use crate::model::base::DbBmc;
use crate::model::{Error, Result};
use modql::field::SeaFields;
use sea_query::{SimpleExpr, Value};
use unicode_normalization::UnicodeNormalization;

/// A free-text field an entity submits to write-path hygiene.
///
/// `field` is the column name. `max_len` is an optional cap on the character
/// count (Unicode scalar values) after normalization and trim. Each later
/// entity ticket declares its own rules via `DbBmc::hygiene_rules`.
#[derive(Clone, Copy)]
pub struct FieldHygiene {
	pub field: &'static str,
	pub max_len: Option<usize>,
}

/// Return the rejection reason for a character that must never persist in free
/// text, or `None` if the character is allowed. This is the single source of
/// truth for both the check and the error reason.
///
/// The rejected sets are:
/// - C0 control characters, except tab (`\t`) and newline (`\n`). Carriage
///   return is folded to newline before this check, so it never reaches here.
/// - DEL and the C1 control characters.
/// - Truly-invisible zero-width characters: zero-width space, word joiner, and
///   the byte-order mark. The functional joiners ZWNJ (U+200C) and ZWJ
///   (U+200D) are allowed: emoji sequences and Persian/Arabic/Indic text need
///   them.
/// - Bidirectional embeddings, overrides, and isolates (trojan-source).
fn forbidden_reason(c: char) -> Option<&'static str> {
	match c {
		'\u{0000}'..='\u{0008}'
		| '\u{000B}'..='\u{001F}'
		| '\u{007F}'..='\u{009F}' => Some("control character not allowed"),
		'\u{200B}' | '\u{2060}' | '\u{FEFF}' => {
			Some("zero-width character not allowed")
		}
		'\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}' => {
			Some("bidirectional control character not allowed")
		}
		_ => None,
	}
}

/// NFC-normalize `value`, fold CR/CRLF line endings to LF, and trim, then
/// reject forbidden characters and enforce `max_len`. Returns the cleaned
/// value, or a `Validation` error that names the field and the reason. The
/// cleaned value is the original text; it is never HTML-escaped here.
pub fn hygiene_value(
	field: &str,
	value: &str,
	max_len: Option<usize>,
) -> Result<String> {
	// -- NFC-normalize, fold CRLF and lone CR to LF, then trim.
	let normalized: String = value.nfc().collect();
	let normalized = normalized.replace("\r\n", "\n").replace('\r', "\n");
	let cleaned = normalized.trim().to_string();

	// -- Reject the first forbidden character, if any.
	if let Some(reason) = cleaned.chars().find_map(forbidden_reason) {
		return Err(Error::Validation {
			field: field.to_string(),
			reason: reason.to_string(),
		});
	}

	// -- Enforce the length cap on the character count (Unicode scalar values).
	if let Some(max) = max_len {
		let len = cleaned.chars().count();
		if len > max {
			return Err(Error::Validation {
				field: field.to_string(),
				reason: format!("exceeds max length {max}"),
			});
		}
	}

	Ok(cleaned)
}

/// Reject `value` unless it is a safe URL: an `http://` / `https://` URL, a
/// root-relative path (`/` then a word character, or `/` alone), or a fragment
/// (`#…`), with none of the break characters `' " ( ) \`. This mirrors the
/// front-end `sanitizeUrl` rule (ADR-0006), so a URL the server stores also
/// passes the front-end check. The server rejects; it never rewrites (ADR-0011).
pub fn check_safe_url(field: &str, value: &str) -> Result<()> {
	let lower = value.to_ascii_lowercase();
	let safe_start = lower.starts_with("http://")
		|| lower.starts_with("https://")
		|| value.starts_with('#')
		|| match value.strip_prefix('/') {
			Some(rest) => rest
				.chars()
				.next()
				.is_none_or(|c| c.is_ascii_alphanumeric() || c == '_'),
			None => false,
		};
	let has_break_char = value.contains(['\'', '"', '(', ')', '\\']);

	if safe_start && !has_break_char {
		Ok(())
	} else {
		Err(Error::Validation {
			field: field.to_string(),
			reason: "unsafe URL".to_string(),
		})
	}
}

/// Run each entity-declared free-text rule and URL rule over `fields` inside
/// the shared write path. A field with no rule passes through untouched. A URL
/// field is checked after its free-text rule, on the cleaned value.
///
/// Only a plain string value (`Value::String`) is hygiened; free-text columns
/// are declared as plain `String` fields, so this matches how a rule is used.
/// A declared field whose value is not a plain string (e.g. a `cast_as`
/// column) is left unchanged — such columns are enum-typed, not free text.
pub fn apply_hygiene<MC: DbBmc>(fields: SeaFields) -> Result<SeaFields> {
	let rules = MC::hygiene_rules();
	let url_fields = MC::url_fields();
	if rules.is_empty() && url_fields.is_empty() {
		return Ok(fields);
	}

	let mut list = fields.into_vec();
	for field in list.iter_mut() {
		let name = field.iden.to_string();
		let SimpleExpr::Value(Value::String(Some(s))) = &field.value else {
			continue;
		};
		let rule = rules.iter().find(|r| r.field == name);
		let is_url = url_fields.contains(&name.as_str());
		if rule.is_none() && !is_url {
			continue;
		}
		let cleaned = match rule {
			Some(rule) => hygiene_value(&name, s, rule.max_len)?,
			None => s.to_string(),
		};
		if is_url {
			check_safe_url(&name, &cleaned)?;
		}
		field.value = SimpleExpr::Value(Value::String(Some(Box::new(cleaned))));
	}

	Ok(SeaFields::new(list))
}

// region:    --- Tests

#[cfg(test)]
mod tests {
	type Error = Box<dyn std::error::Error>;
	type Result<T> = core::result::Result<T, Error>; // For tests.

	use super::*;
	use crate::model::Error as ModelError;

	/// A control character in the middle of the text is rejected.
	#[test]
	fn test_reject_control_char() -> Result<()> {
		let err = hygiene_value("title", "hel\u{0007}lo", None).unwrap_err();
		assert!(
			matches!(&err, ModelError::Validation { field, reason }
				if field == "title" && reason.contains("control")),
			"got {err:?}"
		);
		Ok(())
	}

	/// Tab and newline are allowed; a CRLF line ending is folded to a single LF.
	#[test]
	fn test_allow_tab_newline_and_fold_crlf() -> Result<()> {
		// Tab and newline survive; trim removes only the outer whitespace.
		assert_eq!(hygiene_value("title", "a\tb\nc", None)?, "a\tb\nc");
		// CRLF and a lone CR both fold to LF, so cross-platform text is accepted.
		assert_eq!(hygiene_value("title", "a\r\nb\rc", None)?, "a\nb\nc");
		Ok(())
	}

	/// An invisible zero-width character (ZWSP) is rejected, but the functional
	/// joiners ZWNJ / ZWJ are allowed (emoji sequences, Persian/Indic text).
	#[test]
	fn test_reject_zero_width_but_allow_joiners() -> Result<()> {
		let err = hygiene_value("title", "he\u{200B}llo", None).unwrap_err();
		assert!(
			matches!(&err, ModelError::Validation { reason, .. }
				if reason.contains("zero-width")),
			"got {err:?}"
		);
		// ZWJ emoji family sequence and a ZWNJ word both pass through unchanged.
		let zwj = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}";
		assert_eq!(hygiene_value("title", zwj, None)?, zwj);
		assert_eq!(hygiene_value("title", "a\u{200C}b", None)?, "a\u{200C}b");
		Ok(())
	}

	/// A bidirectional override character is rejected with the bidi reason.
	#[test]
	fn test_reject_bidi_override() -> Result<()> {
		let err = hygiene_value("title", "he\u{202E}llo", None).unwrap_err();
		assert!(
			matches!(&err, ModelError::Validation { reason, .. }
				if reason.contains("bidirectional")),
			"got {err:?}"
		);
		Ok(())
	}

	/// NFC folds a decomposed sequence into its composed form.
	#[test]
	fn test_nfc_normalizes() -> Result<()> {
		// "e" + combining acute accent -> single "é" (U+00E9).
		let cleaned = hygiene_value("title", "e\u{0301}", None)?;
		assert_eq!(cleaned, "\u{00E9}");
		assert_eq!(cleaned.chars().count(), 1);
		Ok(())
	}

	/// Leading and trailing whitespace is trimmed; inner text is kept.
	#[test]
	fn test_trims() -> Result<()> {
		assert_eq!(hygiene_value("title", "  hello  ", None)?, "hello");
		Ok(())
	}

	/// A value over the cap is rejected; a value at the cap is accepted.
	#[test]
	fn test_length_cap() -> Result<()> {
		let err = hygiene_value("title", "abcdef", Some(5)).unwrap_err();
		assert!(
			matches!(&err, ModelError::Validation { field, reason }
				if field == "title" && reason.contains("max length 5")),
			"got {err:?}"
		);
		// The cap counts characters after trim, so trailing spaces do not count.
		assert_eq!(hygiene_value("title", "abcde  ", Some(5))?, "abcde");
		Ok(())
	}

	/// http(s) URLs, root-relative paths, and fragments are safe URLs.
	#[test]
	fn test_safe_url_accepted() -> Result<()> {
		for url in [
			"https://live.staticflickr.com/65535/49909538937_3255dcf9e7_b.jpg",
			"http://example.com",
			"HTTPS://EXAMPLE.COM/A.PNG",
			"/img/hero.jpg",
			"/",
			"#",
		] {
			check_safe_url("background_image", url)?;
		}
		Ok(())
	}

	/// A script / data scheme, a protocol-relative URL, an empty value, and a
	/// URL with a CSS/HTML break character are each rejected as unsafe.
	#[test]
	fn test_unsafe_url_rejected() -> Result<()> {
		for url in [
			"javascript:alert(1)",
			"data:image/png;base64,AAAA",
			"//evil.example.com/a.png",
			"",
			"https://example.com/a.png') no-repeat; x:url('",
			"https://example.com/\"onerror",
		] {
			let err = check_safe_url("background_image", url).unwrap_err();
			assert!(
				matches!(&err, ModelError::Validation { field, reason }
					if field == "background_image" && reason.contains("unsafe URL")),
				"{url:?}: got {err:?}"
			);
		}
		Ok(())
	}
}

// endregion: --- Tests
