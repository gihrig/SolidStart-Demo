use crate::ctx::Ctx;
use crate::generate_common_bmc_fns;
use crate::model::base::{
	self, Access, CommonIden, DbBmc, FieldHygiene, PublicProjection,
};
use crate::model::like::LikeTarget;
use crate::model::modql_utils::time_to_sea_value;
use crate::model::post::PostBmc;
use crate::model::user::{AuthorRef, UserBmc};
use crate::model::ModelManager;
use crate::model::{Error, Result};
use modql::field::Fields;
use modql::filter::{
	FilterNodes, ListOptions, OpValInt64, OpValsInt64, OpValsString, OpValsValue,
};
use sea_query::{Condition, Expr};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::collections::HashMap;
use ts_rs::TS;

// region:    --- Caption Types

/// The `caption` base row (#118). Every Caption is public — read is unscoped,
/// write is owner-only (the same access shape as `Post`). The audit columns exist
/// in the table but are intentionally absent from this struct: the model never
/// reads them, and `CaptionView` (the public projection) is audit-free.
/// `like` / `comment` counts are derived by COUNT, never stored here.
#[derive(Debug, Clone, Fields, FromRow)]
pub struct Caption {
	pub id: i64,

	// -- Relations
	pub post_id: i64,
	pub owner_id: i64,

	// -- Properties
	pub text: String,
}

/// The enriched **public projection** of a Caption (ADR-0021): the author
/// snapshot and the derived like / comment counts, assembled at the model seam
/// so the front-end renders without joining. It carries no audit columns
/// (`cid` / `mid` / `ctime` / `mtime`).
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "CaptionView.d.ts")]
pub struct CaptionView {
	pub id: i64,

	// -- Relations
	pub post_id: i64,

	// -- Author snapshot (owner_id resolved to a public identity)
	pub author: AuthorRef,

	// -- Properties
	pub text: String,

	// -- Derived counts (comments land in #127)
	pub like_count: i64,
	pub comment_count: i64,
}

impl PublicProjection for CaptionView {}

/// The `add_caption` input (#121). The Owner is the caller (`ctx`), never the
/// payload. Exported so the front-end sends the one wire shape.
#[derive(Fields, Deserialize, Default, TS)]
#[ts(export, export_to = "CaptionForCreate.d.ts")]
pub struct CaptionForCreate {
	pub post_id: i64,
	pub text: String,
}

#[derive(Fields, Deserialize, Default)]
pub struct CaptionForUpdate {
	// Note: `owner_id` and `post_id` are intentionally not updatable — the
	//       owner-only Write scope keys on `owner_id`, and a Caption belongs to
	//       one Post for life.
	pub text: Option<String>,
}

#[derive(FilterNodes, Deserialize, Default, Debug)]
pub struct CaptionFilter {
	pub id: Option<OpValsInt64>,
	pub post_id: Option<OpValsInt64>,
	pub owner_id: Option<OpValsInt64>,
	pub text: Option<OpValsString>,

	pub cid: Option<OpValsInt64>,
	#[modql(to_sea_value_fn = "time_to_sea_value")]
	pub ctime: Option<OpValsValue>,
	pub mid: Option<OpValsInt64>,
	#[modql(to_sea_value_fn = "time_to_sea_value")]
	pub mtime: Option<OpValsValue>,
}

// endregion: --- Caption Types

// region:    --- child-table BMCs

// Marker BMCs own their child table's identity (see `PostLikeBmc`).
// `CaptionLikeBmc` is also a Like target (#123): the shared Like module
// (`model::like`) is its write path and its read. `CaptionCommentBmc` stays a
// marker until the comment writes land (#127).
pub struct CaptionLikeBmc;

impl DbBmc for CaptionLikeBmc {
	const TABLE: &'static str = "caption_like";
}

impl LikeTarget for CaptionLikeBmc {
	const PARENT_COL: &'static str = CAPTION_ID;
	const UNKNOWN_PARENT: &'static str = "unknown Caption";
	type Parent = CaptionBmc;
}

struct CaptionCommentBmc;

impl DbBmc for CaptionCommentBmc {
	const TABLE: &'static str = "caption_comment";
}

/// The parent key column of `caption_like` / `caption_comment`.
const CAPTION_ID: &str = "caption_id";

// endregion: --- child-table BMCs

// region:    --- CaptionBmc

pub struct CaptionBmc;

impl DbBmc for CaptionBmc {
	const TABLE: &'static str = "caption";

	fn has_owner_id() -> bool {
		true
	}

	/// Every Caption is public (#106): Read is unscoped (`None`), so any caller
	/// lists every Caption. Write is owner-only (`owner_id = me`), so only the
	/// Owner may update or delete. The root context bypasses this hook (see `base`).
	fn access_scope(ctx: &Ctx, access: Access) -> Option<Condition> {
		match access {
			Access::Read => None,
			Access::Write => Some(
				Condition::all()
					.add(Expr::col(CommonIden::OwnerId).eq(ctx.user_id())),
			),
		}
	}

	/// The Caption text submits to write-path hygiene (ADR-0019): NFC-normalize,
	/// trim, reject control / zero-width / bidirectional characters, and cap the
	/// length at 36 characters (#118).
	fn hygiene_rules() -> &'static [FieldHygiene] {
		const RULES: &[FieldHygiene] = &[FieldHygiene {
			field: "text",
			max_len: Some(36),
		}];
		RULES
	}
}

// `create` is hand-written (below) so it can reject an unknown Post as a client
// error; the macro therefore gets no `ForCreate`.
generate_common_bmc_fns!(
	Bmc: CaptionBmc,
	Entity: Caption,
	ForUpdate: CaptionForUpdate,
	Filter: CaptionFilter,
);

impl CaptionBmc {
	/// Add a Caption to a Post (#121). `owner_id` is `ctx.user_id()` (owner-only
	/// write); any logged-in User may caption any Post (every Post is public). An
	/// unknown `post_id` is a `Validation` error, rejected before the insert, not
	/// a foreign-key failure.
	pub async fn create(
		ctx: &Ctx,
		mm: &ModelManager,
		caption_c: CaptionForCreate,
	) -> Result<i64> {
		base::require_exists::<PostBmc>(
			ctx,
			mm,
			caption_c.post_id,
			"post_id",
			"unknown Post",
		)
		.await?;

		base::create::<Self, _>(ctx, mm, caption_c).await
	}

	/// The Post id of one Caption (#123): a Caption Like re-ranks that Post's Top
	/// Captions, so the like handler pokes `post_caption:{post_id}`. An unknown
	/// Caption is the same `Validation` error the Like module returns (400).
	pub async fn post_id_of(ctx: &Ctx, mm: &ModelManager, id: i64) -> Result<i64> {
		let caption = Self::first(
			ctx,
			mm,
			Some(vec![CaptionFilter {
				id: Some(id.into()),
				..Default::default()
			}]),
			None,
		)
		.await?;
		caption.map(|c| c.post_id).ok_or(Error::Validation {
			field: CaptionLikeBmc::PARENT_COL.to_string(),
			reason: CaptionLikeBmc::UNKNOWN_PARENT.to_string(),
		})
	}

	/// Read a single Caption as its enriched `CaptionView` (public read, unscoped).
	pub async fn get_caption(
		ctx: &Ctx,
		mm: &ModelManager,
		id: i64,
	) -> Result<CaptionView> {
		let caption = base::get::<Self, Caption>(ctx, mm, id).await?;
		let mut views = Self::assemble_views(ctx, mm, vec![caption]).await?;
		views.pop().ok_or(Error::EntityNotFound {
			entity: Self::TABLE,
			id,
		})
	}

	/// List one Post's Captions as enriched `CaptionView`s, ranked by like count
	/// descending — the Top Captions order (#118). Ties break by id ascending, so
	/// the order is stable while every count is 0 (no likes yet). Read is
	/// unscoped: every Caption is public. A Post with no Captions (or no such
	/// Post) yields an empty list.
	///
	/// Ranking and windowing happen at the **database**
	/// (`base::ranked_ids_by_like_count`, shared with `PostBmc::list_posts`):
	/// `list_options` `limit` / `offset` page the ranked list under the shared
	/// list-limit contract (no limit -> 1000), so every Caption stays reachable.
	/// The caller's `order_bys` is ignored: "Top Captions" is defined by like
	/// count. Only the ranked Captions are then fetched and assembled; the ids are
	/// re-ordered to the ranked order because an `IN` fetch does not preserve it.
	pub async fn list_captions_for_post(
		ctx: &Ctx,
		mm: &ModelManager,
		post_id: i64,
		list_options: Option<ListOptions>,
	) -> Result<Vec<CaptionView>> {
		// 1. Rank + window at the DB: the ordered ids of this Post's Captions.
		let ranked_ids = base::ranked_ids_by_like_count::<Self, CaptionLikeBmc, _>(
			mm,
			CAPTION_ID,
			Some(vec![CaptionFilter {
				post_id: Some(post_id.into()),
				..Default::default()
			}]),
			list_options,
		)
		.await?;
		if ranked_ids.is_empty() {
			return Ok(Vec::new());
		}

		// 2. Fetch exactly those Captions. `base::list` re-applies the read scope.
		let captions = base::list::<Self, Caption, _>(
			ctx,
			mm,
			Some(vec![CaptionFilter {
				id: Some(OpValInt64::In(ranked_ids.clone()).into()),
				..Default::default()
			}]),
			None,
		)
		.await?;

		// 3. Assemble, then restore the ranked order.
		let mut by_id: HashMap<i64, CaptionView> =
			Self::assemble_views(ctx, mm, captions)
				.await?
				.into_iter()
				.map(|v| (v.id, v))
				.collect();
		Ok(ranked_ids
			.into_iter()
			.filter_map(|id| by_id.remove(&id))
			.collect())
	}

	/// Assemble `CaptionView`s from base `Caption` rows with a fixed number of
	/// batched reads — never one read per Caption (the N+1 trap): one author batch
	/// and one COUNT per derived count, run concurrently (no data dependency).
	async fn assemble_views(
		ctx: &Ctx,
		mm: &ModelManager,
		captions: Vec<Caption>,
	) -> Result<Vec<CaptionView>> {
		if captions.is_empty() {
			return Ok(Vec::new());
		}

		let caption_ids: Vec<i64> = captions.iter().map(|c| c.id).collect();
		let owner_ids = base::dedup(captions.iter().map(|c| c.owner_id));

		let (authors, likes_by_caption, comments_by_caption) = tokio::try_join!(
			UserBmc::author_refs_by_ids(ctx, mm, &owner_ids),
			base::counts_by_parent::<CaptionLikeBmc>(mm, CAPTION_ID, &caption_ids),
			base::counts_by_parent::<CaptionCommentBmc>(
				mm,
				CAPTION_ID,
				&caption_ids
			),
		)?;

		let author_by_id: HashMap<i64, AuthorRef> =
			authors.into_iter().map(|a| (a.id, a)).collect();

		// -- Compose the views (a missing caption in a count map defaults to 0).
		let views = captions
			.into_iter()
			.map(|c| CaptionView {
				id: c.id,
				post_id: c.post_id,
				author: author_by_id.get(&c.owner_id).cloned().unwrap_or(
					AuthorRef {
						id: c.owner_id,
						name: String::new(),
						avatar_url: None,
					},
				),
				text: c.text,
				like_count: *likes_by_caption.get(&c.id).unwrap_or(&0),
				comment_count: *comments_by_caption.get(&c.id).unwrap_or(&0),
			})
			.collect();

		Ok(views)
	}
}

// endregion: --- CaptionBmc

// region:    --- Tests

#[cfg(test)]
mod tests {
	type Result<T> = core::result::Result<T, Box<dyn std::error::Error>>; // For tests.

	use super::*;
	use crate::_dev_utils::{self, seed_caption, seed_post, seed_user};
	use crate::model;
	use serial_test::serial;

	/// Insert one `caption_like` row directly (test-only). The ranking tests seed
	/// likes at the SQL layer, so they do not depend on the `LikeBmc::toggle`
	/// write path (#123); the unique-constraint test needs a raw double insert.
	async fn seed_caption_like(
		mm: &ModelManager,
		caption_id: i64,
		user_id: i64,
	) -> Result<()> {
		sqlx::query(
			"INSERT INTO caption_like (caption_id, user_id, cid, ctime, mid, mtime) \
			 VALUES ($1, $2, 0, now(), 0, now())",
		)
		.bind(caption_id)
		.bind(user_id)
		.execute(mm.dbx().db())
		.await?;
		Ok(())
	}

	/// `list_captions_for_post` returns only that Post's Captions, ranked by like
	/// count descending; 0-like ties break by id ascending. Each view carries the
	/// author snapshot and the derived counts.
	#[serial]
	#[tokio::test]
	async fn test_list_captions_for_post_ranked_by_like_count() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let owner_id = seed_user(&root, &mm, "test_cap_rank-owner").await?;
		let ctx = Ctx::new(owner_id)?;
		let post_id = seed_post(&ctx, &mm, "test_cap_rank post", &[1]).await?;
		let other_post = seed_post(&ctx, &mm, "test_cap_rank other", &[1]).await?;

		let low_a = seed_caption(&ctx, &mm, post_id, "low a").await?;
		let high = seed_caption(&ctx, &mm, post_id, "high").await?;
		let low_b = seed_caption(&ctx, &mm, post_id, "low b").await?;
		let _elsewhere = seed_caption(&ctx, &mm, other_post, "elsewhere").await?;
		// `high` gets two likes; the others get none.
		seed_caption_like(&mm, high, owner_id).await?;
		seed_caption_like(&mm, high, 1).await?;

		// -- Exec
		let views =
			CaptionBmc::list_captions_for_post(&ctx, &mm, post_id, None).await?;

		// -- Check: `high` first, then the 0-like tie by id ascending. The other
		//    Post's Caption is excluded.
		let ids: Vec<i64> = views.iter().map(|v| v.id).collect();
		assert_eq!(ids, vec![high, low_a, low_b]);
		let likes: Vec<i64> = views.iter().map(|v| v.like_count).collect();
		assert_eq!(likes, vec![2, 0, 0]);
		assert_eq!(views[0].author.id, owner_id);
		assert_eq!(views[0].post_id, post_id);
		assert_eq!(views[0].text, "high");
		assert_eq!(views[0].comment_count, 0, "no comments seeded");

		// -- Clean (owner delete cascades posts, captions, and likes)
		_dev_utils::clean_users(&root, &mm, "test_cap_rank-owner").await?;

		Ok(())
	}

	/// `list_options` pages the RANKED list at the DB, so a Post with more
	/// Captions than one page can still reach them all (#118 review): `limit` /
	/// `offset` window after ranking, never before.
	#[serial]
	#[tokio::test]
	async fn test_list_captions_for_post_pages_the_ranked_list() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let owner_id = seed_user(&root, &mm, "test_cap_page-owner").await?;
		let ctx = Ctx::new(owner_id)?;
		let post_id = seed_post(&ctx, &mm, "test_cap_page post", &[1]).await?;

		// Rank is [top, first, third]: `top` has the only like; the 0-like Captions
		// tie by id ascending.
		let first = seed_caption(&ctx, &mm, post_id, "first").await?;
		let top = seed_caption(&ctx, &mm, post_id, "top").await?;
		let third = seed_caption(&ctx, &mm, post_id, "third").await?;
		seed_caption_like(&mm, top, owner_id).await?;
		let page = |offset| {
			Some(ListOptions {
				limit: Some(1),
				offset: Some(offset),
				order_bys: None,
			})
		};

		// -- Exec & Check: each one-row page returns the next ranked Caption.
		let mut ids = Vec::new();
		for offset in 0..3 {
			let views =
				CaptionBmc::list_captions_for_post(&ctx, &mm, post_id, page(offset))
					.await?;
			assert_eq!(views.len(), 1, "offset {offset}");
			ids.push(views[0].id);
		}
		assert_eq!(ids, vec![top, first, third]);

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_cap_page-owner").await?;

		Ok(())
	}

	/// Adding a Caption (#121): the caller is the Owner, so `get_caption` returns
	/// the view with the caller as author, the text as written, and 0 counts.
	#[serial]
	#[tokio::test]
	async fn test_create_caption_owner_is_author() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let owner_id = seed_user(&root, &mm, "test_cap_create-owner").await?;
		let author_id = seed_user(&root, &mm, "test_cap_create-author").await?;
		let post_id =
			seed_post(&Ctx::new(owner_id)?, &mm, "test_cap_create post", &[1])
				.await?;
		let ctx = Ctx::new(author_id)?;

		// -- Exec: a non-owner of the Post captions it.
		let id = seed_caption(&ctx, &mm, post_id, "  my caption  ").await?;
		let view = CaptionBmc::get_caption(&ctx, &mm, id).await?;

		// -- Check: the caller is the author; hygiene trimmed the text.
		assert_eq!(view.id, id);
		assert_eq!(view.post_id, post_id);
		assert_eq!(view.author.id, author_id);
		assert_eq!(view.author.name, "test_cap_create-author");
		assert_eq!(view.text, "my caption");
		assert_eq!((view.like_count, view.comment_count), (0, 0));

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_cap_create").await?;

		Ok(())
	}

	/// A Caption for an unknown Post is a client error (`Validation` on
	/// `post_id`), not a foreign-key failure (#121).
	#[serial]
	#[tokio::test]
	async fn test_create_caption_unknown_post_rejected() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let owner_id = seed_user(&root, &mm, "test_cap_no_post-owner").await?;
		let ctx = Ctx::new(owner_id)?;

		// -- Exec & Check
		let res = seed_caption(&ctx, &mm, 999_999, "orphan").await;
		assert!(
			matches!(&res, Err(model::Error::Validation { field, .. })
				if field == "post_id"),
			"got {res:?}"
		);

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_cap_no_post-owner").await?;

		Ok(())
	}

	/// Every Caption is public: Read is unscoped, so a non-owner lists any Post's
	/// Captions. Write is owner-only: a non-owner update / delete is
	/// `EntityNotFound`, while the Owner may update. (#106)
	#[serial]
	#[tokio::test]
	async fn test_caption_write_is_owner_only() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let a_id = seed_user(&root, &mm, "test_cap_owner_only-A").await?;
		let b_id = seed_user(&root, &mm, "test_cap_owner_only-B").await?;
		let ctx_a = Ctx::new(a_id)?;
		let ctx_b = Ctx::new(b_id)?;
		let post_id =
			seed_post(&ctx_a, &mm, "test_cap_owner_only post", &[1]).await?;
		let caption_id = seed_caption(&ctx_a, &mm, post_id, "A's caption").await?;

		// -- Check: B reads A's Caption (public read).
		let views =
			CaptionBmc::list_captions_for_post(&ctx_b, &mm, post_id, None).await?;
		assert_eq!(views.len(), 1);
		assert_eq!(views[0].id, caption_id);

		// -- Check: B cannot update or delete A's Caption (owner-only write).
		assert!(
			matches!(
				CaptionBmc::update(
					&ctx_b,
					&mm,
					caption_id,
					CaptionForUpdate {
						text: Some("hijack".to_string()),
					},
				)
				.await,
				Err(model::Error::EntityNotFound { .. })
			),
			"B update A's Caption should be EntityNotFound"
		);
		assert!(
			matches!(
				CaptionBmc::delete(&ctx_b, &mm, caption_id).await,
				Err(model::Error::EntityNotFound { .. })
			),
			"B delete A's Caption should be EntityNotFound"
		);

		// -- Check: A (the Owner) may update.
		CaptionBmc::update(
			&ctx_a,
			&mm,
			caption_id,
			CaptionForUpdate {
				text: Some("owner edit".to_string()),
			},
		)
		.await?;

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_cap_owner_only").await?;

		Ok(())
	}

	/// Caption text is capped at 36 characters by write-path hygiene (#118): 36
	/// is accepted, 37 is rejected as a `Validation` error on `text`.
	#[serial]
	#[tokio::test]
	async fn test_caption_text_capped_at_36() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let owner_id = seed_user(&root, &mm, "test_cap_len-owner").await?;
		let ctx = Ctx::new(owner_id)?;
		let post_id = seed_post(&ctx, &mm, "test_cap_len post", &[1]).await?;

		// -- Exec & Check: exactly 36 characters is accepted.
		seed_caption(&ctx, &mm, post_id, &"a".repeat(36)).await?;

		// -- Exec & Check: 37 characters is rejected on `text`.
		let res = seed_caption(&ctx, &mm, post_id, &"a".repeat(37)).await;
		assert!(
			matches!(&res, Err(model::Error::Validation { field, .. })
				if field == "text"),
			"got {res:?}"
		);

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_cap_len-owner").await?;

		Ok(())
	}

	/// At most one Like per (Caption, User): the DB unique constraint rejects a
	/// second Like by the same User (#106). This guards the schema that the
	/// `LikeBmc::toggle` write path relies on (#123).
	#[serial]
	#[tokio::test]
	async fn test_caption_like_unique_per_user() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let owner_id = seed_user(&root, &mm, "test_cap_like_unique-owner").await?;
		let ctx = Ctx::new(owner_id)?;
		let post_id =
			seed_post(&ctx, &mm, "test_cap_like_unique post", &[1]).await?;
		let caption_id = seed_caption(&ctx, &mm, post_id, "liked").await?;

		// -- Exec & Check: the first Like commits; a second by the same User fails.
		//    Collapse to a bool so the non-Send error is not held across the await.
		seed_caption_like(&mm, caption_id, owner_id).await?;
		let duplicate_rejected =
			seed_caption_like(&mm, caption_id, owner_id).await.is_err();
		assert!(
			duplicate_rejected,
			"a second Like by the same User must violate the unique constraint"
		);

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_cap_like_unique-owner").await?;

		Ok(())
	}

	/// `CaptionView` is a public projection: its serialized shape carries no
	/// audit columns (`cid` / `mid` / `ctime` / `mtime`) — ADR-0021.
	#[test]
	fn test_caption_view_has_no_audit_columns() {
		let view = CaptionView {
			id: 1,
			post_id: 1,
			author: AuthorRef {
				id: 2,
				name: "Lisa".to_string(),
				avatar_url: None,
			},
			text: "t".to_string(),
			like_count: 0,
			comment_count: 0,
		};
		let value = serde_json::to_value(&view).unwrap();
		let obj = value.as_object().unwrap();
		for audit in ["cid", "mid", "ctime", "mtime"] {
			assert!(
				!obj.contains_key(audit),
				"CaptionView must not expose the `{audit}` audit column"
			);
		}
	}
}

// endregion: --- Tests
