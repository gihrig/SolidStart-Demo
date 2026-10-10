//! The TypeScript form of each RPC handler's params, for the RPC contract export
//! (ADR-0029). The web-server contract module reads it through rpc-router's
//! `Handler` bound: `()` for a handler with no params, `(P,)` for one with
//! params `P`.

use crate::rpc_params::{
	ParamsForCreate, ParamsForUpdate, ParamsIded, ParamsIdedList, ParamsList,
};
use serde::de::DeserializeOwned;
use ts_rs::{Config, Dependency, TS};

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

/// Implement `RpcParamsTs` for a params type that derives `TS`: the TS type is
/// its ts-rs name, and it imports its own binding and its generic arguments.
/// A generic type names its type parameter after `where`, e.g.
/// `ParamsForCreate<D> where D`.
macro_rules! impl_rpc_params_ts_via_ts {
	($($ty:ty $(where $gen:ident)?),+ $(,)?) => {
		$(
			impl$(<$gen: TS + 'static>)? RpcParamsTs for $ty {
				fn ts_name(cfg: &Config) -> String {
					<Self as TS>::name(cfg)
				}
				fn ts_dependencies(cfg: &Config) -> Vec<Dependency> {
					ts_dependencies::<Self>(cfg)
				}
			}
		)+
	};
}

impl_rpc_params_ts_via_ts!(
	ParamsForCreate<D> where D,
	ParamsForUpdate<D> where D,
	ParamsIded,
	ParamsIdedList,
);

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
