// region:    --- Modules

pub mod caption_comment_rpc;
pub mod caption_rpc;
pub mod category_rpc;
pub mod hero_rpc;
pub mod post_comment_rpc;
pub mod post_rpc;
pub mod profile_rpc;

mod router_builders;

#[cfg(test)]
mod rpc_contract;

pub use router_builders::{all_rpc_router_builder, public_rpc_router_builder};

// endregion: --- Modules
