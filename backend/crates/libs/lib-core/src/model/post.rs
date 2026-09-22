use crate::ctx::Ctx;
use crate::generate_common_bmc_fns;
use crate::model::base::{
	self, Access, CommonIden, DbBmc, FieldHygiene, PublicProjection,
};
use crate::model::category::{CategoryBmc, CategoryFilter, CategoryPublic};
use crate::model::modql_utils::time_to_sea_value;
use crate::model::user::{AuthorRef, UserBmc};
use crate::model::ModelManager;
use crate::model::{Error, Result};
use modql::field::Fields;
use modql::filter::{
	FilterGroups, FilterNodes, ListOptions, OpValInt64, OpValsInt64, OpValsString,
	OpValsValue,
};
use sea_query::{
	Alias, Asterisk, Condition, Expr, Order, PostgresQueryBuilder, Query,
	SimpleExpr, SubQueryStatement,
};
use sea_query_binder::SqlxBinder;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::collections::HashMap;
use ts_rs::TS;

// region:    --- Post Types

/// The `post` base row (#117). Every Post is public — read is unscoped, write is
/// owner-only (`ConvBmc`'s `kind`/`state` scope is dropped, #106). The audit
/// columns exist in the table but are intentionally absent from this struct: the
/// model never reads them, and `PostView` (the public projection) is audit-free.
/// `like` / `comment` counts are derived by COUNT, never stored here.
#[derive(Debug, Clone, Fields, FromRow)]
pub struct Post {
	pub id: i64,

	// -- Relations
	pub owner_id: i64,

	// -- Properties
	pub title: String,
	pub image_src: String,
	pub image_alt: String,
	pub photographer: String,
	pub photographer_url: String,
	pub source_url: String,
}

/// The enriched **public projection** of a Post (ADR-0021): the author snapshot,
/// the resolved Categories, and the derived like / comment counts, assembled at
/// the model seam so the front-end renders without joining. It carries no audit
/// columns (`cid` / `mid` / `ctime` / `mtime`).
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "PostView.d.ts")]
pub struct PostView {
	pub id: i64,

	// -- Author snapshot (owner_id resolved to a public identity)
	pub author: AuthorRef,

	// -- Properties
	pub title: String,
	pub image_src: String,
	pub image_alt: String,
	pub photographer: String,
	pub photographer_url: String,
	pub source_url: String,

	// -- Resolved Categories (tags), at least one, ordered by Category id
	pub categories: Vec<CategoryPublic>,

	// -- Derived counts (0 until likes / comments land, #118)
	pub like_count: i64,
	pub comment_count: i64,
}

impl PublicProjection for PostView {}

#[derive(Fields, Deserialize, Default)]
pub struct PostForCreate {
	pub title: String,
	pub image_src: String,
	pub image_alt: String,
	pub photographer: String,
	pub photographer_url: String,
	pub source_url: String,
}

#[derive(Fields, Deserialize, Default)]
pub struct PostForUpdate {
	// Note: `owner_id` is intentionally not updatable — the owner-only Write scope
	//       keys on it (see `ConvForUpdate`). Ownership transfer belongs to a
	//       future privilege ACS.
	pub title: Option<String>,
	pub image_src: Option<String>,
	pub image_alt: Option<String>,
	pub photographer: Option<String>,
	pub photographer_url: Option<String>,
	pub source_url: Option<String>,
}

#[derive(FilterNodes, Deserialize, Default, Debug)]
pub struct PostFilter {
	pub id: Option<OpValsInt64>,
	pub owner_id: Option<OpValsInt64>,
	pub title: Option<OpValsString>,

	pub cid: Option<OpValsInt64>,
	#[modql(to_sea_value_fn = "time_to_sea_value")]
	pub ctime: Option<OpValsValue>,
	pub mid: Option<OpValsInt64>,
	#[modql(to_sea_value_fn = "time_to_sea_value")]
	pub mtime: Option<OpValsValue>,
}

// endregion: --- Post Types

// region:    --- child-table BMCs

/// The `post_category` insert row: one Post-to-Category link. `post_category`
/// carries at least one row per Post (#107).
#[derive(Fields)]
struct PostCategoryForInsert {
	post_id: i64,
	category_id: i64,
}

struct PostCategoryBmc;

impl DbBmc for PostCategoryBmc {
	const TABLE: &'static str = "post_category";
}

// A marker BMC owns its child table's identity — the `TABLE` name — so every read
// routes its `FROM` through `DbBmc::table_ref()`, keeping one table name in one
// place. A marker is not a write path; the like / comment writes land in
// #118 / #122.
struct PostLikeBmc;

impl DbBmc for PostLikeBmc {
	const TABLE: &'static str = "post_like";
}

struct PostCommentBmc;

impl DbBmc for PostCommentBmc {
	const TABLE: &'static str = "post_comment";
}

/// One `(post_id, category_id)` link row read back from the join.
#[derive(FromRow)]
struct PostCategoryLink {
	post_id: i64,
	category_id: i64,
}

/// One `(post_id, count)` row from a derived-count query.
#[derive(FromRow)]
struct CountRow {
	post_id: i64,
	cnt: i64,
}

// endregion: --- child-table BMCs

// region:    --- PostBmc

pub struct PostBmc;

impl DbBmc for PostBmc {
	const TABLE: &'static str = "post";

	fn has_owner_id() -> bool {
		true
	}

	/// Every Post is public (#106): Read is unscoped (`None`), so any caller lists
	/// and reads every Post. Write is owner-only (`owner_id = me`), so only the
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

	/// The user-visible free-text fields submit to write-path hygiene (ADR-0019):
	/// NFC-normalize, trim, and reject control / zero-width / bidirectional
	/// characters, with a length cap on the display fields. The URL fields carry
	/// no cap here (they are long by nature) but still reject the hidden-text
	/// character classes; the front-end is the URL-scheme sanitize boundary on read.
	fn hygiene_rules() -> &'static [FieldHygiene] {
		const RULES: &[FieldHygiene] = &[
			FieldHygiene {
				field: "title",
				max_len: Some(200),
			},
			FieldHygiene {
				field: "image_alt",
				max_len: Some(200),
			},
			FieldHygiene {
				field: "photographer",
				max_len: Some(120),
			},
			FieldHygiene {
				field: "image_src",
				max_len: None,
			},
			FieldHygiene {
				field: "photographer_url",
				max_len: None,
			},
			FieldHygiene {
				field: "source_url",
				max_len: None,
			},
		];
		RULES
	}
}

// `create` is hand-written (below) so it can insert the `post_category` links in
// the same transaction; the macro therefore gets no `ForCreate`.
generate_common_bmc_fns!(
	Bmc: PostBmc,
	Entity: Post,
	ForUpdate: PostForUpdate,
	Filter: PostFilter,
);

impl PostBmc {
	/// Create a Post with at least one Category, atomically (#107). The Post row
	/// and its `post_category` links commit together, so a Post never persists
	/// without its mandatory Category. `owner_id` is `ctx.user_id()` (owner-only
	/// write). An empty `category_ids` is rejected before any insert.
	pub async fn create(
		ctx: &Ctx,
		mm: &ModelManager,
		post_c: PostForCreate,
		category_ids: &[i64],
	) -> Result<i64> {
		if category_ids.is_empty() {
			return Err(Error::Validation {
				field: "category_ids".to_string(),
				reason: "a Post requires at least one Category".to_string(),
			});
		}

		let mm = mm.new_with_txn()?;
		mm.dbx().begin_txn().await?;

		let post_id = base::create::<Self, _>(ctx, &mm, post_c).await?;

		let links: Vec<PostCategoryForInsert> = category_ids
			.iter()
			.map(|&category_id| PostCategoryForInsert {
				post_id,
				category_id,
			})
			.collect();
		base::create_many::<PostCategoryBmc, _>(ctx, &mm, links).await?;

		mm.dbx().commit_txn().await?;

		Ok(post_id)
	}

	/// Read a single Post as its enriched `PostView` (public read, unscoped).
	pub async fn get_post(
		ctx: &Ctx,
		mm: &ModelManager,
		id: i64,
	) -> Result<PostView> {
		let post = base::get::<Self, Post>(ctx, mm, id).await?;
		let mut views = Self::assemble_views(ctx, mm, vec![post]).await?;
		views.pop().ok_or(Error::EntityNotFound {
			entity: Self::TABLE,
			id,
		})
	}

	/// List Posts as enriched `PostView`s, ranked by like count descending — the
	/// Top Photos order (#117). Ties break by id ascending, so the order is stable
	/// while every count is 0 (no likes yet). Read is unscoped: every Post is public.
	///
	/// Ranking and windowing happen at the **database** (`ranked_post_ids`): the
	/// like count is derived, so an ORDER BY on a correlated `COUNT` subquery ranks
	/// it, and `LIMIT` / `OFFSET` page it — the DB returns only the ids for the
	/// requested page. Only those Posts are then fetched and assembled, so a large
	/// feed never loads or enriches the whole table. `base::list` re-applies the
	/// read scope on the fetch; the ids are re-ordered to the ranked order because
	/// an `IN` fetch does not preserve it. The caller's `order_bys` is ignored:
	/// "Top Photos" is defined by like count.
	pub async fn list_posts(
		ctx: &Ctx,
		mm: &ModelManager,
		filter: Option<Vec<PostFilter>>,
		list_options: Option<ListOptions>,
	) -> Result<Vec<PostView>> {
		// 1. Rank + window at the DB: the ordered ids for this page only.
		let ranked_ids = ranked_post_ids(mm, filter, list_options).await?;
		if ranked_ids.is_empty() {
			return Ok(Vec::new());
		}

		// 2. Fetch exactly those Posts. `base::list` re-applies the read scope, so a
		//    (future) scoped Post that ranked in but is unreadable drops out here.
		let posts = base::list::<Self, Post, _>(
			ctx,
			mm,
			Some(vec![PostFilter {
				id: Some(OpValInt64::In(ranked_ids.clone()).into()),
				..Default::default()
			}]),
			None,
		)
		.await?;

		// 3. Assemble the page, then restore the ranked order (an `IN` fetch returns
		//    rows by id, not by rank).
		let mut by_id: HashMap<i64, PostView> = Self::assemble_views(ctx, mm, posts)
			.await?
			.into_iter()
			.map(|v| (v.id, v))
			.collect();
		Ok(ranked_ids
			.into_iter()
			.filter_map(|id| by_id.remove(&id))
			.collect())
	}

	/// The single featured Post: the top-ranked Post (most likes). Ranked and
	/// limited to one at the DB, so exactly one `PostView` is assembled. Returns
	/// `EntityNotFound` when no Post exists.
	pub async fn featured_post(ctx: &Ctx, mm: &ModelManager) -> Result<PostView> {
		let views = Self::list_posts(
			ctx,
			mm,
			None,
			Some(ListOptions {
				limit: Some(1),
				offset: None,
				order_bys: None,
			}),
		)
		.await?;
		views.into_iter().next().ok_or(Error::EntityNotFound {
			entity: Self::TABLE,
			id: 0,
		})
	}

	/// Assemble `PostView`s from base `Post` rows with a fixed, small number of
	/// batched reads — never one read per Post (the N+1 trap). For any set of
	/// Posts it runs: one author batch (`UserBmc::author_refs_by_ids`), one
	/// `post_category` link read, one Category resolve (`CategoryBmc::list_public`),
	/// and one COUNT per derived count. Category resolution uses portable `IN`
	/// reads, never `array_agg`, so the Postgres/Turso DB-swap seam holds (ADR-0012).
	async fn assemble_views(
		ctx: &Ctx,
		mm: &ModelManager,
		posts: Vec<Post>,
	) -> Result<Vec<PostView>> {
		if posts.is_empty() {
			return Ok(Vec::new());
		}

		let post_ids: Vec<i64> = posts.iter().map(|p| p.id).collect();
		let owner_ids = dedup(posts.iter().map(|p| p.owner_id));

		// -- Four independent batched reads run concurrently: the author snapshots,
		//    the Category link rows, and the two derived counts have no data
		//    dependency on each other, so `try_join!` collapses their round trips
		//    into one (the read path holds no txn, so each takes its own pooled
		//    connection). Only the Category resolve (below) depends on `links`.
		let (authors, links, likes_by_post, comments_by_post) = tokio::try_join!(
			UserBmc::author_refs_by_ids(ctx, mm, &owner_ids),
			post_category_links(mm, &post_ids),
			counts_by_post::<PostLikeBmc>(mm, &post_ids),
			counts_by_post::<PostCommentBmc>(mm, &post_ids),
		)?;

		let author_by_id: HashMap<i64, AuthorRef> =
			authors.into_iter().map(|a| (a.id, a)).collect();

		// -- Categories: resolve the linked ids to the public projection, grouped by
		//    post_id. The links came back ordered by (post_id, category_id), so each
		//    Post's tags are ordered by Category id.
		let cat_ids = dedup(links.iter().map(|l| l.category_id));
		let categories = if cat_ids.is_empty() {
			Vec::new()
		} else {
			CategoryBmc::list_public(
				ctx,
				mm,
				Some(vec![CategoryFilter {
					id: Some(OpValInt64::In(cat_ids).into()),
					..Default::default()
				}]),
				None,
			)
			.await?
		};
		let cat_by_id: HashMap<i64, CategoryPublic> =
			categories.into_iter().map(|c| (c.id, c)).collect();
		let mut cats_by_post: HashMap<i64, Vec<CategoryPublic>> = HashMap::new();
		for link in links {
			if let Some(cat) = cat_by_id.get(&link.category_id) {
				cats_by_post
					.entry(link.post_id)
					.or_default()
					.push(cat.clone());
			}
		}

		// -- Compose the views (a missing post in a count map defaults to 0).
		let views = posts
			.into_iter()
			.map(|p| PostView {
				id: p.id,
				author: author_by_id.get(&p.owner_id).cloned().unwrap_or(
					AuthorRef {
						id: p.owner_id,
						name: String::new(),
						avatar_url: None,
					},
				),
				title: p.title,
				image_src: p.image_src,
				image_alt: p.image_alt,
				photographer: p.photographer,
				photographer_url: p.photographer_url,
				source_url: p.source_url,
				categories: cats_by_post.get(&p.id).cloned().unwrap_or_default(),
				like_count: *likes_by_post.get(&p.id).unwrap_or(&0),
				comment_count: *comments_by_post.get(&p.id).unwrap_or(&0),
			})
			.collect();

		Ok(views)
	}
}

// endregion: --- PostBmc

// region:    --- Batched read helpers

/// Distinct ids, preserving first-seen order.
fn dedup(ids: impl Iterator<Item = i64>) -> Vec<i64> {
	let mut seen = std::collections::HashSet::new();
	ids.filter(|id| seen.insert(*id)).collect()
}

/// Rank Posts by like count at the **database** and return the ordered ids for
/// one page (#117 review). The like count is derived, so the ranking is an
/// `ORDER BY` on a correlated `COUNT` subquery over `post_like`, with the tie
/// broken by id ascending. `LIMIT` / `OFFSET` page the result at the DB, so only
/// the page's ids come back — never the whole table. The caller's `filter`
/// applies to `post` (the only table in `FROM`, so its columns are unambiguous);
/// `order_bys` is ignored, since the ranking is fixed. This query does not apply
/// the read scope — `Post` read is unscoped (every Post is public), and
/// `list_posts` re-applies the scope when it fetches the rows.
async fn ranked_post_ids(
	mm: &ModelManager,
	filter: Option<Vec<PostFilter>>,
	list_options: Option<ListOptions>,
) -> Result<Vec<i64>> {
	// Correlated like-count subquery: COUNT(*) of post_like for the outer Post row.
	let like_count = SimpleExpr::SubQuery(
		None,
		Box::new(SubQueryStatement::SelectStatement(
			Query::select()
				.expr(Expr::col(Asterisk).count())
				.from(PostLikeBmc::table_ref())
				.and_where(
					Expr::col((Alias::new("post_like"), Alias::new("post_id")))
						.equals((Alias::new("post"), CommonIden::Id)),
				)
				.to_owned(),
		)),
	);

	let mut query = Query::select();
	query
		.from(PostBmc::table_ref())
		.column((Alias::new("post"), CommonIden::Id));

	if let Some(filter) = filter {
		let filters: FilterGroups = filter.into();
		let cond: Condition = filters.try_into()?;
		query.cond_where(cond);
	}

	query
		.order_by_expr(like_count, Order::Desc)
		.order_by((Alias::new("post"), CommonIden::Id), Order::Asc);

	// Window at the DB.
	let (limit, offset) = window_bounds(list_options)?;
	query.limit(limit);
	if offset > 0 {
		query.offset(offset);
	}

	let (sql, values) = query.build_sqlx(PostgresQueryBuilder);
	let sqlx_query = sqlx::query_as_with::<_, (i64,), _>(&sql, values);
	let rows = mm.dbx().fetch_all(sqlx_query).await?;

	Ok(rows.into_iter().map(|(id,)| id).collect())
}

/// Resolve a caller's `list_options` into a `(limit, offset)` for the ranked
/// query, using the **shared** list-read limit check (`base::compute_list_options`)
/// so a ranked read obeys the same contract as every other list read: no limit
/// defaults to 1000, a limit up to the shared max (5000) is honored verbatim, and
/// a larger limit is rejected with `ListLimitOverMax`. Honoring valid limits (not
/// silently clamping them) is what keeps a paginating caller from skipping rows —
/// a clamp would return fewer rows than the `offset` step assumes. A negative
/// offset clamps to 0.
fn window_bounds(list_options: Option<ListOptions>) -> Result<(u64, u64)> {
	let lo = base::compute_list_options(list_options)?;
	let limit = lo.limit.unwrap_or(0).max(0) as u64;
	let offset = lo.offset.unwrap_or(0).max(0) as u64;
	Ok((limit, offset))
}

/// Read every `post_category` link for a set of Post ids, ordered by
/// `(post_id, category_id)`. One portable `IN` read — the batched Category
/// resolution the model seam needs (#117), never `array_agg`.
async fn post_category_links(
	mm: &ModelManager,
	post_ids: &[i64],
) -> Result<Vec<PostCategoryLink>> {
	if post_ids.is_empty() {
		return Ok(Vec::new());
	}

	let mut query = Query::select();
	query
		.from(PostCategoryBmc::table_ref())
		.column(Alias::new("post_id"))
		.column(Alias::new("category_id"))
		.and_where(Expr::col(Alias::new("post_id")).is_in(post_ids.iter().copied()))
		.order_by(Alias::new("post_id"), Order::Asc)
		.order_by(Alias::new("category_id"), Order::Asc);

	let (sql, values) = query.build_sqlx(PostgresQueryBuilder);
	let sqlx_query = sqlx::query_as_with::<_, PostCategoryLink, _>(&sql, values);
	let links = mm.dbx().fetch_all(sqlx_query).await?;

	Ok(links)
}

/// Count rows in a child table (`post_like` or `post_comment`) grouped by
/// `post_id`, for a set of Post ids. The child table's identity is the marker BMC
/// `MC`, so the `FROM` routes through `MC::table_ref()` — no string literal. One
/// portable `GROUP BY` read; a Post with no rows is simply absent from the result
/// and defaults to 0 at the call site.
async fn counts_by_post<MC: DbBmc>(
	mm: &ModelManager,
	post_ids: &[i64],
) -> Result<HashMap<i64, i64>> {
	if post_ids.is_empty() {
		return Ok(HashMap::new());
	}

	let mut query = Query::select();
	query
		.from(MC::table_ref())
		.column(Alias::new("post_id"))
		.expr_as(Expr::col(Asterisk).count(), Alias::new("cnt"))
		.and_where(Expr::col(Alias::new("post_id")).is_in(post_ids.iter().copied()))
		.add_group_by([Expr::col(Alias::new("post_id")).into()]);

	let (sql, values) = query.build_sqlx(PostgresQueryBuilder);
	let sqlx_query = sqlx::query_as_with::<_, CountRow, _>(&sql, values);
	let rows = mm.dbx().fetch_all(sqlx_query).await?;

	Ok(rows.into_iter().map(|r| (r.post_id, r.cnt)).collect())
}

// endregion: --- Batched read helpers

// region:    --- Tests

#[cfg(test)]
mod tests {
	type Error = Box<dyn std::error::Error>;
	type Result<T> = core::result::Result<T, Error>; // For tests.

	use super::*;
	use crate::_dev_utils::{self, seed_post, seed_user};
	use crate::model;
	use serial_test::serial;

	/// Insert one `post_like` row directly (test-only). `PostLikeBmc` now owns the
	/// table identity, but the like *write path* lands in #118, so the ranking test
	/// still seeds likes at the SQL layer.
	async fn seed_post_like(
		mm: &ModelManager,
		post_id: i64,
		user_id: i64,
	) -> Result<()> {
		sqlx::query(
			"INSERT INTO post_like (post_id, user_id, cid, ctime, mid, mtime) \
			 VALUES ($1, $2, 0, now(), 0, now())",
		)
		.bind(post_id)
		.bind(user_id)
		.execute(mm.dbx().db())
		.await?;
		Ok(())
	}

	/// `get_post` assembles the enriched view: the author snapshot, the resolved
	/// Categories (ordered by id), and derived counts that resolve to 0 with no
	/// likes / comments.
	#[serial]
	#[tokio::test]
	async fn test_get_post_assembles_view() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let owner_id =
			seed_user(&root, &mm, "test_get_post_assembles-owner").await?;
		let ctx = Ctx::new(owner_id)?;
		// Category ids 3 (Animals) and 6 (Cute) are seeded; order by id.
		let post_id =
			seed_post(&ctx, &mm, "test_get_post_assembles post", &[6, 3]).await?;

		// -- Exec
		let view = PostBmc::get_post(&ctx, &mm, post_id).await?;

		// -- Check
		assert_eq!(view.id, post_id);
		assert_eq!(view.author.id, owner_id);
		let cat_ids: Vec<i64> = view.categories.iter().map(|c| c.id).collect();
		assert_eq!(cat_ids, vec![3, 6], "categories ordered by id");
		assert_eq!(view.like_count, 0, "no likes seeded");
		assert_eq!(view.comment_count, 0, "no comments seeded");

		// -- Clean (owner delete cascades the post + its links)
		_dev_utils::clean_users(&root, &mm, "test_get_post_assembles").await?;

		Ok(())
	}

	/// `list_posts` ranks by like count descending; ties break by id ascending.
	#[serial]
	#[tokio::test]
	async fn test_list_posts_ranked_by_like_count() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let owner_id = seed_user(&root, &mm, "test_rank-owner").await?;
		let ctx = Ctx::new(owner_id)?;

		let low = seed_post(&ctx, &mm, "test_rank low", &[1]).await?;
		let high = seed_post(&ctx, &mm, "test_rank high", &[1]).await?;
		// `high` gets two likes, `low` gets none.
		seed_post_like(&mm, high, owner_id).await?;
		seed_post_like(&mm, high, 1).await?;

		// -- Exec
		let views = PostBmc::list_posts(
			&ctx,
			&mm,
			Some(vec![PostFilter {
				owner_id: Some(owner_id.into()),
				..Default::default()
			}]),
			None,
		)
		.await?;

		// -- Check: `high` (2 likes) ranks before `low` (0 likes).
		let ids: Vec<i64> = views.iter().map(|v| v.id).collect();
		assert_eq!(ids, vec![high, low], "ranked by like count desc");
		assert_eq!(views[0].like_count, 2);
		assert_eq!(views[1].like_count, 0);

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_rank-owner").await?;

		Ok(())
	}

	/// A `limit` windows the ranked list AFTER ranking, not before (regression
	/// guard, #117 review). The most-liked Post is not the lowest id, so a
	/// limit-1 read must return the top-liked Post, never the lowest-id one.
	#[serial]
	#[tokio::test]
	async fn test_list_posts_limit_windows_after_ranking() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let owner_id = seed_user(&root, &mm, "test_window-owner").await?;
		let ctx = Ctx::new(owner_id)?;

		// Three Posts; the second-created (higher id) gets the only likes.
		let first = seed_post(&ctx, &mm, "test_window a", &[1]).await?;
		let top = seed_post(&ctx, &mm, "test_window b", &[1]).await?;
		let _third = seed_post(&ctx, &mm, "test_window c", &[1]).await?;
		seed_post_like(&mm, top, owner_id).await?;

		// -- Exec: rank the owner's Posts, take only the top 1.
		let views = PostBmc::list_posts(
			&ctx,
			&mm,
			Some(vec![PostFilter {
				owner_id: Some(owner_id.into()),
				..Default::default()
			}]),
			Some(ListOptions {
				limit: Some(1),
				offset: None,
				order_bys: None,
			}),
		)
		.await?;

		// -- Check: the single returned Post is the most-liked one, not `first`.
		assert_eq!(views.len(), 1);
		assert_eq!(views[0].id, top, "limit must window the RANKED list");
		assert_ne!(views[0].id, first);

		// -- Check: OFFSET pages the ranked list at the DB. Rank is [top, first,
		//    third] (top has the only like; the two 0-like Posts tie by id asc), so
		//    offset 1 / limit 1 returns `first`, the second-ranked Post.
		let page2 = PostBmc::list_posts(
			&ctx,
			&mm,
			Some(vec![PostFilter {
				owner_id: Some(owner_id.into()),
				..Default::default()
			}]),
			Some(ListOptions {
				limit: Some(1),
				offset: Some(1),
				order_bys: None,
			}),
		)
		.await?;
		assert_eq!(page2.len(), 1);
		assert_eq!(page2[0].id, first, "offset must page the RANKED list");

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_window-owner").await?;

		Ok(())
	}

	/// Every Post is public: Read is unscoped, so a non-owner reads any Post.
	/// Write is owner-only: a non-owner update / delete is `EntityNotFound`, while
	/// the Owner may update. (#106)
	#[serial]
	#[tokio::test]
	async fn test_post_write_is_owner_only() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let a_id = seed_user(&root, &mm, "test_owner_only-A").await?;
		let b_id = seed_user(&root, &mm, "test_owner_only-B").await?;
		let ctx_a = Ctx::new(a_id)?;
		let ctx_b = Ctx::new(b_id)?;

		let post_id = seed_post(&ctx_a, &mm, "test_owner_only post", &[1]).await?;

		// -- Check: B reads A's Post (public read).
		let view = PostBmc::get_post(&ctx_b, &mm, post_id).await?;
		assert_eq!(view.id, post_id);

		// -- Check: B cannot update or delete A's Post (owner-only write).
		assert!(
			matches!(
				PostBmc::update(
					&ctx_b,
					&mm,
					post_id,
					PostForUpdate {
						title: Some("hijack".to_string()),
						..Default::default()
					},
				)
				.await,
				Err(model::Error::EntityNotFound { .. })
			),
			"B update A's Post should be EntityNotFound"
		);
		assert!(
			matches!(
				PostBmc::delete(&ctx_b, &mm, post_id).await,
				Err(model::Error::EntityNotFound { .. })
			),
			"B delete A's Post should be EntityNotFound"
		);

		// -- Check: A (the Owner) may update.
		PostBmc::update(
			&ctx_a,
			&mm,
			post_id,
			PostForUpdate {
				title: Some("owner edit".to_string()),
				..Default::default()
			},
		)
		.await?;

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_owner_only").await?;

		Ok(())
	}

	/// A Post requires at least one Category: an empty `category_ids` is rejected
	/// before any row is inserted (#107).
	#[serial]
	#[tokio::test]
	async fn test_create_requires_a_category() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let owner_id = seed_user(&root, &mm, "test_requires_cat-owner").await?;
		let ctx = Ctx::new(owner_id)?;

		// -- Exec
		let res = PostBmc::create(
			&ctx,
			&mm,
			PostForCreate {
				title: "no categories".to_string(),
				..Default::default()
			},
			&[],
		)
		.await;

		// -- Check
		assert!(
			matches!(&res, Err(model::Error::Validation { field, .. })
				if field == "category_ids"),
			"got {res:?}"
		);

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_requires_cat").await?;

		Ok(())
	}

	/// `PostView` is a public projection: its serialized shape carries no audit
	/// columns (`cid` / `mid` / `ctime` / `mtime`) — ADR-0021.
	#[test]
	fn test_post_view_has_no_audit_columns() {
		let view = PostView {
			id: 1,
			author: AuthorRef {
				id: 2,
				name: "Lisa".to_string(),
				avatar_url: None,
			},
			title: "t".to_string(),
			image_src: "s".to_string(),
			image_alt: "a".to_string(),
			photographer: "p".to_string(),
			photographer_url: "pu".to_string(),
			source_url: "su".to_string(),
			categories: Vec::new(),
			like_count: 0,
			comment_count: 0,
		};
		let value = serde_json::to_value(&view).unwrap();
		let obj = value.as_object().unwrap();
		for audit in ["cid", "mid", "ctime", "mtime"] {
			assert!(
				!obj.contains_key(audit),
				"PostView must not expose the `{audit}` audit column"
			);
		}
	}

	/// The ranked read obeys the shared list-read limit contract
	/// (`base::compute_list_options`): no limit -> 1000; a valid limit up to the
	/// shared max (5000) is honored verbatim (NOT clamped, so a paginating caller
	/// never skips rows); a limit over the max is rejected.
	#[test]
	fn test_window_bounds_uses_shared_limit_check() {
		let lo = |limit, offset| {
			Some(ListOptions {
				limit,
				offset,
				order_bys: None,
			})
		};
		// No options: the shared default page size, offset 0.
		assert_eq!(window_bounds(None).unwrap(), (1000, 0));
		// A valid explicit limit up to the shared max is honored, not clamped to
		// 1000; offset is honored.
		assert_eq!(window_bounds(lo(Some(5000), Some(10))).unwrap(), (5000, 10));
		assert_eq!(window_bounds(lo(Some(3), None)).unwrap(), (3, 0));
		// Over the shared max (5000) is rejected, so a paginating caller cannot get
		// a short page silently and then skip rows on the next offset step.
		assert!(window_bounds(lo(Some(5001), None)).is_err());
	}

	/// At most one Like per (Post, User): the DB unique constraint rejects a
	/// second Like by the same User, so the one-endorsement invariant holds even
	/// under a double insert (#106, #122). The like write path lands in #122; this
	/// guards the schema the write path relies on.
	#[serial]
	#[tokio::test]
	async fn test_post_like_unique_per_user() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let owner_id = seed_user(&root, &mm, "test_like_unique-owner").await?;
		let ctx = Ctx::new(owner_id)?;
		let post_id = seed_post(&ctx, &mm, "test_like_unique post", &[1]).await?;

		// -- Exec & Check: the first Like commits; a second by the same User fails.
		//    Collapse to a bool so the non-Send error is not held across the await.
		seed_post_like(&mm, post_id, owner_id).await?;
		let duplicate_rejected =
			seed_post_like(&mm, post_id, owner_id).await.is_err();
		assert!(
			duplicate_rejected,
			"a second Like by the same User must violate the unique constraint"
		);

		// -- Clean
		_dev_utils::clean_users(&root, &mm, "test_like_unique-owner").await?;

		Ok(())
	}
}

// endregion: --- Tests
