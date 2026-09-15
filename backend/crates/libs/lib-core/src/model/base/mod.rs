// region:    --- Modules

mod crud_fns;
mod hygiene;
mod macro_utils;
mod utils;

// -- Flatten hierarchy for user code.
pub use crud_fns::*;
pub use hygiene::*;
pub use utils::*;

use crate::ctx::Ctx;
use modql::SIden;
use sea_query::{Condition, Iden, IntoIden, TableRef};

// endregion: --- Modules

// region:    --- Access

/// The kind of access an operation performs, passed to `DbBmc::access_scope`
/// so an entity can return a different row-scoping predicate for reads vs writes.
#[derive(Clone, Copy, Debug)]
pub enum Access {
	Read,
	Write,
}

// endregion: --- Access

// region:    --- Public projection (ADR-0021)

/// Marker for an entity's **public projection**: the audit-free shape a public
/// read returns on `/api/rpc-public` (under `root_ctx`). A public projection
/// carries an entity's public-facing fields minus the audit columns (`cid` /
/// `mid` actor ids, `ctime` / `mtime`), so an anonymous response never leaks
/// internal storage detail.
///
/// This is the shared convention ADR-0021 records: each entity names exactly one
/// such type, and one read serves it. `CategoryPublic` is the first (#116);
/// `PostView` and `AuthorRef` are the second (#117). A projection may **enrich**
/// (an author-and-counts `PostView`) or **narrow** (`CategoryPublic`); either way
/// it is audit-free. `base::list_public` requires this bound, so the full
/// audit-bearing entity row can never be served from a public read by mistake.
pub trait PublicProjection {}

// endregion: --- Public projection (ADR-0021)

// region:    --- Consts

const LIST_LIMIT_DEFAULT: i64 = 1000;
const LIST_LIMIT_MAX: i64 = 5000;

// endregion: --- Consts

// region:    --- SeaQuery Idens

#[derive(Iden)]
pub enum CommonIden {
	Id,
	OwnerId,
}

#[derive(Iden)]
pub enum TimestampIden {
	Cid,
	Ctime,
	Mid,
	Mtime,
}

// endregion: --- SeaQuery Idens

/// The DbBmc trait must be implemented for the Bmc struct of an entity.
/// It specifies meta information such as the table name,
/// whether the table has timestamp columns (cid, ctime, mid, mtime), and more as the
/// code evolves.
///
/// Note: This trait should not be confused with the BaseCrudBmc trait, which provides
///       common default CRUD BMC functions for a given Bmc/Entity.
pub trait DbBmc {
	const TABLE: &'static str;

	fn table_ref() -> TableRef {
		TableRef::Table(SIden(Self::TABLE).into_iden())
	}

	/// Specifies that the table for this Bmc has timestamps (cid, ctime, mid, mtime) columns.
	/// This will allow the code to update those as needed.
	///
	/// default: true
	fn has_timestamps() -> bool {
		true
	}

	/// Specifies if the entity table managed by this BMC
	/// has an `owner_id` column that needs to be set on create (by default ctx.user_id).
	///
	/// default: false
	fn has_owner_id() -> bool {
		false
	}

	/// Optional row-scoping predicate for this entity.
	///
	/// Returns `None` to leave the operation unscoped (the default), so every
	/// entity is unscoped unless it opts in. When `Some`, the returned
	/// `Condition` is ANDed into the operation's `WHERE` by the `base` CRUD
	/// functions. `access` distinguishes reads (owner ∪ public) from writes
	/// (owner-only). The root context bypasses this hook entirely (see `base`).
	fn access_scope(_ctx: &Ctx, _access: Access) -> Option<Condition> {
		None
	}

	/// Optional per-field write-path hygiene rules for this entity.
	///
	/// Each rule names a free-text column and an optional length cap. The
	/// shared write path (`base::create`/`create_many`/`update`) NFC-normalizes
	/// and trims each declared field, rejects control / zero-width /
	/// bidirectional characters, and enforces the cap. Returns `&[]` by default
	/// (no hygiene). This is the seam each later entity ticket adds its rules to.
	fn hygiene_rules() -> &'static [FieldHygiene] {
		&[]
	}
}
