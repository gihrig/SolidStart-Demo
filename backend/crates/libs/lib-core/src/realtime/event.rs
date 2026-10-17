use super::channel::Channel;
use crate::model::comment::{CommentRemoval, CommentView};
use serde::Serialize;
use ts_rs::TS;

/// The realtime feed envelope, a discriminated union tagged by `event_type`
/// (internal serde tagging). ts-rs exports it, so the front-end narrows on the
/// tag and reads a typed payload — no cast. Every contentless poke is one
/// `Poke` variant carrying its [`Channel`] (#85): the poke pushes no domain
/// row, only the id its routing key needs, held inside the `Channel`. A
/// subscriber refetches through the scoped `list_*` RPC. The two Jedi comment
/// channels (`post_comment`, `caption_comment`) push a payload. A Post Comment
/// add or edit pushes `post_comment` (a `CommentView`), and a delete pushes
/// `post_comment_removal` (a `CommentRemoval`: the id and `parent_id`) (#124,
/// #125). A Caption Comment pushes `caption_comment` and
/// `caption_comment_removal` in the same shapes (#127). The routing `Channel`
/// is derived from the event (see the `channel` method below), not carried as a
/// separate field: a payload event reads it from the payload, a poke carries it
/// (ADR-0020).
#[derive(Clone, Debug, Serialize, TS)]
#[serde(tag = "event_type")]
#[ts(export, export_to = "WsEvent.d.ts")]
pub enum WsEvent {
	/// A Post Comment was added or edited (#124): an upsert of its view (#125).
	#[serde(rename = "post_comment")]
	PostComment { payload: CommentView },
	/// A Post Comment was deleted (#124): a removal by id.
	#[serde(rename = "post_comment_removal")]
	PostCommentRemoval { payload: CommentRemoval },
	/// A Caption Comment was added or edited (#127): an upsert of its view.
	#[serde(rename = "caption_comment")]
	CaptionComment { payload: CommentView },
	/// A Caption Comment was deleted (#127): a removal by id.
	#[serde(rename = "caption_comment_removal")]
	CaptionCommentRemoval { payload: CommentRemoval },
	/// A contentless poke on its [`Channel`]. It replaces the former
	/// one-variant-per-poke set (`posts` / `post_like` / `caption_like` /
	/// `post_caption`), so adding a poke channel touches only [`Channel`] — the
	/// hand-written variant→variant map is gone (ADR-0020).
	#[serde(rename = "poke")]
	Poke(Channel),
}

impl WsEvent {
	/// The [`Channel`] this event is addressed to. A payload event derives it from
	/// the payload (a Comment event reads `payload.parent_id`); a poke carries it.
	/// The send task matches its key against a connection's authorized subscription
	/// set (ADR-0015).
	pub fn channel(&self) -> Channel {
		match self {
			WsEvent::PostComment { payload } => {
				Channel::PostComment(payload.parent_id)
			}
			WsEvent::PostCommentRemoval { payload } => {
				Channel::PostComment(payload.parent_id)
			}
			WsEvent::CaptionComment { payload } => {
				Channel::CaptionComment(payload.parent_id)
			}
			WsEvent::CaptionCommentRemoval { payload } => {
				Channel::CaptionComment(payload.parent_id)
			}
			WsEvent::Poke(channel) => *channel,
		}
	}
}

// region:    --- Tests

#[cfg(test)]
mod tests {
	use super::*;

	/// Wire-lock for the envelope the front-end parses (ADR-0010, ADR-0020).
	/// Internal tagging puts `event_type` at the top level; a poke flattens its
	/// `Channel` (`kind`, plus `id` where the channel carries one) alongside the
	/// tag. This guards a serde-shape drift the generated `.d.ts` cannot show.
	#[test]
	fn wsevent_wire_shape_is_stable() {
		// Pokes: `event_type` plus the flattened `Channel`.
		assert_eq!(
			serde_json::to_value(WsEvent::Poke(Channel::Posts)).unwrap(),
			serde_json::json!({ "event_type": "poke", "kind": "posts" }),
		);
		assert_eq!(
			serde_json::to_value(WsEvent::Poke(Channel::PostLike(5))).unwrap(),
			serde_json::json!({ "event_type": "poke", "kind": "post_like", "id": 5 }),
		);
	}

	/// Wire-lock for the two Post Comment payload events (#124): an upsert carries
	/// the `CommentView`, a removal the `CommentRemoval` (#125).
	#[test]
	fn post_comment_events_wire_shape_is_stable() {
		let v = serde_json::to_value(WsEvent::PostComment {
			payload: post_comment(3, 7),
		})
		.unwrap();
		assert_eq!(v["event_type"].as_str(), Some("post_comment"));
		assert_eq!(v["payload"]["id"].as_i64(), Some(3));
		assert_eq!(v["payload"]["parent_id"].as_i64(), Some(7));
		assert_eq!(v["payload"]["author"]["name"].as_str(), Some("Lisa"));
		assert_eq!(v["payload"]["content_html"].as_str(), Some("<p>hi</p>"));
		assert!(v["payload"].get("cid").is_none(), "no actor id on the wire");

		assert_eq!(
			serde_json::to_value(WsEvent::PostCommentRemoval {
				payload: CommentRemoval {
					id: 3,
					parent_id: 7
				},
			})
			.unwrap(),
			serde_json::json!({
				"event_type": "post_comment_removal",
				"payload": { "id": 3, "parent_id": 7 },
			}),
		);
	}

	/// Both Post Comment events route on their Post's thread Channel, read from
	/// the payload's `parent_id` (ADR-0020, #124, #125).
	#[test]
	fn post_comment_events_route_on_the_post_thread() {
		assert_eq!(
			WsEvent::PostComment {
				payload: post_comment(3, 7),
			}
			.channel()
			.key(),
			"post_comment:7"
		);
		assert_eq!(
			WsEvent::PostCommentRemoval {
				payload: CommentRemoval {
					id: 3,
					parent_id: 7
				},
			}
			.channel()
			.key(),
			"post_comment:7"
		);
	}

	/// Both Caption Comment events route on their Caption's thread Channel, read
	/// from the payload's `parent_id`, as the Post ones do (#127).
	#[test]
	fn caption_comment_events_route_on_the_caption_thread() {
		let upsert = WsEvent::CaptionComment {
			payload: post_comment(3, 7),
		};
		assert_eq!(
			serde_json::to_value(&upsert).unwrap()["event_type"].as_str(),
			Some("caption_comment")
		);
		assert_eq!(upsert.channel().key(), "caption_comment:7");

		let removal = WsEvent::CaptionCommentRemoval {
			payload: CommentRemoval {
				id: 3,
				parent_id: 7,
			},
		};
		assert_eq!(
			serde_json::to_value(&removal).unwrap(),
			serde_json::json!({
				"event_type": "caption_comment_removal",
				"payload": { "id": 3, "parent_id": 7 },
			}),
		);
		assert_eq!(removal.channel().key(), "caption_comment:7");
	}

	fn post_comment(id: i64, parent_id: i64) -> CommentView {
		use crate::model::user::AuthorRef;
		use time::OffsetDateTime;
		CommentView {
			id,
			parent_id,
			author: AuthorRef {
				id: 2,
				name: "Lisa".to_string(),
				avatar_url: None,
			},
			content_html: "<p>hi</p>".to_string(),
			ctime: OffsetDateTime::UNIX_EPOCH,
			mtime: OffsetDateTime::UNIX_EPOCH,
		}
	}

	/// The routing key is derived from the event, not carried by hand (ADR-0020): a
	/// poke reads it from its `Channel`, a Comment event from its payload (the
	/// payload cases are the comment-thread tests above).
	#[test]
	fn wsevent_channel_derives_the_routing_key() {
		assert_eq!(WsEvent::Poke(Channel::Posts).channel().key(), "posts");
		assert_eq!(
			WsEvent::Poke(Channel::PostLike(5)).channel().key(),
			"post_like:5"
		);
	}
}

// endregion: --- Tests
