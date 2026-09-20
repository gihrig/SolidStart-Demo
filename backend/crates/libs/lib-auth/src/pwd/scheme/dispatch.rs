use super::scheme_01::Scheme01;
use super::scheme_02::Scheme02;
use super::{Error, Result};
use crate::pwd::ContentToHash;
use enum_dispatch::enum_dispatch;

pub const DEFAULT_SCHEME: &str = "02";

#[derive(Debug)]
pub enum SchemeStatus {
	Ok,       // The pwd uses the latest scheme. All good.
	Outdated, // The pwd uses an old scheme.
}

#[enum_dispatch]
pub trait Scheme {
	fn hash(&self, to_hash: &ContentToHash) -> Result<String>;

	fn validate(&self, to_hash: &ContentToHash, pwd_ref: &str) -> Result<()>;
}

#[enum_dispatch(Scheme)]
pub enum SchemeDispatcher {
	Scheme01(Scheme01),
	Scheme02(Scheme02),
}

pub fn get_scheme(scheme_name: &str) -> Result<impl Scheme> {
	match scheme_name {
		"01" => Ok(SchemeDispatcher::Scheme01(Scheme01)),
		"02" => Ok(SchemeDispatcher::Scheme02(Scheme02)),
		_ => Err(Error::SchemeNotFound(scheme_name.to_string())),
	}
}
