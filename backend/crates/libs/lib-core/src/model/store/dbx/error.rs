use derive_more::From;
use serde::Serialize;
use serde_with::{serde_as, DisplayFromStr};
use ts_rs::TS;

pub type Result<T> = core::result::Result<T, Error>;

#[serde_as]
#[derive(Debug, From, Serialize, TS)]
#[ts(export, export_to = "lib_core_dbx_Error.d.ts")]
pub enum Error {
	TxnCantCommitNoOpenTxn,
	CannotBeginTxnWithTxnFalse,
	CannotCommitTxnWithTxnFalse,
	NoTxn,

	// -- Externals
	#[from]
	Sqlx(
    #[serde_as(as = "DisplayFromStr")]
    #[ts(type = "string")]
    sqlx::Error),
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
