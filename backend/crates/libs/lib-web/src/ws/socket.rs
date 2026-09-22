use super::hub::WsState;
use crate::middleware::mw_auth::CtxW;
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
use lib_core::model::ModelManager;
use lib_core::realtime::Channel;
use serde::Deserialize;
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, warn};

// region:    --- Subscription request

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

// endregion: --- Subscription request

// region:    --- WebSocket State

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
