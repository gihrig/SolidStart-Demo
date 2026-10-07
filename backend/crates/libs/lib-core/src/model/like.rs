//! The **Like** module (#123, C-19, ADR-0024 addendum): one write path and one
//! read for every Like target. A target is a like BMC that implements
//! [`LikeTarget`]: its like table (`DbBmc::TABLE`), its parent key column, and its
//! parent BMC for the existence check. [`LikeBmc::toggle`] and [`LikeBmc::get`]
//! are generic over the target, so the compiler checks each one.
//!
//! A Like is write-once: the toggle inserts or deletes, never updates. The count
//! is never stored — it is derived by counting rows.

use crate::ctx::Ctx;
use crate::model::base::{self, DbBmc};
use crate::model::ModelManager;
use crate::model::{Error, Result};
use modql::field::SeaFields;
use sea_query::{
	Alias, Asterisk, Expr, Func, OnConflict, PostgresQueryBuilder, Query,
};
use sea_query_binder::SqlxBinder;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

// region:    --- Like Types

/// One Like target: a like table keyed on its parent (`post_like.post_id`,
/// `caption_like.caption_id`), with `UNIQUE (parent, user_id)`. The like BMC
/// implements it; the shared [`LikeBmc`] functions do the work.
pub trait LikeTarget: DbBmc {
	/// The parent key column of the like table (`post_id` / `caption_id`).
	const PARENT_COL: &'static str;

	/// The `Validation` reason for an unknown parent (`"unknown Post"`).
	const UNKNOWN_PARENT: &'static str;

	/// The parent BMC: the existence check reads its table.
	type Parent: DbBmc;
}

/// One User's view of one Like target's Likes (#122, #123): the derived like
/// count and whether the caller likes it. `id` is the parent id (the Post or the
/// Caption). Per-caller, so it is served only on the authenticated surface — an
/// anonymous public projection cannot carry `liked`.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "LikeView.d.ts")]
pub struct LikeView {
	pub id: i64,
	pub like_count: i64,
	pub liked: bool,
}

/// The `toggle_*_like` input (#122, #123). `id` is the parent id. `liked` is the
/// wanted state, not a flip, so the toggle is idempotent: a second like and a
/// second unlike are no-ops.
#[derive(Deserialize, TS)]
#[ts(export, export_to = "LikeForToggle.d.ts")]
pub struct LikeForToggle {
	pub id: i64,
	pub liked: bool,
}

// endregion: --- Like Types

// region:    --- LikeBmc

/// The column that names the liking User in every like table.
const USER_ID: &str = "user_id";

pub struct LikeBmc;

impl LikeBmc {
	/// Set the caller's Like on one `T` parent to `liked`. Idempotent: a like
	/// inserts with `ON CONFLICT DO NOTHING` on the `(parent, user_id)` unique key,
	/// so a second like is a no-op; an unlike deletes the caller's row, so a
	/// second unlike is a no-op. Returns whether a Like row changed, so the caller
	/// pokes only on a real change. An unknown parent is a `Validation` error,
	/// rejected before the write.
	pub async fn toggle<T: LikeTarget>(
		ctx: &Ctx,
		mm: &ModelManager,
		like_t: LikeForToggle,
	) -> Result<bool> {
		let LikeForToggle { id, liked } = like_t;
		let user_id = ctx.user_id();

		require_parent::<T>(ctx, mm, id).await?;

		let (sql, values) = if liked {
			let mut fields = SeaFields::new(Vec::new())
				.append_siden(T::PARENT_COL, id)
				.append_siden(USER_ID, user_id);
			base::prep_fields_for_create::<T>(&mut fields, user_id);
			let (columns, sea_values) = fields.for_sea_insert();

			let mut query = Query::insert();
			query
				.into_table(T::table_ref())
				.columns(columns)
				.values(sea_values)?
				.on_conflict(
					OnConflict::columns([
						Alias::new(T::PARENT_COL),
						Alias::new(USER_ID),
					])
					.do_nothing()
					.to_owned(),
				);
			query.build_sqlx(PostgresQueryBuilder)
		} else {
			let mut query = Query::delete();
			query
				.from_table(T::table_ref())
				.and_where(Expr::col(Alias::new(T::PARENT_COL)).eq(id))
				.and_where(Expr::col(Alias::new(USER_ID)).eq(user_id));
			query.build_sqlx(PostgresQueryBuilder)
		};
		// One row at most: the `(parent, user_id)` key is unique.
		let changed = mm.dbx().execute(sqlx::query_with(&sql, values)).await?;

		Ok(changed > 0)
	}

	/// Read the caller's `LikeView` of one `T` parent: the derived like count and
	/// whether the caller likes it. An unknown parent is the same `Validation`
	/// error as `toggle`, not a silent zero view.
	pub async fn get<T: LikeTarget>(
		ctx: &Ctx,
		mm: &ModelManager,
		id: i64,
	) -> Result<LikeView> {
		// One statement reads the count and the caller's Like, so both come from
		// one snapshot: a Like that changes mid-read cannot pair a count of 0
		// with `liked: true` (#122 review).
		let mut query = Query::select();
		query
			.from(T::table_ref())
			.expr(Expr::col(Asterisk).count())
			.expr(Func::coalesce([
				Func::cust(Alias::new("BOOL_OR"))
					.arg(Expr::col(Alias::new(USER_ID)).eq(ctx.user_id()))
					.into(),
				Expr::val(false).into(),
			]))
			.and_where(Expr::col(Alias::new(T::PARENT_COL)).eq(id));
		let (sql, values) = query.build_sqlx(PostgresQueryBuilder);
		let sqlx_query = sqlx::query_as_with::<_, (i64, bool), _>(&sql, values);

		let ((), (like_count, liked)) =
			tokio::try_join!(require_parent::<T>(ctx, mm, id), async {
				mm.dbx().fetch_one(sqlx_query).await.map_err(Error::from)
			},)?;

		Ok(LikeView {
			id,
			like_count,
			liked,
		})
	}
}

/// Reject an unknown `T` parent as a `Validation` error on its parent column
/// (400), so a Like never reaches a foreign-key failure.
async fn require_parent<T: LikeTarget>(
	ctx: &Ctx,
	mm: &ModelManager,
	id: i64,
) -> Result<()> {
	base::require_exists::<T::Parent>(ctx, mm, id, T::PARENT_COL, T::UNKNOWN_PARENT)
		.await
}

// endregion: --- LikeBmc
