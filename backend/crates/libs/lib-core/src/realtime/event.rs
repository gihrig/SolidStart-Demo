use super::channel::Channel;
use crate::model::conv_msg::ConvMsg;
use serde::Serialize;
use ts_rs::TS;

/// The realtime feed envelope, a discriminated union tagged by `event_type`
/// (internal serde tagging). ts-rs exports it, so the front-end narrows on the
/// tag and reads a typed payload — no cast. `conv_msg` carries the new `ConvMsg`.
/// Every contentless poke is one `Poke` variant carrying its [`Channel`] (#85):
/// the poke pushes no domain row, only the id its routing key needs, held inside
/// the `Channel`. A subscriber refetches through the scoped `list_*` RPC. The two
/// Jedi comment channels (`post_comment`, `caption_comment`) push a payload
/// (`CommentView`); that payload is not built yet (#113), so they gain no payload
/// variant here — they are subscribe-only (#115). The routing `Channel` is derived
/// from the event (see the `channel` method below), not carried as a separate
/// field: a payload event reads it from the payload, a poke carries it (ADR-0020).
#[derive(Clone, Debug, Serialize, TS)]
#[serde(tag = "event_type")]
#[ts(export, export_to = "WsEvent.d.ts")]
pub enum WsEvent {
	#[serde(rename = "conv_msg")]
	ConvMsg { payload: ConvMsg },
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
	/// the payload (`conv_msg` reads `payload.conv_id`); a poke carries it. The send
	/// task matches its key against a connection's authorized subscription set
	/// (ADR-0015).
	pub fn channel(&self) -> Channel {
		match self {
			WsEvent::ConvMsg { payload } => Channel::Conv(payload.conv_id),
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
