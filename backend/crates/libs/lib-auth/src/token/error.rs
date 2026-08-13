use serde::Serialize;
use ts_rs::TS;

pub type Result<T> = core::result::Result<T, Error>;

#[derive(Debug, Serialize, TS)]
#[ts(export, export_to = "lib_auth_token_Error.d.ts")]
pub enum Error {
	HmacFailNewFromSlice,

	InvalidFormat,
	CannotDecodeIdent,
	CannotDecodeExp,
	SignatureNotMatching,
	ExpNotIso,
	Expired,
}

// region:    --- Error Boilerplate
impl core::fmt::Display for Error {
	fn fmt(
		&self,
		fmt: &mut core::fmt::Formatter,
	) -> core::result::Result<(), core::fmt::Error> {
		write!(fmt, "{self:?}")
	}
}

impl std::error::Error for Error {}
// endregion: --- Error Boilerplate
