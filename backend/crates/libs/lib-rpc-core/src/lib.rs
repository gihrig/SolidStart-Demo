// region:    --- Modules

mod error;
mod rpc_params;
mod rpc_params_ts;
mod rpc_result;
mod utils;

pub use self::error::{Error, Result};
pub use rpc_params::*;
pub use rpc_params_ts::{ts_dependencies, RpcParamsTs};
pub use rpc_result::RpcData;

pub mod prelude;

// endregion: --- Modules
