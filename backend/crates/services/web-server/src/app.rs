use crate::config::web_config;
use crate::web::routes_ws::{self, WsState};
use crate::web::{routes_login, routes_rpc};

use axum::{http::Method, middleware, Router};
use lib_core::model::ModelManager;
use lib_web::middleware::mw_auth::{mw_ctx_require, mw_ctx_resolver};
use lib_web::middleware::mw_req_stamp::mw_req_stamp_resolver;
use lib_web::middleware::mw_res_map::mw_response_map;
use lib_web::routes::routes_static;
use std::sync::Arc;
use tower_cookies::CookieManagerLayer;
use tower_http::cors::CorsLayer;

/// Assemble the full Axum application router.
///
/// Shared by `main` (real server on a TCP listener) and the integration tests
/// (driven in-process, no port), so both exercise the identical middleware and
/// route wiring.
pub fn app(mm: ModelManager, ws_state: Arc<WsState>) -> Router {
	// Protected API endpoints (require a resolved Ctx / auth cookie).
	let routes_rpc = routes_rpc::routes(mm.clone(), ws_state.clone())
		.route_layer(middleware::from_fn(mw_ctx_require));

	// WebSocket routes (auth handled in the WS handler if needed).
	let routes_ws = routes_ws::routes(ws_state.clone());

	// CORS for the SolidStart front-end (harmless in tests, which send no Origin).
	let cors = CorsLayer::new()
		.allow_origin(
			"http://localhost:3000"
				.parse::<axum::http::HeaderValue>()
				.unwrap(),
		)
		.allow_methods([Method::GET, Method::POST, Method::OPTIONS])
		.allow_headers([
			axum::http::header::CONTENT_TYPE,
			axum::http::header::AUTHORIZATION,
		])
		.allow_credentials(true);

	Router::new()
		.merge(routes_login::routes(mm.clone()))
		.nest("/api", routes_rpc)
		.merge(routes_ws)
		.layer(middleware::map_response(mw_response_map))
		.layer(middleware::from_fn_with_state(mm.clone(), mw_ctx_resolver))
		.layer(CookieManagerLayer::new())
		.layer(cors)
		.layer(middleware::from_fn(mw_req_stamp_resolver))
		.fallback_service(routes_static::serve_dir(&web_config().WEB_FOLDER))
}

// region:    --- Tests

#[cfg(test)]
mod tests {
	type Result<T> = core::result::Result<T, Box<dyn std::error::Error>>;

	use super::app;
	use crate::web::routes_ws::WsState;
	use axum_test::TestServer;
	use lib_core::_dev_utils::{self, clean_agents, clean_convs};
	use lib_core::ctx::Ctx;
	use lib_core::model::user::{UserBmc, UserForCreate};
	use serde_json::{json, Value};
	use serial_test::serial;
	use std::sync::Arc;

	/// End-to-end HTTP smoke of the whole web layer — the seam the model-level
	/// `#[tokio::test]`s do not cover: cookie login, rpc-router dispatch, logoff.
	/// Mirrors the `quick_dev` example, but asserts instead of printing.
	#[serial]
	#[tokio::test]
	async fn test_web_login_rpc_logoff_ok() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let mut server = TestServer::new(app(mm.clone(), Arc::new(WsState::new())));
		server.save_cookies(); // persist the auth cookie across requests
		let fx_agent_name = "test_web_login_rpc_logoff_ok agent 01";
		let fx_conv_title = "test_web_login_rpc_logoff_ok conv 01";

		// -- Exec & Check: login
		server
			.post("/api/login")
			.json(&json!({ "username": "demo1", "pwd": "welcome" }))
			.await
			.assert_status_ok();

		// -- Exec & Check: create_agent (authed rpc)
		let body: Value = server
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "create_agent",
				"params": { "data": { "name": fx_agent_name } }
			}))
			.await
			.json();
		let agent_id = body
			.pointer("/result/data/id")
			.and_then(Value::as_i64)
			.ok_or("create_agent: missing /result/data/id")?;
		assert!(agent_id > 0, "expected a positive agent id");

		// -- Exec & Check: get_agent round-trips the name
		let body: Value = server
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "get_agent",
				"params": { "id": agent_id }
			}))
			.await
			.json();
		assert_eq!(
			body.pointer("/result/data/name").and_then(Value::as_str),
			Some(fx_agent_name)
		);

		// -- Exec & Check: create_conv
		let body: Value = server
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "create_conv",
				"params": { "data": { "agent_id": agent_id, "title": fx_conv_title } }
			}))
			.await
			.json();
		let conv_id = body
			.pointer("/result/data/id")
			.and_then(Value::as_i64)
			.ok_or("create_conv: missing /result/data/id")?;

		// -- Exec & Check: add_conv_msg
		let body: Value = server
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "add_conv_msg",
				"params": { "data": { "conv_id": conv_id, "content": "first comment" } }
			}))
			.await
			.json();
		assert!(
			body.pointer("/result/data/id")
				.and_then(Value::as_i64)
				.is_some(),
			"add_conv_msg: missing /result/data/id"
		);

		// -- Exec & Check: logoff
		server
			.post("/api/logoff")
			.json(&json!({ "logoff": true }))
			.await
			.assert_status_ok();

		// -- Clean (convs before agents; message rows cascade with the conv)
		let ctx = Ctx::root_ctx();
		clean_convs(&ctx, &mm, "test_web_login_rpc_logoff_ok").await?;
		clean_agents(&ctx, &mm, "test_web_login_rpc_logoff_ok").await?;

		Ok(())
	}

	/// C01 cross-user scope over HTTP (Q10): a private (`OwnerOnly`) conv created
	/// by `demo1` is invisible to a second logged-in user — `get_conv` errors
	/// for them, while its owner still reads it.
	#[serial]
	#[tokio::test]
	async fn test_web_cross_user_conv_scope() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let fx_prefix = "test_web_cross_user_conv_scope";

		// A second authenticatable user (demo1 is seeded by dev_db).
		let demo2_username = format!("{fx_prefix}-demo2");
		let demo2_id = UserBmc::create(
			&root,
			&mm,
			UserForCreate {
				username: demo2_username.clone(),
				pwd_clear: "welcome".to_string(),
			},
		)
		.await?;

		let fx_agent_name = format!("{fx_prefix} agent 01");
		let fx_conv_title = format!("{fx_prefix} conv 01");

		// -- demo1 session: create an agent + a private (default OwnerOnly) conv.
		let mut server_a =
			TestServer::new(app(mm.clone(), Arc::new(WsState::new())));
		server_a.save_cookies();
		server_a
			.post("/api/login")
			.json(&json!({ "username": "demo1", "pwd": "welcome" }))
			.await
			.assert_status_ok();

		let body: Value = server_a
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "create_agent",
				"params": { "data": { "name": fx_agent_name } }
			}))
			.await
			.json();
		let agent_id = body
			.pointer("/result/data/id")
			.and_then(Value::as_i64)
			.ok_or("create_agent: missing /result/data/id")?;

		let body: Value = server_a
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "create_conv",
				"params": { "data": { "agent_id": agent_id, "title": fx_conv_title } }
			}))
			.await
			.json();
		let conv_id = body
			.pointer("/result/data/id")
			.and_then(Value::as_i64)
			.ok_or("create_conv: missing /result/data/id")?;

		// -- demo2 session: cannot read demo1's private conv.
		let mut server_b =
			TestServer::new(app(mm.clone(), Arc::new(WsState::new())));
		server_b.save_cookies();
		server_b
			.post("/api/login")
			.json(&json!({ "username": demo2_username, "pwd": "welcome" }))
			.await
			.assert_status_ok();

		let body: Value = server_b
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "get_conv",
				"params": { "id": conv_id }
			}))
			.await
			.json();
		assert!(
			body.get("error").is_some(),
			"cross-user get_conv should error, got: {body}"
		);
		assert!(
			body.pointer("/result/data").is_none(),
			"cross-user get_conv should not return conv data"
		);

		// -- The owner still reads its own conv (scope is not over-broad).
		let body: Value = server_a
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "get_conv",
				"params": { "id": conv_id }
			}))
			.await
			.json();
		assert_eq!(
			body.pointer("/result/data/id").and_then(Value::as_i64),
			Some(conv_id)
		);

		// -- Clean (convs before agents; message rows cascade with the conv)
		clean_convs(&root, &mm, fx_prefix).await?;
		clean_agents(&root, &mm, fx_prefix).await?;
		UserBmc::delete(&root, &mm, demo2_id).await?;

		Ok(())
	}

	/// An rpc call without the login cookie is rejected by `mw_ctx_require`.
	#[serial]
	#[tokio::test]
	async fn test_web_rpc_requires_auth() -> Result<()> {
		let mm = _dev_utils::init_test().await;
		let server = TestServer::new(app(mm, Arc::new(WsState::new())));

		let res = server
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "get_agent",
				"params": { "id": 1 }
			}))
			.await;

		assert_eq!(res.status_code(), 401, "unauthenticated rpc should be 401");
		assert!(
			res.text().contains("NO_AUTH"),
			"expected a NO_AUTH error body, got: {}",
			res.text()
		);

		Ok(())
	}
}

// endregion: --- Tests
