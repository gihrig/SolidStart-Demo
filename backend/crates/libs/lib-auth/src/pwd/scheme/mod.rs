// region:    --- Modules

mod dispatch;
mod error;
mod name;
mod scheme_01;
mod scheme_02;

pub use self::error::{Error, Result};
pub use dispatch::{get_scheme, Scheme};
pub use name::{SchemeName, SchemeStatus, DEFAULT_SCHEME};

// endregion: --- Modules
