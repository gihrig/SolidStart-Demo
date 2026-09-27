use super::{agent_rpc, category_rpc, conv_rpc, post_rpc};
use rpc_router::{Router, RouterBuilder};

/// The authenticated RPC surface (`/api/rpc`, behind `mw_ctx_require`): every
/// mutation and every row-scoped read.
pub fn all_rpc_router_builder() -> RouterBuilder {
	Router::builder()
		.extend(agent_rpc::rpc_router_builder())
		.extend(conv_rpc::rpc_router_builder())
}

/// The public RPC surface (`/api/rpc-public`, no auth): a hand-picked set of
/// reads an anonymous visitor may run. The Jedi feed's static taxonomy is public
/// (the whole `data.json` content becomes public reads), so `list_categories`
/// lives here, not on the authenticated surface. Register ONLY safe public reads
/// here — never a mutation or a row-scoped read — because this endpoint
/// dispatches under `root_ctx` (see `handlers_rpc::rpc_axum_handler_public`).
pub fn public_rpc_router_builder() -> RouterBuilder {
	Router::builder()
		.extend(category_rpc::rpc_router_builder())
		.extend(post_rpc::rpc_router_builder())
}
