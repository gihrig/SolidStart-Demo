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
use lib_core::model::conv::ConvBmc;
use lib_core::model::conv_msg::ConvMsg;
use lib_core::model::ModelManager;
use lib_web::middleware::mw_auth::CtxW;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::marker::PhantomData;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, warn};
use ts_rs::TS;

// region:    --- WebSocket Event Types

/// The realtime feed envelope, a discriminated union tagged by `event_type`
/// (internal serde tagging). ts-rs exports it, so the front-end narrows on the
/// tag and reads a typed payload — no cast. `conv_msg` carries the new `ConvMsg`.
/// Every contentless poke is one `Poke` variant carrying its [`Channel`] (#85):
/// the poke pushes no domain row, only the id its routing key needs, held inside
/// the `Channel`. A subscriber refetches through the scoped `list_*` RPC. The two
/// Jedi comment channels (`post_comment`, `caption_comment`) push a payload
/// (`CommentView`); that payload is not built yet (#113), so they gain no payload
/// variant here — they are subscribe-only (#115). The routing `Channel` is derived
/// from the event (see the `channel` method below), not carried as a separate
/// field: a payload event reads it from the payload, a poke carries it (ADR-0020).
#[derive(Clone, Debug, Serialize, TS)]
#[serde(tag = "event_type")]
#[ts(export, export_to = "WsEvent.d.ts")]
pub enum WsEvent {
	#[serde(rename = "conv_msg")]
	ConvMsg { payload: ConvMsg },
	/// A contentless poke on its [`Channel`]. It replaces the former
	/// one-variant-per-poke set (`agent_update` / `conv_update` / `posts` /
	/// `post_like` / `caption_like` / `post_caption`), so adding a poke channel
	/// touches only [`Channel`] — the hand-written variant→variant map is gone
	/// (ADR-0020).
	#[serde(rename = "poke")]
	Poke(Channel),
}

impl WsEvent {
	/// The [`Channel`] this event is addressed to. A payload event derives it from
	/// the payload (`conv_msg` reads `payload.conv_id`); a poke carries it. The send
	/// task matches its key against a connection's authorized subscription set
	/// (ADR-0015).
	fn channel(&self) -> Channel {
		match self {
			WsEvent::ConvMsg { payload } => Channel::Conv(payload.conv_id),
			WsEvent::Poke(channel) => *channel,
		}
	}
}

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

	pub fn broadcast(&self, event: WsEvent) {
		// Ignore send errors (no subscribers)
		let _ = self.tx.send(event);
	}
}

/// Axum state for the `/ws` route: the broadcast channel plus a `ModelManager`,
/// so the receive task can authorize subscriptions against the read scope.
#[derive(Clone)]
pub struct WsRouteState {
	pub ws: Arc<WsState>,
	pub mm: ModelManager,
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

/// The one exported realtime **Channel** vocabulary (CONTEXT.md "Channel"): the
/// routing key an Event is addressed to and a Subscription names. It is the wire
/// kind a [`SubscriptionRequest`] carries, the key the send task routes on, and
/// the authorize rule — the three types ADR-0018 kept apart (`WsEvent` mapping,
/// `ChannelKind` wire, `Channel` routing), merged into one (ADR-0020). ts-rs
/// exports it, so the front-end mirrors it. Adjacently tagged: the wire is
/// `{ "kind": <string>, "id": <i64> }`, with `id` present only where the variant
/// carries one. `conv:{id}` names one Conversation's Event stream (C03/Q9);
/// `agents`, `convs` and `posts` are id-less global list-feed pokes — a subscriber
/// refetches through the scoped `list_*` RPC, so no row crosses the push path
/// (#85). The five id-bearing Jedi channels key on their entity id (#115):
/// `post_comment:{id}`, `caption_comment:{id}`, `post_like:{id}`,
/// `caption_like:{id}`, `post_caption:{id}`.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "kind", content = "id")]
#[ts(export, export_to = "Channel.d.ts")]
pub(crate) enum Channel {
	#[serde(rename = "conv")]
	Conv(i64),
	#[serde(rename = "agents")]
	Agents,
	#[serde(rename = "convs")]
	Convs,
	// --- Jedi channels (expand step, #115) ---
	#[serde(rename = "posts")]
	Posts,
	#[serde(rename = "post_comment")]
	PostComment(i64),
	#[serde(rename = "caption_comment")]
	CaptionComment(i64),
	#[serde(rename = "post_like")]
	PostLike(i64),
	#[serde(rename = "caption_like")]
	CaptionLike(i64),
	#[serde(rename = "post_caption")]
	PostCaption(i64),
}

impl Channel {
	/// The routing key string. The one place the `post_like:{id}` format lives; the
	/// send task matches it against a connection's authorized subscription set.
	fn key(&self) -> String {
		match self {
			Channel::Conv(id) => format!("conv:{id}"),
			Channel::Agents => "agents".to_string(),
			Channel::Convs => "convs".to_string(),
			Channel::Posts => "posts".to_string(),
			Channel::PostComment(id) => format!("post_comment:{id}"),
			Channel::CaptionComment(id) => format!("caption_comment:{id}"),
			Channel::PostLike(id) => format!("post_like:{id}"),
			Channel::CaptionLike(id) => format!("caption_like:{id}"),
			Channel::PostCaption(id) => format!("post_caption:{id}"),
		}
	}

	/// Whether this caller may subscribe. Fails closed. A Conversation channel
	/// reuses the ADR-0014 read scope: entitled iff `ConvBmc::get` (owner ∪
	/// `MultiUsers`) returns the row. Every other channel is authenticated-read —
	/// the list-feed pokes are contentless (#85) and every Post is public (#106),
	/// so a logged-in socket suffices; identity is fixed at upgrade and a poke leaks
	/// no row. #128 removes `Conv` and collapses this to uniform authenticated-read.
	async fn authorize(&self, ctx: &Ctx, mm: &ModelManager) -> bool {
		// Exhaustive on purpose (no `_` arm): `Channel` is the shared vocabulary, so
		// a new variant must force an authorization decision here — a bare `_ => true`
		// would silently open a future scoped channel to any authenticated socket.
		match self {
			Channel::Conv(id) => ConvBmc::get(ctx, mm, *id).await.is_ok(),
			Channel::Agents
			| Channel::Convs
			| Channel::Posts
			| Channel::PostComment(_)
			| Channel::CaptionComment(_)
			| Channel::PostLike(_)
			| Channel::CaptionLike(_)
			| Channel::PostCaption(_) => true,
		}
	}
}

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
	type Result<T> = core::result::Result<T, Box<dyn std::error::Error>>;

	use super::*;
	use lib_core::_dev_utils::{self, seed_agent, seed_user};
	use lib_core::model::conv::{ConvForCreate, ConvKind};
	use serial_test::serial;

	fn sub(action: &str, channel: Channel) -> SubscriptionRequest {
		SubscriptionRequest {
			action: action.to_string(),
			channel,
		}
	}

	/// Test sugar: the full subscribe resolution `handle_socket` performs
	/// (`authorize` → `key`). `None` on a scope miss.
	async fn authorize_subscription(
		ctx: &Ctx,
		mm: &ModelManager,
		req: &SubscriptionRequest,
	) -> Option<String> {
		req.channel
			.authorize(ctx, mm)
			.await
			.then(|| req.channel.key())
	}

	/// Wire-lock for the merged `Channel` (ADR-0020). Adjacently tagged: `kind`
	/// selects the variant, `id` rides alongside only where the variant carries one.
	/// These are the strings the front-end `channel.ts` mirror is built on; a rename
	/// or an id-placement change here is a wire change carried to the front-end by
	/// the ts-rs binding.
	#[test]
	fn channel_wire_shape_is_stable() {
		assert_eq!(
			serde_json::to_value(Channel::Conv(5)).unwrap(),
			serde_json::json!({ "kind": "conv", "id": 5 })
		);
		assert_eq!(
			serde_json::to_value(Channel::Agents).unwrap(),
			serde_json::json!({ "kind": "agents" })
		);
		assert_eq!(
			serde_json::to_value(Channel::Convs).unwrap(),
			serde_json::json!({ "kind": "convs" })
		);
		assert_eq!(
			serde_json::to_value(Channel::Posts).unwrap(),
			serde_json::json!({ "kind": "posts" })
		);
		assert_eq!(
			serde_json::to_value(Channel::PostComment(3)).unwrap(),
			serde_json::json!({ "kind": "post_comment", "id": 3 })
		);
		assert_eq!(
			serde_json::to_value(Channel::CaptionComment(4)).unwrap(),
			serde_json::json!({ "kind": "caption_comment", "id": 4 })
		);
		assert_eq!(
			serde_json::to_value(Channel::PostLike(5)).unwrap(),
			serde_json::json!({ "kind": "post_like", "id": 5 })
		);
		assert_eq!(
			serde_json::to_value(Channel::CaptionLike(6)).unwrap(),
			serde_json::json!({ "kind": "caption_like", "id": 6 })
		);
		assert_eq!(
			serde_json::to_value(Channel::PostCaption(8)).unwrap(),
			serde_json::json!({ "kind": "post_caption", "id": 8 })
		);
	}

	/// Routing-key lock (ADR-0020). `key()` is the one place the `post_like:{id}`
	/// format lives; `agents` / `convs` / `posts` are id-less.
	#[test]
	fn channel_keys_are_stable() {
		assert_eq!(Channel::Conv(5).key(), "conv:5");
		assert_eq!(Channel::Agents.key(), "agents");
		assert_eq!(Channel::Convs.key(), "convs");
		assert_eq!(Channel::Posts.key(), "posts");
		assert_eq!(Channel::PostComment(3).key(), "post_comment:3");
		assert_eq!(Channel::CaptionComment(4).key(), "caption_comment:4");
		assert_eq!(Channel::PostLike(5).key(), "post_like:5");
		assert_eq!(Channel::CaptionLike(6).key(), "caption_like:6");
		assert_eq!(Channel::PostCaption(8).key(), "post_caption:8");
	}

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

	/// Wire-lock for the envelope the front-end parses (ADR-0010, ADR-0020).
	/// Internal tagging puts `event_type` at the top level; a poke flattens its
	/// `Channel` (`kind`, plus `id` where the channel carries one) alongside the
	/// tag. This guards a serde-shape drift the generated `.d.ts` cannot show.
	#[test]
	fn wsevent_wire_shape_is_stable() {
		use time::OffsetDateTime;

		// Pokes: `event_type` plus the flattened `Channel`.
		assert_eq!(
			serde_json::to_value(WsEvent::Poke(Channel::Agents)).unwrap(),
			serde_json::json!({ "event_type": "poke", "kind": "agents" }),
		);
		assert_eq!(
			serde_json::to_value(WsEvent::Poke(Channel::Convs)).unwrap(),
			serde_json::json!({ "event_type": "poke", "kind": "convs" }),
		);
		assert_eq!(
			serde_json::to_value(WsEvent::Poke(Channel::Posts)).unwrap(),
			serde_json::json!({ "event_type": "poke", "kind": "posts" }),
		);
		assert_eq!(
			serde_json::to_value(WsEvent::Poke(Channel::PostLike(5))).unwrap(),
			serde_json::json!({ "event_type": "poke", "kind": "post_like", "id": 5 }),
		);

		// Payload: `event_type` plus the typed `ConvMsg`.
		let msg = ConvMsg {
			id: 1,
			conv_id: 7,
			user_id: 2,
			content: "hi".to_string(),
			cid: 2,
			ctime: OffsetDateTime::UNIX_EPOCH,
			mid: 2,
			mtime: OffsetDateTime::UNIX_EPOCH,
		};
		let v = serde_json::to_value(WsEvent::ConvMsg { payload: msg }).unwrap();
		assert_eq!(v["event_type"].as_str(), Some("conv_msg"));
		assert_eq!(v["payload"]["conv_id"].as_i64(), Some(7));
	}

	/// The routing key is derived from the event, not carried by hand (ADR-0020): a
	/// poke reads it from its `Channel`, a `conv_msg` from its payload.
	#[test]
	fn wsevent_channel_derives_the_routing_key() {
		use time::OffsetDateTime;

		assert_eq!(WsEvent::Poke(Channel::Agents).channel().key(), "agents");
		assert_eq!(
			WsEvent::Poke(Channel::PostLike(5)).channel().key(),
			"post_like:5"
		);

		let msg = ConvMsg {
			id: 1,
			conv_id: 7,
			user_id: 2,
			content: "hi".to_string(),
			cid: 2,
			ctime: OffsetDateTime::UNIX_EPOCH,
			mid: 2,
			mtime: OffsetDateTime::UNIX_EPOCH,
		};
		assert_eq!(WsEvent::ConvMsg { payload: msg }.channel().key(), "conv:7");
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

	/// C03 subscribe gate: entitlement reuses the C01 read scope. User B may
	/// subscribe to A's `MultiUsers` conv but not A's `OwnerOnly` one. Every other
	/// channel is authenticated-read, so B is admitted without a DB scope check.
	/// (The scope itself is proven in `lib-core`'s `test_access_scope_conv_two_user`.)
	#[serial]
	#[tokio::test]
	async fn test_authorize_subscription_two_user() -> Result<()> {
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let fx_prefix = "test_authorize_subscription_two_user";

		let a_id = seed_user(&root, &mm, &format!("{fx_prefix}-A")).await?;
		let b_id = seed_user(&root, &mm, &format!("{fx_prefix}-B")).await?;
		let ctx_a = Ctx::new(a_id)?;
		let ctx_b = Ctx::new(b_id)?;

		let agent_id =
			seed_agent(&ctx_a, &mm, &format!("{fx_prefix} agent")).await?;
		let owner_conv_id = ConvBmc::create(
			&ctx_a,
			&mm,
			ConvForCreate {
				agent_id,
				title: Some(format!("{fx_prefix} owner-only")),
				kind: Some(ConvKind::OwnerOnly),
			},
		)
		.await?;
		let multi_conv_id = ConvBmc::create(
			&ctx_a,
			&mm,
			ConvForCreate {
				agent_id,
				title: Some(format!("{fx_prefix} multi-users")),
				kind: Some(ConvKind::MultiUsers),
			},
		)
		.await?;

		// B may subscribe to the public conv.
		assert_eq!(
			authorize_subscription(
				&ctx_b,
				&mm,
				&sub("subscribe", Channel::Conv(multi_conv_id))
			)
			.await,
			Some(format!("conv:{multi_conv_id}")),
		);
		// B may NOT subscribe to A's private conv (scope miss → None).
		assert_eq!(
			authorize_subscription(
				&ctx_b,
				&mm,
				&sub("subscribe", Channel::Conv(owner_conv_id))
			)
			.await,
			None,
			"B must not subscribe to A's OwnerOnly conv",
		);
		// A may subscribe to its own private conv.
		assert_eq!(
			authorize_subscription(
				&ctx_a,
				&mm,
				&sub("subscribe", Channel::Conv(owner_conv_id))
			)
			.await,
			Some(format!("conv:{owner_conv_id}")),
		);

		// The list-feed channels are contentless pokes: any authenticated caller
		// may subscribe (#85), so B is admitted to both without a DB scope check.
		assert_eq!(
			authorize_subscription(&ctx_b, &mm, &sub("subscribe", Channel::Agents))
				.await,
			Some("agents".to_string()),
		);
		assert_eq!(
			authorize_subscription(&ctx_b, &mm, &sub("subscribe", Channel::Convs))
				.await,
			Some("convs".to_string()),
		);

		// Every Jedi channel is authenticated-read (#115): B, a logged-in socket
		// with no relation to A's rows, may subscribe to the id-less `posts` feed
		// and to any Post's comment thread. No per-row scope applies.
		assert_eq!(
			authorize_subscription(&ctx_b, &mm, &sub("subscribe", Channel::Posts))
				.await,
			Some("posts".to_string()),
		);
		assert_eq!(
			authorize_subscription(
				&ctx_b,
				&mm,
				&sub("subscribe", Channel::PostComment(999))
			)
			.await,
			Some("post_comment:999".to_string()),
			"any logged-in socket may subscribe to any Post comment thread",
		);

		Ok(())
	}
}

// endregion: --- Tests
