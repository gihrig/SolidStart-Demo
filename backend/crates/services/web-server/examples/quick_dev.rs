#![allow(unused)] // For example code.

pub type Result<T> = core::result::Result<T, Error>;
pub type Error = Box<dyn std::error::Error>; // For examples.

use serde_json::{json, Value};

#[tokio::main]
async fn main() -> Result<()> {
	let hc = httpc_test::new_client("http://localhost:8080")?;

	// 1. Login
	let req_login = hc.do_post(
		"/api/login",
		json!({
			"username": "demo1",
			"pwd": "welcome"
		}),
	);
	req_login.await?.print().await?;

	// 2. Create Post
	let req_create_post = hc.do_post(
		"/api/rpc",
		json!({
			"jsonrpc": "2.0",
			"id": 1,
			"method": "create_post",
			"params": {
				"data": {
					"title": "quick_dev post",
					"image_src": "https://example.com/quick_dev.jpg",
					"image_alt": "A quick_dev photo",
					"photographer": "quick_dev",
					"photographer_url": "https://example.com/quick_dev/",
					"source_url": "https://example.com/quick_dev/1/",
					"category_ids": [1]
				}
			}
		}),
	);
	let result = req_create_post.await?;
	result.print().await?;
	// Extract post_id
	let post_id = result.json_value::<i64>("/result/data/id")?;

	// 3. Add Caption
	let req_add_caption = hc.do_post(
		"/api/rpc",
		json!({
			"jsonrpc": "2.0",
			"id": 1,
			"method": "add_caption",
			"params": {
				"data": {
					"post_id": post_id,
					"text": "The first caption"
				}
			}
		}),
	);
	let result = req_add_caption.await?;
	result.print().await?;
	// Extract caption_id
	let caption_id = result.json_value::<i64>("/result/data/id")?;

	// 4. Add Post Comment
	let req_add_post_comment = hc.do_post(
		"/api/rpc",
		json!({
			"jsonrpc": "2.0",
			"id": 1,
			"method": "add_post_comment",
			"params": {
				"data": {
					"post_id": post_id,
					"content": "This is the first comment"
				}
			}
		}),
	);
	let result = req_add_post_comment.await?;
	result.print().await?;
	// Extract post_comment_id
	let post_comment_id = result.json_value::<i64>("/result/data/id")?;

	// 5. Logoff
	let req_logoff = hc.do_post(
		"/api/logoff",
		json!({
			"logoff": true
		}),
	);
	req_logoff.await?.print().await?;

	Ok(())
}
