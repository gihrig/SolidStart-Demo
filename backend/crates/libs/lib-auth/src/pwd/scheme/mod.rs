// region:    --- Modules

mod dispatch;
mod error;
mod scheme_01;
mod scheme_02;

pub use self::error::{Error, Result};
pub use dispatch::{get_scheme, Scheme, SchemeStatus, DEFAULT_SCHEME};

// endregion: --- Modules
