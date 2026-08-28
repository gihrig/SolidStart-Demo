use crate::ctx::Ctx;
use crate::generate_common_bmc_fns;
use crate::model::base::{self, Access, CommonIden, DbBmc};
use crate::model::conv_msg::{
	ConvMsg, ConvMsgBmc, ConvMsgFilter, ConvMsgForCreate, ConvMsgForInsert,
};
use crate::model::modql_utils::time_to_sea_value;
use crate::model::ModelManager;
use crate::model::Result;
use lib_utils::time::Rfc3339;
use modql::field::{Fields, SeaFieldValue};
use modql::filter::{
	FilterNodes, ListOptions, OpValString, OpValsInt64, OpValsString, OpValsValue,
};
use sea_query::{Alias, Condition, Expr, Nullable};
use serde::{Deserialize, Serialize};
use serde_with::serde_as;
use sqlx::types::time::OffsetDateTime;
use sqlx::FromRow;
use ts_rs::TS;

// region:    --- Conv Types

#[derive(
	Debug, Clone, sqlx::Type, derive_more::Display, Deserialize, Serialize, TS,
)]
#[ts(export, export_to = "ConvKind.d.ts")]
#[sqlx(type_name = "conv_kind")]
#[cfg_attr(test, derive(PartialEq))]
pub enum ConvKind {
	OwnerOnly,
	MultiUsers,
}

/// Note: Manual implementation.
///       Required for a modql::field::Fields
impl From<ConvKind> for sea_query::Value {
	fn from(val: ConvKind) -> Self {
		val.to_string().into()
	}
}

/// Note: Manual implementation.
///       This is required for sea::query in case of None.
///       However, in this codebase, we utilize the modql not_none_field,
///       so this will be disregarded anyway.
///       Nonetheless, it's still necessary for compilation.
impl Nullable for ConvKind {
	fn null() -> sea_query::Value {
		ConvKind::OwnerOnly.into()
	}
}

/// Note: Here we derive from modql `SeaFieldValue` which implements
///       the `From<ConvState> for sea_query::Value` and the
///       `sea_query::value::Nullable for ConvState`
///       See the `ConvKind` for the manual implementation.
///
#[derive(
	Debug,
	Clone,
	sqlx::Type,
	SeaFieldValue,
	derive_more::Display,
	Deserialize,
	Serialize,
	TS,
)]
#[ts(export, export_to = "ConvState.d.ts")]
#[sqlx(type_name = "conv_state")]
pub enum ConvState {
	Active,
	Archived,
}

#[serde_as]
#[derive(Debug, Clone, Fields, FromRow, Serialize, TS)]
#[ts(export, export_to = "Conv.d.ts")]
pub struct Conv {
	pub id: i64,

	// -- Relations
	pub agent_id: i64,
	pub owner_id: i64,

	// -- Properties
	pub title: Option<String>,
	pub kind: ConvKind,
	pub state: ConvState,

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

#[derive(Fields, Deserialize, Default)]
pub struct ConvForCreate {
	pub agent_id: i64,

	pub title: Option<String>,

	#[field(cast_as = "conv_kind")]
	pub kind: Option<ConvKind>,
}

#[derive(Fields, Deserialize, Default)]
pub struct ConvForUpdate {
	// Note: `owner_id` is intentionally not updatable. The owner-only Write
	//       scope (`owner_id = me`) keys on it, so allowing a client to rewrite
	//       it would let an owner give away — or lock themselves out of — their
	//       own conv. Ownership transfer belongs to the privilege ACS.
	//
	// Note: `kind` is likewise not updatable — a Conv's visibility is fixed
	//       at creation. The realtime subscribe-time authorization cache
	//       (ADR-0015) relies on this: because no operation can narrow a Conv
	//       (`MultiUsers → OwnerOnly`) under a live Subscription, there is no
	//       stale-authorization (TOCTOU) window today. Adding `kind` here
	//       reopens that window and must be paired with subscription-
	//       invalidation first (deferred, #91 "Realtime hardening II").
	//       Guarded by `test_conv_kind_is_immutable_guard`.
	pub title: Option<String>,
	pub closed: Option<bool>,
	#[field(cast_as = "conv_state")]
	pub state: Option<ConvState>,
}

#[derive(FilterNodes, Deserialize, Default, Debug)]
pub struct ConvFilter {
	pub id: Option<OpValsInt64>,

	pub owner_id: Option<OpValsInt64>,
	pub agent_id: Option<OpValsInt64>,

	#[modql(cast_as = "conv_kind")]
	pub kind: Option<OpValsString>,

	#[modql(cast_as = "conv_state")]
	pub state: Option<OpValsString>,

	pub title: Option<OpValsString>,

	pub cid: Option<OpValsInt64>,
	#[modql(to_sea_value_fn = "time_to_sea_value")]
	pub ctime: Option<OpValsValue>,
	pub mid: Option<OpValsInt64>,
	#[modql(to_sea_value_fn = "time_to_sea_value")]
	pub mtime: Option<OpValsValue>,
}

// endregion: --- Conv Types

// region:    --- ConvBmc

pub struct ConvBmc;

impl DbBmc for ConvBmc {
	const TABLE: &'static str = "conv";

	fn has_owner_id() -> bool {
		true
	}

	/// Owner-scope a Conv operation:
	/// - `Read`: `owner_id = me OR kind = 'MultiUsers'` (a `MultiUsers` conv is
	///   public; Member reads are deferred — no Members exist yet).
	/// - `Write`: `owner_id = me` (only the Owner may update/delete).
	fn access_scope(ctx: &Ctx, access: Access) -> Option<Condition> {
		let owner = Expr::col(CommonIden::OwnerId).eq(ctx.user_id());
		match access {
			Access::Read => Some(
				Condition::any().add(owner).add(
					Expr::col(Alias::new("kind"))
						.eq(Expr::val(ConvKind::MultiUsers.to_string())
							.cast_as(Alias::new("conv_kind"))),
				),
			),
			Access::Write => Some(Condition::all().add(owner)),
		}
	}
}

// This will generate the `impl ConvBmc {...}` with the default CRUD functions.
generate_common_bmc_fns!(
	Bmc: ConvBmc,
	Entity: Conv,
	ForCreate: ConvForCreate,
	ForUpdate: ConvForUpdate,
	Filter: ConvFilter,
);

/// Append a `state != Archived` constraint to each filter node unless the caller
/// already constrains `state`. `None` (and an empty node set) becomes a single
/// node carrying only that constraint. The result stays an ARRAY of filter nodes
/// end to end: a wrapping object would deserialize as one `OneOrMany` "One" node
/// (no `deny_unknown_fields`) and silently match every row, so the exclusion is
/// appended to each node, never wrapped.
fn hide_archived_by_default(
	filter: Option<Vec<ConvFilter>>,
) -> Option<Vec<ConvFilter>> {
	fn exclude_archived() -> Option<OpValsString> {
		Some(OpValString::Not(ConvState::Archived.to_string()).into())
	}

	let nodes = match filter {
		// Caller constrains `state` anywhere -> honor the filter verbatim, so
		// Archived Convs can be listed explicitly (e.g. `state = Archived`).
		Some(nodes) if nodes.iter().any(|n| n.state.is_some()) => {
			return Some(nodes)
		}
		Some(nodes) => nodes,
		None => Vec::new(),
	};

	if nodes.is_empty() {
		Some(vec![ConvFilter {
			state: exclude_archived(),
			..Default::default()
		}])
	} else {
		Some(
			nodes
				.into_iter()
				.map(|mut node| {
					node.state = exclude_archived();
					node
				})
				.collect(),
		)
	}
}

// Default working-set listing for `Conv`.
impl ConvBmc {
	/// List `Conv`s as the default working set (backs the `list_convs` RPC):
	/// Archived Convs are hidden unless the caller's `filter` constrains `state`,
	/// in which case the filter is honored verbatim. Archiving is a `state` flip
	/// (`ConvForUpdate`), never a delete — an Archived Conv and its Messages are
	/// retained and reachable via an explicit `state = Archived` filter or by id.
	pub async fn list_active_default(
		ctx: &Ctx,
		mm: &ModelManager,
		filter: Option<Vec<ConvFilter>>,
		list_options: Option<ListOptions>,
	) -> Result<Vec<Conv>> {
		let filter = hide_archived_by_default(filter);
		base::list::<Self, _, _>(ctx, mm, filter, list_options).await
	}
}

// Additional ConvBmc methods to manage the `ConvMsg` constructs.
impl ConvBmc {
	/// Add a `ConvMsg` to a `Conv`
	///
	// For access constrol, we will add:
	// #[ctx_add(conv, space)]
	// #[requires_privilege_any_of("og:FullAccess", "sp:FullAccess", "conv@owner_id" "conv:AddMsg")]
	pub async fn add_msg(
		ctx: &Ctx,
		mm: &ModelManager,
		msg_c: ConvMsgForCreate,
	) -> Result<i64> {
		// Post-permission (#89): may post iff may read the parent conv — the same
		// predicate as `ConvBmc::get`. A miss yields `EntityNotFound` before any
		// insert (no existence oracle, consistent with ADR-0014).
		let conv_id = msg_c.conv_id;
		let _ = base::get::<ConvBmc, Conv>(ctx, mm, conv_id).await?;

		let msg_i = ConvMsgForInsert::from_msg_for_create(ctx.user_id(), msg_c);
		let conv_msg_id = base::create::<ConvMsgBmc, _>(ctx, mm, msg_i).await?;

		Ok(conv_msg_id)
	}

	pub async fn list_msgs(
		ctx: &Ctx,
		mm: &ModelManager,
		filter: Option<Vec<ConvMsgFilter>>,
		list_options: Option<ListOptions>,
	) -> Result<Vec<ConvMsg>> {
		base::list::<ConvMsgBmc, _, _>(ctx, mm, filter, list_options).await
	}

	/// Read a single `ConvMsg` by id. A thin `base::get` passthrough now that the
	/// `ConvMsgBmc` `Read` hook auto-scopes it to messages in a readable Conv:
	/// a message in a Conv the caller may not read yields `EntityNotFound`.
	pub async fn get_msg(
		ctx: &Ctx,
		mm: &ModelManager,
		msg_id: i64,
	) -> Result<ConvMsg> {
		base::get::<ConvMsgBmc, _>(ctx, mm, msg_id).await
	}
}

// endregion: --- ConvBmc

// region:    --- Tests

#[cfg(test)]
mod tests {
	type Error = Box<dyn std::error::Error>;
	type Result<T> = core::result::Result<T, Error>; // For tests.

	use super::*;
	use crate::_dev_utils::{self, seed_agent, seed_conv, seed_user};
	use crate::ctx::Ctx;
	use crate::model;
	use crate::model::agent::AgentBmc;
	use crate::model::conv_msg::ConvMsgFilter;
	use modql::filter::OpValString;
	use serde_json::json;
	use serial_test::serial;

	#[serial]
	#[tokio::test]
	async fn test_create_ok() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let ctx = Ctx::root_ctx();
		let fx_title = "test_create_ok conv 01";
		let fx_kind = ConvKind::MultiUsers;
		let agent_id = seed_agent(&ctx, &mm, "test_create_ok conv agent 01").await?;

		// -- Exec
		let conv_id = ConvBmc::create(
			&ctx,
			&mm,
			ConvForCreate {
				agent_id,
				title: Some(fx_title.to_string()),
				kind: Some(fx_kind.clone()),
			},
		)
		.await?;

		// -- Check
		let conv: Conv = ConvBmc::get(&ctx, &mm, conv_id).await?;
		assert_eq!(&conv.kind, &fx_kind);
		assert_eq!(conv.title.ok_or("conv should have title")?, fx_title);

		// -- Clean
		ConvBmc::delete(&ctx, &mm, conv_id).await?;
		AgentBmc::delete(&ctx, &mm, agent_id).await?;

		Ok(())
	}

	#[serial]
	#[tokio::test]
	async fn test_list_ok() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let ctx = Ctx::root_ctx();
		let fx_title_prefix = "test_list_ok conv - ";
		let agent_id = seed_agent(&ctx, &mm, "test_create_ok conv agent 01").await?;

		for i in 1..=6 {
			let kind = if i <= 3 {
				ConvKind::OwnerOnly
			} else {
				ConvKind::MultiUsers
			};

			let _conv_id = ConvBmc::create(
				&ctx,
				&mm,
				ConvForCreate {
					agent_id,
					title: Some(format!("{fx_title_prefix}{:<02}", i)),
					kind: Some(kind),
				},
			)
			.await?;
		}

		// -- Exec
		let convs = ConvBmc::list(
			&ctx,
			&mm,
			Some(vec![ConvFilter {
				agent_id: Some(agent_id.into()),

				kind: Some(OpValString::In(vec!["MultiUsers".to_string()]).into()),
				// or
				// kind: Some(OpValString::Eq("MultiUsers".to_string()).into()),
				..Default::default()
			}]),
			None,
		)
		.await?;

		// -- Check
		// extract the 04, 05, 06 parts of the tiles
		let num_parts = convs
			.iter()
			.filter_map(|c| c.title.as_ref().and_then(|s| s.split("- ").nth(1)))
			.collect::<Vec<&str>>();
		assert_eq!(num_parts, &["04", "05", "06"]);

		// -- Clean
		// This should delete cascade
		AgentBmc::delete(&ctx, &mm, agent_id).await?;

		Ok(())
	}

	/// C01 owner-scope matrix (Q10): a non-root two-user fixture proving the
	/// `access_scope` seam. User A owns an `OwnerOnly` and a `MultiUsers` conv
	/// (each with a message); User B may see only the public one.
	#[serial]
	#[tokio::test]
	async fn test_access_scope_conv_two_user() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let fx_prefix = "test_access_scope_conv_two_user";

		let a_id = seed_user(&root, &mm, &format!("{fx_prefix}-A")).await?;
		let b_id = seed_user(&root, &mm, &format!("{fx_prefix}-B")).await?;
		let ctx_a = Ctx::new(a_id)?;
		let ctx_b = Ctx::new(b_id)?;

		// Agents are readable by all Users; owner is irrelevant here.
		let agent_id =
			seed_agent(&ctx_a, &mm, &format!("{fx_prefix} agent")).await?;

		// A owns one private (OwnerOnly) and one public (MultiUsers) conv.
		let owner_conv_id = ConvBmc::create(
			&ctx_a,
			&mm,
			ConvForCreate {
				agent_id,
				title: Some(format!("{fx_prefix} owner-only")),
				kind: Some(ConvKind::OwnerOnly),
			},
		)
		.await?;
		let multi_conv_id = ConvBmc::create(
			&ctx_a,
			&mm,
			ConvForCreate {
				agent_id,
				title: Some(format!("{fx_prefix} multi-users")),
				kind: Some(ConvKind::MultiUsers),
			},
		)
		.await?;

		// A posts a message into each of its convs.
		ConvBmc::add_msg(
			&ctx_a,
			&mm,
			ConvMsgForCreate {
				conv_id: owner_conv_id,
				content: "owner-only msg".to_string(),
			},
		)
		.await?;
		ConvBmc::add_msg(
			&ctx_a,
			&mm,
			ConvMsgForCreate {
				conv_id: multi_conv_id,
				content: "multi-users msg".to_string(),
			},
		)
		.await?;

		// -- Check: B is denied the OwnerOnly conv (read + writes).
		assert!(
			matches!(
				ConvBmc::get(&ctx_b, &mm, owner_conv_id).await,
				Err(model::Error::EntityNotFound { .. })
			),
			"B get A's OwnerOnly conv should be EntityNotFound"
		);
		assert!(
			matches!(
				ConvBmc::update(
					&ctx_b,
					&mm,
					owner_conv_id,
					ConvForUpdate {
						title: Some("hijack".to_string()),
						..Default::default()
					},
				)
				.await,
				Err(model::Error::EntityNotFound { .. })
			),
			"B update A's OwnerOnly conv should be EntityNotFound"
		);
		assert!(
			matches!(
				ConvBmc::delete(&ctx_b, &mm, owner_conv_id).await,
				Err(model::Error::EntityNotFound { .. })
			),
			"B delete A's OwnerOnly conv should be EntityNotFound"
		);

		// -- Check: B may read the MultiUsers conv.
		let multi = ConvBmc::get(&ctx_b, &mm, multi_conv_id).await?;
		assert_eq!(multi.id, multi_conv_id);

		// -- Check: B's list sees the public conv but not A's private one.
		let b_convs = ConvBmc::list(
			&ctx_b,
			&mm,
			Some(vec![ConvFilter {
				agent_id: Some(agent_id.into()),
				..Default::default()
			}]),
			None,
		)
		.await?;
		let b_ids: Vec<i64> = b_convs.iter().map(|c| c.id).collect();
		assert!(
			b_ids.contains(&multi_conv_id),
			"B list should include MultiUsers"
		);
		assert!(
			!b_ids.contains(&owner_conv_id),
			"B list should exclude A's OwnerOnly"
		);

		// -- Check: message reads scope via the parent-conv subquery.
		let owner_msgs = ConvBmc::list_msgs(
			&ctx_b,
			&mm,
			Some(vec![serde_json::from_value::<ConvMsgFilter>(
				json!({ "conv_id": owner_conv_id }),
			)?]),
			None,
		)
		.await?;
		assert!(
			owner_msgs.is_empty(),
			"B list_msgs on OwnerOnly should be empty"
		);

		let multi_msgs = ConvBmc::list_msgs(
			&ctx_b,
			&mm,
			Some(vec![serde_json::from_value::<ConvMsgFilter>(
				json!({ "conv_id": multi_conv_id }),
			)?]),
			None,
		)
		.await?;
		assert_eq!(
			multi_msgs.len(),
			1,
			"B list_msgs on MultiUsers should return rows"
		);

		// -- Check: root bypasses the scope and sees the private conv.
		ConvBmc::get(&root, &mm, owner_conv_id).await?;

		// -- Clean (agent delete cascades convs + msgs).
		AgentBmc::delete(&root, &mm, agent_id).await?;
		_dev_utils::clean_users(&root, &mm, fx_prefix).await?;

		Ok(())
	}

	/// Guard: a Conv's `kind` is immutable. `ConvForUpdate` has no `kind`
	/// field, so an update payload carrying `kind` is silently dropped (no
	/// `deny_unknown_fields`) and the Conv stays as created. The realtime
	/// subscribe-time authorization cache (ADR-0015) is safe *because* of this:
	/// nothing can narrow `MultiUsers → OwnerOnly` under a live Subscription, so
	/// there is no TOCTOU window today. If someone adds `kind` to `ConvForUpdate`
	/// this test fails — the signal to build subscription-invalidation before
	/// shipping mutable visibility (deferred, #91 "Realtime hardening II").
	#[serial]
	#[tokio::test]
	async fn test_conv_kind_is_immutable_guard() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let fx_prefix = "test_conv_kind_is_immutable_guard";

		let a_id = seed_user(&root, &mm, &format!("{fx_prefix}-A")).await?;
		let ctx_a = Ctx::new(a_id)?;
		let agent_id =
			seed_agent(&ctx_a, &mm, &format!("{fx_prefix} agent")).await?;

		// A public conv a non-owner may currently read (and subscribe to).
		let conv_id = ConvBmc::create(
			&ctx_a,
			&mm,
			ConvForCreate {
				agent_id,
				title: Some(format!("{fx_prefix} multi-users")),
				kind: Some(ConvKind::MultiUsers),
			},
		)
		.await?;

		// An update payload that *tries* to narrow the conv to OwnerOnly. `kind`
		// is not a field of `ConvForUpdate`, so serde drops it; the `title` keeps
		// the UPDATE well-formed.
		let for_update: ConvForUpdate = serde_json::from_value(json!({
			"title": "narrow attempt",
			"kind": "OwnerOnly",
		}))?;
		ConvBmc::update(&ctx_a, &mm, conv_id, for_update).await?;

		// The kind is unchanged: narrowing via update is impossible today.
		let conv = ConvBmc::get(&ctx_a, &mm, conv_id).await?;
		assert_eq!(
			conv.kind,
			ConvKind::MultiUsers,
			"Conv.kind must be immutable; if it changed, `kind` became updatable \
			 and the WS subscribe-time cache (ADR-0015) now needs \
			 subscription-invalidation",
		);

		// -- Clean (agent delete cascades convs + msgs).
		AgentBmc::delete(&root, &mm, agent_id).await?;
		_dev_utils::clean_users(&root, &mm, fx_prefix).await?;

		Ok(())
	}

	/// #89 post-permission: a User may `add_msg` to a conv iff it may read the
	/// parent conv (same predicate as `ConvBmc::get`). A denied post must not
	/// insert a row (no existence oracle, consistent with ADR-0014).
	#[serial]
	#[tokio::test]
	async fn test_add_msg_post_permission_two_user() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let fx_prefix = "test_add_msg_post_permission_two_user";

		let a_id = seed_user(&root, &mm, &format!("{fx_prefix}-A")).await?;
		let b_id = seed_user(&root, &mm, &format!("{fx_prefix}-B")).await?;
		let ctx_a = Ctx::new(a_id)?;
		let ctx_b = Ctx::new(b_id)?;

		let agent_id =
			seed_agent(&ctx_a, &mm, &format!("{fx_prefix} agent")).await?;

		// A owns one private (OwnerOnly) and one public (MultiUsers) conv.
		let owner_conv_id = ConvBmc::create(
			&ctx_a,
			&mm,
			ConvForCreate {
				agent_id,
				title: Some(format!("{fx_prefix} owner-only")),
				kind: Some(ConvKind::OwnerOnly),
			},
		)
		.await?;
		let multi_conv_id = ConvBmc::create(
			&ctx_a,
			&mm,
			ConvForCreate {
				agent_id,
				title: Some(format!("{fx_prefix} multi-users")),
				kind: Some(ConvKind::MultiUsers),
			},
		)
		.await?;

		// -- Check: the Owner may post to its own OwnerOnly conv.
		ConvBmc::add_msg(
			&ctx_a,
			&mm,
			ConvMsgForCreate {
				conv_id: owner_conv_id,
				content: "owner post".to_string(),
			},
		)
		.await?;

		// -- Check: B is denied posting to A's OwnerOnly conv ...
		assert!(
			matches!(
				ConvBmc::add_msg(
					&ctx_b,
					&mm,
					ConvMsgForCreate {
						conv_id: owner_conv_id,
						content: "b illicit post".to_string(),
					},
				)
				.await,
				Err(model::Error::EntityNotFound { .. })
			),
			"B add_msg to A's OwnerOnly conv should be EntityNotFound"
		);

		// ... and the denied post inserted nothing (only the Owner's msg remains).
		let owner_msgs = ConvBmc::list_msgs(
			&root,
			&mm,
			Some(vec![serde_json::from_value::<ConvMsgFilter>(
				json!({ "conv_id": owner_conv_id }),
			)?]),
			None,
		)
		.await?;
		assert_eq!(owner_msgs.len(), 1, "denied post must not insert a row");

		// -- Check: B may post to A's MultiUsers (public) conv.
		ConvBmc::add_msg(
			&ctx_b,
			&mm,
			ConvMsgForCreate {
				conv_id: multi_conv_id,
				content: "b public post".to_string(),
			},
		)
		.await?;

		// -- Check: root bypasses the scope (may post to A's OwnerOnly conv).
		ConvBmc::add_msg(
			&root,
			&mm,
			ConvMsgForCreate {
				conv_id: owner_conv_id,
				content: "root post".to_string(),
			},
		)
		.await?;

		// -- Clean (agent delete cascades convs + msgs).
		AgentBmc::delete(&root, &mm, agent_id).await?;
		_dev_utils::clean_users(&root, &mm, fx_prefix).await?;

		Ok(())
	}

	/// #90 atomic `delete_many`: under the owner Write scope (`owner_id = me`) a
	/// mixed-ownership id set must be all-or-nothing. A scoped-out id makes the
	/// whole delete roll back, so an owned id in the same call is never left
	/// partially deleted while the call reports failure.
	#[serial]
	#[tokio::test]
	async fn test_delete_many_atomic_two_user() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let fx_prefix = "test_delete_many_atomic_two_user";

		let a_id = seed_user(&root, &mm, &format!("{fx_prefix}-A")).await?;
		let b_id = seed_user(&root, &mm, &format!("{fx_prefix}-B")).await?;
		let ctx_a = Ctx::new(a_id)?;
		let ctx_b = Ctx::new(b_id)?;

		let agent_id =
			seed_agent(&ctx_a, &mm, &format!("{fx_prefix} agent")).await?;

		// A owns one conv, B owns another (both default OwnerOnly, Write-scoped).
		let a_conv1 =
			seed_conv(&ctx_a, &mm, agent_id, &format!("{fx_prefix} A-1")).await?;
		let b_conv =
			seed_conv(&ctx_b, &mm, agent_id, &format!("{fx_prefix} B-1")).await?;

		// -- Check: A `delete_many([own, other])` → the scoped DELETE removes only
		//    A's row, so count (1) != len (2) → rolled back → EntityNotFound.
		assert!(
			matches!(
				ConvBmc::delete_many(&ctx_a, &mm, vec![a_conv1, b_conv]).await,
				Err(model::Error::EntityNotFound { .. })
			),
			"mixed-ownership delete_many should be EntityNotFound"
		);
		// ... and the owned row must survive the rolled-back partial delete.
		ConvBmc::get(&ctx_a, &mm, a_conv1).await?;
		ConvBmc::get(&ctx_b, &mm, b_conv).await?;

		// -- Check: A `delete_many([own, own])`, both owned → Ok(2), both gone.
		let a_conv2 =
			seed_conv(&ctx_a, &mm, agent_id, &format!("{fx_prefix} A-2")).await?;
		let a_conv3 =
			seed_conv(&ctx_a, &mm, agent_id, &format!("{fx_prefix} A-3")).await?;
		let deleted =
			ConvBmc::delete_many(&ctx_a, &mm, vec![a_conv2, a_conv3]).await?;
		assert_eq!(deleted, 2, "all-owned delete_many should delete both");
		for gone in [a_conv2, a_conv3] {
			assert!(
				matches!(
					ConvBmc::get(&ctx_a, &mm, gone).await,
					Err(model::Error::EntityNotFound { .. })
				),
				"conv {gone} should be gone after a committed delete"
			);
		}

		// -- Check: empty id set → Ok(0) (unchanged early return, no txn).
		assert_eq!(ConvBmc::delete_many(&ctx_a, &mm, vec![]).await?, 0);

		// -- Check: root (user_id 0) bypasses the scope, deleting across owners.
		let deleted_root =
			ConvBmc::delete_many(&root, &mm, vec![a_conv1, b_conv]).await?;
		assert_eq!(
			deleted_root, 2,
			"root delete_many should delete across owners"
		);

		// -- Clean (agent delete cascades any remaining convs + msgs).
		AgentBmc::delete(&root, &mm, agent_id).await?;
		_dev_utils::clean_users(&root, &mm, fx_prefix).await?;

		Ok(())
	}

	/// #25 archive semantics: the default working-set listing
	/// (`list_active_default`, backing the `list_convs` RPC) hides Archived Convs;
	/// an explicit `state` filter lists them; and archiving/unarchiving is a
	/// `state` flip that never deletes the Conv or its Messages.
	#[serial]
	#[tokio::test]
	async fn test_list_active_default_archive_semantics() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let ctx = Ctx::root_ctx();
		let fx_prefix = "test_archive_semantics";
		let agent_id = seed_agent(&ctx, &mm, &format!("{fx_prefix} agent")).await?;

		let active_id =
			seed_conv(&ctx, &mm, agent_id, &format!("{fx_prefix} active")).await?;
		let archived_id =
			seed_conv(&ctx, &mm, agent_id, &format!("{fx_prefix} archived")).await?;
		// The soon-to-be-Archived Conv keeps a Message, to prove retention.
		ConvBmc::add_msg(
			&ctx,
			&mm,
			ConvMsgForCreate {
				conv_id: archived_id,
				content: "keep me".to_string(),
			},
		)
		.await?;

		// Archive: `state -> Archived` is an update, not a delete.
		ConvBmc::update(
			&ctx,
			&mm,
			archived_id,
			ConvForUpdate {
				state: Some(ConvState::Archived),
				..Default::default()
			},
		)
		.await?;

		let agent_filter = || {
			Some(vec![ConvFilter {
				agent_id: Some(agent_id.into()),
				..Default::default()
			}])
		};
		let ids = |convs: &[Conv]| convs.iter().map(|c| c.id).collect::<Vec<i64>>();

		// -- Check: default listing (agent filter, no `state`) hides Archived.
		let default_ids =
			ids(
				&ConvBmc::list_active_default(&ctx, &mm, agent_filter(), None)
					.await?,
			);
		assert!(
			default_ids.contains(&active_id),
			"default list keeps Active"
		);
		assert!(
			!default_ids.contains(&archived_id),
			"default list hides Archived"
		);

		// -- Check: a `None` filter also hides Archived (single exclude node).
		let none_ids =
			ids(&ConvBmc::list_active_default(&ctx, &mm, None, None).await?);
		assert!(
			!none_ids.contains(&archived_id),
			"None-filter default list hides Archived"
		);

		// -- Check: an explicit `state = Archived` filter lists it.
		let archived_ids = ids(&ConvBmc::list_active_default(
			&ctx,
			&mm,
			Some(vec![ConvFilter {
				agent_id: Some(agent_id.into()),
				state: Some(OpValString::Eq(ConvState::Archived.to_string()).into()),
				..Default::default()
			}]),
			None,
		)
		.await?);
		assert_eq!(
			archived_ids,
			vec![archived_id],
			"explicit state=Archived lists only the Archived conv"
		);

		// -- Check: archiving deleted nothing — the Conv and its Message remain.
		let still = ConvBmc::get(&ctx, &mm, archived_id).await?;
		assert!(
			matches!(still.state, ConvState::Archived),
			"archived conv is retained with state Archived"
		);
		let archived_msgs = ConvBmc::list_msgs(
			&ctx,
			&mm,
			Some(vec![serde_json::from_value::<ConvMsgFilter>(
				json!({ "conv_id": archived_id }),
			)?]),
			None,
		)
		.await?;
		assert_eq!(archived_msgs.len(), 1, "archiving retains Messages");

		// -- Check: unarchive (`state -> Active`) restores it to the default list,
		//    and its Message survived the round-trip.
		ConvBmc::update(
			&ctx,
			&mm,
			archived_id,
			ConvForUpdate {
				state: Some(ConvState::Active),
				..Default::default()
			},
		)
		.await?;
		let after_ids =
			ids(
				&ConvBmc::list_active_default(&ctx, &mm, agent_filter(), None)
					.await?,
			);
		assert!(
			after_ids.contains(&archived_id),
			"unarchived conv reappears in the default list"
		);
		let msgs_after = ConvBmc::list_msgs(
			&ctx,
			&mm,
			Some(vec![serde_json::from_value::<ConvMsgFilter>(
				json!({ "conv_id": archived_id }),
			)?]),
			None,
		)
		.await?;
		assert_eq!(msgs_after.len(), 1, "unarchiving retains Messages");

		// -- Clean (agent delete cascades convs + msgs).
		AgentBmc::delete(&ctx, &mm, agent_id).await?;

		Ok(())
	}
}

// endregion: --- Tests
