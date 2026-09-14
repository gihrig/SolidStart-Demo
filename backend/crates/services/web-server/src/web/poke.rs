//! The typed poke receipt that enforces the Poke rule at compile time (ADR-0016).
//!
//! A list-poke mutation must poke its list feed. A `broadcast_*` mints a
//! channel-typed [`PokeReceipt<C>`](crate::web::routes_ws::PokeReceipt) (its
//! constructor is private to the ws module). [`PokedRpcResult::new`] consumes that
//! receipt, so a mutation cannot build its return value without having poked its
//! own feed — no poke, no receipt, no compile. The channel marker binds each
//! mutation to the right feed: a `Convs` result cannot be built from an `Agents`
//! receipt, so a wrong-feed poke is a type error.

use crate::web::routes_ws::PokeReceipt;
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

/// A mutation's RPC result: the wire twin of
/// [`DataRpcResult`](lib_rpc_core::prelude::DataRpcResult), gated by a
/// [`PokeReceipt<C>`](crate::web::routes_ws::PokeReceipt). It serializes as
/// `{ "data": T }` — the channel marker is `PhantomData`, `#[serde(skip)]` — so the
/// wire shape is byte-identical to a read's result (ADR-0016; rpc-router asks only
/// `R: Serialize`). Reads keep `DataRpcResult`; only mutations return this.
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
