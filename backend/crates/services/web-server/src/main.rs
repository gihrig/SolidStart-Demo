// region:    --- Modules

mod app;
mod config;
mod error;
mod web;

pub use self::error::{Error, Result};

use crate::app::app;
use crate::web::routes_ws::WsState;

use lib_core::_dev_utils;
use lib_core::model::ModelManager;
use std::sync::Arc;
use tokio::net::TcpListener;
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

	// Router Assembly (shared with the integration tests in `app.rs`).
	let routes_all = app(mm, ws_state);

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
