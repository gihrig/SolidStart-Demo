use super::poke::{Agents, Conv, Convs, PokeReceipt};
use lib_core::model::conv_msg::ConvMsg;
use lib_core::realtime::{Channel, WsEvent};
use tokio::sync::broadcast;

// region:    --- WebSocket State

/// The broadcast hub: one `tokio::broadcast` channel that fans every [`WsEvent`]
/// to all connected sockets. Held as an `rpc-router` resource, so a mutation
/// handler can poke a feed through the typed `broadcast_*` helpers.
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
	/// `broadcast_*` helper, so this is not part of the module's public surface.
	fn broadcast(&self, event: WsEvent) {
		// Ignore send errors (no subscribers)
		let _ = self.tx.send(event);
	}
}

// endregion: --- WebSocket State

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
	// call them in the follow-up contract step (#113). As lib-web public API they
	// need no dead-code allowance; the tests construct them.

	/// Poke the global Post-list channel: the Post list may have changed (#115).
	/// Contentless — a subscriber refetches through the scoped `list_*` RPC, so no
	/// Post row crosses the push path (#85).
	pub fn broadcast_posts_update(&self) {
		self.broadcast(WsEvent::Poke(Channel::Posts));
	}

	/// Poke one Post's like-count channel (`post_like:{post_id}`): the like count
	/// changed (#115). Carries only the `post_id` for routing — the count is
	/// derived by refetch, never pushed.
	pub fn broadcast_post_like(&self, post_id: i64) {
		self.broadcast(WsEvent::Poke(Channel::PostLike(post_id)));
	}

	/// Poke one Caption's like-count channel (`caption_like:{caption_id}`): the
	/// like count changed (#115). Carries only the `caption_id` for routing.
	pub fn broadcast_caption_like(&self, caption_id: i64) {
		self.broadcast(WsEvent::Poke(Channel::CaptionLike(caption_id)));
	}

	/// Poke one Post's Caption-list channel (`post_caption:{post_id}`): the
	/// competing Captions changed or re-ranked (#115). Carries only the `post_id`;
	/// the client refetches the Top Captions list.
	pub fn broadcast_post_caption(&self, post_id: i64) {
		self.broadcast(WsEvent::Poke(Channel::PostCaption(post_id)));
	}
}

// endregion: --- Helper Functions for Broadcasting

// region:    --- Tests

#[cfg(test)]
mod tests {
	use super::*;

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
}

// endregion: --- Tests
