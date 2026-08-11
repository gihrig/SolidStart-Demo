#![allow(unused)] // For example code.

pub type Result<T> = core::result::Result<T, Error>;
pub type Error = Box<dyn std::error::Error>; // For examples.

use serde_json::{json, Value};

#[tokio::main]
async fn main() -> Result<()> {
	let hc = httpc_test::new_client("http://localhost:8080")?;

	// hc.do_get("/index.html").await?.print().await?;

	// 1. Login
	let req_login = hc.do_post(
		"/api/login",
		json!({
			"username": "demo1",
			"pwd": "welcome"
		}),
	);
	req_login.await?.print().await?;

	// 2. Create Agent
	let req_create_agent = hc.do_post(
		"/api/rpc",
		json!({
			"jsonrpc": "2.0",
			"id": 1,
			"method": "create_agent",
			"params": {
				"data": {
					"name": "agent AAA"
				}
			}
		}),
	);
	let result = req_create_agent.await?;
	result.print().await?;
	// Extract agent_id
	let agent_id = result.json_value::<i64>("/result/data/id")?;

	// 3. Get Agent
	let req_get_agent = hc.do_post(
		"/api/rpc",
		json!({
			"jsonrpc": "2.0",
			"id": 1,
			"method": "get_agent",
			"params": {
					"id": agent_id
			}
		}),
	);
	let result = req_get_agent.await?;
	result.print().await?;

	// 4. Create Conversation
	let req_create_conv = hc.do_post(
		"/api/rpc",
		json!({
			"jsonrpc": "2.0",
			"id": 1,
			"method": "create_conv",
			"params": {
				"data": {
					"agent_id": agent_id,
					"title": "conv 01"
				}
			}
		}),
	);
	let result = req_create_conv.await?;
	result.print().await?;
	// Extract conv_id
	let conv_id = result.json_value::<i64>("/result/data/id")?;

	// 5. Add Conv Message
	let req_create_conv = hc.do_post(
		"/api/rpc",
		json!({
			"jsonrpc": "2.0",
			"id": 1,
			"method": "add_conv_msg",
			"params": {
				"data": {
					"conv_id": conv_id,
					"content": "This is the first comment"
				}
			}
		}),
	);
	let result = req_create_conv.await?;
	result.print().await?;
	// Extract conv_msg_id
	let conv_msg_id = result.json_value::<i64>("/result/data/id")?;

	// 6. Logoff
	let req_logoff = hc.do_post(
		"/api/logoff",
		json!({
			"logoff": true
		}),
	);
	req_logoff.await?.print().await?;

	Ok(())
}
