// region:    --- Modules

mod config;
mod error;
mod web;

pub use self::error::{Error, Result};
use config::web_config;

use lib_web::middleware::mw_auth::{mw_ctx_require, mw_ctx_resolver};
use lib_web::middleware::mw_req_stamp::mw_req_stamp_resolver;
use lib_web::middleware::mw_res_map::mw_response_map;
use lib_web::routes::routes_static;

use crate::web::routes_login;
use crate::web::routes_ws::WsState;

use axum::{http::Method, middleware, Router};
use lib_core::_dev_utils;
use lib_core::model::ModelManager;
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_cookies::CookieManagerLayer;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;
use tracing_subscriber::EnvFilter;

// endregion: --- Modules

#[tokio::main]
async fn main() -> Result<()> {
	// region: --- Initialization Pase

	// Initialize Tracing
	tracing_subscriber::fmt()
		.without_time() // TODO: For early local development.
		.with_target(false)
		.with_env_filter(EnvFilter::from_default_env())
		.init();

	// -- TODO: Development setup
	_dev_utils::init_dev().await;

	// ModelManager initialization
	let mm = ModelManager::new().await?;

	// WebSocket state initialization
	let ws_state = Arc::new(WsState::new());

	// endregion: -- Initialization Phase

	// Route Definition - Protected API endpoints
	let routes_rpc = web::routes_rpc::routes(mm.clone())
		.route_layer(middleware::from_fn(mw_ctx_require));

	// WebSocket routes (no auth required for upgrade, auth handled in WS handler if needed)
	let routes_ws = web::routes_ws::routes(ws_state.clone());

	// CORS Configuration for SolidStart front-end
	// Note: For production, replace with specific allowed origins
	let cors = CorsLayer::new()
		.allow_origin("http://localhost:3000".parse::<axum::http::HeaderValue>().unwrap())
		.allow_methods([Method::GET, Method::POST, Method::OPTIONS])
		.allow_headers(Any)
		.allow_credentials(true);

	// Router Assembly - Middleware nested under /api prefix
	let routes_all = Router::new()
		.merge(routes_login::routes(mm.clone()))
		.nest("/api", routes_rpc)
		.merge(routes_ws)
		.layer(middleware::map_response(mw_response_map))
		.layer(middleware::from_fn_with_state(mm.clone(), mw_ctx_resolver))
		.layer(CookieManagerLayer::new())
		.layer(cors)
		.layer(middleware::from_fn(mw_req_stamp_resolver))
		.fallback_service(routes_static::serve_dir(&web_config().WEB_FOLDER));

	// region: --- Start Server
	// Note: For this block, ok to unwrap
	let listener = TcpListener::bind("127.0.0.1:8080").await.unwrap();
	info!("{:<12} - {:?}\n", "LISTENING", listener.local_addr());
	axum::serve(listener, routes_all.into_make_service())
		.await
		.unwrap();
	// endregion: --- Start Server >  panic on error

	Ok(())
}
