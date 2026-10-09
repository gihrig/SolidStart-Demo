//! Base constructs for the typed RPC Params that will be used in their respective
//! rpc handler functions (e.g., `project_rpc::create_project` and `project_rpc::list_projects`).
//!
//! Most of these base constructs use generics for their respective data elements, allowing
//! each rpc handler function to receive the exact desired type.
//!
//! `IntoParams` or `IntoDefaultRpcParams` are implemented to ensure these Params conform to the
//! `RpcRouter` (i.e., `rpc::router`) model.

use modql::filter::ListOptions;
use rpc_router::{IntoDefaultRpcParams, IntoParams};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_with::{serde_as, OneOrMany};
use ts_rs::{Config, Dependency, TS};

/// Params structure for any RPC Create call.
#[derive(Deserialize, TS)]
#[ts(export, export_to = "ParamsForCreate.d.ts")]
pub struct ParamsForCreate<D> {
	pub data: D,
}

impl<D> IntoParams for ParamsForCreate<D> where D: DeserializeOwned + Send {}

/// Params structure for any RPC Update call.
#[derive(Deserialize, TS)]
#[ts(export, export_to = "ParamsForUpdate.d.ts")]
pub struct ParamsForUpdate<D> {
	pub id: i64,
	pub data: D,
}

impl<D> IntoParams for ParamsForUpdate<D> where D: DeserializeOwned + Send {}

/// Params structure for any RPC Update call.
#[derive(Deserialize, TS)]
#[ts(export, export_to = "ParamsIded.d.ts")]
pub struct ParamsIded {
	pub id: i64,
}
impl IntoParams for ParamsIded {}

/// Params structure for an RPC List call scoped to one parent entity (e.g. a
/// Post's Captions): `id` names the parent, and the optional `list_options`
/// pages the result. The export holds only `id`: `list_options` stays on the
/// back-end until a front-end caller needs it (#176).
#[derive(Deserialize, TS)]
#[ts(export, export_to = "ParamsIdedList.d.ts")]
pub struct ParamsIdedList {
	pub id: i64,
	#[ts(skip)]
	pub list_options: Option<ListOptions>,
}
impl IntoParams for ParamsIdedList {}

/// Params structure for any RPC List call.
#[serde_as]
#[derive(Deserialize, Default)]
pub struct ParamsList<F>
where
	F: DeserializeOwned,
{
	#[serde_as(deserialize_as = "Option<OneOrMany<_>>")]
	pub filters: Option<Vec<F>>,
	pub list_options: Option<ListOptions>,
}

impl<D> IntoDefaultRpcParams for ParamsList<D> where
	D: DeserializeOwned + Send + Default
{
}

// region:    --- RPC contract params

/// The TypeScript form of an RPC handler's params, for the RPC contract export
/// (ADR-0029). A params type with no exported field maps to `undefined`, so
/// the typed front-end call takes no params argument.
pub trait RpcParamsTs {
	/// The TypeScript type, e.g. `ParamsIded` or `undefined`.
	fn ts_name(cfg: &Config) -> String;

	/// The bindings that the TypeScript type imports.
	fn ts_dependencies(cfg: &Config) -> Vec<Dependency>;
}

/// The bindings that `T` imports: `T` itself, if it is exported, and the
/// types it names (e.g. its generic arguments).
pub fn ts_dependencies<T: TS + 'static>(cfg: &Config) -> Vec<Dependency> {
	Dependency::from_ty::<T>(cfg)
		.into_iter()
		.chain(T::dependencies(cfg))
		.collect()
}

impl<D: TS + 'static> RpcParamsTs for ParamsForCreate<D> {
	fn ts_name(cfg: &Config) -> String {
		Self::name(cfg)
	}
	fn ts_dependencies(cfg: &Config) -> Vec<Dependency> {
		ts_dependencies::<Self>(cfg)
	}
}

impl<D: TS + 'static> RpcParamsTs for ParamsForUpdate<D> {
	fn ts_name(cfg: &Config) -> String {
		Self::name(cfg)
	}
	fn ts_dependencies(cfg: &Config) -> Vec<Dependency> {
		ts_dependencies::<Self>(cfg)
	}
}

impl RpcParamsTs for ParamsIded {
	fn ts_name(cfg: &Config) -> String {
		Self::name(cfg)
	}
	fn ts_dependencies(cfg: &Config) -> Vec<Dependency> {
		ts_dependencies::<Self>(cfg)
	}
}

impl RpcParamsTs for ParamsIdedList {
	fn ts_name(cfg: &Config) -> String {
		Self::name(cfg)
	}
	fn ts_dependencies(cfg: &Config) -> Vec<Dependency> {
		ts_dependencies::<Self>(cfg)
	}
}

/// `filters` and `list_options` stay on the back-end until a front-end caller
/// needs them (#176), so a list takes no params argument.
impl<F: DeserializeOwned> RpcParamsTs for ParamsList<F> {
	fn ts_name(_cfg: &Config) -> String {
		"undefined".to_string()
	}
	fn ts_dependencies(_cfg: &Config) -> Vec<Dependency> {
		Vec::new()
	}
}

/// A handler with no params argument (rpc-router's `Handler<_, (), _>`).
impl RpcParamsTs for () {
	fn ts_name(_cfg: &Config) -> String {
		"undefined".to_string()
	}
	fn ts_dependencies(_cfg: &Config) -> Vec<Dependency> {
		Vec::new()
	}
}

/// A handler with one params argument (rpc-router's `Handler<_, (P,), _>`).
impl<P: RpcParamsTs> RpcParamsTs for (P,) {
	fn ts_name(cfg: &Config) -> String {
		P::ts_name(cfg)
	}
	fn ts_dependencies(cfg: &Config) -> Vec<Dependency> {
		P::ts_dependencies(cfg)
	}
}

// endregion: --- RPC contract params
