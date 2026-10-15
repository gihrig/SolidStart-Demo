use crate::ctx::Ctx;
use crate::model::ModelManager;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// The one exported realtime **Channel** vocabulary (CONTEXT.md "Channel"): the
/// routing key an Event is addressed to and a Subscription names. It is the wire
/// kind a `SubscriptionRequest` carries, the key the send task routes on, and
/// the authorize rule — the three types ADR-0018 kept apart (`WsEvent` mapping,
/// `ChannelKind` wire, `Channel` routing), merged into one (ADR-0020). ts-rs
/// exports it, so the front-end mirrors it. Adjacently tagged: the wire is
/// `{ "kind": <string>, "id": <i64> }`, with `id` present only where the variant
/// carries one. `posts` is the id-less global list-feed poke — a subscriber
/// refetches through the `list_*` RPC, so no row crosses the push path (#85).
/// The five id-bearing Jedi channels key on their entity id (#115):
/// `post_comment:{id}`, `caption_comment:{id}`, `post_like:{id}`,
/// `caption_like:{id}`, `post_caption:{id}`.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "kind", content = "id")]
#[ts(export, export_to = "Channel.d.ts")]
pub enum Channel {
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
	pub fn key(&self) -> String {
		match self {
			Channel::Posts => "posts".to_string(),
			Channel::PostComment(id) => format!("post_comment:{id}"),
			Channel::CaptionComment(id) => format!("caption_comment:{id}"),
			Channel::PostLike(id) => format!("post_like:{id}"),
			Channel::CaptionLike(id) => format!("caption_like:{id}"),
			Channel::PostCaption(id) => format!("post_caption:{id}"),
		}
	}

	/// Whether this caller may subscribe. Uniform authenticated-read today: the
	/// list-feed poke is contentless (#85) and every Post is public (#106), so a
	/// logged-in socket suffices; identity is fixed at upgrade and a poke leaks no
	/// row. The `(ctx, mm)` arguments and the `async` stay as the seam for a future
	/// scoped channel that must read the model (ADR-0015).
	pub async fn authorize(&self, _ctx: &Ctx, _mm: &ModelManager) -> bool {
		// Exhaustive on purpose (no `_` arm): `Channel` is the shared vocabulary, so
		// a new variant must force an authorization decision here — a bare `_ => true`
		// would silently open a future scoped channel to any authenticated socket.
		match self {
			Channel::Posts
			| Channel::PostComment(_)
			| Channel::CaptionComment(_)
			| Channel::PostLike(_)
			| Channel::CaptionLike(_)
			| Channel::PostCaption(_) => true,
		}
	}
}

// region:    --- Tests

#[cfg(test)]
mod tests {
	type Result<T> = core::result::Result<T, Box<dyn std::error::Error>>;

	use super::*;
	use crate::_dev_utils::{self, seed_user};
	use serial_test::serial;

	/// Test sugar: the subscribe resolution `handle_socket` performs
	/// (`authorize` → `key`). `None` on a scope miss.
	async fn authorize_to_key(
		ctx: &Ctx,
		mm: &ModelManager,
		channel: Channel,
	) -> Option<String> {
		channel.authorize(ctx, mm).await.then(|| channel.key())
	}

	/// Wire-lock for the merged `Channel` (ADR-0020). Adjacently tagged: `kind`
	/// selects the variant, `id` rides alongside only where the variant carries one.
	/// These are the strings the front-end `channel.ts` mirror is built on; a rename
	/// or an id-placement change here is a wire change carried to the front-end by
	/// the ts-rs binding.
	#[test]
	fn channel_wire_shape_is_stable() {
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
	/// format lives; `posts` is id-less.
	#[test]
	fn channel_keys_are_stable() {
		assert_eq!(Channel::Posts.key(), "posts");
		assert_eq!(Channel::PostComment(3).key(), "post_comment:3");
		assert_eq!(Channel::CaptionComment(4).key(), "caption_comment:4");
		assert_eq!(Channel::PostLike(5).key(), "post_like:5");
		assert_eq!(Channel::CaptionLike(6).key(), "caption_like:6");
		assert_eq!(Channel::PostCaption(8).key(), "post_caption:8");
	}

	/// The subscribe gate is uniform authenticated-read (#128): B, a logged-in
	/// socket with no relation to A's rows, is admitted to every channel. No
	/// per-row scope applies, so the ids need no rows behind them.
	#[serial]
	#[tokio::test]
	async fn test_authorize_subscription_two_user() -> Result<()> {
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let fx_prefix = "test_authorize_subscription_two_user";

		let b_id = seed_user(&root, &mm, &format!("{fx_prefix}-B")).await?;
		let ctx_b = Ctx::new(b_id)?;

		for channel in [
			Channel::Posts,
			Channel::PostComment(999),
			Channel::CaptionComment(999),
			Channel::PostLike(999),
			Channel::CaptionLike(999),
			Channel::PostCaption(999),
		] {
			assert_eq!(
				authorize_to_key(&ctx_b, &mm, channel).await,
				Some(channel.key()),
				"any logged-in socket may subscribe to {}",
				channel.key(),
			);
		}

		Ok(())
	}
}

// endregion: --- Tests
