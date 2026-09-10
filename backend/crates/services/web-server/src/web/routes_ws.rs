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
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, warn};
use ts_rs::TS;

// region:    --- WebSocket Event Types

/// The realtime feed envelope, a discriminated union tagged by `event_type`
/// (internal serde tagging). ts-rs exports it, so the front-end narrows on the
/// tag and reads a typed payload — no cast. `conv_msg` carries the new `ConvMsg`.
/// The pokes carry no domain row (#85): `agent_update` / `conv_update` / `posts`
/// carry nothing; `post_like` / `caption_like` / `post_caption` carry only the id
/// their routing key needs. The two Jedi comment channels (`post_comment`,
/// `caption_comment`) push a payload (`CommentView`); that payload is not built
/// yet, so they gain no variant here in this expand step — they are subscribe-only
/// (#115). The routing `channel` is derived from the variant (see the `channel`
/// method below), not carried on the wire.
#[derive(Clone, Debug, Serialize, TS)]
#[serde(tag = "event_type")]
#[ts(export, export_to = "WsEvent.d.ts")]
pub enum WsEvent {
	#[serde(rename = "conv_msg")]
	ConvMsg { payload: ConvMsg },
	#[serde(rename = "agent_update")]
	AgentUpdate,
	#[serde(rename = "conv_update")]
	ConvUpdate,
	// --- Jedi channels (expand step, #115) ---
	// The four contentless list/count pokes. A poke carries only the id its
	// routing key needs — never a domain row — so a subscriber refetches through
	// the scoped `list_*` RPC (#85). The two comment channels push a payload; that
	// payload (`CommentView`) is not built yet, so `post_comment` / `caption_comment`
	// gain no `WsEvent` variant in this expand step — they are subscribe-only.
	#[serde(rename = "posts")]
	Posts,
	#[serde(rename = "post_like")]
	PostLike { post_id: i64 },
	#[serde(rename = "caption_like")]
	CaptionLike { caption_id: i64 },
	#[serde(rename = "post_caption")]
	PostCaption { post_id: i64 },
}

impl WsEvent {
	/// The [`Channel`] this event is addressed to, derived from the variant. The
	/// send task matches its key against a connection's authorized subscription
	/// set (ADR-0015).
	fn channel(&self) -> Channel {
		match self {
			WsEvent::ConvMsg { payload } => Channel::Conv(payload.conv_id),
			WsEvent::AgentUpdate => Channel::Agents,
			WsEvent::ConvUpdate => Channel::Convs,
			WsEvent::Posts => Channel::Posts,
			WsEvent::PostLike { post_id } => Channel::PostLike(*post_id),
			WsEvent::CaptionLike { caption_id } => {
				Channel::CaptionLike(*caption_id)
			}
			WsEvent::PostCaption { post_id } => Channel::PostCaption(*post_id),
		}
	}
}

/// The Channel *kind* a Subscription names — the wire vocabulary. ts-rs exports it
/// so the front-end mirrors these names instead of hand-typing them (ADR-0018); as
/// a typed field on [`SubscriptionRequest`] it also makes an unknown kind a
/// deserialize error, not a silent miss. `conv` names one Conversation's Event
/// stream and needs an `id`; `agents` and `convs` are id-less global list-feed
/// pokes (#85). The Jedi channels ride alongside (#115): `posts` is also id-less;
/// the other five (`post_comment`, `caption_comment`, `post_like`, `caption_like`,
/// `post_caption`) name one entity and need an `id`. Distinct from [`Channel`],
/// which pairs a kind with its id and owns the routing-key and authorize logic.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, TS)]
#[ts(export, export_to = "ChannelKind.d.ts")]
enum ChannelKind {
	#[serde(rename = "conv")]
	Conv,
	#[serde(rename = "agents")]
	Agents,
	#[serde(rename = "convs")]
	Convs,
	// --- Jedi channels (expand step, #115; ADR-0018 addendum) ---
	// `posts` is the id-less Post list-feed poke. The other five name one entity
	// and need an `id`: the two comment threads push a payload, the three
	// list/count channels poke. All are authenticated-read (any logged-in socket).
	#[serde(rename = "posts")]
	Posts,
	#[serde(rename = "post_comment")]
	PostComment,
	#[serde(rename = "caption_comment")]
	CaptionComment,
	#[serde(rename = "post_like")]
	PostLike,
	#[serde(rename = "caption_like")]
	CaptionLike,
	#[serde(rename = "post_caption")]
	PostCaption,
}

#[derive(Debug, Deserialize)]
struct SubscriptionRequest {
	action: String, // "subscribe" | "unsubscribe"
	channel: ChannelKind,
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

/// The routing key an Event is addressed to and a Subscription names
/// (CONTEXT.md "Channel"). Backend-internal: the wire still carries the
/// `{ channel, id }` string pair; this is its parsed, checked form. `conv:{id}`
/// names one Conversation's Event stream (C03/Q9); `agents`, `convs` and `posts`
/// are the id-less global list-feed pokes — a subscriber refetches through the
/// scoped `list_*` RPC, so no row crosses the push path (#85). The five id-bearing
/// Jedi channels key on their entity id (#115): `post_comment:{id}`,
/// `caption_comment:{id}`, `post_like:{id}`, `caption_like:{id}`,
/// `post_caption:{id}`.
#[derive(Debug)]
enum Channel {
	Conv(i64),
	Agents,
	Convs,
	// --- Jedi channels (expand step, #115) ---
	Posts,
	PostComment(i64),
	CaptionComment(i64),
	PostLike(i64),
	CaptionLike(i64),
	PostCaption(i64),
}

impl Channel {
	/// Pair a subscription request's [`ChannelKind`] with its id, or `None` when a
	/// `conv` request omits the id. An unknown kind cannot reach here — serde
	/// rejects it while deserializing `SubscriptionRequest` (ADR-0018).
	fn parse(req: &SubscriptionRequest) -> Option<Self> {
		match req.channel {
			ChannelKind::Conv => req.id.map(Channel::Conv),
			ChannelKind::Agents => Some(Channel::Agents),
			ChannelKind::Convs => Some(Channel::Convs),
			ChannelKind::Posts => Some(Channel::Posts),
			ChannelKind::PostComment => req.id.map(Channel::PostComment),
			ChannelKind::CaptionComment => req.id.map(Channel::CaptionComment),
			ChannelKind::PostLike => req.id.map(Channel::PostLike),
			ChannelKind::CaptionLike => req.id.map(Channel::CaptionLike),
			ChannelKind::PostCaption => req.id.map(Channel::PostCaption),
		}
	}

	/// The routing key string. The one place the `conv:{id}` format lives; the
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
	/// `MultiUsers`) returns the row. The list-feed pokes are contentless, so any
	/// authenticated socket may subscribe (#85) — identity is fixed at upgrade
	/// and a poke leaks no row. Every Jedi channel is authenticated-read: every
	/// Post is public (#106), so no per-row scope applies and a comment thread or
	/// poke needs only a logged-in socket (ADR-0018 addendum).
	async fn authorize(&self, ctx: &Ctx, mm: &ModelManager) -> bool {
		match self {
			Channel::Conv(id) => ConvBmc::get(ctx, mm, *id).await.is_ok(),
			Channel::Agents | Channel::Convs => true,
			Channel::Posts
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
							"Subscription request: action={}, channel={:?}, id={:?}",
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
									if let Some(ch) = Channel::parse(&req) {
										if ch.authorize(&ctx, &mm).await {
											recv_subs.write().await.insert(ch.key());
										}
									}
								}
							}
							"unsubscribe" => {
								if let Some(ch) = Channel::parse(&req) {
									recv_subs.write().await.remove(&ch.key());
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
	/// Broadcast a conversation message event. Takes the typed `ConvMsg`; the
	/// envelope derives its `conv:{id}` channel from the payload.
	pub fn broadcast_conv_msg(&self, msg: &ConvMsg) {
		self.broadcast(WsEvent::ConvMsg {
			payload: msg.clone(),
		});
	}

	/// Poke the global Agent-list channel: the Agent list may have changed (#85).
	/// Carries no payload — a subscriber refetches through the scoped
	/// `list_agents` RPC, so no Agent row crosses the push path.
	pub fn broadcast_agent_update(&self) {
		self.broadcast(WsEvent::AgentUpdate);
	}

	/// Poke the global Conversation-list channel: some Conversation list may have
	/// changed (#85). Contentless for the same reason as `broadcast_agent_update`;
	/// the refetch re-applies the read scope, so no Conversation row leaks.
	pub fn broadcast_conv_update(&self) {
		self.broadcast(WsEvent::ConvUpdate);
	}

	/// Poke the global Post-list channel: the Post list may have changed (#115).
	/// Contentless — a subscriber refetches through the scoped `list_*` RPC, so no
	/// Post row crosses the push path (#85).
	pub fn broadcast_posts_update(&self) {
		self.broadcast(WsEvent::Posts);
	}

	/// Poke one Post's like-count channel (`post_like:{post_id}`): the like count
	/// changed (#115). Carries only the `post_id` for routing — the count is
	/// derived by refetch, never pushed.
	pub fn broadcast_post_like(&self, post_id: i64) {
		self.broadcast(WsEvent::PostLike { post_id });
	}

	/// Poke one Caption's like-count channel (`caption_like:{caption_id}`): the
	/// like count changed (#115). Carries only the `caption_id` for routing.
	pub fn broadcast_caption_like(&self, caption_id: i64) {
		self.broadcast(WsEvent::CaptionLike { caption_id });
	}

	/// Poke one Post's Caption-list channel (`post_caption:{post_id}`): the
	/// competing Captions changed or re-ranked (#115). Carries only the `post_id`;
	/// the client refetches the Top Captions list.
	pub fn broadcast_post_caption(&self, post_id: i64) {
		self.broadcast(WsEvent::PostCaption { post_id });
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

	fn sub(
		action: &str,
		channel: ChannelKind,
		id: Option<i64>,
	) -> SubscriptionRequest {
		SubscriptionRequest {
			action: action.to_string(),
			channel,
			id,
		}
	}

	/// Test sugar over the `Channel` API: parse a request to its routing key
	/// (`parse` → `key`), the pair the old free `channel_key` used to be.
	fn channel_key(req: &SubscriptionRequest) -> Option<String> {
		Channel::parse(req).map(|c| c.key())
	}

	/// Test sugar: the full subscribe resolution `handle_socket` performs
	/// (`parse` → `authorize` → `key`). `None` on unknown kind or a scope miss.
	async fn authorize_subscription(
		ctx: &Ctx,
		mm: &ModelManager,
		req: &SubscriptionRequest,
	) -> Option<String> {
		let ch = Channel::parse(req)?;
		ch.authorize(ctx, mm).await.then(|| ch.key())
	}

	#[test]
	fn channel_key_conv_requires_id() {
		assert_eq!(
			channel_key(&sub("subscribe", ChannelKind::Conv, Some(5))),
			Some("conv:5".to_string())
		);
		assert_eq!(
			channel_key(&sub("subscribe", ChannelKind::Conv, None)),
			None
		);
	}

	#[test]
	fn unknown_channel_kind_fails_to_deserialize() {
		// `channel` is a typed `ChannelKind`, so an unknown kind is rejected while
		// deserializing the request — it never reaches `parse` (ADR-0018). A known
		// kind still deserializes.
		assert!(serde_json::from_str::<SubscriptionRequest>(
			r#"{"action":"subscribe","channel":"agent","id":1}"#
		)
		.is_err());
		assert!(serde_json::from_str::<SubscriptionRequest>(
			r#"{"action":"subscribe","channel":"","id":1}"#
		)
		.is_err());
		assert!(serde_json::from_str::<SubscriptionRequest>(
			r#"{"action":"subscribe","channel":"conv","id":1}"#
		)
		.is_ok());
	}

	#[test]
	fn channel_key_list_feeds_are_idless() {
		// The two global list-feed channels carry no id; a stray id is ignored.
		assert_eq!(
			channel_key(&sub("subscribe", ChannelKind::Agents, None)),
			Some("agents".to_string())
		);
		assert_eq!(
			channel_key(&sub("subscribe", ChannelKind::Agents, Some(7))),
			Some("agents".to_string())
		);
		assert_eq!(
			channel_key(&sub("subscribe", ChannelKind::Convs, None)),
			Some("convs".to_string())
		);
	}

	#[test]
	fn broadcast_agent_update_pokes_agents_channel() {
		let ws = WsState::new();
		let mut rx = ws.tx.subscribe();
		ws.broadcast_agent_update();
		let event = rx.try_recv().expect("an event was broadcast");
		assert!(matches!(event, WsEvent::AgentUpdate));
		assert_eq!(event.channel().key(), "agents");
	}

	#[test]
	fn broadcast_conv_update_pokes_convs_channel() {
		let ws = WsState::new();
		let mut rx = ws.tx.subscribe();
		ws.broadcast_conv_update();
		let event = rx.try_recv().expect("an event was broadcast");
		assert!(matches!(event, WsEvent::ConvUpdate));
		assert_eq!(event.channel().key(), "convs");
	}

	/// Wire-lock: the serialized envelope the front-end parses. Internal tagging
	/// puts `event_type` at the top level; the two pokes carry nothing else. This
	/// guards the contract (ADR-0010) against a serde-shape drift the generated
	/// `.d.ts` cannot show — e.g. a change of tagging mode or a variant rename.
	#[test]
	fn wsevent_wire_shape_is_stable() {
		use time::OffsetDateTime;

		assert_eq!(
			serde_json::to_value(WsEvent::AgentUpdate).unwrap(),
			serde_json::json!({ "event_type": "agent_update" }),
		);
		assert_eq!(
			serde_json::to_value(WsEvent::ConvUpdate).unwrap(),
			serde_json::json!({ "event_type": "conv_update" }),
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
		let v = serde_json::to_value(WsEvent::ConvMsg { payload: msg }).unwrap();
		assert_eq!(v["event_type"].as_str(), Some("conv_msg"));
		assert_eq!(v["payload"]["conv_id"].as_i64(), Some(7));
	}

	/// Wire-lock for the subscription vocabulary: `ChannelKind` serializes to the
	/// exact kind strings the front-end mirror is built on (ADR-0018). A rename here
	/// is a wire change; the ts-rs binding carries it to the front-end.
	#[test]
	fn channelkind_wire_shape_is_stable() {
		assert_eq!(
			serde_json::to_value(ChannelKind::Conv).unwrap(),
			serde_json::json!("conv")
		);
		assert_eq!(
			serde_json::to_value(ChannelKind::Agents).unwrap(),
			serde_json::json!("agents")
		);
		assert_eq!(
			serde_json::to_value(ChannelKind::Convs).unwrap(),
			serde_json::json!("convs")
		);
	}

	/// Wire-lock for the six Jedi kind strings (#115, ADR-0018 addendum). These are
	/// what the front-end `Channel` mirror is built on; a rename here is a wire
	/// change carried to the front-end by the ts-rs binding.
	#[test]
	fn jedi_channelkind_wire_shape_is_stable() {
		assert_eq!(
			serde_json::to_value(ChannelKind::Posts).unwrap(),
			serde_json::json!("posts")
		);
		assert_eq!(
			serde_json::to_value(ChannelKind::PostComment).unwrap(),
			serde_json::json!("post_comment")
		);
		assert_eq!(
			serde_json::to_value(ChannelKind::CaptionComment).unwrap(),
			serde_json::json!("caption_comment")
		);
		assert_eq!(
			serde_json::to_value(ChannelKind::PostLike).unwrap(),
			serde_json::json!("post_like")
		);
		assert_eq!(
			serde_json::to_value(ChannelKind::CaptionLike).unwrap(),
			serde_json::json!("caption_like")
		);
		assert_eq!(
			serde_json::to_value(ChannelKind::PostCaption).unwrap(),
			serde_json::json!("post_caption")
		);
	}

	/// Routing-key lock for the six Jedi channels (#115). `posts` is id-less; the
	/// other five key on their entity id (ADR-0018 addendum table).
	#[test]
	fn jedi_channel_keys_are_stable() {
		assert_eq!(
			channel_key(&sub("subscribe", ChannelKind::Posts, None)),
			Some("posts".to_string())
		);
		assert_eq!(
			channel_key(&sub("subscribe", ChannelKind::Posts, Some(7))),
			Some("posts".to_string()),
			"a stray id on the id-less posts channel is ignored",
		);
		assert_eq!(
			channel_key(&sub("subscribe", ChannelKind::PostComment, Some(3))),
			Some("post_comment:3".to_string())
		);
		assert_eq!(
			channel_key(&sub("subscribe", ChannelKind::CaptionComment, Some(4))),
			Some("caption_comment:4".to_string())
		);
		assert_eq!(
			channel_key(&sub("subscribe", ChannelKind::PostLike, Some(5))),
			Some("post_like:5".to_string())
		);
		assert_eq!(
			channel_key(&sub("subscribe", ChannelKind::CaptionLike, Some(6))),
			Some("caption_like:6".to_string())
		);
		assert_eq!(
			channel_key(&sub("subscribe", ChannelKind::PostCaption, Some(8))),
			Some("post_caption:8".to_string())
		);
	}

	/// An id-bearing Jedi channel with no id does not resolve — same rule as
	/// `conv` (#115). Guards against a subscribe silently keying on a missing id.
	#[test]
	fn jedi_id_bearing_channels_require_id() {
		for kind in [
			ChannelKind::PostComment,
			ChannelKind::CaptionComment,
			ChannelKind::PostLike,
			ChannelKind::CaptionLike,
			ChannelKind::PostCaption,
		] {
			assert_eq!(
				channel_key(&sub("subscribe", kind, None)),
				None,
				"{kind:?} must not resolve without an id",
			);
		}
	}

	/// Wire-lock for the four Jedi poke events (#115). Each is contentless — it
	/// carries only the id its routing key needs, never a domain row — and routes
	/// to its channel key. The two comment channels push a payload and gain no
	/// `WsEvent` variant in this expand step.
	#[test]
	fn jedi_poke_wire_shape_is_stable() {
		let posts = WsEvent::Posts;
		assert_eq!(
			serde_json::to_value(&posts).unwrap(),
			serde_json::json!({ "event_type": "posts" }),
		);
		assert_eq!(posts.channel().key(), "posts");

		let post_like = WsEvent::PostLike { post_id: 5 };
		assert_eq!(
			serde_json::to_value(&post_like).unwrap(),
			serde_json::json!({ "event_type": "post_like", "post_id": 5 }),
		);
		assert_eq!(post_like.channel().key(), "post_like:5");

		let caption_like = WsEvent::CaptionLike { caption_id: 6 };
		assert_eq!(
			serde_json::to_value(&caption_like).unwrap(),
			serde_json::json!({ "event_type": "caption_like", "caption_id": 6 }),
		);
		assert_eq!(caption_like.channel().key(), "caption_like:6");

		let post_caption = WsEvent::PostCaption { post_id: 8 };
		assert_eq!(
			serde_json::to_value(&post_caption).unwrap(),
			serde_json::json!({ "event_type": "post_caption", "post_id": 8 }),
		);
		assert_eq!(post_caption.channel().key(), "post_caption:8");
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
				&sub("subscribe", ChannelKind::Conv, Some(multi_conv_id))
			)
			.await,
			Some(format!("conv:{multi_conv_id}")),
		);
		// B may NOT subscribe to A's private conv (scope miss → None).
		assert_eq!(
			authorize_subscription(
				&ctx_b,
				&mm,
				&sub("subscribe", ChannelKind::Conv, Some(owner_conv_id))
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
				&sub("subscribe", ChannelKind::Conv, Some(owner_conv_id))
			)
			.await,
			Some(format!("conv:{owner_conv_id}")),
		);

		// The list-feed channels are contentless pokes: any authenticated caller
		// may subscribe (#85), so B is admitted to both without a DB scope check.
		assert_eq!(
			authorize_subscription(
				&ctx_b,
				&mm,
				&sub("subscribe", ChannelKind::Agents, None)
			)
			.await,
			Some("agents".to_string()),
		);
		assert_eq!(
			authorize_subscription(
				&ctx_b,
				&mm,
				&sub("subscribe", ChannelKind::Convs, None)
			)
			.await,
			Some("convs".to_string()),
		);

		// Every Jedi channel is authenticated-read (#115): B, a logged-in socket
		// with no relation to A's rows, may subscribe to the id-less `posts` feed
		// and to any Post's comment thread. No per-row scope applies.
		assert_eq!(
			authorize_subscription(
				&ctx_b,
				&mm,
				&sub("subscribe", ChannelKind::Posts, None)
			)
			.await,
			Some("posts".to_string()),
		);
		assert_eq!(
			authorize_subscription(
				&ctx_b,
				&mm,
				&sub("subscribe", ChannelKind::PostComment, Some(999))
			)
			.await,
			Some("post_comment:999".to_string()),
			"any logged-in socket may subscribe to any Post comment thread",
		);

		Ok(())
	}
}

// endregion: --- Tests
