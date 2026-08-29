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

	// A Rust identifier: leading letter or `_`, then letters/digits/`_`.
	fn is_ident(tok: &str) -> bool {
		let mut chars = tok.chars();
		matches!(chars.next(), Some(c) if c.is_ascii_alphabetic() || c == '_')
			&& chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
	}

	// `src` with every `//` line comment removed, so paren-matching and name
	// extraction never trip on `()` or identifiers that live inside a comment.
	fn strip_line_comments(src: &str) -> String {
		src.lines()
			.map(|l| match l.find("//") {
				Some(i) => &l[..i],
				None => l,
			})
			.collect::<Vec<_>>()
			.join("\n")
	}

	// The text inside the outermost `( ... )` — `after` begins just past the
	// opening paren — plus the remainder after the matching close paren.
	fn balanced_parens(after: &str) -> (&str, &str) {
		let mut depth = 1usize;
		for (i, c) in after.char_indices() {
			match c {
				'(' => depth += 1,
				')' => {
					depth -= 1;
					if depth == 0 {
						return (&after[..i], &after[i + 1..]);
					}
				}
				_ => {}
			}
		}
		(after, "")
	}

	// Handler fn names inside one `router_builder!( ... )` argument, across all
	// three rpc-router syntaxes. In the labeled forms only the `handlers: [ ... ]`
	// group carries fn names; `resources: [ ... ]` is ignored.
	fn handler_idents(args: &str) -> Vec<String> {
		let scope = match args.find("handlers:") {
			Some(h) => {
				let after = &args[h + "handlers:".len()..];
				match (after.find('['), after.find(']')) {
					(Some(o), Some(c)) if c > o => &after[o + 1..c],
					_ => "",
				}
			}
			None => args,
		};
		scope
			.split(|c: char| !c.is_ascii_alphanumeric() && c != '_')
			.filter(|t| is_ident(t))
			.map(str::to_string)
			.collect()
	}

	// Every handler registered via `router_builder!` in this source — across every
	// block and all three call syntaxes (Pattern 1 bare list; Pattern 2/3
	// `handlers: [..]`). Comments are stripped first.
	fn router_builder_names(src: &str) -> Vec<String> {
		let clean = strip_line_comments(src);
		let mut names = Vec::new();
		let mut rest = clean.as_str();
		while let Some(i) = rest.find("router_builder!(") {
			let after = &rest[i + "router_builder!(".len()..];
			let (args, tail) = balanced_parens(after);
			names.extend(handler_idents(args));
			rest = tail;
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

	#[test]
	fn router_builder_names_reads_all_syntaxes_and_blocks() {
		// Pattern 1 (bare list, multi-line + inline), Pattern 2 (handlers +
		// resources), Pattern 3 (handlers only), and two blocks in one file.
		let src = r#"
pub fn a() -> RouterBuilder {
	router_builder!(
		create_a, // trailing comment
		get_a,
	)
}
pub fn b() -> RouterBuilder {
	router_builder!(handlers: [create_b, get_b], resources: [ModelManager {}])
}
pub fn c() -> RouterBuilder {
	router_builder!(handlers: [create_c])
}
pub fn d() -> RouterBuilder { router_builder!(create_d, get_d) }
"#;
		let mut got = router_builder_names(src);
		got.sort();
		assert_eq!(
			got,
			[
				"create_a", "create_b", "create_c", "create_d", "get_a", "get_b",
				"get_d"
			]
		);
		// A resource type must never be read as a handler.
		assert!(!got.iter().any(|n| n == "ModelManager"));
	}
}

// endregion: --- Poke-rule guard (#95)
