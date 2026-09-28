//! Shared helpers for **derived** like / comment counts and the like-count
//! ranking (Top Photos #117, Top Captions #118). A Post and a Caption each have
//! their own child tables (`post_like` / `caption_like`, `post_comment` /
//! `caption_comment`), keyed on their own parent column (`post_id` /
//! `caption_id`), so each helper takes the child table as a marker BMC and the
//! parent key column by name. Every read is a portable `IN` / `GROUP BY` /
//! correlated `COUNT` — never `array_agg` — so the Postgres/Turso DB-swap seam
//! holds (ADR-0012).

use crate::model::base::{self, CommonIden, DbBmc};
use crate::model::ModelManager;
use crate::model::Result;
use modql::filter::{FilterGroups, ListOptions};
use sea_query::{
	Alias, Asterisk, Condition, Expr, Order, PostgresQueryBuilder, Query,
	SimpleExpr, SubQueryStatement,
};
use sea_query_binder::SqlxBinder;
use sqlx::FromRow;
use std::collections::HashMap;

/// Distinct ids, preserving first-seen order.
pub fn dedup(ids: impl Iterator<Item = i64>) -> Vec<i64> {
	let mut seen = std::collections::HashSet::new();
	ids.filter(|id| seen.insert(*id)).collect()
}

/// One `(parent_id, count)` row from a derived-count query.
#[derive(FromRow)]
struct CountRow {
	parent_id: i64,
	cnt: i64,
}

/// Rank the rows of `MC` by like count at the **database** and return the
/// ordered ids for one page (#117 review). The like count is derived, so the
/// ranking is an `ORDER BY` on a correlated `COUNT` subquery over the like table
/// `LikeMC` (joined on its `parent_col`), with the tie broken by id ascending.
/// `LIMIT` / `OFFSET` page the result at the DB, so only the page's ids come back
/// — never the whole table. The caller's `filter` applies to `MC` (the only
/// table in `FROM`, so its columns are unambiguous); there is no caller
/// `order_bys`, since the ranking is fixed. This query does not apply the read
/// scope — the caller re-applies it when it fetches the rows.
pub async fn ranked_ids_by_like_count<MC, LikeMC, F>(
	mm: &ModelManager,
	parent_col: &'static str,
	filter: Option<F>,
	list_options: Option<ListOptions>,
) -> Result<Vec<i64>>
where
	MC: DbBmc,
	LikeMC: DbBmc,
	F: Into<FilterGroups>,
{
	// Correlated like-count subquery: COUNT(*) of the like table for the outer row.
	let like_count = SimpleExpr::SubQuery(
		None,
		Box::new(SubQueryStatement::SelectStatement(
			Query::select()
				.expr(Expr::col(Asterisk).count())
				.from(LikeMC::table_ref())
				.and_where(
					Expr::col((Alias::new(LikeMC::TABLE), Alias::new(parent_col)))
						.equals((Alias::new(MC::TABLE), CommonIden::Id)),
				)
				.to_owned(),
		)),
	);

	let mut query = Query::select();
	query
		.from(MC::table_ref())
		.column((Alias::new(MC::TABLE), CommonIden::Id));

	if let Some(filter) = filter {
		let filters: FilterGroups = filter.into();
		let cond: Condition = filters.try_into()?;
		query.cond_where(cond);
	}

	query
		.order_by_expr(like_count, Order::Desc)
		.order_by((Alias::new(MC::TABLE), CommonIden::Id), Order::Asc);

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

/// Count rows in a child table (a like or comment table) grouped by its
/// `parent_col`, for a set of parent ids. The child table's identity is the
/// marker BMC `MC`, so the `FROM` routes through `MC::table_ref()` — no string
/// literal. One portable `GROUP BY` read; a parent with no rows is simply absent
/// from the result and defaults to 0 at the call site.
pub async fn counts_by_parent<MC: DbBmc>(
	mm: &ModelManager,
	parent_col: &'static str,
	parent_ids: &[i64],
) -> Result<HashMap<i64, i64>> {
	if parent_ids.is_empty() {
		return Ok(HashMap::new());
	}

	let mut query = Query::select();
	query
		.from(MC::table_ref())
		.expr_as(Expr::col(Alias::new(parent_col)), Alias::new("parent_id"))
		.expr_as(Expr::col(Asterisk).count(), Alias::new("cnt"))
		.and_where(
			Expr::col(Alias::new(parent_col)).is_in(parent_ids.iter().copied()),
		)
		.add_group_by([Expr::col(Alias::new(parent_col)).into()]);

	let (sql, values) = query.build_sqlx(PostgresQueryBuilder);
	let sqlx_query = sqlx::query_as_with::<_, CountRow, _>(&sql, values);
	let rows = mm.dbx().fetch_all(sqlx_query).await?;

	Ok(rows.into_iter().map(|r| (r.parent_id, r.cnt)).collect())
}

// region:    --- Tests

#[cfg(test)]
mod tests {
	use super::*;

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
}

// endregion: --- Tests
