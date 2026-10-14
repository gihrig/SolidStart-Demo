use crate::ctx::Ctx;
use crate::generate_common_bmc_fns;
use crate::model::base::{self, Access, CommonIden, DbBmc, FieldHygiene};
use crate::model::comment::{
	self, CommentParts, CommentSource, CommentTarget, CommentView,
};
use crate::model::modql_utils::time_to_sea_value;
use crate::model::post::PostBmc;
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

// region:    --- PostComment Types

/// The `post_comment` row (#124): one User's remark in a Post's thread. Every
/// Comment is public — read is unscoped, write is owner-only (the same access
/// shape as `Post`). No wire carries this row: the thread read, the write
/// results and the upsert Event carry its `CommentView` (#125). So it derives
/// no `Serialize` and no `TS`.
#[derive(Debug, Clone, Fields, FromRow)]
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
	pub ctime: OffsetDateTime,
	// last modifier user_id and time
	pub mid: i64,
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

impl CommentTarget for PostCommentBmc {
	const PARENT_COL: &'static str = "post_id";
	const UNKNOWN_PARENT: &'static str = "unknown Post";
	type Parent = PostBmc;
	type Row = PostComment;

	fn parts(c: PostComment) -> CommentParts {
		CommentParts {
			id: c.id,
			parent_id: c.post_id,
			owner_id: c.owner_id,
			content: c.content,
			ctime: c.ctime,
			mtime: c.mtime,
		}
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

// The thin target-typed doors to the shared Comment module (`model::comment`).
impl PostCommentBmc {
	/// Add a Comment to a Post (#124). An unknown `post_id` is a `Validation`
	/// error (see `comment::create`).
	pub async fn create(
		ctx: &Ctx,
		mm: &ModelManager,
		comment_c: PostCommentForCreate,
	) -> Result<i64> {
		comment::create::<Self, _>(ctx, mm, comment_c.post_id, comment_c).await
	}

	/// Read one Comment as its `CommentView` (#125).
	pub async fn get_comment(
		ctx: &Ctx,
		mm: &ModelManager,
		id: i64,
	) -> Result<CommentView> {
		comment::get_comment::<Self>(ctx, mm, id).await
	}

	/// Read the stored text of the caller's own Comment (#126).
	pub async fn get_source(
		ctx: &Ctx,
		mm: &ModelManager,
		id: i64,
	) -> Result<CommentSource> {
		comment::get_source::<Self>(ctx, mm, id).await
	}

	/// List one Post's Comments as `CommentView`s, newest first (#125).
	pub async fn list_for_post(
		ctx: &Ctx,
		mm: &ModelManager,
		post_id: i64,
		list_options: Option<ListOptions>,
	) -> Result<Vec<CommentView>> {
		comment::list_for_parent::<Self>(ctx, mm, post_id, list_options).await
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

	/// Adding a Comment (#124): the caller is the Owner, and the content is
	/// stored after hygiene. The thread lists only that Post's Comments as
	/// `CommentView`s, newest first (#125). Each view carries its author
	/// snapshot, and a new Comment has `ctime` equal to `mtime`.
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
		let lisa = Ctx::new(1)?; // the seeded author User with an avatar

		// -- Exec: two non-owners of the Post comment on it.
		let first = seed_post_comment(&ctx, &mm, post_id, "  first  ").await?;
		let second = seed_post_comment(&lisa, &mm, post_id, "second").await?;
		seed_post_comment(&ctx, &mm, other_post, "elsewhere").await?;
		let thread = PostCommentBmc::list_for_post(&ctx, &mm, post_id, None).await?;

		// -- Check: newest first; the other Post's Comment is excluded.
		let ids: Vec<i64> = thread.iter().map(|c| c.id).collect();
		assert_eq!(ids, vec![second, first]);
		let (lisas, mine) = (&thread[0], &thread[1]);
		assert_eq!(mine.parent_id, post_id);
		assert_eq!(mine.author.id, author_id);
		assert_eq!(mine.author.name, "test_pc_list-author");
		assert_eq!(mine.author.avatar_url, None);
		assert_eq!(
			mine.content_html, "<p>first</p>",
			"hygiene trims the content"
		);
		assert_eq!(mine.ctime, mine.mtime, "a create writes one time to both");
		assert_eq!(lisas.author.name, "Lisa");
		assert_eq!(
			lisas.author.avatar_url.as_deref(),
			Some("https://img.icons8.com/doodle/96/null/lisa-simpson.png")
		);

		// -- Check: a `limit` keeps the newest Comment.
		let newest = PostCommentBmc::list_for_post(
			&ctx,
			&mm,
			post_id,
			Some(ListOptions {
				limit: Some(1),
				..Default::default()
			}),
		)
		.await?;
		assert_eq!(
			newest.iter().map(|c| c.id).collect::<Vec<_>>(),
			vec![second]
		);

		// -- Clean (user delete cascades Posts and Comments)
		_dev_utils::clean_users(&root, &mm, "test_pc_list").await?;

		Ok(())
	}

	/// An edit moves `mtime` past `ctime`, which the "(edited)" mark reads
	/// (#125). `get_comment` returns the edited view.
	#[serial]
	#[tokio::test]
	async fn test_post_comment_edit_sets_mtime() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let owner_id = seed_user(&root, &mm, "test_pc_mtime-owner").await?;
		let ctx = Ctx::new(owner_id)?;
		let post_id = seed_post(&ctx, &mm, "test_pc_mtime post", &[1]).await?;
		let id = seed_post_comment(&ctx, &mm, post_id, "before").await?;
		let created = PostCommentBmc::get_comment(&ctx, &mm, id).await?;

		// -- Exec
		PostCommentBmc::update(
			&ctx,
			&mm,
			id,
			PostCommentForUpdate {
				content: "after".to_string(),
			},
		)
		.await?;
		let edited = PostCommentBmc::get_comment(&ctx, &mm, id).await?;

		// -- Check
		assert_eq!(created.ctime, created.mtime);
		assert_eq!(edited.content_html, "<p>after</p>");
		assert_eq!(edited.ctime, created.ctime, "an edit keeps ctime");
		assert!(edited.mtime > edited.ctime, "an edit moves mtime");

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_pc_mtime-owner").await?;

		Ok(())
	}

	/// The edit form's read (#126): the Owner gets the stored text as a
	/// `CommentSource`, and a non-owner gets `EntityNotFound` (the Write
	/// scope). A public read does not change the stored text.
	#[serial]
	#[tokio::test]
	async fn test_post_comment_get_source_is_owner_only() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let a_id = seed_user(&root, &mm, "test_pc_source-A").await?;
		let b_id = seed_user(&root, &mm, "test_pc_source-B").await?;
		let ctx_a = Ctx::new(a_id)?;
		let ctx_b = Ctx::new(b_id)?;
		let post_id = seed_post(&ctx_a, &mm, "test_pc_source post", &[1]).await?;
		let id = seed_post_comment(&ctx_a, &mm, post_id, "**bold**").await?;

		// -- Exec: a public read, then the Owner's read.
		PostCommentBmc::get_comment(&ctx_b, &mm, id).await?;
		let source = PostCommentBmc::get_source(&ctx_a, &mm, id).await?;

		// -- Check: the Owner gets the stored markdown.
		assert_eq!(source.id, id);
		assert_eq!(source.content, "**bold**");

		// -- Check: a non-owner gets `EntityNotFound`.
		let res = PostCommentBmc::get_source(&ctx_b, &mm, id).await;
		assert!(
			matches!(res, Err(model::Error::EntityNotFound { .. })),
			"got {res:?}"
		);

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_pc_source").await?;

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
}

// endregion: --- Tests
