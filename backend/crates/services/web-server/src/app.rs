use crate::config::web_config;
use crate::web::{routes_login, routes_rpc};
use lib_web::ws::{self, WsState};

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

	// Public API endpoints (no auth): the Jedi feed's static reads, e.g.
	// `list_categories`, so an anonymous visitor to `/` can load them. Merged
	// into `/api` WITHOUT the `mw_ctx_require` layer.
	let routes_rpc_public = routes_rpc::routes_public(mm.clone());

	// WebSocket routes require auth like the RPC routes; the handler then captures
	// the caller's identity at the upgrade to authorize per-connection subscriptions.
	let routes_ws = ws::routes(ws_state.clone(), mm.clone())
		.route_layer(middleware::from_fn(mw_ctx_require));

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
		.nest("/api", routes_rpc.merge(routes_rpc_public))
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
	use axum_test::TestServer;
	use lib_core::_dev_utils::{
		self, clean_posts, clean_users, seed_admin_user, seed_caption,
		seed_caption_comment, seed_post, seed_post_comment, seed_user,
	};
	use lib_core::ctx::Ctx;
	use lib_web::ws::WsState;
	use serde_json::{json, Value};
	use serial_test::serial;
	use std::sync::Arc;

	/// The `(id, like_count)` pairs of a ranked public list, in response order.
	fn ids_and_likes(items: &[Value]) -> Vec<(i64, i64)> {
		items
			.iter()
			.filter_map(|v| {
				Some((
					v.pointer("/id").and_then(Value::as_i64)?,
					v.pointer("/like_count").and_then(Value::as_i64)?,
				))
			})
			.collect()
	}

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
		let fx_title = "test_web_login_rpc_logoff_ok";

		// -- Exec & Check: login
		server
			.post("/api/login")
			.json(&json!({ "username": "demo1", "pwd": "welcome" }))
			.await
			.assert_status_ok();

		// -- Exec & Check: create_post (authed rpc) returns the caller as author
		let body: Value = server
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "create_post",
				"params": { "data": {
					"title": fx_title,
					"image_src": "https://example.com/a.jpg",
					"image_alt": "alt",
					"photographer": "Photographer",
					"photographer_url": "https://www.flickr.com/photos/p/",
					"source_url": "https://www.flickr.com/photos/p/2/",
					"category_ids": [3]
				} }
			}))
			.await
			.json();
		let post_id = body
			.pointer("/result/data/id")
			.and_then(Value::as_i64)
			.ok_or("create_post: missing /result/data/id")?;
		assert!(post_id > 0, "expected a positive post id");
		assert_eq!(
			body.pointer("/result/data/author/name")
				.and_then(Value::as_str),
			Some("demo1")
		);

		// -- Exec & Check: logoff
		server
			.post("/api/logoff")
			.json(&json!({ "logoff": true }))
			.await
			.assert_status_ok();

		// -- Clean
		clean_posts(&mm, fx_title).await?;

		Ok(())
	}

	/// The public RPC surface serves the Jedi feed's static taxonomy to an
	/// anonymous visitor: `list_categories` on `/api/rpc-public` returns the
	/// seeded rows with NO login, while the same method on the authed `/api/rpc`
	/// is rejected (it is not registered there and the surface requires auth).
	/// This guards the regression that the auth-gated feed would break the
	/// anonymous landing page (#116).
	#[serial]
	#[tokio::test]
	async fn test_web_public_list_categories_anonymous_ok() -> Result<()> {
		// -- Setup & Fixtures (no login — an anonymous client)
		let mm = _dev_utils::init_test().await;
		let server = TestServer::new(app(mm.clone(), Arc::new(WsState::new())));

		// -- Exec & Check: the public endpoint returns the seeded taxonomy.
		let body: Value = server
			.post("/api/rpc-public")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "list_categories"
			}))
			.await
			.json();
		let names: Vec<&str> = body
			.pointer("/result/data")
			.and_then(Value::as_array)
			.ok_or("list_categories: missing /result/data array")?
			.iter()
			.filter_map(|c| c.pointer("/name").and_then(Value::as_str))
			.collect();
		assert!(names.contains(&"Landscape"), "got {names:?}");
		assert!(names.contains(&"Cute"), "got {names:?}");

		// -- Exec & Check: the authed surface rejects the anonymous call.
		server
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "list_categories"
			}))
			.await
			.assert_status(axum::http::StatusCode::UNAUTHORIZED);

		Ok(())
	}

	/// The public RPC surface serves the Jedi Post feed to an anonymous visitor
	/// (#117): `list_posts` / `featured_post` / `get_post` on `/api/rpc-public`
	/// return the enriched `PostView` — author, resolved Categories, derived counts
	/// — with NO login, and the response carries no audit columns (ADR-0021).
	#[serial]
	#[tokio::test]
	async fn test_web_public_posts_anonymous_ok() -> Result<()> {
		// -- Setup & Fixtures (no login — an anonymous client)
		let mm = _dev_utils::init_test().await;
		let server = TestServer::new(app(mm.clone(), Arc::new(WsState::new())));

		// -- Exec & Check: the public endpoint returns the seeded Posts as views.
		let body: Value = server
			.post("/api/rpc-public")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "list_posts"
			}))
			.await
			.json();
		let posts = body
			.pointer("/result/data")
			.and_then(Value::as_array)
			.ok_or("list_posts: missing /result/data array")?;
		assert_eq!(posts.len(), 4, "four Posts are seeded");

		// The seeded Likes rank the Posts as the fixture does (#177): 5, 5, 4, 3
		// Likes, with the 5-Like tie broken by id ascending.
		assert_eq!(ids_and_likes(posts), vec![(1, 5), (3, 5), (2, 4), (4, 3)]);

		// The first Post carries the assembled view: an author snapshot, resolved
		// Category tags, and derived counts.
		let first = &posts[0];
		assert!(
			first
				.pointer("/author/name")
				.and_then(Value::as_str)
				.is_some(),
			"PostView carries an author snapshot"
		);
		assert!(
			first
				.pointer("/categories/0/name")
				.and_then(Value::as_str)
				.is_some(),
			"PostView carries resolved Categories"
		);
		// No audit columns leak on the public surface (ADR-0021).
		for audit in ["cid", "mid", "ctime", "mtime"] {
			assert!(
				first.get(audit).is_none(),
				"PostView must not expose `{audit}`"
			);
		}

		// -- Exec & Check: featured_post returns the single top-ranked view.
		let body: Value = server
			.post("/api/rpc-public")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "featured_post"
			}))
			.await
			.json();
		let featured_id = body
			.pointer("/result/data/id")
			.and_then(Value::as_i64)
			.ok_or("featured_post: missing /result/data/id")?;
		assert_eq!(featured_id, 1, "Post 1 is the top-ranked Post");

		// -- Exec & Check: get_post fetches that same Post by id.
		let body: Value = server
			.post("/api/rpc-public")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "get_post",
				"params": { "id": featured_id }
			}))
			.await
			.json();
		assert_eq!(
			body.pointer("/result/data/id").and_then(Value::as_i64),
			Some(featured_id)
		);

		Ok(())
	}

	/// The public RPC surface serves a Post's Top Captions to an anonymous
	/// visitor (#118): `list_captions_for_post` on `/api/rpc-public` returns the
	/// enriched `CaptionView` — author, derived counts — with NO login, ranked by
	/// like count, and the response carries no audit columns (ADR-0021).
	#[serial]
	#[tokio::test]
	async fn test_web_public_captions_anonymous_ok() -> Result<()> {
		// -- Setup & Fixtures (no login — an anonymous client)
		let mm = _dev_utils::init_test().await;
		let server = TestServer::new(app(mm.clone(), Arc::new(WsState::new())));

		// -- Exec: the seeded Post 1 carries Captions 1 (Lisa) and 2 (Bart).
		let body: Value = server
			.post("/api/rpc-public")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "list_captions_for_post",
				"params": { "id": 1 }
			}))
			.await
			.json();
		let captions = body
			.pointer("/result/data")
			.and_then(Value::as_array)
			.ok_or("list_captions_for_post: missing /result/data array")?;

		// -- Check: the seeded Likes rank the Captions as the fixture does (#177).
		assert_eq!(ids_and_likes(captions), vec![(1, 8), (2, 5)]);
		let first = &captions[0];
		assert_eq!(
			first.pointer("/text").and_then(Value::as_str),
			Some("Jedi Kitty protects the street")
		);
		assert_eq!(
			first.pointer("/author/name").and_then(Value::as_str),
			Some("Lisa")
		);
		assert_eq!(
			first.pointer("/comment_count").and_then(Value::as_i64),
			Some(0)
		);
		// No audit columns leak on the public surface (ADR-0021).
		for audit in ["cid", "mid", "ctime", "mtime"] {
			assert!(
				first.get(audit).is_none(),
				"CaptionView must not expose `{audit}`"
			);
		}

		// -- Exec & Check: `list_options` pages the ranked list over the wire, so
		//    the second one-row page is Caption 2.
		let body: Value = server
			.post("/api/rpc-public")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "list_captions_for_post",
				"params": { "id": 1, "list_options": { "limit": 1, "offset": 1 } }
			}))
			.await
			.json();
		let page_ids: Vec<i64> = body
			.pointer("/result/data")
			.and_then(Value::as_array)
			.ok_or("list_captions_for_post page: missing /result/data array")?
			.iter()
			.filter_map(|c| c.pointer("/id").and_then(Value::as_i64))
			.collect();
		assert_eq!(page_ids, vec![2]);

		// -- Exec & Check: Captions 3–8 each carry 2 Likes, so each Post's tie
		//    breaks by id ascending.
		for (post_id, expected_ids) in [(2, [3, 4]), (3, [6, 8]), (4, [5, 7])] {
			let body: Value = server
				.post("/api/rpc-public")
				.json(&json!({
					"jsonrpc": "2.0", "id": 1, "method": "list_captions_for_post",
					"params": { "id": post_id }
				}))
				.await
				.json();
			let captions = body
				.pointer("/result/data")
				.and_then(Value::as_array)
				.ok_or("list_captions_for_post: missing /result/data array")?;
			assert_eq!(
				ids_and_likes(captions),
				vec![(expected_ids[0], 2), (expected_ids[1], 2)],
				"Post {post_id} Captions"
			);
		}

		Ok(())
	}

	/// The public RPC surface serves the Hero singleton to an anonymous visitor
	/// (#119): `get_hero` on `/api/rpc-public` returns the seeded `HeroView` with
	/// NO login. The view carries exactly its public fields: no `cta_href` and no
	/// audit columns (ADR-0021). `update_hero` is a mutation, so it is not on the
	/// public surface, and the authed surface rejects an anonymous call.
	#[serial]
	#[tokio::test]
	async fn test_web_public_hero_anonymous_ok() -> Result<()> {
		// -- Setup & Fixtures (no login — an anonymous client)
		let mm = _dev_utils::init_test().await;
		let server = TestServer::new(app(mm.clone(), Arc::new(WsState::new())));

		// -- Exec & Check: the public endpoint returns the seeded Hero.
		let body: Value = server
			.post("/api/rpc-public")
			.json(&json!({ "jsonrpc": "2.0", "id": 1, "method": "get_hero" }))
			.await
			.json();
		let hero = body
			.pointer("/result/data")
			.and_then(Value::as_object)
			.ok_or("get_hero: missing /result/data object")?;
		assert_eq!(
			hero.get("title").and_then(Value::as_str),
			Some("Awesome Photos & Captions")
		);
		let mut keys: Vec<&str> = hero.keys().map(String::as_str).collect();
		keys.sort_unstable();
		assert_eq!(
			keys,
			["background_image", "cta_text", "id", "subtitle", "title"]
		);

		// -- Exec & Check: the mutation is not registered on the public surface.
		let body: Value = server
			.post("/api/rpc-public")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "update_hero",
				"params": { "id": 1, "data": { "title": "anon" } }
			}))
			.await
			.json();
		assert!(body.pointer("/result").is_none(), "got {body}");

		// -- Exec & Check: the authed surface rejects the anonymous call.
		server
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "update_hero",
				"params": { "id": 1, "data": { "title": "anon" } }
			}))
			.await
			.assert_status(axum::http::StatusCode::UNAUTHORIZED);

		Ok(())
	}

	/// A logged-in standard User reads their own profile, but may not edit the
	/// Hero (#119): `get_profile` returns the login User as an `AuthorRef`, and
	/// `update_hero` rejects a caller who is not an Admin (`Sys`) User. The
	/// rejection is `EntityNotFound` (HTTP 400), the #89 permission-miss idiom,
	/// and the stored Hero is unchanged. The interim Admin gate stands until the
	/// privilege system lands (#181).
	#[serial]
	#[tokio::test]
	async fn test_web_profile_ok_standard_user_cannot_update_hero() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let mut server = TestServer::new(app(mm.clone(), Arc::new(WsState::new())));
		server.save_cookies();
		server
			.post("/api/login")
			.json(&json!({ "username": "demo1", "pwd": "welcome" }))
			.await
			.assert_status_ok();

		// -- Exec & Check: get_profile is the login User's author snapshot.
		let body: Value = server
			.post("/api/rpc")
			.json(&json!({ "jsonrpc": "2.0", "id": 1, "method": "get_profile" }))
			.await
			.json();
		assert_eq!(
			body.pointer("/result/data/name").and_then(Value::as_str),
			Some("demo1")
		);
		assert!(
			body.pointer("/result/data/avatar_url")
				.is_some_and(Value::is_null),
			"demo1 has no avatar: got {body}"
		);

		// -- Exec & Check: a standard User may not edit the Hero.
		let res = server
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "update_hero",
				"params": { "id": 1, "data": { "cta_text": "Hijacked" } }
			}))
			.await;
		res.assert_status(axum::http::StatusCode::BAD_REQUEST);
		assert!(
			res.text().contains("ENTITY_NOT_FOUND"),
			"expected an ENTITY_NOT_FOUND error body, got: {}",
			res.text()
		);

		// -- Check: the stored Hero is unchanged.
		let body: Value = server
			.post("/api/rpc-public")
			.json(&json!({ "jsonrpc": "2.0", "id": 1, "method": "get_hero" }))
			.await
			.json();
		assert_eq!(
			body.pointer("/result/data/cta_text")
				.and_then(Value::as_str),
			Some("Get Started")
		);

		Ok(())
	}

	/// An Admin (`Sys`) User edits the Hero (#119): `update_hero` returns the
	/// updated `HeroView`, and an unsafe `background_image` is still rejected
	/// on write.
	#[serial]
	#[tokio::test]
	async fn test_web_admin_update_hero_ok() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let fx_username = "test_web_admin_update_hero_ok-admin";
		let fx_pwd = "welcome";
		seed_admin_user(&root, &mm, fx_username, fx_pwd).await?;
		let mut server = TestServer::new(app(mm.clone(), Arc::new(WsState::new())));
		server.save_cookies();
		server
			.post("/api/login")
			.json(&json!({ "username": fx_username, "pwd": fx_pwd }))
			.await
			.assert_status_ok();

		// -- Exec & Check: an unsafe background_image is rejected.
		server
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "update_hero",
				"params": { "id": 1, "data": { "background_image": "javascript:alert(1)" } }
			}))
			.await
			.assert_status(axum::http::StatusCode::BAD_REQUEST);

		// -- Exec & Check: a valid update returns the updated view.
		let body: Value = server
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "update_hero",
				"params": { "id": 1, "data": { "cta_text": "Join now" } }
			}))
			.await
			.json();
		assert_eq!(
			body.pointer("/result/data/cta_text")
				.and_then(Value::as_str),
			Some("Join now")
		);
		assert_eq!(
			body.pointer("/result/data/background_image")
				.and_then(Value::as_str),
			Some("https://live.staticflickr.com/65535/49909538937_3255dcf9e7_b.jpg")
		);

		// -- Clean: restore the seeded CTA text, then drop the Admin User.
		server
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "update_hero",
				"params": { "id": 1, "data": { "cta_text": "Get Started" } }
			}))
			.await
			.assert_status_ok();
		clean_users(&root, &mm, fx_username).await?;

		Ok(())
	}

	/// A logged-in User creates a Post (#120): `create_post` returns the
	/// `PostView` with the caller as author and the named Categories, and pokes
	/// the `posts` feed once. An unsafe URL is rejected (400) with no poke, and
	/// an anonymous caller is rejected (401).
	#[serial]
	#[tokio::test]
	async fn test_web_create_post_ok() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let fx_title = "test_web_create_post_ok";
		let post_data = |image_src: &str| {
			json!({
				"title": fx_title,
				"image_src": image_src,
				"image_alt": "alt",
				"photographer": "Photographer",
				"photographer_url": "https://www.flickr.com/photos/p/",
				"source_url": "https://www.flickr.com/photos/p/2/",
				"category_ids": [6, 3]
			})
		};
		let ws_state = Arc::new(WsState::new());
		let mut rx = ws_state.tx.subscribe();
		let anon = TestServer::new(app(mm.clone(), ws_state.clone()));
		let mut server = TestServer::new(app(mm.clone(), ws_state.clone()));
		server.save_cookies();
		server
			.post("/api/login")
			.json(&json!({ "username": "demo1", "pwd": "welcome" }))
			.await
			.assert_status_ok();

		// -- Exec & Check: an anonymous caller is rejected.
		anon.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "create_post",
				"params": { "data": post_data("https://example.com/a.jpg") }
			}))
			.await
			.assert_status(axum::http::StatusCode::UNAUTHORIZED);

		// -- Exec & Check: an unsafe URL is rejected, and nothing is poked.
		server
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "create_post",
				"params": { "data": post_data("javascript:alert(1)") }
			}))
			.await
			.assert_status(axum::http::StatusCode::BAD_REQUEST);
		assert!(rx.try_recv().is_err(), "a rejected create must not poke");

		// -- Exec: a valid create.
		let body: Value = server
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "create_post",
				"params": { "data": post_data("https://example.com/a.jpg") }
			}))
			.await
			.json();

		// -- Check: the returned view carries the author and Categories.
		assert_eq!(
			body.pointer("/result/data/title").and_then(Value::as_str),
			Some(fx_title),
			"got {body}"
		);
		assert_eq!(
			body.pointer("/result/data/author/name")
				.and_then(Value::as_str),
			Some("demo1")
		);
		let cat_ids: Vec<i64> = body
			.pointer("/result/data/categories")
			.and_then(Value::as_array)
			.map(|cats| {
				cats.iter()
					.filter_map(|c| c.pointer("/id").and_then(Value::as_i64))
					.collect()
			})
			.unwrap_or_default();
		assert_eq!(cat_ids, vec![3, 6]);

		// -- Check: the `posts` feed was poked once.
		let event = rx.try_recv().expect("create_post pokes the posts feed");
		assert_eq!(event.channel().key(), "posts");
		assert!(rx.try_recv().is_err(), "exactly one poke");

		// -- Clean
		clean_posts(&mm, fx_title).await?;

		Ok(())
	}

	/// A logged-in User adds a Caption (#121): `add_caption` returns the
	/// `CaptionView` with the caller as author, and pokes `post_caption:{post_id}`
	/// once. An over-cap text or an unknown Post is rejected (400) with no poke,
	/// and an anonymous caller is rejected (401).
	#[serial]
	#[tokio::test]
	async fn test_web_add_caption_ok() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let fx_title = "test_web_add_caption_ok";
		let post_id = seed_post(&Ctx::root_ctx(), &mm, fx_title, &[1]).await?;
		let add = |post_id: i64, text: &str| {
			json!({
				"jsonrpc": "2.0", "id": 1, "method": "add_caption",
				"params": { "data": { "post_id": post_id, "text": text } }
			})
		};
		let ws_state = Arc::new(WsState::new());
		let mut rx = ws_state.tx.subscribe();
		let anon = TestServer::new(app(mm.clone(), ws_state.clone()));
		let mut server = TestServer::new(app(mm.clone(), ws_state.clone()));
		server.save_cookies();
		server
			.post("/api/login")
			.json(&json!({ "username": "demo1", "pwd": "welcome" }))
			.await
			.assert_status_ok();

		// -- Exec & Check: an anonymous caller is rejected.
		anon.post("/api/rpc")
			.json(&add(post_id, "anon caption"))
			.await
			.assert_status(axum::http::StatusCode::UNAUTHORIZED);

		// -- Exec & Check: an over-cap text and an unknown Post are rejected, and
		//    nothing is poked.
		server
			.post("/api/rpc")
			.json(&add(post_id, &"a".repeat(37)))
			.await
			.assert_status(axum::http::StatusCode::BAD_REQUEST);
		server
			.post("/api/rpc")
			.json(&add(999_999, "orphan"))
			.await
			.assert_status(axum::http::StatusCode::BAD_REQUEST);
		assert!(rx.try_recv().is_err(), "a rejected add must not poke");

		// -- Exec: a valid add.
		let body: Value = server
			.post("/api/rpc")
			.json(&add(post_id, "Use the Force, Kitty"))
			.await
			.json();

		// -- Check: the returned view carries the caller as author.
		assert_eq!(
			body.pointer("/result/data/text").and_then(Value::as_str),
			Some("Use the Force, Kitty"),
			"got {body}"
		);
		assert_eq!(
			body.pointer("/result/data/post_id").and_then(Value::as_i64),
			Some(post_id)
		);
		assert_eq!(
			body.pointer("/result/data/author/name")
				.and_then(Value::as_str),
			Some("demo1")
		);

		// -- Check: the Post's Caption feed was poked once.
		let event = rx.try_recv().expect("add_caption pokes post_caption");
		assert_eq!(event.channel().key(), format!("post_caption:{post_id}"));
		assert!(rx.try_recv().is_err(), "exactly one poke");

		// -- Clean (the Post delete cascades its Captions)
		clean_posts(&mm, fx_title).await?;

		Ok(())
	}

	/// A logged-in User likes and unlikes a Post (#122): `toggle_post_like`
	/// returns the caller's `LikeView`, and a toggle that changes the Like
	/// pokes `post_like:{post_id}` (the count) and `posts` (the ranking). A
	/// second like is a no-op that pokes nothing. `get_post_like` reads the same
	/// view. An unknown Post is rejected (400) by both RPCs with no poke, and an
	/// anonymous caller is rejected (401).
	#[serial]
	#[tokio::test]
	async fn test_web_toggle_post_like_ok() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let fx_title = "test_web_toggle_post_like_ok";
		let post_id = seed_post(&Ctx::root_ctx(), &mm, fx_title, &[1]).await?;
		let toggle = |post_id: i64, liked: bool| {
			json!({
				"jsonrpc": "2.0", "id": 1, "method": "toggle_post_like",
				"params": { "data": { "id": post_id, "liked": liked } }
			})
		};
		let ws_state = Arc::new(WsState::new());
		let mut rx = ws_state.tx.subscribe();
		let anon = TestServer::new(app(mm.clone(), ws_state.clone()));
		let mut server = TestServer::new(app(mm.clone(), ws_state.clone()));
		server.save_cookies();
		server
			.post("/api/login")
			.json(&json!({ "username": "demo1", "pwd": "welcome" }))
			.await
			.assert_status_ok();

		// -- Exec & Check: an anonymous caller is rejected.
		anon.post("/api/rpc")
			.json(&toggle(post_id, true))
			.await
			.assert_status(axum::http::StatusCode::UNAUTHORIZED);

		// -- Exec & Check: an unknown Post is rejected by both RPCs, and nothing
		//    is poked.
		server
			.post("/api/rpc")
			.json(&toggle(999_999, true))
			.await
			.assert_status(axum::http::StatusCode::BAD_REQUEST);
		server
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "get_post_like",
				"params": { "id": 999_999 }
			}))
			.await
			.assert_status(axum::http::StatusCode::BAD_REQUEST);
		assert!(rx.try_recv().is_err(), "a rejected toggle must not poke");

		// -- Exec: like twice.
		server.post("/api/rpc").json(&toggle(post_id, true)).await;
		let body: Value = server
			.post("/api/rpc")
			.json(&toggle(post_id, true))
			.await
			.json();

		// -- Check: one Like, liked by the caller.
		assert_eq!(
			body.pointer("/result/data"),
			Some(&json!({ "id": post_id, "like_count": 1, "liked": true })),
			"got {body}"
		);

		// -- Check: the first like poked the count, then the ranking; the second
		//    like changed nothing, so it poked nothing.
		let like = rx.try_recv().expect("toggle pokes post_like");
		assert_eq!(like.channel().key(), format!("post_like:{post_id}"));
		let posts = rx.try_recv().expect("toggle pokes posts");
		assert_eq!(posts.channel().key(), "posts");
		assert!(rx.try_recv().is_err(), "a no-op toggle must not poke");

		// -- Exec & Check: unlike; `get_post_like` reads the same view.
		server.post("/api/rpc").json(&toggle(post_id, false)).await;
		let body: Value = server
			.post("/api/rpc")
			.json(&json!({
				"jsonrpc": "2.0", "id": 1, "method": "get_post_like",
				"params": { "id": post_id }
			}))
			.await
			.json();
		assert_eq!(
			body.pointer("/result/data"),
			Some(&json!({ "id": post_id, "like_count": 0, "liked": false })),
			"got {body}"
		);

		// -- Clean (the Post delete cascades its Likes)
		clean_posts(&mm, fx_title).await?;

		Ok(())
	}

	/// A Post's Comment thread over HTTP (#124). An anonymous visitor reads the
	/// thread on `/api/rpc-public` but cannot write (401). A logged-in User adds,
	/// edits and deletes their own Comment: an add or edit returns the
	/// `CommentView` and pushes the same view on `post_comment:{post_id}`, and a
	/// delete returns and pushes the removal (`id`, `parent_id`) (#125). An add
	/// or delete then pokes `posts` (the count); an edit does not. A non-owner
	/// edit or delete is rejected (400) with no push. The public read lists
	/// `CommentView`s newest first, with no actor ids.
	#[serial]
	#[tokio::test]
	async fn test_web_post_comment_thread_ok() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let fx_title = "test_web_post_comment_thread_ok";
		let post_id = seed_post(&root, &mm, fx_title, &[1]).await?;
		let other_id = seed_user(&root, &mm, "test_web_pc_thread-other").await?;
		let other_comment =
			seed_post_comment(&Ctx::new(other_id)?, &mm, post_id, "other's").await?;
		let rpc = |method: &str, params: Value| json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });
		let ws_state = Arc::new(WsState::new());
		let mut rx = ws_state.tx.subscribe();
		let anon = TestServer::new(app(mm.clone(), ws_state.clone()));
		let mut server = TestServer::new(app(mm.clone(), ws_state.clone()));
		server.save_cookies();
		server
			.post("/api/login")
			.json(&json!({ "username": "demo1", "pwd": "welcome" }))
			.await
			.assert_status_ok();
		let add = rpc(
			"add_post_comment",
			json!({ "data": { "post_id": post_id, "content": "  hello  " } }),
		);

		// -- Exec & Check: an anonymous caller cannot add.
		anon.post("/api/rpc")
			.json(&add)
			.await
			.assert_status(axum::http::StatusCode::UNAUTHORIZED);

		// -- Exec & Check: add. The view comes back after hygiene, with demo1 as
		//    its author, and the same view is pushed on the thread. Then `posts`
		//    is poked.
		let body: Value = server.post("/api/rpc").json(&add).await.json();
		let id = body
			.pointer("/result/data/id")
			.and_then(Value::as_i64)
			.ok_or(format!("add_post_comment: missing id in {body}"))?;
		assert_eq!(
			body.pointer("/result/data/content_html")
				.and_then(Value::as_str),
			Some("<p>hello</p>")
		);
		assert_eq!(
			body.pointer("/result/data/author/name")
				.and_then(Value::as_str),
			Some("demo1")
		);
		assert_eq!(
			body.pointer("/result/data/parent_id")
				.and_then(Value::as_i64),
			Some(post_id)
		);
		let event = rx.try_recv().expect("add pushes the view");
		assert_eq!(event.channel().key(), format!("post_comment:{post_id}"));
		let event = serde_json::to_value(event)?;
		assert_eq!(event["event_type"], "post_comment");
		assert_eq!(
			Some(&event["payload"]),
			body.pointer("/result/data"),
			"the add result equals the pushed payload"
		);
		let posts = rx.try_recv().expect("add pokes posts");
		assert_eq!(posts.channel().key(), "posts");

		// -- Exec & Check: edit pushes the new row, and does not poke `posts`.
		//    The view carries the rendered markdown (#126).
		let body: Value = server
			.post("/api/rpc")
			.json(&rpc(
				"update_post_comment",
				json!({ "id": id, "data": { "content": "**edited**" } }),
			))
			.await
			.json();
		assert_eq!(
			body.pointer("/result/data/content_html")
				.and_then(Value::as_str),
			Some("<p><strong>edited</strong></p>"),
			"got {body}"
		);
		let event = serde_json::to_value(rx.try_recv().expect("edit pushes"))?;
		assert_eq!(event["event_type"], "post_comment");
		assert_eq!(
			Some(&event["payload"]),
			body.pointer("/result/data"),
			"the edit result equals the pushed payload"
		);
		assert!(rx.try_recv().is_err(), "an edit must not poke posts");

		// -- Exec & Check: a non-owner edit or delete is rejected, with no push.
		server
			.post("/api/rpc")
			.json(&rpc(
				"update_post_comment",
				json!({ "id": other_comment, "data": { "content": "hijack" } }),
			))
			.await
			.assert_status(axum::http::StatusCode::BAD_REQUEST);
		server
			.post("/api/rpc")
			.json(&rpc("delete_post_comment", json!({ "id": other_comment })))
			.await
			.assert_status(axum::http::StatusCode::BAD_REQUEST);
		assert!(rx.try_recv().is_err(), "a rejected write must not push");

		// -- Exec & Check: the Owner reads the stored markdown of their Comment
		//    (#126). A non-owner read is rejected (400).
		let body: Value = server
			.post("/api/rpc")
			.json(&rpc("get_post_comment", json!({ "id": id })))
			.await
			.json();
		assert_eq!(
			body.pointer("/result/data"),
			Some(&json!({ "id": id, "content": "**edited**" })),
			"got {body}"
		);
		server
			.post("/api/rpc")
			.json(&rpc("get_post_comment", json!({ "id": other_comment })))
			.await
			.assert_status(axum::http::StatusCode::BAD_REQUEST);

		// -- Exec & Check: the public thread lists both, newest first. Each row
		//    has exactly the `CommentView` keys: no `cid`, `mid` or `owner_id`,
		//    and no stored text (#126).
		let list = rpc("list_post_comments", json!({ "id": post_id }));
		let body: Value = anon.post("/api/rpc-public").json(&list).await.json();
		let rows = body
			.pointer("/result/data")
			.and_then(Value::as_array)
			.ok_or(format!("list_post_comments: missing data in {body}"))?;
		let ids: Vec<i64> = rows
			.iter()
			.filter_map(|c| c.pointer("/id").and_then(Value::as_i64))
			.collect();
		assert_eq!(ids, vec![id, other_comment]);
		for row in rows {
			let mut keys: Vec<&str> = row
				.as_object()
				.ok_or(format!("list_post_comments: row is not an object: {row}"))?
				.keys()
				.map(String::as_str)
				.collect();
			keys.sort_unstable();
			assert_eq!(
				keys,
				vec![
					"author",
					"content_html",
					"ctime",
					"id",
					"mtime",
					"parent_id"
				]
			);
		}

		// -- Exec & Check: delete returns and pushes the removal, then pokes
		//    `posts`.
		let body: Value = server
			.post("/api/rpc")
			.json(&rpc("delete_post_comment", json!({ "id": id })))
			.await
			.json();
		assert_eq!(
			body.pointer("/result/data"),
			Some(&json!({ "id": id, "parent_id": post_id })),
			"got {body}"
		);
		let event = rx.try_recv().expect("delete pushes the removal");
		assert_eq!(event.channel().key(), format!("post_comment:{post_id}"));
		assert_eq!(
			serde_json::to_value(event)?,
			json!({
				"event_type": "post_comment_removal",
				"payload": { "id": id, "parent_id": post_id },
			})
		);
		let posts = rx.try_recv().expect("delete pokes posts");
		assert_eq!(posts.channel().key(), "posts");

		// -- Check: the thread now holds only the other User's Comment.
		let body: Value = anon.post("/api/rpc-public").json(&list).await.json();
		assert_eq!(
			body.pointer("/result/data/0/id").and_then(Value::as_i64),
			Some(other_comment)
		);
		assert_eq!(
			body.pointer("/result/data")
				.and_then(Value::as_array)
				.map(Vec::len),
			Some(1)
		);

		// -- Clean (the Post delete cascades its Comments)
		clean_posts(&mm, fx_title).await?;
		clean_users(&root, &mm, "test_web_pc_thread").await?;

		Ok(())
	}

	/// A Caption's Comment thread over HTTP (#127). A logged-in User adds,
	/// edits and deletes their own Comment: each write pushes on
	/// `caption_comment:{caption_id}`. An add or a delete then pokes
	/// `post_caption:{post_id}`, so the Caption list refetches its comment
	/// count; an edit does not. An anonymous visitor reads the thread on
	/// `/api/rpc-public`.
	#[serial]
	#[tokio::test]
	async fn test_web_caption_comment_thread_ok() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let root = Ctx::root_ctx();
		let fx_title = "test_web_caption_comment_thread_ok";
		let post_id = seed_post(&root, &mm, fx_title, &[1]).await?;
		let caption_id = seed_caption(&root, &mm, post_id, "a caption").await?;
		let other_id = seed_user(&root, &mm, "test_web_cc_thread-other").await?;
		let other_comment =
			seed_caption_comment(&Ctx::new(other_id)?, &mm, caption_id, "other's")
				.await?;
		let rpc = |method: &str, params: Value| json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });
		let ws_state = Arc::new(WsState::new());
		let mut rx = ws_state.tx.subscribe();
		let anon = TestServer::new(app(mm.clone(), ws_state.clone()));
		let mut server = TestServer::new(app(mm.clone(), ws_state.clone()));
		server.save_cookies();
		server
			.post("/api/login")
			.json(&json!({ "username": "demo1", "pwd": "welcome" }))
			.await
			.assert_status_ok();

		// -- Exec & Check: add pushes the view on the Caption's thread, then
		//    pokes `post_caption`.
		let body: Value = server
			.post("/api/rpc")
			.json(&rpc(
				"add_caption_comment",
				json!({ "data": { "caption_id": caption_id, "content": "hello" } }),
			))
			.await
			.json();
		let id = body
			.pointer("/result/data/id")
			.and_then(Value::as_i64)
			.ok_or(format!("add_caption_comment: missing id in {body}"))?;
		assert_eq!(
			body.pointer("/result/data/parent_id")
				.and_then(Value::as_i64),
			Some(caption_id)
		);
		let event = rx.try_recv().expect("add pushes the view");
		assert_eq!(
			event.channel().key(),
			format!("caption_comment:{caption_id}")
		);
		let event = serde_json::to_value(event)?;
		assert_eq!(event["event_type"], "caption_comment");
		assert_eq!(Some(&event["payload"]), body.pointer("/result/data"));
		let poke = rx.try_recv().expect("add pokes post_caption");
		assert_eq!(poke.channel().key(), format!("post_caption:{post_id}"));

		// -- Exec & Check: edit pushes the new view, and does not poke.
		let body: Value = server
			.post("/api/rpc")
			.json(&rpc(
				"update_caption_comment",
				json!({ "id": id, "data": { "content": "**edited**" } }),
			))
			.await
			.json();
		assert_eq!(
			body.pointer("/result/data/content_html")
				.and_then(Value::as_str),
			Some("<p><strong>edited</strong></p>"),
			"got {body}"
		);
		let event = rx.try_recv().expect("edit pushes");
		assert_eq!(
			event.channel().key(),
			format!("caption_comment:{caption_id}")
		);
		assert!(rx.try_recv().is_err(), "an edit must not poke post_caption");

		// -- Exec & Check: the Owner reads the stored text; a non-owner write is
		//    rejected (400) with no push.
		let body: Value = server
			.post("/api/rpc")
			.json(&rpc("get_caption_comment", json!({ "id": id })))
			.await
			.json();
		assert_eq!(
			body.pointer("/result/data"),
			Some(&json!({ "id": id, "content": "**edited**" })),
			"got {body}"
		);
		server
			.post("/api/rpc")
			.json(&rpc(
				"delete_caption_comment",
				json!({ "id": other_comment }),
			))
			.await
			.assert_status(axum::http::StatusCode::BAD_REQUEST);
		assert!(rx.try_recv().is_err(), "a rejected write must not push");

		// -- Exec & Check: an anonymous visitor reads the thread, newest first.
		let list = rpc("list_caption_comments", json!({ "id": caption_id }));
		let body: Value = anon.post("/api/rpc-public").json(&list).await.json();
		let ids: Vec<i64> = body
			.pointer("/result/data")
			.and_then(Value::as_array)
			.ok_or(format!("list_caption_comments: missing data in {body}"))?
			.iter()
			.filter_map(|c| c.pointer("/id").and_then(Value::as_i64))
			.collect();
		assert_eq!(ids, vec![id, other_comment]);

		// -- Exec & Check: delete returns and pushes the removal, then pokes
		//    `post_caption`.
		let body: Value = server
			.post("/api/rpc")
			.json(&rpc("delete_caption_comment", json!({ "id": id })))
			.await
			.json();
		assert_eq!(
			body.pointer("/result/data"),
			Some(&json!({ "id": id, "parent_id": caption_id })),
			"got {body}"
		);
		assert_eq!(
			serde_json::to_value(rx.try_recv().expect("delete pushes"))?,
			json!({
				"event_type": "caption_comment_removal",
				"payload": { "id": id, "parent_id": caption_id },
			})
		);
		let poke = rx.try_recv().expect("delete pokes post_caption");
		assert_eq!(poke.channel().key(), format!("post_caption:{post_id}"));

		// -- Clean (the Post delete cascades its Captions and their Comments)
		clean_posts(&mm, fx_title).await?;
		clean_users(&root, &mm, "test_web_cc_thread").await?;

		Ok(())
	}

	/// A logged-in User likes and unlikes a Caption (#123): `toggle_caption_like`
	/// returns the caller's `LikeView`, and a toggle that changes the Like pokes
	/// `caption_like:{caption_id}` (the count) and `post_caption:{post_id}` (the
	/// Top Captions ranking). A second like is a no-op that pokes nothing.
	/// `get_caption_like` reads the same view. An unknown Caption is rejected
	/// (400) by both RPCs with no poke, and an anonymous caller is rejected (401).
	#[serial]
	#[tokio::test]
	async fn test_web_toggle_caption_like_ok() -> Result<()> {
		// -- Setup & Fixtures
		let mm = _dev_utils::init_test().await;
		let fx_title = "test_web_toggle_caption_like_ok";
		let root = Ctx::root_ctx();
		let post_id = seed_post(&root, &mm, fx_title, &[1]).await?;
		let caption_id = seed_caption(&root, &mm, post_id, "liked caption").await?;
		let toggle = |caption_id: i64, liked: bool| {
			json!({
				"jsonrpc": "2.0", "id": 1, "method": "toggle_caption_like",
				"params": { "data": { "id": caption_id, "liked": liked } }
			})
		};
		let get_like = |caption_id: i64| {
			json!({
				"jsonrpc": "2.0", "id": 1, "method": "get_caption_like",
				"params": { "id": caption_id }
			})
		};
		let ws_state = Arc::new(WsState::new());
		let mut rx = ws_state.tx.subscribe();
		let anon = TestServer::new(app(mm.clone(), ws_state.clone()));
		let mut server = TestServer::new(app(mm.clone(), ws_state.clone()));
		server.save_cookies();
		server
			.post("/api/login")
			.json(&json!({ "username": "demo1", "pwd": "welcome" }))
			.await
			.assert_status_ok();

		// -- Exec & Check: an anonymous caller is rejected.
		anon.post("/api/rpc")
			.json(&toggle(caption_id, true))
			.await
			.assert_status(axum::http::StatusCode::UNAUTHORIZED);

		// -- Exec & Check: an unknown Caption is rejected by both RPCs, and
		//    nothing is poked.
		server
			.post("/api/rpc")
			.json(&toggle(999_999, true))
			.await
			.assert_status(axum::http::StatusCode::BAD_REQUEST);
		server
			.post("/api/rpc")
			.json(&get_like(999_999))
			.await
			.assert_status(axum::http::StatusCode::BAD_REQUEST);
		assert!(rx.try_recv().is_err(), "a rejected toggle must not poke");

		// -- Exec: like twice.
		server
			.post("/api/rpc")
			.json(&toggle(caption_id, true))
			.await;
		let body: Value = server
			.post("/api/rpc")
			.json(&toggle(caption_id, true))
			.await
			.json();

		// -- Check: one Like, liked by the caller.
		assert_eq!(
			body.pointer("/result/data"),
			Some(&json!({ "id": caption_id, "like_count": 1, "liked": true })),
			"got {body}"
		);

		// -- Check: the first like poked the count, then the ranking; the second
		//    like changed nothing, so it poked nothing.
		let like = rx.try_recv().expect("toggle pokes caption_like");
		assert_eq!(like.channel().key(), format!("caption_like:{caption_id}"));
		let ranking = rx.try_recv().expect("toggle pokes post_caption");
		assert_eq!(ranking.channel().key(), format!("post_caption:{post_id}"));
		assert!(rx.try_recv().is_err(), "a no-op toggle must not poke");

		// -- Exec & Check: unlike; `get_caption_like` reads the same view.
		server
			.post("/api/rpc")
			.json(&toggle(caption_id, false))
			.await;
		let body: Value = server
			.post("/api/rpc")
			.json(&get_like(caption_id))
			.await
			.json();
		assert_eq!(
			body.pointer("/result/data"),
			Some(&json!({ "id": caption_id, "like_count": 0, "liked": false })),
			"got {body}"
		);

		// -- Clean (the Post delete cascades its Captions and their Likes)
		clean_posts(&mm, fx_title).await?;

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
				"jsonrpc": "2.0", "id": 1, "method": "create_post",
				"params": { "data": {} }
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
