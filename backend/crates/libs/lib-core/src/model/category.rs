use crate::ctx::Ctx;
use crate::generate_common_bmc_fns;
use crate::model::base::{self, DbBmc, FieldHygiene};
use crate::model::modql_utils::time_to_sea_value;
use crate::model::ModelManager;
use crate::model::Result;
use lib_utils::time::Rfc3339;
use modql::field::Fields;
use modql::filter::{FilterNodes, OpValsString, OpValsValue};
use modql::filter::{ListOptions, OpValsInt64};
use serde::{Deserialize, Serialize};
use serde_with::serde_as;
use sqlx::types::time::OffsetDateTime;
use sqlx::FromRow;
use ts_rs::TS;

// region:    --- Category Types

/// A static, back-end-owned taxonomy row. It has no `owner_id` and no AI fields
/// (ADR-0011). `icon` is an opaque key the back-end never interprets; the
/// front-end maps it to a sprite name with a fallback.
#[serde_as]
#[derive(Debug, Clone, Fields, FromRow, Serialize, TS)]
#[ts(export, export_to = "Category.d.ts")]
pub struct Category {
	pub id: i64,

	// -- Properties
	pub name: String,
	pub icon: String,

	// -- Timestamps
	//    (creator and last modified user_id/time)
	pub cid: i64,
	#[serde_as(as = "Rfc3339")]
	#[ts(type = "string")]
	pub ctime: OffsetDateTime,
	pub mid: i64,
	#[serde_as(as = "Rfc3339")]
	#[ts(type = "string")]
	pub mtime: OffsetDateTime,
}

/// The public projection of a Category: only the fields an anonymous consumer
/// needs. The audit columns (`cid` / `mid` actor ids, `ctime` / `mtime`) are
/// deliberately absent, so the public `/api/rpc-public` response never exposes
/// internal storage detail (#116 review). `base::list` selects exactly these
/// columns for this type, so the audit columns are never even queried.
#[derive(Debug, Clone, Fields, FromRow, Serialize, TS)]
#[ts(export, export_to = "CategoryPublic.d.ts")]
pub struct CategoryPublic {
	pub id: i64,
	pub name: String,
	pub icon: String,
}

#[derive(Fields, Deserialize)]
pub struct CategoryForCreate {
	pub name: String,
	pub icon: String,
}

#[derive(Fields, Deserialize)]
pub struct CategoryForUpdate {
	pub name: Option<String>,
	pub icon: Option<String>,
}

#[derive(FilterNodes, Default, Deserialize)]
pub struct CategoryFilter {
	pub id: Option<OpValsInt64>,
	pub name: Option<OpValsString>,
	pub icon: Option<OpValsString>,

	pub cid: Option<OpValsInt64>,
	#[modql(to_sea_value_fn = "time_to_sea_value")]
	pub ctime: Option<OpValsValue>,
	pub mid: Option<OpValsInt64>,
	#[modql(to_sea_value_fn = "time_to_sea_value")]
	pub mtime: Option<OpValsValue>,
}

// endregion: --- Category Types

// region:    --- CategoryBmc

pub struct CategoryBmc;

impl DbBmc for CategoryBmc {
	const TABLE: &'static str = "category";

	/// The `name` is user-visible free text, so it submits to write-path
	/// hygiene with a 20-character cap (ADR-0019). `icon` is an opaque key set
	/// by the taxonomy owner, not free text, so it declares no rule.
	fn hygiene_rules() -> &'static [FieldHygiene] {
		const RULES: &[FieldHygiene] = &[FieldHygiene {
			field: "name",
			max_len: Some(20),
		}];
		RULES
	}
}

// Categories carry no `owner_id`; the default `access_scope` leaves both Read
// and Write unscoped, so Read returns the whole taxonomy to every User.
// This generates the `impl CategoryBmc {...}` with the default CRUD functions.
generate_common_bmc_fns!(
	Bmc: CategoryBmc,
	Entity: Category,
	ForCreate: CategoryForCreate,
	ForUpdate: CategoryForUpdate,
	Filter: CategoryFilter,
);

impl CategoryBmc {
	/// List the taxonomy as the public projection (`id`, `name`, `icon`). The
	/// public RPC uses this so the anonymous response carries no audit columns.
	pub async fn list_public(
		ctx: &Ctx,
		mm: &ModelManager,
		filter: Option<Vec<CategoryFilter>>,
		list_options: Option<ListOptions>,
	) -> Result<Vec<CategoryPublic>> {
		base::list::<Self, CategoryPublic, _>(ctx, mm, filter, list_options).await
	}
}

// endregion: --- CategoryBmc

// region:    --- Tests

#[cfg(test)]
mod tests {
	type Error = Box<dyn std::error::Error>;
	type Result<T> = core::result::Result<T, Error>; // For tests.

	use super::*;
	use crate::_dev_utils::{
		self, clean_categories, seed_categories, seed_category,
	};
	use crate::model;
	use serde_json::json;
	use serial_test::serial;

	#[serial]
	#[tokio::test]
	async fn test_create_ok() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let ctx = Ctx::root_ctx();
		let fx_name = "test_create_ok cat";
		let fx_icon = "dog";

		// -- Exec
		let fx_category_c = CategoryForCreate {
			name: fx_name.to_string(),
			icon: fx_icon.to_string(),
		};
		let category_id = CategoryBmc::create(&ctx, &mm, fx_category_c).await?;

		// -- Check
		let category = CategoryBmc::get(&ctx, &mm, category_id).await?;
		assert_eq!(category.name, fx_name);
		assert_eq!(category.icon, fx_icon);

		// -- Clean
		let count = clean_categories(&ctx, &mm, "test_create_ok").await?;
		assert_eq!(count, 1, "Should have cleaned only 1 category");

		Ok(())
	}

	#[serial]
	#[tokio::test]
	async fn test_update_ok() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let ctx = Ctx::root_ctx();

		let fx_name = "test_update_ok cat";
		let fx_category_id = seed_category(&ctx, &mm, fx_name, "dog").await?;
		let fx_name_updated = "test_update_ok upd";

		// -- Exec
		let fx_category_u = CategoryForUpdate {
			name: Some(fx_name_updated.to_string()),
			icon: None,
		};
		CategoryBmc::update(&ctx, &mm, fx_category_id, fx_category_u).await?;

		// -- Check
		let category = CategoryBmc::get(&ctx, &mm, fx_category_id).await?;
		assert_eq!(category.name, fx_name_updated);
		assert_eq!(category.icon, "dog");

		// -- Clean
		let count = clean_categories(&ctx, &mm, "test_update_ok").await?;
		assert_eq!(count, 1, "Should have cleaned only 1 category");

		Ok(())
	}

	#[serial]
	#[tokio::test]
	async fn test_delete_ok() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let ctx = Ctx::root_ctx();

		let fx_name = "test_delete_ok cat";
		let fx_category_id = seed_category(&ctx, &mm, fx_name, "dog").await?;

		// -- Exec
		CategoryBmc::get(&ctx, &mm, fx_category_id).await?;
		CategoryBmc::delete(&ctx, &mm, fx_category_id).await?;

		// -- Check
		let res = CategoryBmc::get(&ctx, &mm, fx_category_id).await;
		assert!(
			matches!(&res, Err(model::Error::EntityNotFound { .. })),
			"should return a EntityNotFound"
		);

		Ok(())
	}

	#[serial]
	#[tokio::test]
	async fn test_list_ok() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let ctx = Ctx::root_ctx();

		let fx_names = &["test_list_ok cat 01", "test_list_ok cat 02"];
		seed_categories(&ctx, &mm, fx_names, "dog").await?;

		// -- Exec
		let category_filter: CategoryFilter = serde_json::from_value(json!(
			{
				"name": {"$contains": "test_list_ok cat"}
			}
		))?;
		let categories =
			CategoryBmc::list(&ctx, &mm, Some(vec![category_filter]), None).await?;

		// -- Check
		assert_eq!(categories.len(), 2);
		let names = categories.iter().map(|c| &c.name).collect::<Vec<_>>();
		assert_eq!(names, fx_names);

		// -- Clean
		let count = clean_categories(&ctx, &mm, "test_list_ok cat").await?;
		assert_eq!(count, 2, "Should have cleaned 2 categories");

		Ok(())
	}

	/// Read is unscoped: the seeded taxonomy (ids 1..6) is visible to any User.
	#[serial]
	#[tokio::test]
	async fn test_seeded_taxonomy_read_unscoped() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let ctx = Ctx::new(1000)?; // an ordinary (non-root) User ctx

		// -- Exec
		let categories = CategoryBmc::list(&ctx, &mm, None, None).await?;

		// -- Check: the six seeded rows are all readable.
		let names = categories
			.iter()
			.map(|c| c.name.as_str())
			.collect::<Vec<_>>();
		assert!(names.contains(&"Landscape"), "got {names:?}");
		assert!(names.contains(&"Cute"), "got {names:?}");

		Ok(())
	}

	/// `list_public` returns the taxonomy as the public projection. The type
	/// carries only `id` / `name` / `icon` (no audit columns), so the anonymous
	/// response cannot leak actor ids or timestamps (#116 review).
	#[serial]
	#[tokio::test]
	async fn test_list_public_ok() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let ctx = Ctx::new(1000)?; // an ordinary (non-root) User ctx

		// -- Exec
		let categories = CategoryBmc::list_public(&ctx, &mm, None, None).await?;

		// -- Check: the seeded rows come back as the public projection.
		let names = categories
			.iter()
			.map(|c| c.name.as_str())
			.collect::<Vec<_>>();
		assert!(names.contains(&"Landscape"), "got {names:?}");
		assert!(names.contains(&"Cute"), "got {names:?}");

		Ok(())
	}

	/// The `name` field is hygiene-validated with a 20-character cap: a longer
	/// name is rejected with a `Validation` error naming the field.
	#[serial]
	#[tokio::test]
	async fn test_name_over_cap_rejected() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let ctx = Ctx::root_ctx();
		let fx_name = "123456789012345678901"; // 21 chars, one over the cap

		// -- Exec
		let res = CategoryBmc::create(
			&ctx,
			&mm,
			CategoryForCreate {
				name: fx_name.to_string(),
				icon: "dog".to_string(),
			},
		)
		.await;

		// -- Check
		assert!(
			matches!(&res, Err(model::Error::Validation { field, reason })
				if field == "name" && reason.contains("max length 20")),
			"got {res:?}"
		);

		Ok(())
	}
}

// endregion: --- Tests
