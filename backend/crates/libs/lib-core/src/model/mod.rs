//! Model Layer
//!
//! Design:
//!
//! - The Model layer normalizes the application's data type
//!   structures and access.
//! - All application code data access must go through the Model layer.
//! - The `ModelManager` holds the internal states/resources
//!   needed by ModelControllers to access data.
//!   (e.g., db_pool, S3 client, redis client).
//! - Model Controllers (e.g., `ConvBmc`, `AgentBmc`) implement
//!   CRUD and other data access methods on a given "entity"
//!   (e.g., `Conv`, `Agent`).
//!   (`Bmc` is short for Backend Model Controller).
//! - In frameworks like Axum, Tauri, `ModelManager` are typically used as App State.
//! - ModelManager are designed to be passed as an argument
//!   to all Model Controllers functions.
//!

// region:    --- Modules

mod acs;
mod base;
mod error;
mod model_manager;
mod store;

pub mod agent;
pub mod category;
pub mod conv;
pub mod conv_msg;
pub mod conv_user;
pub(in crate::model) mod modql_utils;
pub mod post;
pub mod user;

pub use self::error::{Error, Result};
pub use self::model_manager::ModelManager;

// endregion: --- Modules
