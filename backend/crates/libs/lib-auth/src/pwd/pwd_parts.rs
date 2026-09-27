use super::scheme::SchemeName;
use super::{Error, Result};
use lazy_regex::regex_captures;
use std::fmt::Display;
use std::str::FromStr;

/// The stored password envelope: `#<scheme>#<hashed>`.
///
/// One type owns the wire format both ways — `FromStr` decodes, `Display` encodes.
pub struct PwdParts {
	/// The scheme the hash was made with.
	pub scheme: SchemeName,
	/// The hashed password.
	pub hashed: String,
}

impl FromStr for PwdParts {
	type Err = Error;

	fn from_str(pwd_with_scheme: &str) -> Result<Self> {
		let (_, scheme, hashed) = regex_captures!(
			r#"^#(\w+)#(.*)"#, // a literal regex
			pwd_with_scheme
		)
		.ok_or(Error::PwdWithSchemeFailedParse)?;

		Ok(Self {
			scheme: scheme.parse()?,
			hashed: hashed.to_string(),
		})
	}
}

impl Display for PwdParts {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		write!(f, "#{}#{}", self.scheme.as_str(), self.hashed)
	}
}

// region:    --- Tests
#[cfg(test)]
mod tests {
	pub type Result<T> = core::result::Result<T, Error>;
	pub type Error = Box<dyn std::error::Error>; // For tests.

	use super::*;

	#[test]
	fn test_pwd_parts_from_str_ok() -> Result<()> {
		let fx_pwd = "#02#some-hashed-content";
		let parts: PwdParts = fx_pwd.parse()?;
		assert_eq!(parts.scheme, SchemeName::Scheme02);
		assert_eq!(parts.hashed, "some-hashed-content");
		Ok(())
	}

	#[test]
	fn test_pwd_parts_display_round_trip_ok() -> Result<()> {
		let fx_pwd = "#01#abc123";
		let parts: PwdParts = fx_pwd.parse()?;
		assert_eq!(parts.to_string(), fx_pwd);
		Ok(())
	}

	#[test]
	fn test_pwd_parts_from_str_err_bad_format() -> Result<()> {
		let res = "no-scheme-prefix".parse::<PwdParts>();
		assert!(res.is_err(), "should fail without a #scheme# prefix");
		Ok(())
	}
}
// endregion: --- Tests
