use crate::web::poke::{Agents, Conv, Convs};
use axum::{
	extract::{
		ws::{Message, WebSocket, WebSocketUpgrade},
		State,
	},
	response::IntoResponse,
	routing::get,
	Router,
};
use futures::{SinkExt, StreamExt};
use lib_core::ctx::Ctx;
use lib_core::model::conv_msg::ConvMsg;
use lib_core::model::ModelManager;
use lib_core::realtime::{Channel, WsEvent};
use lib_web::middleware::mw_auth::CtxW;
use serde::Deserialize;
use std::collections::HashSet;
use std::marker::PhantomData;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, warn};

// region:    --- WebSocket Event Types

/// The client → server subscribe/unsubscribe request. It carries a [`Channel`]
/// flattened onto the request, so the wire stays `{ action, kind, id? }`: `kind`
/// selects the variant and `id` rides inside it (ADR-0020). A `conv` request with
/// no id therefore fails to deserialize — the arity check the old `parse` did by
/// hand — and an unknown `kind` is a deserialize error, not a silent miss.
#[derive(Debug, Deserialize)]
struct SubscriptionRequest {
	action: String, // "subscribe" | "unsubscribe"
	#[serde(flatten)]
	channel: Channel,
}

// endregion: --- WebSocket Event Types

// region:    --- WebSocket State

#[derive(Clone, rpc_router::RpcResource)]
pub struct WsState {
	pub tx: broadcast::Sender<WsEvent>,
}

impl Default for WsState {
	fn default() -> Self {
		Self::new()
	}
}

impl WsState {
	pub fn new() -> Self {
		let (tx, _) = broadcast::channel(100);
		Self { tx }
	}

	/// The private broadcast primitive: every send goes through a typed
	/// `broadcast_*` helper, so this is not part of the crate's public surface.
	fn broadcast(&self, event: WsEvent) {
		// Ignore send errors (no subscribers)
		let _ = self.tx.send(event);
	}
}

/// Axum state for the `/ws` route: the broadcast channel plus a `ModelManager`,
/// so the receive task can authorize subscriptions against the read scope.
#[derive(Clone)]
struct WsRouteState {
	ws: Arc<WsState>,
	mm: ModelManager,
}

// endregion: --- WebSocket State

// region:    --- WebSocket Routes

pub fn routes(ws_state: Arc<WsState>, mm: ModelManager) -> Router {
	Router::new()
		.route("/ws", get(ws_handler))
		.with_state(WsRouteState { ws: ws_state, mm })
}

// endregion: --- WebSocket Routes

// region:    --- Subscription authorization

/// Default-deny fan-out: a connection receives an event only for a channel it
/// holds an authorized subscription to.
fn should_forward(subs: &HashSet<String>, channel: &str) -> bool {
	subs.contains(channel)
}

/// The per-connection subscription cap. Because it is checked *before* the
/// authorizing `ConvBmc::get`, it bounds both the authorized set and the number
/// of concurrent authorizing DB reads a single connection can hold. The
/// front-end holds one active subscription at a time, so 16 is generous headroom
/// for conversation-switching and reconnect replay. Subscribe-frequency and
/// server-side connection rate-limiting are deferred (#91 "Realtime hardening
/// II").
const MAX_SUBSCRIPTIONS: usize = 16;

/// Whether a connection may admit another subscription without exceeding
/// [`MAX_SUBSCRIPTIONS`]. Checked before the authorizing read, so a full set
/// issues no further `ConvBmc::get`s.
fn has_subscription_capacity(subs: &HashSet<String>) -> bool {
	subs.len() < MAX_SUBSCRIPTIONS
}

// endregion: --- Subscription authorization

// region:    --- WebSocket Handler

async fn ws_handler(
	ctx: CtxW,
	ws: WebSocketUpgrade,
	State(state): State<WsRouteState>,
) -> impl IntoResponse {
	// Identity is fixed once, at the upgrade — a WebSocket has no per-message auth.
	let ctx = ctx.0;
	ws.on_upgrade(move |socket| handle_socket(socket, state.ws, state.mm, ctx))
}

async fn handle_socket(
	socket: WebSocket,
	ws: Arc<WsState>,
	mm: ModelManager,
	ctx: Ctx,
) {
	let (mut sender, mut receiver) = socket.split();
	let mut rx = ws.tx.subscribe();

	// Per-connection authorized subscriptions. Receive task writes, send task reads.
	let subs: Arc<RwLock<HashSet<String>>> = Arc::new(RwLock::new(HashSet::new()));

	// Task to forward the broadcast events this connection is subscribed to.
	let send_subs = subs.clone();
	let send_task = tokio::spawn(async move {
		loop {
			match rx.recv().await {
				Ok(event) => {
					// Default-deny: skip channels this connection has not subscribed to.
					let subscribed = {
						let subs = send_subs.read().await;
						should_forward(&subs, &event.channel().key())
					};
					if !subscribed {
						continue;
					}
					match serde_json::to_string(&event) {
						Ok(msg) => {
							if sender.send(Message::Text(msg.into())).await.is_err()
							{
								break;
							}
						}
						Err(e) => {
							warn!("Failed to serialize WebSocket event: {}", e);
						}
					}
				}
				Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
					warn!("WebSocket client lagged, missed {} messages", n);
					// Continue receiving — don't drop the connection
				}
				Err(tokio::sync::broadcast::error::RecvError::Closed) => {
					break;
				}
			}
		}
	});

	// Task to receive subscription requests from the client and authorize them.
	let recv_subs = subs.clone();
	let recv_task = tokio::spawn(async move {
		while let Some(Ok(msg)) = receiver.next().await {
			match msg {
				Message::Text(text) => {
					if let Ok(req) =
						serde_json::from_str::<SubscriptionRequest>(&text)
					{
						debug!(
							"Subscription request: action={}, channel={:?}",
							req.action, req.channel
						);
						match req.action.as_str() {
							// Authorize against the read scope before honoring; an
							// unauthorized channel is silently ignored. An unknown or
							// arity-broken channel never reaches here — serde rejects
							// it while deserializing the request (ADR-0020).
							"subscribe" => {
								// Cap the per-connection set *before* the
								// authorizing read, so a full connection
								// issues no further `ConvBmc::get`s. Over the
								// cap is ignored, like an unauthorized channel.
								let has_capacity = {
									let subs = recv_subs.read().await;
									has_subscription_capacity(&subs)
								};
								if has_capacity
									&& req.channel.authorize(&ctx, &mm).await
								{
									recv_subs
										.write()
										.await
										.insert(req.channel.key());
								}
							}
							"unsubscribe" => {
								recv_subs.write().await.remove(&req.channel.key());
							}
							_ => {}
						}
					}
				}
				Message::Ping(data) => {
					debug!("Received ping: {:?}", data);
					// Axum handles pong automatically
				}
				Message::Close(_) => {
					debug!("WebSocket connection closed by client");
					break;
				}
				_ => {}
			}
		}
	});

	// Wait for either task to finish
	tokio::select! {
		_ = send_task => {
			debug!("WebSocket send task completed");
		},
		_ = recv_task => {
			debug!("WebSocket receive task completed");
		},
	}
}

// endregion: --- WebSocket Handler

// region:    --- Poke receipt (ADR-0016)

/// A channel-typed proof that a list-feed poke fired. Its field is private, so
/// only this ws module mints one — a handler cannot fabricate a receipt without
/// calling a `broadcast_*`. [`PokedRpcResult::new`](crate::web::poke::PokedRpcResult::new)
/// consumes it, so a mutation must poke its own feed to build its return value:
/// no poke, no receipt, no compile (ADR-0016). The marker `C` binds the receipt to
/// one feed (`Convs` / `Agents` / `Conv`), so a wrong-feed poke is a type error.
pub struct PokeReceipt<C> {
	_channel: PhantomData<C>,
}

impl<C> PokeReceipt<C> {
	/// Mint a receipt. Private to the ws module: only a `broadcast_*` calls it.
	fn new() -> Self {
		Self {
			_channel: PhantomData,
		}
	}
}

// endregion: --- Poke receipt (ADR-0016)

// region:    --- Helper Functions for Broadcasting

impl WsState {
	/// Broadcast a conversation message event. Takes the typed `ConvMsg`; the
	/// envelope derives its `conv:{id}` channel from the payload. Returns the
	/// [`PokeReceipt<Conv>`] the `add_conv_msg` handler needs to build its result.
	pub fn broadcast_conv_msg(&self, msg: &ConvMsg) -> PokeReceipt<Conv> {
		self.broadcast(WsEvent::ConvMsg {
			payload: msg.clone(),
		});
		PokeReceipt::new()
	}

	/// Poke the global Agent-list channel: the Agent list may have changed (#85).
	/// Carries no payload — a subscriber refetches through the scoped
	/// `list_agents` RPC, so no Agent row crosses the push path. Returns the
	/// [`PokeReceipt<Agents>`] the Agent mutations need to build their result.
	pub fn broadcast_agent_update(&self) -> PokeReceipt<Agents> {
		self.broadcast(WsEvent::Poke(Channel::Agents));
		PokeReceipt::new()
	}

	/// Poke the global Conversation-list channel: some Conversation list may have
	/// changed (#85). Contentless for the same reason as `broadcast_agent_update`;
	/// the refetch re-applies the read scope, so no Conversation row leaks. Returns
	/// the [`PokeReceipt<Convs>`] the Conversation mutations need for their result.
	pub fn broadcast_conv_update(&self) -> PokeReceipt<Convs> {
		self.broadcast(WsEvent::Poke(Channel::Convs));
		PokeReceipt::new()
	}

	// The four Jedi poke helpers below have no caller yet: the mutation handlers
	// call them in the follow-up contract step (#113). Each carries `allow(dead_code)`
	// until the handler wires the poke; the tests construct them.

	/// Poke the global Post-list channel: the Post list may have changed (#115).
	/// Contentless — a subscriber refetches through the scoped `list_*` RPC, so no
	/// Post row crosses the push path (#85).
	#[allow(dead_code)]
	pub fn broadcast_posts_update(&self) {
		self.broadcast(WsEvent::Poke(Channel::Posts));
	}

	/// Poke one Post's like-count channel (`post_like:{post_id}`): the like count
	/// changed (#115). Carries only the `post_id` for routing — the count is
	/// derived by refetch, never pushed.
	#[allow(dead_code)]
	pub fn broadcast_post_like(&self, post_id: i64) {
		self.broadcast(WsEvent::Poke(Channel::PostLike(post_id)));
	}

	/// Poke one Caption's like-count channel (`caption_like:{caption_id}`): the
	/// like count changed (#115). Carries only the `caption_id` for routing.
	#[allow(dead_code)]
	pub fn broadcast_caption_like(&self, caption_id: i64) {
		self.broadcast(WsEvent::Poke(Channel::CaptionLike(caption_id)));
	}

	/// Poke one Post's Caption-list channel (`post_caption:{post_id}`): the
	/// competing Captions changed or re-ranked (#115). Carries only the `post_id`;
	/// the client refetches the Top Captions list.
	#[allow(dead_code)]
	pub fn broadcast_post_caption(&self, post_id: i64) {
		self.broadcast(WsEvent::Poke(Channel::PostCaption(post_id)));
	}
}

// endregion: --- Helper Functions for Broadcasting

// region:    --- Tests

#[cfg(test)]
mod tests {
	use super::*;

	/// A `SubscriptionRequest` carries a `Channel` flattened onto `{ action, kind,
	/// id? }`. An id-bearing kind with no id fails to deserialize; an id-less kind
	/// deserializes without one; an unknown kind fails (ADR-0020 — the arity and
	/// unknown-kind checks the old `parse` did by hand).
	#[test]
	fn subscription_request_deserialize_enforces_arity() {
		// `conv` needs an id.
		assert!(serde_json::from_str::<SubscriptionRequest>(
			r#"{"action":"subscribe","kind":"conv","id":5}"#
		)
		.is_ok());
		assert!(serde_json::from_str::<SubscriptionRequest>(
			r#"{"action":"subscribe","kind":"conv"}"#
		)
		.is_err());
		// The id-less feeds deserialize with no id.
		assert!(serde_json::from_str::<SubscriptionRequest>(
			r#"{"action":"subscribe","kind":"agents"}"#
		)
		.is_ok());
		assert!(serde_json::from_str::<SubscriptionRequest>(
			r#"{"action":"subscribe","kind":"posts"}"#
		)
		.is_ok());
		// An id-bearing Jedi kind needs an id.
		assert!(serde_json::from_str::<SubscriptionRequest>(
			r#"{"action":"subscribe","kind":"post_like"}"#
		)
		.is_err());
		// A stray id on an id-less kind is rejected: adjacent tagging requires the
		// content (`id`) to be absent for a unit variant.
		assert!(serde_json::from_str::<SubscriptionRequest>(
			r#"{"action":"subscribe","kind":"agents","id":7}"#
		)
		.is_err());
		// An unknown kind is rejected.
		assert!(serde_json::from_str::<SubscriptionRequest>(
			r#"{"action":"subscribe","kind":"nope","id":1}"#
		)
		.is_err());
	}

	/// A deserialized request resolves to its variant's `key()`.
	#[test]
	fn subscription_request_resolves_to_channel_key() {
		let req = serde_json::from_str::<SubscriptionRequest>(
			r#"{"action":"subscribe","kind":"conv","id":5}"#,
		)
		.unwrap();
		assert_eq!(req.channel.key(), "conv:5");
		let req = serde_json::from_str::<SubscriptionRequest>(
			r#"{"action":"subscribe","kind":"post_like","id":9}"#,
		)
		.unwrap();
		assert_eq!(req.channel.key(), "post_like:9");
	}

	#[test]
	fn broadcast_agent_update_pokes_agents_channel() {
		let ws = WsState::new();
		let mut rx = ws.tx.subscribe();
		ws.broadcast_agent_update();
		let event = rx.try_recv().expect("an event was broadcast");
		assert!(matches!(event, WsEvent::Poke(Channel::Agents)));
		assert_eq!(event.channel().key(), "agents");
	}

	#[test]
	fn broadcast_conv_update_pokes_convs_channel() {
		let ws = WsState::new();
		let mut rx = ws.tx.subscribe();
		ws.broadcast_conv_update();
		let event = rx.try_recv().expect("an event was broadcast");
		assert!(matches!(event, WsEvent::Poke(Channel::Convs)));
		assert_eq!(event.channel().key(), "convs");
	}

	/// Wire-lock for the typed poke receipt (ADR-0016). A `PokedRpcResult`
	/// serializes as `{ "data": … }` — byte-identical to `DataRpcResult`, the
	/// channel marker skipped — so a mutation's wire shape does not change. The
	/// receipt comes from a real broadcast; only the ws module can mint one.
	#[test]
	fn poked_rpc_result_serializes_as_data_only() {
		use crate::web::poke::PokedRpcResult;

		let ws = WsState::new();
		let receipt = ws.broadcast_conv_update(); // PokeReceipt<Convs>
		let result = PokedRpcResult::new(42_i64, receipt);
		assert_eq!(
			serde_json::to_value(result).unwrap(),
			serde_json::json!({ "data": 42 }),
		);
	}

	/// Each Jedi broadcast helper emits its poke on the right channel (#115).
	#[test]
	fn jedi_broadcast_helpers_poke_their_channels() {
		let ws = WsState::new();
		let mut rx = ws.tx.subscribe();

		ws.broadcast_posts_update();
		ws.broadcast_post_like(5);
		ws.broadcast_caption_like(6);
		ws.broadcast_post_caption(8);

		assert_eq!(rx.try_recv().unwrap().channel().key(), "posts");
		assert_eq!(rx.try_recv().unwrap().channel().key(), "post_like:5");
		assert_eq!(rx.try_recv().unwrap().channel().key(), "caption_like:6");
		assert_eq!(rx.try_recv().unwrap().channel().key(), "post_caption:8");
	}

	#[test]
	fn should_forward_is_default_deny() {
		let mut subs = HashSet::new();
		assert!(
			!should_forward(&subs, "conv:1"),
			"empty set forwards nothing"
		);
		subs.insert("conv:1".to_string());
		assert!(
			should_forward(&subs, "conv:1"),
			"subscribed channel forwards"
		);
		assert!(
			!should_forward(&subs, "conv:2"),
			"unsubscribed channel is dropped"
		);
	}

	#[test]
	fn subscription_capacity_caps_at_max() {
		let mut subs = HashSet::new();
		for i in 0..MAX_SUBSCRIPTIONS {
			assert!(
				has_subscription_capacity(&subs),
				"a set below the cap admits another subscription"
			);
			subs.insert(format!("conv:{i}"));
		}
		assert_eq!(subs.len(), MAX_SUBSCRIPTIONS);
		assert!(
			!has_subscription_capacity(&subs),
			"a full set admits no more subscriptions"
		);
	}
}

// endregion: --- Tests
