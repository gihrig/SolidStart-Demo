//! The compile-time **Poke** rule (ADR-0016), co-located in one module: the
//! channel markers, the [`PokeReceipt`] proof token, and the [`PokedRpcResult`]
//! wire twin that consumes it.
//!
//! A list-poke mutation must poke its list feed. A `broadcast_*` on
//! [`WsState`](super::WsState) mints a channel-typed [`PokeReceipt<C>`], and
//! [`PokedRpcResult::new`] consumes it — so a mutation cannot build its return
//! value without having poked its own feed: no poke, no receipt, no compile. The
//! marker `C` binds each mutation to the right feed: a `Convs` result cannot be
//! built from an `Agents` receipt, so a wrong-feed poke is a type error.
//!
//! [`PokeReceipt::new`] is `pub(super)`, so only code inside `lib-web::ws` — the
//! `broadcast_*` helpers — can mint one; an external handler cannot fabricate a
//! receipt.

use serde::Serialize;
use std::marker::PhantomData;

// region:    --- Channel markers

/// Channel marker: the global Conversation-list feed (`convs`).
pub struct Convs;

/// Channel marker: the global Agent-list feed (`agents`).
pub struct Agents;

/// Channel marker: one Conversation's message channel (`conv:{id}`).
pub struct Conv;

// endregion: --- Channel markers

// region:    --- Poke receipt

/// A channel-typed proof that a list-feed poke fired. Its field is private and
/// its constructor is `pub(super)`, so only a `broadcast_*` on
/// [`WsState`](super::WsState) mints one — a handler cannot fabricate a receipt.
/// [`PokedRpcResult::new`] consumes it, so a mutation must poke its own feed to
/// build its return value (ADR-0016). The marker `C` binds the receipt to one feed
/// (`Convs` / `Agents` / `Conv`), so a wrong-feed poke is a type error.
pub struct PokeReceipt<C> {
	_channel: PhantomData<C>,
}

impl<C> PokeReceipt<C> {
	/// Mint a receipt. `pub(super)` — only the `broadcast_*` helpers in
	/// `lib-web::ws` call it.
	pub(super) fn new() -> Self {
		Self {
			_channel: PhantomData,
		}
	}
}

// endregion: --- Poke receipt

// region:    --- Poked RPC result

/// A mutation's RPC result: the wire twin of
/// [`DataRpcResult`](lib_rpc_core::prelude::DataRpcResult), gated by a
/// [`PokeReceipt<C>`]. It serializes as `{ "data": T }` — the channel marker is
/// `PhantomData`, `#[serde(skip)]` — so the wire shape is byte-identical to a
/// read's result (ADR-0016; rpc-router asks only `R: Serialize`). Reads keep
/// `DataRpcResult`; only mutations return this.
#[derive(Serialize)]
#[serde(bound(serialize = "T: Serialize"))]
pub struct PokedRpcResult<T, C>
where
	T: Serialize,
{
	data: T,
	#[serde(skip)]
	_channel: PhantomData<C>,
}

impl<T, C> PokedRpcResult<T, C>
where
	T: Serialize,
{
	/// Build the result from the entity and the matching [`PokeReceipt<C>`]. The
	/// receipt is proof the feed was poked; only a `broadcast_*` can mint one.
	pub fn new(data: T, _receipt: PokeReceipt<C>) -> Self {
		Self {
			data,
			_channel: PhantomData,
		}
	}
}

// endregion: --- Poked RPC result

// region:    --- Tests

#[cfg(test)]
mod tests {
	use super::*;
	use crate::ws::WsState;

	/// Wire-lock for the typed poke receipt (ADR-0016). A `PokedRpcResult`
	/// serializes as `{ "data": … }` — byte-identical to `DataRpcResult`, the
	/// channel marker skipped — so a mutation's wire shape does not change. The
	/// receipt comes from a real broadcast; only this module can mint one.
	#[test]
	fn poked_rpc_result_serializes_as_data_only() {
		let ws = WsState::new();
		let receipt = ws.broadcast_conv_update(); // PokeReceipt<Convs>
		let result = PokedRpcResult::new(42_i64, receipt);
		assert_eq!(
			serde_json::to_value(result).unwrap(),
			serde_json::json!({ "data": 42 }),
		);
	}
}

// endregion: --- Tests
