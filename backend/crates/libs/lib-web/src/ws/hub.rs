use super::poke::{
	CaptionComment, CaptionLike, PokeReceipt, PostCaption, PostComment, PostLike,
	Posts,
};
use lib_core::model::comment::{CommentRemoval, CommentView};
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
	/// Poke the global Post-list channel: the Post list may have changed (#115).
	/// Contentless — a subscriber refetches through the scoped `list_*` RPC, so no
	/// Post row crosses the push path (#85). Returns the [`PokeReceipt<Posts>`]
	/// the Post mutations need to build their result (#120).
	pub fn broadcast_posts_update(&self) -> PokeReceipt<Posts> {
		self.broadcast(WsEvent::Poke(Channel::Posts));
		PokeReceipt::new()
	}

	/// Poke one Post's like-count channel (`post_like:{post_id}`) when the like
	/// count changed (#115). Carries only the `post_id` for routing — the count
	/// is derived by refetch, never pushed. A toggle that changed no row
	/// (`changed == false`, an idempotent repeat) pokes nothing, since no client
	/// needs to refetch (#122). The condition lives here, not in the handler, so
	/// the handler cannot skip a real change. Returns the
	/// [`PokeReceipt<PostLike>`] `toggle_post_like` needs to build its result.
	pub fn broadcast_post_like(
		&self,
		post_id: i64,
		changed: bool,
	) -> PokeReceipt<PostLike> {
		if changed {
			self.broadcast(WsEvent::Poke(Channel::PostLike(post_id)));
		}
		PokeReceipt::new()
	}

	/// Poke one Caption's like-count channel (`caption_like:{caption_id}`) when
	/// the like count changed (#115). Carries only the `caption_id` for routing.
	/// The same change rule as `broadcast_post_like`: a toggle that changed no
	/// row pokes nothing (#123). Returns the [`PokeReceipt<CaptionLike>`]
	/// `toggle_caption_like` needs to build its result.
	pub fn broadcast_caption_like(
		&self,
		caption_id: i64,
		changed: bool,
	) -> PokeReceipt<CaptionLike> {
		if changed {
			self.broadcast(WsEvent::Poke(Channel::CaptionLike(caption_id)));
		}
		PokeReceipt::new()
	}

	/// Poke one Post's Caption-list channel (`post_caption:{post_id}`): the
	/// competing Captions changed or re-ranked (#115). Carries only the `post_id`;
	/// the client refetches the Top Captions list. Returns the
	/// [`PokeReceipt<PostCaption>`] `add_caption` needs to build its result (#121).
	pub fn broadcast_post_caption(&self, post_id: i64) -> PokeReceipt<PostCaption> {
		self.broadcast(WsEvent::Poke(Channel::PostCaption(post_id)));
		PokeReceipt::new()
	}

	/// Push a Post Comment add or edit on its Post's thread
	/// (`post_comment:{parent_id}`): an upsert carrying the `CommentView` (#124,
	/// #125). The envelope derives its Channel from the payload. Returns the
	/// [`PokeReceipt<PostComment>`] `add_post_comment` / `update_post_comment`
	/// need to build their result.
	pub fn broadcast_post_comment(
		&self,
		comment: &CommentView,
	) -> PokeReceipt<PostComment> {
		self.broadcast(WsEvent::PostComment {
			payload: comment.clone(),
		});
		PokeReceipt::new()
	}

	/// Push a Post Comment delete on its Post's thread: a removal carrying the
	/// Comment id and its `parent_id` (#124, #125). Returns the
	/// [`PokeReceipt<PostComment>`] `delete_post_comment` needs.
	pub fn broadcast_post_comment_removal(
		&self,
		removal: CommentRemoval,
	) -> PokeReceipt<PostComment> {
		self.broadcast(WsEvent::PostCommentRemoval { payload: removal });
		PokeReceipt::new()
	}

	/// Push a Caption Comment add or edit on its Caption's thread
	/// (`caption_comment:{parent_id}`): an upsert carrying the `CommentView`
	/// (#127). Returns the [`PokeReceipt<CaptionComment>`]
	/// `add_caption_comment` / `update_caption_comment` need.
	pub fn broadcast_caption_comment(
		&self,
		comment: &CommentView,
	) -> PokeReceipt<CaptionComment> {
		self.broadcast(WsEvent::CaptionComment {
			payload: comment.clone(),
		});
		PokeReceipt::new()
	}

	/// Push a Caption Comment delete on its Caption's thread: a removal
	/// carrying the Comment id and its `parent_id` (#127). Returns the
	/// [`PokeReceipt<CaptionComment>`] `delete_caption_comment` needs.
	pub fn broadcast_caption_comment_removal(
		&self,
		removal: CommentRemoval,
	) -> PokeReceipt<CaptionComment> {
		self.broadcast(WsEvent::CaptionCommentRemoval { payload: removal });
		PokeReceipt::new()
	}
}

// endregion: --- Helper Functions for Broadcasting

// region:    --- Tests

#[cfg(test)]
mod tests {
	use super::*;

	/// Each Jedi broadcast helper emits its poke on the right channel (#115).
	#[test]
	fn jedi_broadcast_helpers_poke_their_channels() {
		let ws = WsState::new();
		let mut rx = ws.tx.subscribe();

		ws.broadcast_posts_update();
		ws.broadcast_post_like(5, true);
		ws.broadcast_caption_like(6, true);
		ws.broadcast_post_caption(8);

		assert_eq!(rx.try_recv().unwrap().channel().key(), "posts");
		assert_eq!(rx.try_recv().unwrap().channel().key(), "post_like:5");
		assert_eq!(rx.try_recv().unwrap().channel().key(), "caption_like:6");
		assert_eq!(rx.try_recv().unwrap().channel().key(), "post_caption:8");
	}

	/// A Post Comment add / edit pushes the view, and a delete pushes the
	/// removal, each on the Post's thread Channel (#124, #125).
	#[test]
	fn post_comment_helpers_push_on_the_post_thread() {
		use lib_core::model::user::AuthorRef;
		use time::OffsetDateTime;

		let ws = WsState::new();
		let mut rx = ws.tx.subscribe();
		let comment = CommentView {
			id: 3,
			parent_id: 7,
			author: AuthorRef {
				id: 2,
				name: "Lisa".to_string(),
				avatar_url: None,
			},
			content_html: "<p>hi</p>".to_string(),
			ctime: OffsetDateTime::UNIX_EPOCH,
			mtime: OffsetDateTime::UNIX_EPOCH,
		};

		let _receipt: PokeReceipt<PostComment> = ws.broadcast_post_comment(&comment);
		let _receipt: PokeReceipt<PostComment> =
			ws.broadcast_post_comment_removal(CommentRemoval {
				id: 3,
				parent_id: 7,
			});

		let upsert = rx.try_recv().unwrap();
		assert!(
			matches!(&upsert, WsEvent::PostComment { payload } if payload.id == 3)
		);
		assert_eq!(upsert.channel().key(), "post_comment:7");
		let removal = rx.try_recv().unwrap();
		assert!(matches!(
			&removal,
			WsEvent::PostCommentRemoval { payload } if payload.id == 3
		));
		assert_eq!(removal.channel().key(), "post_comment:7");
	}

	/// A Caption Comment add / edit pushes the view, and a delete pushes the
	/// removal, each on the Caption's thread Channel (#127).
	#[test]
	fn caption_comment_helpers_push_on_the_caption_thread() {
		use lib_core::model::user::AuthorRef;
		use time::OffsetDateTime;

		let ws = WsState::new();
		let mut rx = ws.tx.subscribe();
		let comment = CommentView {
			id: 3,
			parent_id: 7,
			author: AuthorRef::unknown(2),
			content_html: "<p>hi</p>".to_string(),
			ctime: OffsetDateTime::UNIX_EPOCH,
			mtime: OffsetDateTime::UNIX_EPOCH,
		};

		let _receipt: PokeReceipt<CaptionComment> =
			ws.broadcast_caption_comment(&comment);
		let _receipt: PokeReceipt<CaptionComment> = ws
			.broadcast_caption_comment_removal(CommentRemoval {
				id: 3,
				parent_id: 7,
			});

		let upsert = rx.try_recv().unwrap();
		assert!(
			matches!(&upsert, WsEvent::CaptionComment { payload } if payload.id == 3)
		);
		assert_eq!(upsert.channel().key(), "caption_comment:7");
		let removal = rx.try_recv().unwrap();
		assert!(matches!(
			&removal,
			WsEvent::CaptionCommentRemoval { payload } if payload.id == 3
		));
		assert_eq!(removal.channel().key(), "caption_comment:7");
	}

	/// A like toggle that changed no row pokes nothing (#122): no client needs to
	/// refetch, but the handler still gets its receipt.
	#[test]
	fn broadcast_post_like_unchanged_pokes_nothing() {
		let ws = WsState::new();
		let mut rx = ws.tx.subscribe();
		let _receipt: PokeReceipt<PostLike> = ws.broadcast_post_like(5, false);
		assert!(rx.try_recv().is_err(), "an unchanged Like must not poke");
	}

	/// The same rule for a Caption Like (#123): a toggle that changed no row
	/// pokes nothing, but the handler still gets its receipt.
	#[test]
	fn broadcast_caption_like_unchanged_pokes_nothing() {
		let ws = WsState::new();
		let mut rx = ws.tx.subscribe();
		let _receipt: PokeReceipt<CaptionLike> = ws.broadcast_caption_like(6, false);
		assert!(rx.try_recv().is_err(), "an unchanged Like must not poke");
	}
}

// endregion: --- Tests
