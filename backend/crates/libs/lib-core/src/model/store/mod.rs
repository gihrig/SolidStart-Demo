// region:    --- Modules

pub(in crate::model) mod dbx;

mod pool;

pub use pool::{new_db_pool, Db};

// endregion: --- Modules
