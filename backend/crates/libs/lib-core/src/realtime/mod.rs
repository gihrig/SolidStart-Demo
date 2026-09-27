//! The realtime **Feed** contract (CONTEXT.md "Real-time feed"): the exported
//! [`Channel`] routing vocabulary and the [`WsEvent`] envelope. The mechanism
//! that serves them — the broadcast hub, the socket driver, the fan-out — lives
//! in `lib-web::ws`. This module owns only the ts-rs-exported contract plus the
//! [`Channel::authorize`] read-scope rule, which is DB-backed and so sits beside
//! `ConvBmc` in `lib-core`.

mod channel;
mod event;

pub use channel::Channel;
pub use event::WsEvent;
