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
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{debug, warn};

// region:    --- WebSocket Event Types

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WsEvent {
	pub event_type: String,
	pub channel: String,
	pub payload: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct SubscriptionRequest {
	action: String,  // "subscribe" | "unsubscribe"
	channel: String, // "conv" | "agent"
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

// endregion: --- WebSocket State

// region:    --- WebSocket Routes

pub fn routes(ws_state: Arc<WsState>) -> Router {
	Router::new()
		.route("/ws", get(ws_handler))
		.with_state(ws_state)
}

// endregion: --- WebSocket Routes

// region:    --- WebSocket Handler

async fn ws_handler(
	ws: WebSocketUpgrade,
	State(state): State<Arc<WsState>>,
) -> impl IntoResponse {
	ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<WsState>) {
	let (mut sender, mut receiver) = socket.split();
	let mut rx = state.tx.subscribe();

	// Task to forward broadcast messages to this client
	let send_task = tokio::spawn(async move {
		while let Ok(event) = rx.recv().await {
			match serde_json::to_string(&event) {
				Ok(msg) => {
					if sender.send(Message::Text(msg.into())).await.is_err() {
						break;
					}
				}
				Err(e) => {
					warn!("Failed to serialize WebSocket event: {}", e);
				}
			}
		}
	});

	// Task to receive messages from client (subscriptions, pings, etc.)
	let recv_task = tokio::spawn(async move {
		while let Some(Ok(msg)) = receiver.next().await {
			match msg {
				Message::Text(text) => {
					// Handle subscription requests
					if let Ok(sub) = serde_json::from_str::<SubscriptionRequest>(&text) {
						debug!(
							"Subscription request: action={}, channel={}, id={:?}",
							sub.action, sub.channel, sub.id
						);
						// Note: For a full implementation, you would track subscriptions
						// per client and filter broadcasts accordingly.
						// For now, all connected clients receive all broadcasts.
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

	/// Broadcast a conversation update event
	pub fn broadcast_conv_update(&self, conv_id: i64, conv: &serde_json::Value) {
		self.broadcast(WsEvent {
			event_type: "conv_update".to_string(),
			channel: format!("conv:{}", conv_id),
			payload: conv.clone(),
		});
	}

	/// Broadcast an agent update event
	pub fn broadcast_agent_update(&self, agent_id: i64, agent: &serde_json::Value) {
		self.broadcast(WsEvent {
			event_type: "agent_update".to_string(),
			channel: format!("agent:{}", agent_id),
			payload: agent.clone(),
		});
	}
}

// endregion: --- Helper Functions for Broadcasting
