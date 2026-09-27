//! The pwd module is responsible for hashing and validating hashes.
//! It follows a multi-scheme hashing code design, allowing each
//! scheme to provide its own hashing and validation methods.
//!
//! Code Design Points:
//!
//! - Exposes two public async functions `hash_pwd(...)` and `validate_pwd(...)`
//! - `ContentToHash` represents the data to be hashed along with the corresponding salt.
//! - `SchemeStatus` is the result of `validate_pwd` which, upon successful validation, indicates
//!   whether the password needs to be re-hashed to adopt the latest scheme.
//! - Internally, the `pwd` module implements a multi-scheme code design with the `Scheme` trait.
//! - The `Scheme` trait exposes sync functions `hash` and `validate` to be implemented for each scheme.
//! - The two public async functions `hash_pwd(...)` and `validate_pwd(...)` call the scheme using
//!   `spawn_blocking` to ensure that long hashing/validation processes do not hinder the execution of smaller tasks.
//! - Schemes are designed to be agnostic of whether they are in an async or sync context, hence they are async-free.

// region:    --- Modules

mod error;
mod hasher;
mod pwd_parts;
mod scheme;

pub use self::error::{Error, Result};
pub use hasher::{hash_pwd, validate_pwd, ContentToHash};
pub use scheme::SchemeStatus;

// endregion: --- Modules
