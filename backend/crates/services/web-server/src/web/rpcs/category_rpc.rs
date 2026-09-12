use lib_core::model::category::{Category, CategoryBmc, CategoryFilter};
use lib_rpc_core::prelude::*;

pub fn rpc_router_builder() -> RouterBuilder {
	router_builder!(list_categories,)
}

/// List the Category taxonomy. Categories are static and back-end-owned, so
/// there is no create/update/delete RPC and no realtime poke (ADR-0011). The
/// name is spelled out (not via the read-fn macro) because that macro pluralizes
/// the suffix as `category` + `s` = `categorys`, not `categories`.
pub async fn list_categories(
	ctx: Ctx,
	mm: ModelManager,
	params: ParamsList<CategoryFilter>,
) -> Result<DataRpcResult<Vec<Category>>> {
	let entities =
		CategoryBmc::list(&ctx, &mm, params.filters, params.list_options).await?;
	Ok(entities.into())
}
