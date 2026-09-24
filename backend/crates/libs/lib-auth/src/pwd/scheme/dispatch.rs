use super::scheme_01::Scheme01;
use super::scheme_02::Scheme02;
use super::{Result, SchemeName};
use crate::pwd::ContentToHash;
use enum_dispatch::enum_dispatch;

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

/// Map a typed scheme to its implementation.
///
/// Total: every `SchemeName` variant has an implementation, so this never fails.
pub fn get_scheme(scheme_name: SchemeName) -> impl Scheme {
	match scheme_name {
		SchemeName::Scheme01 => SchemeDispatcher::Scheme01(Scheme01),
		SchemeName::Scheme02 => SchemeDispatcher::Scheme02(Scheme02),
	}
}
