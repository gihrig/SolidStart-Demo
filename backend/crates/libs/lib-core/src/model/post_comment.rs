use crate::ctx::Ctx;
use crate::generate_common_bmc_fns;
use crate::model::base::{self, Access, CommonIden, DbBmc, FieldHygiene};
use crate::model::modql_utils::time_to_sea_value;
use crate::model::post::PostBmc;
use crate::model::ModelManager;
use crate::model::Result;
use lib_utils::time::Rfc3339;
use modql::field::Fields;
use modql::filter::{
	FilterNodes, ListOptions, OpValsInt64, OpValsString, OpValsValue,
};
use sea_query::{Condition, Expr};
use serde::{Deserialize, Serialize};
use serde_with::serde_as;
use sqlx::FromRow;
use time::OffsetDateTime;
use ts_rs::TS;

// region:    --- PostComment Types

/// The `post_comment` row (#124): one User's remark in a Post's thread. Every
/// Comment is public — read is unscoped, write is owner-only (the same access
/// shape as `Post`). It is the thread read's row and the upsert payload on
/// `post_comment:{post_id}`. #125 replaces both with a `CommentView`.
#[serde_as]
#[derive(Debug, Clone, Fields, FromRow, Serialize, TS)]
#[ts(export, export_to = "PostComment.d.ts")]
pub struct PostComment {
	pub id: i64,

	// -- Relations
	pub post_id: i64,
	pub owner_id: i64,

	// -- Properties
	pub content: String,

	// -- Timestamps
	// creator user_id and time
	pub cid: i64,
	#[serde_as(as = "Rfc3339")]
	#[ts(type = "string")]
	pub ctime: OffsetDateTime,
	// last modifier user_id and time
	pub mid: i64,
	#[serde_as(as = "Rfc3339")]
	#[ts(type = "string")]
	pub mtime: OffsetDateTime,
}

/// The `add_post_comment` input (#124). The Owner is the caller (`ctx`), never
/// the payload. Exported so the front-end sends the one wire shape.
#[derive(Fields, Deserialize, Default, TS)]
#[ts(export, export_to = "PostCommentForCreate.d.ts")]
pub struct PostCommentForCreate {
	pub post_id: i64,
	pub content: String,
}

/// The `update_post_comment` input (#124): the new content.
#[derive(Fields, Deserialize, Default, TS)]
#[ts(export, export_to = "PostCommentForUpdate.d.ts")]
pub struct PostCommentForUpdate {
	// Note: `owner_id` and `post_id` are intentionally not updatable — the
	//       owner-only Write scope keys on `owner_id`, and a Comment belongs to
	//       one Post for life.
	pub content: String,
}

/// A removed Comment (#124): the `delete_post_comment` result and the removal
/// payload on `post_comment:{post_id}`. It carries the `post_id` because the
/// event derives its Channel from the payload (ADR-0020).
#[derive(Debug, Clone, Copy, Serialize, TS)]
#[ts(export, export_to = "PostCommentRemoval.d.ts")]
pub struct PostCommentRemoval {
	pub id: i64,
	pub post_id: i64,
}

#[derive(FilterNodes, Deserialize, Default, Debug)]
pub struct PostCommentFilter {
	pub id: Option<OpValsInt64>,
	pub post_id: Option<OpValsInt64>,
	pub owner_id: Option<OpValsInt64>,
	pub content: Option<OpValsString>,

	pub cid: Option<OpValsInt64>,
	#[modql(to_sea_value_fn = "time_to_sea_value")]
	pub ctime: Option<OpValsValue>,
	pub mid: Option<OpValsInt64>,
	#[modql(to_sea_value_fn = "time_to_sea_value")]
	pub mtime: Option<OpValsValue>,
}

// endregion: --- PostComment Types

// region:    --- PostCommentBmc

pub struct PostCommentBmc;

impl DbBmc for PostCommentBmc {
	const TABLE: &'static str = "post_comment";

	fn has_owner_id() -> bool {
		true
	}

	/// Every Comment is public (#106, #113): Read is unscoped (`None`), so any
	/// caller reads every thread. Write is owner-only (`owner_id = me`), so only
	/// the Owner may edit or delete. The root context bypasses this hook (see
	/// `base`).
	fn access_scope(ctx: &Ctx, access: Access) -> Option<Condition> {
		match access {
			Access::Read => None,
			Access::Write => Some(
				Condition::all()
					.add(Expr::col(CommonIden::OwnerId).eq(ctx.user_id())),
			),
		}
	}

	/// The Comment content submits to write-path hygiene (ADR-0019):
	/// NFC-normalize, trim, reject control / zero-width / bidirectional
	/// characters, and cap the length at 2000 characters (#124).
	fn hygiene_rules() -> &'static [FieldHygiene] {
		const RULES: &[FieldHygiene] = &[FieldHygiene {
			field: "content",
			max_len: Some(2000),
		}];
		RULES
	}
}

// `create` is hand-written (below) so it can reject an unknown Post as a client
// error; the macro therefore gets no `ForCreate`.
generate_common_bmc_fns!(
	Bmc: PostCommentBmc,
	Entity: PostComment,
	ForUpdate: PostCommentForUpdate,
	Filter: PostCommentFilter,
);

impl PostCommentBmc {
	/// Add a Comment to a Post (#124). `owner_id` is `ctx.user_id()` (owner-only
	/// write); any logged-in User may comment on any Post (every Post is
	/// public). An unknown `post_id` is a `Validation` error, rejected before
	/// the insert, not a foreign-key failure.
	pub async fn create(
		ctx: &Ctx,
		mm: &ModelManager,
		comment_c: PostCommentForCreate,
	) -> Result<i64> {
		base::require_exists::<PostBmc>(
			ctx,
			mm,
			comment_c.post_id,
			"post_id",
			"unknown Post",
		)
		.await?;

		base::create::<Self, _>(ctx, mm, comment_c).await
	}

	/// List one Post's Comments, oldest first (#124). Ties break by id
	/// ascending. The caller's `order_bys` is ignored: a thread reads in time
	/// order. `limit` / `offset` page it under the shared list-limit contract
	/// (no limit -> 1000). Read is unscoped: every Comment is public. A Post
	/// with no Comments (or no such Post) yields an empty list.
	pub async fn list_for_post(
		ctx: &Ctx,
		mm: &ModelManager,
		post_id: i64,
		list_options: Option<ListOptions>,
	) -> Result<Vec<PostComment>> {
		let list_options = ListOptions {
			order_bys: Some(vec!["ctime", "id"].into()),
			..list_options.unwrap_or_default()
		};
		Self::list(
			ctx,
			mm,
			Some(vec![PostCommentFilter {
				post_id: Some(post_id.into()),
				..Default::default()
			}]),
			Some(list_options),
		)
		.await
	}
}

// endregion: --- PostCommentBmc

// region:    --- Tests

#[cfg(test)]
mod tests {
	type Result<T> = core::result::Result<T, Box<dyn std::error::Error>>; // For tests.

	use super::*;
	use crate::_dev_utils::{self, seed_post, seed_post_comment, seed_user};
	use crate::model;
	use serial_test::serial;

	/// Adding a Comment (#124): the caller is the Owner, the content is stored
	/// after hygiene, and the thread lists only that Post's Comments, oldest
	/// first.
	#[serial]
	#[tokio::test]
	async fn test_post_comment_create_and_list_for_post() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let poster_id = seed_user(&root, &mm, "test_pc_list-poster").await?;
		let author_id = seed_user(&root, &mm, "test_pc_list-author").await?;
		let post_id =
			seed_post(&Ctx::new(poster_id)?, &mm, "test_pc_list post", &[1]).await?;
		let other_post =
			seed_post(&Ctx::new(poster_id)?, &mm, "test_pc_list other", &[1])
				.await?;
		let ctx = Ctx::new(author_id)?;

		// -- Exec: a non-owner of the Post comments on it, twice.
		let first = seed_post_comment(&ctx, &mm, post_id, "  first  ").await?;
		let second = seed_post_comment(&ctx, &mm, post_id, "second").await?;
		seed_post_comment(&ctx, &mm, other_post, "elsewhere").await?;
		let thread = PostCommentBmc::list_for_post(&ctx, &mm, post_id, None).await?;

		// -- Check: oldest first; the other Post's Comment is excluded.
		let ids: Vec<i64> = thread.iter().map(|c| c.id).collect();
		assert_eq!(ids, vec![first, second]);
		assert_eq!(thread[0].post_id, post_id);
		assert_eq!(thread[0].owner_id, author_id);
		assert_eq!(thread[0].content, "first", "hygiene trims the content");

		// -- Clean (user delete cascades Posts and Comments)
		_dev_utils::clean_users(&root, &mm, "test_pc_list").await?;

		Ok(())
	}

	/// A Comment on an unknown Post is a client error (`Validation` on
	/// `post_id`), not a foreign-key failure (#124).
	#[serial]
	#[tokio::test]
	async fn test_post_comment_unknown_post_rejected() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let owner_id = seed_user(&root, &mm, "test_pc_no_post-owner").await?;
		let ctx = Ctx::new(owner_id)?;

		// -- Exec & Check
		let res = seed_post_comment(&ctx, &mm, 999_999, "orphan").await;
		assert!(
			matches!(&res, Err(model::Error::Validation { field, .. })
				if field == "post_id"),
			"got {res:?}"
		);

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_pc_no_post-owner").await?;

		Ok(())
	}

	/// Every Comment is public, and write is owner-only (#124): a non-owner
	/// reads the thread, but a non-owner edit or delete is `EntityNotFound`.
	/// The Owner may edit and delete.
	#[serial]
	#[tokio::test]
	async fn test_post_comment_write_is_owner_only() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let a_id = seed_user(&root, &mm, "test_pc_owner_only-A").await?;
		let b_id = seed_user(&root, &mm, "test_pc_owner_only-B").await?;
		let ctx_a = Ctx::new(a_id)?;
		let ctx_b = Ctx::new(b_id)?;
		let post_id =
			seed_post(&ctx_a, &mm, "test_pc_owner_only post", &[1]).await?;
		let id = seed_post_comment(&ctx_a, &mm, post_id, "A's comment").await?;
		let edit = |content: &str| PostCommentForUpdate {
			content: content.to_string(),
		};

		// -- Check: B reads A's Comment (public read).
		let thread =
			PostCommentBmc::list_for_post(&ctx_b, &mm, post_id, None).await?;
		assert_eq!(thread.len(), 1);

		// -- Check: B cannot edit or delete A's Comment.
		assert!(
			matches!(
				PostCommentBmc::update(&ctx_b, &mm, id, edit("hijack")).await,
				Err(model::Error::EntityNotFound { .. })
			),
			"B edit A's Comment should be EntityNotFound"
		);
		assert!(
			matches!(
				PostCommentBmc::delete(&ctx_b, &mm, id).await,
				Err(model::Error::EntityNotFound { .. })
			),
			"B delete A's Comment should be EntityNotFound"
		);

		// -- Check: A (the Owner) edits, then deletes.
		PostCommentBmc::update(&ctx_a, &mm, id, edit("owner edit")).await?;
		assert_eq!(
			PostCommentBmc::get(&ctx_b, &mm, id).await?.content,
			"owner edit"
		);
		PostCommentBmc::delete(&ctx_a, &mm, id).await?;
		assert!(PostCommentBmc::list_for_post(&ctx_a, &mm, post_id, None)
			.await?
			.is_empty());

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_pc_owner_only").await?;

		Ok(())
	}

	/// Comment content is capped at 2000 characters by write-path hygiene
	/// (#124): 2000 is accepted, 2001 is rejected as a `Validation` error on
	/// `content`, on both add and edit.
	#[serial]
	#[tokio::test]
	async fn test_post_comment_content_capped_at_2000() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let owner_id = seed_user(&root, &mm, "test_pc_len-owner").await?;
		let ctx = Ctx::new(owner_id)?;
		let post_id = seed_post(&ctx, &mm, "test_pc_len post", &[1]).await?;
		fn is_content_error<T>(res: &model::Result<T>) -> bool {
			matches!(res, Err(model::Error::Validation { field, .. })
				if field == "content")
		}

		// -- Exec & Check: exactly 2000 characters is accepted.
		let id = seed_post_comment(&ctx, &mm, post_id, &"a".repeat(2000)).await?;

		// -- Exec & Check: 2001 characters is rejected on add and on edit.
		let res = seed_post_comment(&ctx, &mm, post_id, &"a".repeat(2001)).await;
		assert!(is_content_error(&res), "add: got {res:?}");
		let res = PostCommentBmc::update(
			&ctx,
			&mm,
			id,
			PostCommentForUpdate {
				content: "a".repeat(2001),
			},
		)
		.await;
		assert!(is_content_error(&res), "edit: got {res:?}");

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_pc_len-owner").await?;

		Ok(())
	}

	/// Wire-lock for the removal payload (#124): the Comment id and its
	/// `post_id`, nothing else.
	#[test]
	fn test_post_comment_removal_wire_shape() {
		assert_eq!(
			serde_json::to_value(PostCommentRemoval { id: 3, post_id: 7 }).unwrap(),
			serde_json::json!({ "id": 3, "post_id": 7 })
		);
	}
}

// endregion: --- Tests
