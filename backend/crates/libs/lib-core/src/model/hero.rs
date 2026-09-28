use crate::ctx::Ctx;
use crate::model::base::{self, DbBmc, FieldHygiene, PublicProjection};
use crate::model::ModelManager;
use crate::model::Result;
use modql::field::Fields;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use ts_rs::TS;

// region:    --- Hero Types

/// The id of the one Hero row. The `hero` table's `CHECK (id = 1)` keeps it a
/// singleton, and no RPC creates or deletes it.
const HERO_ID: i64 = 1;

/// The **public projection** of the Hero singleton (ADR-0021): the home page
/// banner content, minus the audit columns (`cid` / `mid` / `ctime` / `mtime`).
/// There is no `cta_href`: the CTA runs fixed front-end code (ADR-0011
/// addendum). `base::get` selects exactly these columns, so the audit columns
/// are never queried.
#[derive(Debug, Clone, Fields, FromRow, Serialize, TS)]
#[ts(export, export_to = "HeroView.d.ts")]
pub struct HeroView {
	pub id: i64,

	// -- Properties
	pub title: String,
	pub subtitle: String,
	pub cta_text: String,
	pub background_image: String,
}

impl PublicProjection for HeroView {}

#[derive(Fields, Deserialize, Default)]
pub struct HeroForUpdate {
	pub title: Option<String>,
	pub subtitle: Option<String>,
	pub cta_text: Option<String>,
	pub background_image: Option<String>,
}

// endregion: --- Hero Types

// region:    --- HeroBmc

pub struct HeroBmc;

impl DbBmc for HeroBmc {
	const TABLE: &'static str = "hero";

	/// The display fields submit to write-path hygiene with their caps
	/// (ADR-0019). `background_image` is capped at its `varchar(1024)` column
	/// width, so an over-long URL is a `Validation` error, not a DB error. It
	/// also rejects the hidden-text characters before its URL check.
	fn hygiene_rules() -> &'static [FieldHygiene] {
		const RULES: &[FieldHygiene] = &[
			FieldHygiene {
				field: "title",
				max_len: Some(40),
			},
			FieldHygiene {
				field: "subtitle",
				max_len: Some(100),
			},
			FieldHygiene {
				field: "cta_text",
				max_len: Some(20),
			},
			FieldHygiene {
				field: "background_image",
				max_len: Some(1024),
			},
		];
		RULES
	}

	/// An unsafe `background_image` is rejected on write (ADR-0011).
	fn url_fields() -> &'static [&'static str] {
		&["background_image"]
	}
}

// The Hero has no `owner_id`, so the default `access_scope` leaves Read and
// Write unscoped. Admin-only write-gating is deferred until a privilege system
// exists (ADR-0011 addendum). The CRUD macro is not used: it would generate a
// `create` / `delete`, and the singleton has neither.
impl HeroBmc {
	/// Read the Hero singleton as its public projection.
	pub async fn get_hero(ctx: &Ctx, mm: &ModelManager) -> Result<HeroView> {
		base::get::<Self, HeroView>(ctx, mm, HERO_ID).await
	}

	/// Update the Hero singleton. `id` must be the singleton's id (the one
	/// `get_hero` returns); any other id is `EntityNotFound`.
	pub async fn update(
		ctx: &Ctx,
		mm: &ModelManager,
		id: i64,
		hero_u: HeroForUpdate,
	) -> Result<()> {
		base::update::<Self, _>(ctx, mm, id, hero_u).await
	}
}

// endregion: --- HeroBmc

// region:    --- Tests

#[cfg(test)]
mod tests {
	type Error = Box<dyn std::error::Error>;
	type Result<T> = core::result::Result<T, Error>; // For tests.

	use super::*;
	use crate::_dev_utils;
	use crate::model;
	use serial_test::serial;

	/// The seeded fixture Hero is the singleton any User reads.
	#[serial]
	#[tokio::test]
	async fn test_get_hero_seeded() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let ctx = Ctx::new(1000)?; // an ordinary (non-root) User ctx

		// -- Exec
		let hero = HeroBmc::get_hero(&ctx, &mm).await?;

		// -- Check
		assert_eq!(hero.id, 1);
		assert_eq!(hero.title, "Awesome Photos & Captions");
		assert_eq!(hero.cta_text, "Get Started");
		assert_eq!(
			hero.background_image,
			"https://live.staticflickr.com/65535/49909538937_3255dcf9e7_b.jpg"
		);

		Ok(())
	}

	/// An update changes only the given fields; a later read returns them.
	#[serial]
	#[tokio::test]
	async fn test_update_hero_ok() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let ctx = Ctx::new(1000)?; // Hero write is unscoped for now (ADR-0011)
		let before = HeroBmc::get_hero(&ctx, &mm).await?;

		// -- Exec
		HeroBmc::update(
			&ctx,
			&mm,
			before.id,
			HeroForUpdate {
				title: Some("  test_update_hero_ok  ".to_string()),
				..Default::default()
			},
		)
		.await?;

		// -- Check: the title is trimmed by hygiene; the rest is unchanged.
		let hero = HeroBmc::get_hero(&ctx, &mm).await?;
		assert_eq!(hero.title, "test_update_hero_ok");
		assert_eq!(hero.subtitle, before.subtitle);

		// -- Clean: restore the seeded title for the other tests.
		HeroBmc::update(
			&ctx,
			&mm,
			before.id,
			HeroForUpdate {
				title: Some(before.title),
				..Default::default()
			},
		)
		.await?;

		Ok(())
	}

	/// Each field enforces its cap: title 40, subtitle 100, cta_text 20, and
	/// background_image 1024 characters. One character over the cap is rejected.
	#[serial]
	#[tokio::test]
	async fn test_update_hero_over_cap_rejected() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let ctx = Ctx::root_ctx();
		let cases = [
			(
				"title",
				HeroForUpdate {
					title: Some("a".repeat(41)),
					..Default::default()
				},
				"max length 40",
			),
			(
				"subtitle",
				HeroForUpdate {
					subtitle: Some("a".repeat(101)),
					..Default::default()
				},
				"max length 100",
			),
			(
				"cta_text",
				HeroForUpdate {
					cta_text: Some("a".repeat(21)),
					..Default::default()
				},
				"max length 20",
			),
			(
				"background_image",
				HeroForUpdate {
					background_image: Some(format!(
						"https://example.com/{}",
						"a".repeat(1005)
					)),
					..Default::default()
				},
				"max length 1024",
			),
		];

		for (fx_field, fx_hero_u, fx_reason) in cases {
			// -- Exec
			let res = HeroBmc::update(&ctx, &mm, 1, fx_hero_u).await;

			// -- Check
			assert!(
				matches!(&res, Err(model::Error::Validation { field, reason })
					if field == fx_field && reason.contains(fx_reason)),
				"{fx_field}: got {res:?}"
			);
		}

		Ok(())
	}

	/// The Hero is a singleton: an update of any id but the singleton's is
	/// `EntityNotFound`.
	#[serial]
	#[tokio::test]
	async fn test_update_hero_other_id_not_found() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let ctx = Ctx::root_ctx();

		// -- Exec
		let res = HeroBmc::update(
			&ctx,
			&mm,
			2,
			HeroForUpdate {
				title: Some("test_update_hero_other_id".to_string()),
				..Default::default()
			},
		)
		.await;

		// -- Check
		assert!(
			matches!(
				&res,
				Err(model::Error::EntityNotFound {
					entity: "hero",
					id: 2
				})
			),
			"got {res:?}"
		);

		Ok(())
	}

	/// An unsafe `background_image` URL is rejected on write, and the stored
	/// value is unchanged.
	#[serial]
	#[tokio::test]
	async fn test_update_hero_unsafe_url_rejected() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let ctx = Ctx::root_ctx();
		let before = HeroBmc::get_hero(&ctx, &mm).await?;

		// -- Exec
		let res = HeroBmc::update(
			&ctx,
			&mm,
			before.id,
			HeroForUpdate {
				background_image: Some("javascript:alert(1)".to_string()),
				..Default::default()
			},
		)
		.await;

		// -- Check
		assert!(
			matches!(&res, Err(model::Error::Validation { field, reason })
				if field == "background_image" && reason.contains("unsafe URL")),
			"got {res:?}"
		);
		let hero = HeroBmc::get_hero(&ctx, &mm).await?;
		assert_eq!(hero.background_image, before.background_image);

		Ok(())
	}
}

// endregion: --- Tests
