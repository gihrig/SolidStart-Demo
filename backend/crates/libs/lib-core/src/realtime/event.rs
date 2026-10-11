use super::channel::Channel;
use crate::model::conv_msg::ConvMsg;
use crate::model::post_comment::{PostComment, PostCommentRemoval};
use serde::Serialize;
use ts_rs::TS;

/// The realtime feed envelope, a discriminated union tagged by `event_type`
/// (internal serde tagging). ts-rs exports it, so the front-end narrows on the
/// tag and reads a typed payload — no cast. `conv_msg` carries the new `ConvMsg`.
/// Every contentless poke is one `Poke` variant carrying its [`Channel`] (#85):
/// the poke pushes no domain row, only the id its routing key needs, held inside
/// the `Channel`. A subscriber refetches through the scoped `list_*` RPC. The two
/// Jedi comment channels (`post_comment`, `caption_comment`) push a payload. A
/// Post Comment add or edit pushes `post_comment` (the row), and a delete pushes
/// `post_comment_removal` (the id and `post_id`) (#124); #125 changes the row to
/// a `CommentView`. `caption_comment` stays subscribe-only until #127. The
/// routing `Channel` is derived from the event (see the `channel` method below),
/// not carried as a separate field: a payload event reads it from the payload, a
/// poke carries it (ADR-0020).
#[derive(Clone, Debug, Serialize, TS)]
#[serde(tag = "event_type")]
#[ts(export, export_to = "WsEvent.d.ts")]
pub enum WsEvent {
	#[serde(rename = "conv_msg")]
	ConvMsg { payload: ConvMsg },
	/// A Post Comment was added or edited (#124): an upsert of the row.
	#[serde(rename = "post_comment")]
	PostComment { payload: PostComment },
	/// A Post Comment was deleted (#124): a removal by id.
	#[serde(rename = "post_comment_removal")]
	PostCommentRemoval { payload: PostCommentRemoval },
	/// A contentless poke on its [`Channel`]. It replaces the former
	/// one-variant-per-poke set (`agent_update` / `conv_update` / `posts` /
	/// `post_like` / `caption_like` / `post_caption`), so adding a poke channel
	/// touches only [`Channel`] — the hand-written variant→variant map is gone
	/// (ADR-0020).
	#[serde(rename = "poke")]
	Poke(Channel),
}

impl WsEvent {
	/// The [`Channel`] this event is addressed to. A payload event derives it from
	/// the payload (`conv_msg` reads `payload.conv_id`, a Post Comment event reads
	/// `payload.post_id`); a poke carries it. The send
	/// task matches its key against a connection's authorized subscription set
	/// (ADR-0015).
	pub fn channel(&self) -> Channel {
		match self {
			WsEvent::ConvMsg { payload } => Channel::Conv(payload.conv_id),
			WsEvent::PostComment { payload } => {
				Channel::PostComment(payload.post_id)
			}
			WsEvent::PostCommentRemoval { payload } => {
				Channel::PostComment(payload.post_id)
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
		use time::OffsetDateTime;

		// Pokes: `event_type` plus the flattened `Channel`.
		assert_eq!(
			serde_json::to_value(WsEvent::Poke(Channel::Agents)).unwrap(),
			serde_json::json!({ "event_type": "poke", "kind": "agents" }),
		);
		assert_eq!(
			serde_json::to_value(WsEvent::Poke(Channel::Convs)).unwrap(),
			serde_json::json!({ "event_type": "poke", "kind": "convs" }),
		);
		assert_eq!(
			serde_json::to_value(WsEvent::Poke(Channel::Posts)).unwrap(),
			serde_json::json!({ "event_type": "poke", "kind": "posts" }),
		);
		assert_eq!(
			serde_json::to_value(WsEvent::Poke(Channel::PostLike(5))).unwrap(),
			serde_json::json!({ "event_type": "poke", "kind": "post_like", "id": 5 }),
		);

		// Payload: `event_type` plus the typed `ConvMsg`.
		let msg = ConvMsg {
			id: 1,
			conv_id: 7,
			user_id: 2,
			content: "hi".to_string(),
			cid: 2,
			ctime: OffsetDateTime::UNIX_EPOCH,
			mid: 2,
			mtime: OffsetDateTime::UNIX_EPOCH,
		};
		let v = serde_json::to_value(WsEvent::ConvMsg { payload: msg }).unwrap();
		assert_eq!(v["event_type"].as_str(), Some("conv_msg"));
		assert_eq!(v["payload"]["conv_id"].as_i64(), Some(7));
	}

	/// Wire-lock for the two Post Comment payload events (#124): an upsert carries
	/// the `PostComment` row, a removal carries the Comment id and its `post_id`.
	#[test]
	fn post_comment_events_wire_shape_is_stable() {
		let v = serde_json::to_value(WsEvent::PostComment {
			payload: post_comment(3, 7),
		})
		.unwrap();
		assert_eq!(v["event_type"].as_str(), Some("post_comment"));
		assert_eq!(v["payload"]["id"].as_i64(), Some(3));
		assert_eq!(v["payload"]["post_id"].as_i64(), Some(7));
		assert_eq!(v["payload"]["content"].as_str(), Some("hi"));

		assert_eq!(
			serde_json::to_value(WsEvent::PostCommentRemoval {
				payload: PostCommentRemoval { id: 3, post_id: 7 },
			})
			.unwrap(),
			serde_json::json!({
				"event_type": "post_comment_removal",
				"payload": { "id": 3, "post_id": 7 },
			}),
		);
	}

	/// Both Post Comment events route on their Post's thread Channel, read from
	/// the payload (ADR-0020, #124).
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
				payload: PostCommentRemoval { id: 3, post_id: 7 },
			}
			.channel()
			.key(),
			"post_comment:7"
		);
	}

	fn post_comment(id: i64, post_id: i64) -> PostComment {
		use time::OffsetDateTime;
		PostComment {
			id,
			post_id,
			owner_id: 2,
			content: "hi".to_string(),
			cid: 2,
			ctime: OffsetDateTime::UNIX_EPOCH,
			mid: 2,
			mtime: OffsetDateTime::UNIX_EPOCH,
		}
	}

	/// The routing key is derived from the event, not carried by hand (ADR-0020): a
	/// poke reads it from its `Channel`, a `conv_msg` from its payload.
	#[test]
	fn wsevent_channel_derives_the_routing_key() {
		use time::OffsetDateTime;

		assert_eq!(WsEvent::Poke(Channel::Agents).channel().key(), "agents");
		assert_eq!(
			WsEvent::Poke(Channel::PostLike(5)).channel().key(),
			"post_like:5"
		);

		let msg = ConvMsg {
			id: 1,
			conv_id: 7,
			user_id: 2,
			content: "hi".to_string(),
			cid: 2,
			ctime: OffsetDateTime::UNIX_EPOCH,
			mid: 2,
			mtime: OffsetDateTime::UNIX_EPOCH,
		};
		assert_eq!(WsEvent::ConvMsg { payload: msg }.channel().key(), "conv:7");
	}
}

// endregion: --- Tests
