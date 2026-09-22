use crate::web::rpcs::{all_rpc_router_builder, public_rpc_router_builder};
use axum::routing::post;
use axum::Router;
use lib_core::model::ModelManager;
use lib_web::handlers::handlers_rpc;
use lib_web::ws::WsState;
use std::sync::Arc;

///  Build the Axum router for '/api/rpc'
/// Note: This will build the `rpc-router::Router` that will be used by the
///       rpc_axum_handler
pub fn routes(mm: ModelManager, ws_state: Arc<WsState>) -> Router {
	// Build the combined Rpc Router (from `rpc-router` crate)
	// Note: WsState is cloned from Arc, broadcast::Sender clones share the same channel
	let rpc_router = all_rpc_router_builder()
		// Add the common resources for all rpc calls
		.append_resource(mm)
		.append_resource((*ws_state).clone())
		.build();

	// Build the Axum Router for '/rpc'
	Router::new()
		.route("/rpc", post(handlers_rpc::rpc_axum_handler))
		.with_state(rpc_router)
}

/// Build the Axum router for the public '/rpc-public' endpoint.
/// Note: This surface carries no auth (it is merged into '/api' WITHOUT the
///       `mw_ctx_require` layer, see `app.rs`), so an anonymous visitor to the
///       Jedi feed can read it. It only needs the `ModelManager` resource; the
///       public handler injects a root `Ctx` per call.
pub fn routes_public(mm: ModelManager) -> Router {
	let rpc_router = public_rpc_router_builder().append_resource(mm).build();

	Router::new()
		.route("/rpc-public", post(handlers_rpc::rpc_axum_handler_public))
		.with_state(rpc_router)
}
