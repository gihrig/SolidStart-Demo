//! The realtime **Feed** contract (CONTEXT.md "Real-time feed"): the exported
//! [`Channel`] routing vocabulary and the [`WsEvent`] envelope. The mechanism
//! that serves them — the broadcast hub, the socket driver, the fan-out — lives
//! in `lib-web::ws`. This module owns only the ts-rs-exported contract plus the
//! [`Channel::authorize`] rule: uniform authenticated-read today, kept here with
//! its `(ctx, mm)` seam so a future scoped channel can read the model (ADR-0015).

mod channel;
mod event;

pub use channel::Channel;
pub use event::WsEvent;
