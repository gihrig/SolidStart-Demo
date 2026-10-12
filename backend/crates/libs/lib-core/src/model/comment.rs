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
use time::OffsetDateTime;
use ts_rs::TS;

// region:    --- Comment Types

/// The enriched **public projection** of a Comment (ADR-0021): the author
/// snapshot, the raw content and the times. The thread read, the write results
/// and the upsert Event all carry it. It carries no actor ids (`cid` / `mid`).
/// It carries `ctime` and `mtime` because the UI shows them: the time of the
/// Comment, and the "(edited)" mark (ADR-0021 addendum).
///
/// `content` is the raw text after write-path hygiene. The server never
/// HTML-escapes it (ADR-0019), so a consumer shows it as text.
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
	pub content: String,

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
			content: "hi".to_string(),
			ctime: OffsetDateTime::UNIX_EPOCH,
			mtime: OffsetDateTime::UNIX_EPOCH,
		};
		assert_eq!(
			serde_json::to_value(&view).unwrap(),
			serde_json::json!({
				"id": 3,
				"parent_id": 7,
				"author": { "id": 2, "name": "Lisa", "avatar_url": null },
				"content": "hi",
				"ctime": "1970-01-01T00:00:00Z",
				"mtime": "1970-01-01T00:00:00Z",
			})
		);
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
