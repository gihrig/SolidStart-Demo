use crate::ctx::Ctx;
use crate::model::conv::ConvBmc;
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
/// carries one. `conv:{id}` names one Conversation's Event stream (C03/Q9);
/// `agents`, `convs` and `posts` are id-less global list-feed pokes — a subscriber
/// refetches through the scoped `list_*` RPC, so no row crosses the push path
/// (#85). The five id-bearing Jedi channels key on their entity id (#115):
/// `post_comment:{id}`, `caption_comment:{id}`, `post_like:{id}`,
/// `caption_like:{id}`, `post_caption:{id}`.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "kind", content = "id")]
#[ts(export, export_to = "Channel.d.ts")]
pub enum Channel {
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
	pub fn key(&self) -> String {
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
	pub async fn authorize(&self, ctx: &Ctx, mm: &ModelManager) -> bool {
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

// region:    --- Tests

#[cfg(test)]
mod tests {
	type Result<T> = core::result::Result<T, Box<dyn std::error::Error>>;

	use super::*;
	use crate::_dev_utils::{self, seed_agent, seed_user};
	use crate::model::conv::{ConvForCreate, ConvKind};
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

	/// C03 subscribe gate: entitlement reuses the C01 read scope. User B may
	/// subscribe to A's `MultiUsers` conv but not A's `OwnerOnly` one. Every other
	/// channel is authenticated-read, so B is admitted without a DB scope check.
	/// (The scope itself is proven in `test_access_scope_conv_two_user`.)
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
			authorize_to_key(&ctx_b, &mm, Channel::Conv(multi_conv_id)).await,
			Some(format!("conv:{multi_conv_id}")),
		);
		// B may NOT subscribe to A's private conv (scope miss → None).
		assert_eq!(
			authorize_to_key(&ctx_b, &mm, Channel::Conv(owner_conv_id)).await,
			None,
			"B must not subscribe to A's OwnerOnly conv",
		);
		// A may subscribe to its own private conv.
		assert_eq!(
			authorize_to_key(&ctx_a, &mm, Channel::Conv(owner_conv_id)).await,
			Some(format!("conv:{owner_conv_id}")),
		);

		// The list-feed channels are contentless pokes: any authenticated caller
		// may subscribe (#85), so B is admitted to both without a DB scope check.
		assert_eq!(
			authorize_to_key(&ctx_b, &mm, Channel::Agents).await,
			Some("agents".to_string()),
		);
		assert_eq!(
			authorize_to_key(&ctx_b, &mm, Channel::Convs).await,
			Some("convs".to_string()),
		);

		// Every Jedi channel is authenticated-read (#115): B, a logged-in socket
		// with no relation to A's rows, may subscribe to the id-less `posts` feed
		// and to any Post's comment thread. No per-row scope applies.
		assert_eq!(
			authorize_to_key(&ctx_b, &mm, Channel::Posts).await,
			Some("posts".to_string()),
		);
		assert_eq!(
			authorize_to_key(&ctx_b, &mm, Channel::PostComment(999)).await,
			Some("post_comment:999".to_string()),
			"any logged-in socket may subscribe to any Post comment thread",
		);

		Ok(())
	}
}

// endregion: --- Tests
