// region:    --- Modules

mod error;
mod web_token;

pub use self::error::{Error, Result};
pub use web_token::{generate_web_token, validate_web_token, Token};

// endregion: --- Modules
