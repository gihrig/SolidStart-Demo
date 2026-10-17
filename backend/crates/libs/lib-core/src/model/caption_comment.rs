use crate::ctx::Ctx;
use crate::generate_common_bmc_fns;
use crate::model::base::{self, Access, CommonIden, DbBmc, FieldHygiene};
use crate::model::caption::CaptionBmc;
use crate::model::comment::{
	self, CommentParts, CommentSource, CommentTarget, CommentView,
};
use crate::model::modql_utils::time_to_sea_value;
use crate::model::ModelManager;
use crate::model::Result;
use modql::field::Fields;
use modql::filter::{
	FilterNodes, ListOptions, OpValsInt64, OpValsString, OpValsValue,
};
use sea_query::{Condition, Expr};
use serde::Deserialize;
use sqlx::FromRow;
use time::OffsetDateTime;
use ts_rs::TS;

// region:    --- CaptionComment Types

/// The `caption_comment` row (#127): one User's remark in a Caption's thread.
/// Every Comment is public — read is unscoped, write is owner-only (the same
/// access shape as `PostComment`). No wire carries this row: the thread read,
/// the write results and the upsert Event carry its `CommentView`. So it
/// derives no `Serialize` and no `TS`.
#[derive(Debug, Clone, Fields, FromRow)]
pub struct CaptionComment {
	pub id: i64,

	// -- Relations
	pub caption_id: i64,
	pub owner_id: i64,

	// -- Properties
	pub content: String,

	// -- Timestamps
	// creator user_id and time
	pub cid: i64,
	pub ctime: OffsetDateTime,
	// last modifier user_id and time
	pub mid: i64,
	pub mtime: OffsetDateTime,
}

/// The `add_caption_comment` input (#127). The Owner is the caller (`ctx`),
/// never the payload. Exported so the front-end sends the one wire shape.
#[derive(Fields, Deserialize, Default, TS)]
#[ts(export, export_to = "CaptionCommentForCreate.d.ts")]
pub struct CaptionCommentForCreate {
	pub caption_id: i64,
	pub content: String,
}

/// The `update_caption_comment` input (#127): the new content.
#[derive(Fields, Deserialize, Default, TS)]
#[ts(export, export_to = "CaptionCommentForUpdate.d.ts")]
pub struct CaptionCommentForUpdate {
	// Note: `owner_id` and `caption_id` are intentionally not updatable — the
	//       owner-only Write scope keys on `owner_id`, and a Comment belongs to
	//       one Caption for life.
	pub content: String,
}

#[derive(FilterNodes, Deserialize, Default, Debug)]
pub struct CaptionCommentFilter {
	pub id: Option<OpValsInt64>,
	pub caption_id: Option<OpValsInt64>,
	pub owner_id: Option<OpValsInt64>,
	pub content: Option<OpValsString>,

	pub cid: Option<OpValsInt64>,
	#[modql(to_sea_value_fn = "time_to_sea_value")]
	pub ctime: Option<OpValsValue>,
	pub mid: Option<OpValsInt64>,
	#[modql(to_sea_value_fn = "time_to_sea_value")]
	pub mtime: Option<OpValsValue>,
}

// endregion: --- CaptionComment Types

// region:    --- CaptionCommentBmc

pub struct CaptionCommentBmc;

impl DbBmc for CaptionCommentBmc {
	const TABLE: &'static str = "caption_comment";

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

	/// The Comment content submits to write-path hygiene (ADR-0019), with the
	/// same 2000-character cap as a Post Comment (#127).
	fn hygiene_rules() -> &'static [FieldHygiene] {
		const RULES: &[FieldHygiene] = &[FieldHygiene {
			field: "content",
			max_len: Some(2000),
			required: true,
		}];
		RULES
	}
}

impl CommentTarget for CaptionCommentBmc {
	const PARENT_COL: &'static str = "caption_id";
	const UNKNOWN_PARENT: &'static str = "unknown Caption";
	type Parent = CaptionBmc;
	type Row = CaptionComment;

	fn parts(c: CaptionComment) -> CommentParts {
		CommentParts {
			id: c.id,
			parent_id: c.caption_id,
			owner_id: c.owner_id,
			content: c.content,
			ctime: c.ctime,
			mtime: c.mtime,
		}
	}
}

// `create` is hand-written (below) so it can reject an unknown Caption as a
// client error; the macro therefore gets no `ForCreate`.
generate_common_bmc_fns!(
	Bmc: CaptionCommentBmc,
	Entity: CaptionComment,
	ForUpdate: CaptionCommentForUpdate,
	Filter: CaptionCommentFilter,
);

// The thin target-typed doors to the shared Comment module (`model::comment`).
impl CaptionCommentBmc {
	/// Add a Comment to a Caption (#127). An unknown `caption_id` is a
	/// `Validation` error (see `comment::create`).
	pub async fn create(
		ctx: &Ctx,
		mm: &ModelManager,
		comment_c: CaptionCommentForCreate,
	) -> Result<i64> {
		comment::create::<Self, _>(ctx, mm, comment_c.caption_id, comment_c).await
	}

	/// Read one Comment as its `CommentView`.
	pub async fn get_comment(
		ctx: &Ctx,
		mm: &ModelManager,
		id: i64,
	) -> Result<CommentView> {
		comment::get_comment::<Self>(ctx, mm, id).await
	}

	/// Read the stored text of the caller's own Comment, for the edit form.
	pub async fn get_source(
		ctx: &Ctx,
		mm: &ModelManager,
		id: i64,
	) -> Result<CommentSource> {
		comment::get_source::<Self>(ctx, mm, id).await
	}

	/// List one Caption's Comments as `CommentView`s, newest first.
	pub async fn list_for_caption(
		ctx: &Ctx,
		mm: &ModelManager,
		caption_id: i64,
		list_options: Option<ListOptions>,
	) -> Result<Vec<CommentView>> {
		comment::list_for_parent::<Self>(ctx, mm, caption_id, list_options).await
	}
}

// endregion: --- CaptionCommentBmc

// region:    --- Tests

#[cfg(test)]
mod tests {
	type Result<T> = core::result::Result<T, Box<dyn std::error::Error>>; // For tests.

	use super::*;
	use crate::_dev_utils::{
		self, seed_caption, seed_caption_comment, seed_post, seed_user,
	};
	use crate::model;
	use serial_test::serial;

	/// One Post and one Caption on it, owned by `ctx`: the parent of a Caption
	/// thread. Cleanup rides the owner delete, which cascades.
	async fn fx_caption(ctx: &Ctx, mm: &ModelManager, title: &str) -> Result<i64> {
		let post_id = seed_post(ctx, mm, title, &[1]).await?;
		Ok(seed_caption(ctx, mm, post_id, "a caption").await?)
	}

	/// Adding a Comment (#127): the caller is the Owner, and the content is
	/// stored after hygiene. The thread lists only that Caption's Comments as
	/// `CommentView`s, newest first. Each view carries its author snapshot, and
	/// a new Comment has `ctime` equal to `mtime`.
	#[serial]
	#[tokio::test]
	async fn test_caption_comment_create_and_list_for_caption() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let poster_id = seed_user(&root, &mm, "test_cc_list-poster").await?;
		let author_id = seed_user(&root, &mm, "test_cc_list-author").await?;
		let poster = Ctx::new(poster_id)?;
		let caption_id = fx_caption(&poster, &mm, "test_cc_list post").await?;
		let other_caption = fx_caption(&poster, &mm, "test_cc_list other").await?;
		let ctx = Ctx::new(author_id)?;
		let lisa = Ctx::new(1)?; // the seeded author User with an avatar

		// -- Exec: two non-owners of the Caption comment on it.
		let first = seed_caption_comment(&ctx, &mm, caption_id, "  first  ").await?;
		let second = seed_caption_comment(&lisa, &mm, caption_id, "second").await?;
		seed_caption_comment(&ctx, &mm, other_caption, "elsewhere").await?;
		let thread =
			CaptionCommentBmc::list_for_caption(&ctx, &mm, caption_id, None).await?;

		// -- Check: newest first; the other Caption's Comment is excluded.
		let ids: Vec<i64> = thread.iter().map(|c| c.id).collect();
		assert_eq!(ids, vec![second, first]);
		let (lisas, mine) = (&thread[0], &thread[1]);
		assert_eq!(mine.parent_id, caption_id);
		assert_eq!(mine.author.id, author_id);
		assert_eq!(mine.author.name, "test_cc_list-author");
		assert_eq!(mine.author.avatar_url, None);
		assert_eq!(
			mine.content_html, "<p>first</p>",
			"hygiene trims the content"
		);
		assert_eq!(mine.ctime, mine.mtime, "a create writes one time to both");
		assert_eq!(lisas.author.name, "Lisa");

		// -- Clean (user delete cascades Posts, Captions and Comments)
		_dev_utils::clean_users(&root, &mm, "test_cc_list").await?;

		Ok(())
	}

	/// An edit moves `mtime` past `ctime`, which the "(edited)" mark reads.
	/// `get_comment` returns the edited view.
	#[serial]
	#[tokio::test]
	async fn test_caption_comment_edit_sets_mtime() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let owner_id = seed_user(&root, &mm, "test_cc_mtime-owner").await?;
		let ctx = Ctx::new(owner_id)?;
		let caption_id = fx_caption(&ctx, &mm, "test_cc_mtime post").await?;
		let id = seed_caption_comment(&ctx, &mm, caption_id, "before").await?;
		let created = CaptionCommentBmc::get_comment(&ctx, &mm, id).await?;

		// -- Exec
		CaptionCommentBmc::update(
			&ctx,
			&mm,
			id,
			CaptionCommentForUpdate {
				content: "after".to_string(),
			},
		)
		.await?;
		let edited = CaptionCommentBmc::get_comment(&ctx, &mm, id).await?;

		// -- Check
		assert_eq!(created.ctime, created.mtime);
		assert_eq!(edited.content_html, "<p>after</p>");
		assert_eq!(edited.ctime, created.ctime, "an edit keeps ctime");
		assert!(edited.mtime > edited.ctime, "an edit moves mtime");

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_cc_mtime-owner").await?;

		Ok(())
	}

	/// The edit form's read: the Owner gets the stored text as a
	/// `CommentSource`, and a non-owner gets `EntityNotFound` (the Write scope).
	#[serial]
	#[tokio::test]
	async fn test_caption_comment_get_source_is_owner_only() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let a_id = seed_user(&root, &mm, "test_cc_source-A").await?;
		let b_id = seed_user(&root, &mm, "test_cc_source-B").await?;
		let ctx_a = Ctx::new(a_id)?;
		let ctx_b = Ctx::new(b_id)?;
		let caption_id = fx_caption(&ctx_a, &mm, "test_cc_source post").await?;
		let id = seed_caption_comment(&ctx_a, &mm, caption_id, "**bold**").await?;

		// -- Exec: the Owner's read.
		let source = CaptionCommentBmc::get_source(&ctx_a, &mm, id).await?;

		// -- Check: the Owner gets the stored markdown.
		assert_eq!(source.id, id);
		assert_eq!(source.content, "**bold**");

		// -- Check: a non-owner gets `EntityNotFound`.
		let res = CaptionCommentBmc::get_source(&ctx_b, &mm, id).await;
		assert!(
			matches!(res, Err(model::Error::EntityNotFound { .. })),
			"got {res:?}"
		);

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_cc_source").await?;

		Ok(())
	}

	/// A Comment on an unknown Caption is a client error (`Validation` on
	/// `caption_id`), not a foreign-key failure.
	#[serial]
	#[tokio::test]
	async fn test_caption_comment_unknown_caption_rejected() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let owner_id = seed_user(&root, &mm, "test_cc_no_caption-owner").await?;
		let ctx = Ctx::new(owner_id)?;

		// -- Exec & Check
		let res = seed_caption_comment(&ctx, &mm, 999_999, "orphan").await;
		assert!(
			matches!(&res, Err(model::Error::Validation { field, reason })
				if field == "caption_id" && reason == "unknown Caption"),
			"got {res:?}"
		);

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_cc_no_caption-owner").await?;

		Ok(())
	}

	/// Every Comment is public, and write is owner-only: a non-owner reads the
	/// thread, but a non-owner edit or delete is `EntityNotFound`. The Owner may
	/// edit and delete.
	#[serial]
	#[tokio::test]
	async fn test_caption_comment_write_is_owner_only() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let a_id = seed_user(&root, &mm, "test_cc_owner_only-A").await?;
		let b_id = seed_user(&root, &mm, "test_cc_owner_only-B").await?;
		let ctx_a = Ctx::new(a_id)?;
		let ctx_b = Ctx::new(b_id)?;
		let caption_id = fx_caption(&ctx_a, &mm, "test_cc_owner_only post").await?;
		let id =
			seed_caption_comment(&ctx_a, &mm, caption_id, "A's comment").await?;
		let edit = |content: &str| CaptionCommentForUpdate {
			content: content.to_string(),
		};

		// -- Check: B reads A's Comment (public read).
		let thread =
			CaptionCommentBmc::list_for_caption(&ctx_b, &mm, caption_id, None)
				.await?;
		assert_eq!(thread.len(), 1);

		// -- Check: B cannot edit or delete A's Comment.
		assert!(
			matches!(
				CaptionCommentBmc::update(&ctx_b, &mm, id, edit("hijack")).await,
				Err(model::Error::EntityNotFound { .. })
			),
			"B edit A's Comment should be EntityNotFound"
		);
		assert!(
			matches!(
				CaptionCommentBmc::delete(&ctx_b, &mm, id).await,
				Err(model::Error::EntityNotFound { .. })
			),
			"B delete A's Comment should be EntityNotFound"
		);

		// -- Check: A (the Owner) edits, then deletes.
		CaptionCommentBmc::update(&ctx_a, &mm, id, edit("owner edit")).await?;
		assert_eq!(
			CaptionCommentBmc::get(&ctx_b, &mm, id).await?.content,
			"owner edit"
		);
		CaptionCommentBmc::delete(&ctx_a, &mm, id).await?;
		assert!(
			CaptionCommentBmc::list_for_caption(&ctx_a, &mm, caption_id, None)
				.await?
				.is_empty()
		);

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_cc_owner_only").await?;

		Ok(())
	}

	/// Comment content is capped at 2000 characters by write-path hygiene:
	/// 2000 is accepted, 2001 is rejected as a `Validation` error on `content`.
	#[serial]
	#[tokio::test]
	async fn test_caption_comment_content_capped_at_2000() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let owner_id = seed_user(&root, &mm, "test_cc_len-owner").await?;
		let ctx = Ctx::new(owner_id)?;
		let caption_id = fx_caption(&ctx, &mm, "test_cc_len post").await?;

		// -- Exec & Check: exactly 2000 characters is accepted.
		seed_caption_comment(&ctx, &mm, caption_id, &"a".repeat(2000)).await?;

		// -- Exec & Check: 2001 characters is rejected.
		let res =
			seed_caption_comment(&ctx, &mm, caption_id, &"a".repeat(2001)).await;
		assert!(
			matches!(&res, Err(model::Error::Validation { field, .. })
				if field == "content"),
			"got {res:?}"
		);

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_cc_len-owner").await?;

		Ok(())
	}
}

// endregion: --- Tests
