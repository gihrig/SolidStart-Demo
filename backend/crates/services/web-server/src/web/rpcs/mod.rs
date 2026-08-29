// region:    --- Modules

pub mod agent_rpc;
pub mod conv_rpc;

use rpc_router::{Router, RouterBuilder};

// endregion: --- Modules

pub fn all_rpc_router_builder() -> RouterBuilder {
	Router::builder()
		.extend(agent_rpc::rpc_router_builder())
		.extend(conv_rpc::rpc_router_builder())
}

// region:    --- Poke-rule guard (#95)

// Guards the Poke rule (CONTEXT.md): every registered create/update/delete/add
// mutation must poke its list feed. The guard reads every `*_rpc.rs` in this
// directory as source text, extracts each `router_builder!` entry, and asserts
// every mutation contains its expected `broadcast_*` call (POKE_TABLE). A new
// mutation — in an existing module or a brand-new `*_rpc.rs` — that has no table
// entry, or that omits its poke, fails the build (#85). Structural, not by memory.
//
// Known limit: it proves the poke call is present in the handler body, not that it
// executes; `fn_body` assumes rustfmt's column-0 closing brace.
#[cfg(test)]
mod poke_rule_guard {
	const MUTATION_PREFIXES: [&str; 4] = ["create_", "update_", "delete_", "add_"];

	// The list-feed poke each mutation must call. The one place the rule is spelled out.
	const POKE_TABLE: &[(&str, &str)] = &[
		("create_conv", "broadcast_conv_update"),
		("update_conv", "broadcast_conv_update"),
		("delete_conv", "broadcast_conv_update"),
		("create_agent", "broadcast_agent_update"),
		("update_agent", "broadcast_agent_update"),
		("delete_agent", "broadcast_agent_update"),
		("add_conv_msg", "broadcast_conv_msg"),
	];

	fn expected_poke(mutation: &str) -> Option<&'static str> {
		POKE_TABLE
			.iter()
			.find(|&&(name, _)| name == mutation)
			.map(|&(_, poke)| poke)
	}

	fn is_mutation(name: &str) -> bool {
		MUTATION_PREFIXES.iter().any(|p| name.starts_with(p))
	}

	// The identifiers listed inside the file's `router_builder!( ... )` block.
	fn router_builder_names(src: &str) -> Vec<String> {
		let mut names = Vec::new();
		let mut in_block = false;
		for line in src.lines() {
			let t = line.trim();
			if !in_block {
				if t.contains("router_builder!(") {
					in_block = true;
				}
				continue;
			}
			if t.starts_with(')') {
				break;
			}
			if t.starts_with("//") || t.is_empty() {
				continue;
			}
			names.push(t.trim_end_matches(',').trim().to_string());
		}
		names
	}

	// The body text of `fn <name>( ... )`, from the signature to the next column-0 `}`.
	fn fn_body<'a>(src: &'a str, name: &str) -> Option<&'a str> {
		let start = src.find(&format!("fn {name}("))?;
		let rest = &src[start..];
		let end = rest.find("\n}").map(|i| i + 2).unwrap_or(rest.len());
		Some(&rest[..end])
	}

	// Poke-rule violations for one source file. Empty when the file is clean.
	fn violations(
		file: &str,
		src: &str,
		expected: impl Fn(&str) -> Option<&'static str>,
	) -> Vec<String> {
		let mut out = Vec::new();
		for name in router_builder_names(src) {
			if !is_mutation(&name) {
				continue;
			}
			let Some(poke) = expected(&name) else {
				out.push(format!(
					"{file}: `{name}` is a mutation with no expected poke. \
					 Add it to `expected_poke` (CONTEXT.md \"Poke rule\", #85)."
				));
				continue;
			};
			match fn_body(src, &name) {
				Some(body) if body.contains(poke) => {}
				Some(_) => out.push(format!(
					"{file}: `{name}` must call `{poke}` but does not \
					 (CONTEXT.md \"Poke rule\", #85)."
				)),
				None => {
					out.push(format!("{file}: could not find `fn {name}(` body."))
				}
			}
		}
		out
	}

	// Every `*_rpc.rs` in this directory, read at test time so a new rpc module is
	// scanned automatically — the scan set cannot drift from the real modules.
	fn rpc_sources() -> Vec<(String, String)> {
		let dir =
			std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/web/rpcs");
		let mut out = Vec::new();
		for entry in std::fs::read_dir(&dir).expect("read rpcs dir") {
			let path = entry.expect("rpcs dir entry").path();
			let name = path.file_name().unwrap().to_string_lossy().into_owned();
			if name.ends_with("_rpc.rs") {
				let src = std::fs::read_to_string(&path).expect("read rpc source");
				out.push((name, src));
			}
		}
		out
	}

	#[test]
	fn every_registered_mutation_pokes_its_list_feed() {
		let files = rpc_sources();
		assert!(!files.is_empty(), "no *_rpc.rs sources found to scan");

		// Non-vacuity: the scan must actually see every table mutation. This guards
		// against a `router_builder!` parse regression turning the test below into a
		// silent pass.
		let scanned: Vec<String> = files
			.iter()
			.flat_map(|(_, src)| router_builder_names(src))
			.collect();
		for &(name, _) in POKE_TABLE {
			assert!(
				scanned.iter().any(|s| s.as_str() == name),
				"Poke guard is not scanning `{name}` — the router_builder! parse may have regressed."
			);
		}

		let found: Vec<String> = files
			.iter()
			.flat_map(|(file, src)| violations(file, src, expected_poke))
			.collect();
		assert!(
			found.is_empty(),
			"Poke-rule violations found:\n{}",
			found.join("\n")
		);
	}

	// The guard must bite. The next two prove it flags both failure modes on
	// synthetic source, so a real regression cannot pass silently.

	#[test]
	fn flags_a_mutation_that_forgot_its_poke() {
		let src = r#"
pub fn rpc_router_builder() -> RouterBuilder {
	router_builder!(
		create_widget,
		get_widget,
	)
}
pub async fn create_widget(params: X) -> Y {
	let id = WidgetBmc::create(&ctx, &mm, data).await;
	Ok(id.into())
}
"#;
		let out = violations("fake.rs", src, |m| {
			(m == "create_widget").then_some("broadcast_widget_update")
		});
		assert_eq!(out.len(), 1, "expected one violation, got: {out:?}");
		assert!(out[0].contains("create_widget"));
		assert!(out[0].contains("broadcast_widget_update"));
	}

	#[test]
	fn flags_a_mutation_absent_from_the_table() {
		let src = r#"
pub fn rpc_router_builder() -> RouterBuilder {
	router_builder!(
		delete_widget,
	)
}
pub async fn delete_widget(params: X) -> Y {
	ws_state.broadcast_widget_update();
	Ok(())
}
"#;
		let out = violations("fake.rs", src, |_| None);
		assert_eq!(out.len(), 1, "expected one violation, got: {out:?}");
		assert!(out[0].contains("no expected poke"));
	}
}

// endregion: --- Poke-rule guard (#95)
