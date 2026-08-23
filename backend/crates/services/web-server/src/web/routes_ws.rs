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
use lib_core::model::ModelManager;
use lib_web::middleware::mw_auth::CtxW;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, warn};
use ts_rs::TS;

// region:    --- WebSocket Event Types

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "WsEvent.d.ts")]
pub struct WsEvent {
	pub event_type: String,
	pub channel: String,
	// The payload shape varies by `event_type`; the consumer narrows it. Kept
	// `unknown` on the TS side so the envelope can join the bindings without a
	// serde_json TS impl.
	#[ts(type = "unknown")]
	pub payload: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct SubscriptionRequest {
	action: String,  // "subscribe" | "unsubscribe"
	channel: String, // "conv"
	id: Option<i64>,
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

/// The channel key a well-formed subscription request targets, or `None` for an
/// unknown kind or a missing id. Today only `conv:{id}` exists (C03/Q9); an
/// unknown kind is ignored rather than errored.
fn channel_key(req: &SubscriptionRequest) -> Option<String> {
	match req.channel.as_str() {
		"conv" => req.id.map(|id| format!("conv:{id}")),
		_ => None,
	}
}

/// Resolve a `subscribe` request to the channel key the connection may receive,
/// or `None` if it is malformed, of an unknown kind, or the caller is not
/// entitled. Entitlement reuses the ADR-0014 read scope: a caller may subscribe
/// to a Conversation's channel iff `ConvBmc::get` (owner ∪ `MultiUsers`) returns
/// it. Fails closed on any error.
async fn authorize_subscription(
	ctx: &Ctx,
	mm: &ModelManager,
	req: &SubscriptionRequest,
) -> Option<String> {
	let key = channel_key(req)?;
	let id = req.id?;
	ConvBmc::get(ctx, mm, id).await.ok()?;
	Some(key)
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
						should_forward(&subs, &event.channel)
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
							"Subscription request: action={}, channel={}, id={:?}",
							req.action, req.channel, req.id
						);
						match req.action.as_str() {
							// Authorize against the read scope before honoring; an
							// unauthorized or unknown channel is silently ignored.
							"subscribe" => {
								// Cap the per-connection set *before* the
								// authorizing read, so a full connection
								// issues no further `ConvBmc::get`s. Over the
								// cap is ignored, like an unauthorized channel.
								let has_capacity = {
									let subs = recv_subs.read().await;
									has_subscription_capacity(&subs)
								};
								if has_capacity {
									if let Some(key) =
										authorize_subscription(&ctx, &mm, &req).await
									{
										recv_subs.write().await.insert(key);
									}
								}
							}
							"unsubscribe" => {
								if let Some(key) = channel_key(&req) {
									recv_subs.write().await.remove(&key);
								}
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

// region:    --- Helper Functions for Broadcasting

impl WsState {
	/// Broadcast a conversation message event
	pub fn broadcast_conv_msg(&self, conv_id: i64, msg: &serde_json::Value) {
		self.broadcast(WsEvent {
			event_type: "conv_msg".to_string(),
			channel: format!("conv:{}", conv_id),
			payload: msg.clone(),
		});
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

	fn sub(action: &str, channel: &str, id: Option<i64>) -> SubscriptionRequest {
		SubscriptionRequest {
			action: action.to_string(),
			channel: channel.to_string(),
			id,
		}
	}

	#[test]
	fn channel_key_conv_requires_id() {
		assert_eq!(
			channel_key(&sub("subscribe", "conv", Some(5))),
			Some("conv:5".to_string())
		);
		assert_eq!(channel_key(&sub("subscribe", "conv", None)), None);
	}

	#[test]
	fn channel_key_rejects_unknown_kind() {
		assert_eq!(channel_key(&sub("subscribe", "agent", Some(1))), None);
		assert_eq!(channel_key(&sub("subscribe", "", Some(1))), None);
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
	/// subscribe to A's `MultiUsers` conv but not A's `OwnerOnly` one, and never
	/// to an unknown channel kind. (The scope itself is proven in `lib-core`'s
	/// `test_access_scope_conv_two_user`.)
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
				&sub("subscribe", "conv", Some(multi_conv_id))
			)
			.await,
			Some(format!("conv:{multi_conv_id}")),
		);
		// B may NOT subscribe to A's private conv (scope miss → None).
		assert_eq!(
			authorize_subscription(
				&ctx_b,
				&mm,
				&sub("subscribe", "conv", Some(owner_conv_id))
			)
			.await,
			None,
			"B must not subscribe to A's OwnerOnly conv",
		);
		// Unknown channel kind is refused.
		assert_eq!(
			authorize_subscription(
				&ctx_b,
				&mm,
				&sub("subscribe", "agent", Some(agent_id))
			)
			.await,
			None,
		);
		// A may subscribe to its own private conv.
		assert_eq!(
			authorize_subscription(
				&ctx_a,
				&mm,
				&sub("subscribe", "conv", Some(owner_conv_id))
			)
			.await,
			Some(format!("conv:{owner_conv_id}")),
		);

		Ok(())
	}
}

// endregion: --- Tests
