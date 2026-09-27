use super::{Error, Result};
use crate::model::store::dbx::Dbx;
use crate::model::store::new_db_pool;

// region:    --- ModelManager

#[cfg_attr(feature = "with-rpc", derive(rpc_router::RpcResource))]
#[derive(Clone)]
pub struct ModelManager {
	dbx: Dbx,
}

impl ModelManager {
	/// Constructor
	pub async fn new() -> Result<Self> {
		let db_pool = new_db_pool()
			.await
			.map_err(|ex| Error::CantCreateModelManagerProvider(ex.to_string()))?;
		let dbx = Dbx::new(db_pool, false)?;
		Ok(ModelManager { dbx })
	}

	pub fn new_with_txn(&self) -> Result<ModelManager> {
		let dbx = Dbx::new(self.dbx.db().clone(), true)?;
		Ok(ModelManager { dbx })
	}

	pub fn dbx(&self) -> &Dbx {
		&self.dbx
	}
}

// endregion: --- ModelManager
