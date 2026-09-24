use super::{Error, Result};
use std::str::FromStr;

// region:    --- Scheme Name

/// The password hashing scheme, typed.
///
/// The wire token (`as_str`) is embedded in every stored hash as `#<token>#...`,
/// so the tokens `01` / `02` are a stable, backward-compatible contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SchemeName {
	Scheme01,
	Scheme02,
}

/// The scheme new hashes are minted with.
pub const DEFAULT_SCHEME: SchemeName = SchemeName::Scheme02;

impl SchemeName {
	/// The stable wire token embedded in a stored hash.
	pub fn as_str(self) -> &'static str {
		match self {
			SchemeName::Scheme01 => "01",
			SchemeName::Scheme02 => "02",
		}
	}

	/// Whether a hash made with this scheme is current or needs re-hashing.
	pub fn status(self) -> SchemeStatus {
		if self == DEFAULT_SCHEME {
			SchemeStatus::Ok
		} else {
			SchemeStatus::Outdated
		}
	}
}

impl FromStr for SchemeName {
	type Err = Error;

	fn from_str(name: &str) -> Result<Self> {
		match name {
			"01" => Ok(SchemeName::Scheme01),
			"02" => Ok(SchemeName::Scheme02),
			_ => Err(Error::SchemeNotFound(name.to_string())),
		}
	}
}

// endregion: --- Scheme Name

// region:    --- Scheme Status

#[derive(Debug)]
pub enum SchemeStatus {
	Ok,       // The pwd uses the latest scheme. All good.
	Outdated, // The pwd uses an old scheme.
}

// endregion: --- Scheme Status

// region:    --- Tests
#[cfg(test)]
mod tests {
	pub type Result<T> = core::result::Result<T, Error>;
	pub type Error = Box<dyn std::error::Error>; // For tests.

	use super::*;

	#[test]
	fn test_scheme_name_as_str_ok() -> Result<()> {
		assert_eq!(SchemeName::Scheme01.as_str(), "01");
		assert_eq!(SchemeName::Scheme02.as_str(), "02");
		Ok(())
	}

	#[test]
	fn test_scheme_name_from_str_ok() -> Result<()> {
		assert_eq!("01".parse::<SchemeName>()?, SchemeName::Scheme01);
		assert_eq!("02".parse::<SchemeName>()?, SchemeName::Scheme02);
		Ok(())
	}

	#[test]
	fn test_scheme_name_from_str_err_unknown() -> Result<()> {
		let res = "99".parse::<SchemeName>();
		assert!(
			matches!(res, Err(super::Error::SchemeNotFound(name)) if name == "99"),
			"should be SchemeNotFound(\"99\")"
		);
		Ok(())
	}

	#[test]
	fn test_scheme_name_status_ok() -> Result<()> {
		assert!(matches!(SchemeName::Scheme02.status(), SchemeStatus::Ok));
		assert!(matches!(
			SchemeName::Scheme01.status(),
			SchemeStatus::Outdated
		));
		Ok(())
	}
}
// endregion: --- Tests
