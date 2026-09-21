use super::pwd_parts::PwdParts;
use super::scheme::{get_scheme, Scheme, SchemeName, DEFAULT_SCHEME};
use super::{Error, Result, SchemeStatus};
use uuid::Uuid;

// region:    --- Types

/// The clean content to hash, with the salt.
///
/// Notes:
///    - Since content is sensitive information, we do NOT implement default debug for this struct.
///    - The clone is only implement for testing
#[cfg_attr(test, derive(Clone))]
pub struct ContentToHash {
	pub content: String, // Clear content.
	pub salt: Uuid,
}

// endregion: --- Types

// region:    --- Public Functions

/// Hash the password with the default scheme.
pub async fn hash_pwd(to_hash: ContentToHash) -> Result<String> {
	tokio::task::spawn_blocking(move || hash_for_scheme(DEFAULT_SCHEME, to_hash))
		.await
		.map_err(|_| Error::FailSpawnBlockForHash)?
}

/// Validate if an ContentToHash matches.
pub async fn validate_pwd(
	to_hash: ContentToHash,
	pwd_ref: String,
) -> Result<SchemeStatus> {
	let PwdParts { scheme, hashed } = pwd_ref.parse()?;

	// Determine status before validating, from the parsed scheme.
	let scheme_status = scheme.status();

	// Note: Since validate might take some time depending on algo
	//       doing a spawn_blocking to avoid
	tokio::task::spawn_blocking(move || {
		validate_for_scheme(scheme, to_hash, hashed)
	})
	.await
	.map_err(|_| Error::FailSpawnBlockForValidate)??;

	Ok(scheme_status)
}
// endregion: --- Public Functions

// region:    --- Privates

fn hash_for_scheme(scheme: SchemeName, to_hash: ContentToHash) -> Result<String> {
	let hashed = get_scheme(scheme).hash(&to_hash)?;

	Ok(PwdParts { scheme, hashed }.to_string())
}

fn validate_for_scheme(
	scheme: SchemeName,
	to_hash: ContentToHash,
	pwd_ref: String,
) -> Result<()> {
	get_scheme(scheme).validate(&to_hash, &pwd_ref)?;
	Ok(())
}

// endregion: --- Privates

// region:    --- Tests
#[cfg(test)]
mod tests {
	pub type Result<T> = core::result::Result<T, Error>;
	pub type Error = Box<dyn std::error::Error>; // For tests.

	use super::*;

	#[tokio::test]
	async fn test_multi_scheme_ok() -> Result<()> {
		// -- Setup & Fixtures
		let fx_salt = Uuid::parse_str("f05e8961-d6ad-4086-9e78-a6de065e5453")?;
		let fx_to_hash = ContentToHash {
			content: "hello world".to_string(),
			salt: fx_salt,
		};

		// -- Exec
		let pwd_hashed = hash_for_scheme(SchemeName::Scheme01, fx_to_hash.clone())?;
		let pwd_validate = validate_pwd(fx_to_hash.clone(), pwd_hashed).await?;

		// -- Check
		assert!(
			matches!(pwd_validate, SchemeStatus::Outdated),
			"status should be SchemeStatus::Outdated"
		);

		Ok(())
	}
}
// endregion: --- Tests
