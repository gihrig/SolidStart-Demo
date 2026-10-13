//! The shared Comment shapes (#125). A Post Comment uses them now; a Caption
//! Comment reuses them (#127). `parent_id` is the id of the Post or Caption that
//! holds the thread.

use crate::model::base::PublicProjection;
use crate::model::user::AuthorRef;
use lib_utils::time::Rfc3339;
use modql::field::Fields;
use serde::Serialize;
use serde_with::serde_as;
use sqlx::FromRow;
use std::collections::HashSet;
use std::sync::LazyLock;
use time::OffsetDateTime;
use ts_rs::TS;

// region:    --- Comment Types

/// The enriched **public projection** of a Comment (ADR-0021): the author
/// snapshot, the rendered content and the times. The thread read, the write results
/// and the upsert Event all carry it. It carries no actor ids (`cid` / `mid`).
/// It carries `ctime` and `mtime` because the UI shows them: the time of the
/// Comment, and the "(edited)" mark (ADR-0021 addendum).
///
/// `content_html` is the stored markdown, rendered to sanitized HTML on read
/// (`render_comment_html`, ADR-0019 addendum). A consumer injects it as HTML,
/// through its own backstop. No public read carries the stored text: the
/// Owner's edit form reads it as a `CommentSource`.
#[serde_as]
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "CommentView.d.ts")]
pub struct CommentView {
	pub id: i64,

	// -- Relations
	pub parent_id: i64,

	// -- Author snapshot (owner_id resolved to a public identity)
	pub author: AuthorRef,

	// -- Properties
	pub content_html: String,

	// -- Times (shown by the UI)
	#[serde_as(as = "Rfc3339")]
	#[ts(type = "string")]
	pub ctime: OffsetDateTime,
	#[serde_as(as = "Rfc3339")]
	#[ts(type = "string")]
	pub mtime: OffsetDateTime,
}

impl PublicProjection for CommentView {}

/// A removed Comment: the delete result and the removal Event payload. It
/// carries the `parent_id` because the Event derives its Channel from the
/// payload (ADR-0020).
#[derive(Debug, Clone, Copy, Serialize, TS)]
#[ts(export, export_to = "CommentRemoval.d.ts")]
pub struct CommentRemoval {
	pub id: i64,
	pub parent_id: i64,
}

/// The stored text of one Comment, for its Owner's edit form (#126): the
/// `get_post_comment` result. It is **not** a `PublicProjection`: only an
/// owner-scoped read (`base::get_writable`) returns it, so no public read and
/// no push carries the stored text.
#[derive(Debug, Clone, Fields, FromRow, Serialize, TS)]
#[ts(export, export_to = "CommentSource.d.ts")]
pub struct CommentSource {
	pub id: i64,
	pub content: String,
}

// endregion: --- Comment Types

// region:    --- Comment Render

/// The Comment HTML policy (ADR-0019 addendum, #126): the one allow-list for
/// the server render (ammonia) and the client backstop (`neosanitize`, through
/// the generated `CommentHtmlPolicy.ts`).
pub struct CommentHtmlPolicy {
	/// The allowed tags. Every other tag is removed and its text kept, except
	/// `script` and `style`, which lose their content too.
	pub tags: &'static [&'static str],
	/// The allowed attributes, per tag. `class` is not here: `classes` owns it.
	pub tag_attributes: &'static [(&'static str, &'static [&'static str])],
	/// The allowed classes, per tag: the six heading classes, on `p` only.
	pub classes: &'static [(&'static str, &'static [&'static str])],
	/// The allowed `href` schemes. A relative URL is removed.
	pub url_schemes: &'static [&'static str],
	/// The `rel` that each link gets.
	pub link_rel: &'static str,
	/// The `target` that each link gets.
	pub link_target: &'static str,
}

pub const COMMENT_HTML_POLICY: CommentHtmlPolicy = CommentHtmlPolicy {
	tags: &[
		"p",
		"br",
		"strong",
		"em",
		"code",
		"pre",
		"blockquote",
		"ul",
		"ol",
		"li",
		"a",
		"hr",
	],
	tag_attributes: &[("a", &["href"])],
	classes: &[("p", &["md-h1", "md-h2", "md-h3", "md-h4", "md-h5", "md-h6"])],
	url_schemes: &["http", "https", "mailto"],
	link_rel: "noopener noreferrer nofollow ugc",
	link_target: "_blank",
};

/// The ammonia cleaner, built once from `COMMENT_HTML_POLICY`. It starts from
/// `Builder::empty()` and sets each list, so no ammonia default applies.
static COMMENT_CLEANER: LazyLock<ammonia::Builder<'static>> = LazyLock::new(|| {
	let policy = &COMMENT_HTML_POLICY;
	let per_tag = |lists: &'static [(&'static str, &'static [&'static str])]| {
		lists
			.iter()
			.map(|(tag, items)| (*tag, items.iter().copied().collect()))
			.collect()
	};
	let mut cleaner = ammonia::Builder::empty();
	cleaner
		.tags(policy.tags.iter().copied().collect())
		.clean_content_tags(HashSet::from(["script", "style"]))
		.generic_attributes(HashSet::new())
		.tag_attributes(per_tag(policy.tag_attributes))
		.allowed_classes(per_tag(policy.classes))
		.url_schemes(policy.url_schemes.iter().copied().collect())
		.url_relative(ammonia::UrlRelative::Deny)
		.link_rel(Some(policy.link_rel))
		.set_tag_attribute_value("a", "target", policy.link_target)
		.strip_comments(true);
	cleaner
});

/// Render a Comment's stored markdown to sanitized HTML (#126): the
/// `CommentView.content_html`. `markdown` renders CommonMark with the default
/// options, so it escapes each `<` that a user types. Each heading then
/// becomes `<p class="md-hN">`, so user text never enters the page's heading
/// outline. ammonia then cleans the HTML under `COMMENT_HTML_POLICY`.
pub fn render_comment_html(content: &str) -> String {
	let html = markdown::to_html(content);
	COMMENT_CLEANER
		.clean(&headings_to_paragraphs(&html))
		.to_string()
}

/// Change each `<hN>` and `</hN>` that `markdown` made into `<p class="md-hN">`
/// and `</p>`. The string change is safe: `markdown` escapes each `<` in user
/// text, so each `<hN>` here is a tag that `markdown` wrote. The exact
/// `markdown` pin and the render tests guard its output format.
fn headings_to_paragraphs(html: &str) -> String {
	(1..=6).fold(html.to_string(), |html, n| {
		html.replace(&format!("<h{n}>"), &format!("<p class=\"md-h{n}\">"))
			.replace(&format!("</h{n}>"), "</p>")
	})
}

// endregion: --- Comment Render

// region:    --- Tests

#[cfg(test)]
mod tests {
	use super::*;

	/// Wire-lock for `CommentView`: exactly the public keys, with the author
	/// snapshot and RFC 3339 times. No actor id (`cid` / `mid`) and no
	/// `owner_id` (ADR-0021 addendum).
	#[test]
	fn test_comment_view_wire_shape() {
		let view = CommentView {
			id: 3,
			parent_id: 7,
			author: AuthorRef {
				id: 2,
				name: "Lisa".to_string(),
				avatar_url: None,
			},
			content_html: "<p>hi</p>".to_string(),
			ctime: OffsetDateTime::UNIX_EPOCH,
			mtime: OffsetDateTime::UNIX_EPOCH,
		};
		assert_eq!(
			serde_json::to_value(&view).unwrap(),
			serde_json::json!({
				"id": 3,
				"parent_id": 7,
				"author": { "id": 2, "name": "Lisa", "avatar_url": null },
				"content_html": "<p>hi</p>",
				"ctime": "1970-01-01T00:00:00Z",
				"mtime": "1970-01-01T00:00:00Z",
			})
		);
	}

	// -- The render (#126): markdown, the heading change, then ammonia.

	#[test]
	fn test_render_bold() {
		assert_eq!(
			render_comment_html("**bold**"),
			"<p><strong>bold</strong></p>"
		);
	}

	#[test]
	fn test_render_javascript_link_has_no_javascript_href() {
		let html = render_comment_html("[x](javascript:alert(1))");
		assert!(!html.contains("javascript:"), "got {html}");
		assert!(!html.contains("href"), "got {html}");
	}

	/// A link keeps only an `http`, `https` or `mailto` href: a relative URL
	/// has no scheme, so it is removed.
	#[test]
	fn test_render_relative_link_has_no_href() {
		assert_eq!(render_comment_html("[x](/y)"), "<p><a target=\"_blank\" rel=\"noopener noreferrer nofollow ugc\">x</a></p>");
	}

	#[test]
	fn test_render_typed_html_stays_escaped_text() {
		assert_eq!(
			render_comment_html("<script>alert(1)</script>"),
			"&lt;script&gt;alert(1)&lt;/script&gt;"
		);
		assert_eq!(render_comment_html("<h1>x</h1>"), "&lt;h1&gt;x&lt;/h1&gt;");
	}

	#[test]
	fn test_render_headings_become_classed_paragraphs() {
		assert_eq!(
			render_comment_html("# Title"),
			"<p class=\"md-h1\">Title</p>"
		);
		assert_eq!(
			render_comment_html("Title\n==="),
			"<p class=\"md-h1\">Title</p>"
		);
		assert_eq!(
			render_comment_html("###### Six"),
			"<p class=\"md-h6\">Six</p>"
		);
	}

	#[test]
	fn test_render_heading_inside_code_block_stays_code() {
		assert_eq!(
			render_comment_html("```\n# x\n```"),
			"<pre><code># x\n</code></pre>"
		);
	}

	#[test]
	fn test_render_image_gives_no_img() {
		let html = render_comment_html("![a](https://x.example/y.png)");
		assert!(!html.contains("<img"), "got {html}");
	}

	#[test]
	fn test_render_link_gets_rel_and_target() {
		assert_eq!(
			render_comment_html("[x](https://x.example/)"),
			"<p><a href=\"https://x.example/\" target=\"_blank\" \
			 rel=\"noopener noreferrer nofollow ugc\">x</a></p>"
		);
	}

	#[test]
	fn test_render_class_not_in_policy_is_removed() {
		// A fenced code block's info string gives `class="language-rust"`.
		assert_eq!(
			render_comment_html("```rust\nfn x() {}\n```"),
			"<pre><code>fn x() {}\n</code></pre>"
		);
	}

	#[test]
	fn test_render_single_newline_stays_inside_p() {
		assert_eq!(
			render_comment_html("line one\nline two"),
			"<p>line one\nline two</p>"
		);
	}

	/// Write `bindings/CommentHtmlPolicy.ts`: `COMMENT_HTML_POLICY` as a TS
	/// value, for the client's `neosanitize` backstop (#126). `cgs bindings`
	/// runs it, and the CI bindings-drift guard checks the file, so a change on
	/// one side only fails CI.
	#[test]
	fn export_bindings_comment_html_policy() -> Result<(), Box<dyn std::error::Error>>
	{
		let policy = &COMMENT_HTML_POLICY;
		let per_tag = |lists: &[(&str, &[&str])]| -> serde_json::Map<String, serde_json::Value> {
			lists
				.iter()
				.map(|(tag, items)| (tag.to_string(), serde_json::json!(items)))
				.collect()
		};
		let value = serde_json::json!({
			"tags": policy.tags,
			"tag_attributes": per_tag(policy.tag_attributes),
			"classes": per_tag(policy.classes),
			"url_schemes": policy.url_schemes,
			"link_rel": policy.link_rel,
			"link_target": policy.link_target,
		});

		let out = format!(
			"// This file was generated by `export_bindings_comment_html_policy` \
			 (lib-core `model/comment.rs`, #126). Do not edit this file manually.\n\n\
			 /** The Comment HTML policy (ADR-0019 addendum): ammonia on the server \
			 and the `neosanitize` backstop on the client read it. */\n\
			 export const COMMENT_HTML_POLICY = {} as const;\n",
			serde_json::to_string_pretty(&value)?
		);

		let cfg = ts_rs::Config::from_env();
		std::fs::write(cfg.out_dir().join("CommentHtmlPolicy.ts"), out)?;
		Ok(())
	}

	/// Wire-lock for `CommentSource` (#126): the Comment id and the stored
	/// text, nothing else.
	#[test]
	fn test_comment_source_wire_shape() {
		let source = CommentSource {
			id: 3,
			content: "**hi**".to_string(),
		};
		assert_eq!(
			serde_json::to_value(&source).unwrap(),
			serde_json::json!({ "id": 3, "content": "**hi**" })
		);
	}

	/// Wire-lock for the removal payload: the Comment id and its `parent_id`,
	/// nothing else.
	#[test]
	fn test_comment_removal_wire_shape() {
		assert_eq!(
			serde_json::to_value(CommentRemoval {
				id: 3,
				parent_id: 7
			})
			.unwrap(),
			serde_json::json!({ "id": 3, "parent_id": 7 })
		);
	}
}

// endregion: --- Tests
