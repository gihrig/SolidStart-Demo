//! The realtime **Feed** transport (CONTEXT.md "Feed"): the WebSocket broadcast
//! hub, the socket driver, the subscription-authorization fan-out, and the
//! co-located compile-time **Poke** rule (ADR-0016). The exported contract it
//! serves — [`Channel`](lib_core::realtime::Channel) and
//! [`WsEvent`](lib_core::realtime::WsEvent) — lives in `lib_core::realtime`; this
//! module owns only the mechanism. The service mounts [`routes`] and pokes through
//! [`WsState`]'s `broadcast_*` helpers.

mod hub;
pub mod poke;
mod socket;

pub use hub::WsState;
pub use socket::routes;
