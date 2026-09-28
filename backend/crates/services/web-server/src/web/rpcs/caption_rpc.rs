use lib_core::model::caption::{CaptionBmc, CaptionView};
use lib_rpc_core::prelude::*;

pub fn rpc_router_builder() -> RouterBuilder {
	router_builder!(list_captions_for_post,)
}

// Every Caption is public (#106), so this is a PUBLIC read (`/api/rpc-public`):
// it returns the `CaptionView` public projection — author and derived counts,
// never the audit columns (ADR-0021). Caption mutations (create / like /
// comment) are owner-scoped and land in later tickets on the authenticated
// surface.

/// List one Post's Captions as `CaptionView`s, ranked by like count descending
/// (Top Captions, #118). `params.id` is the **Post** id.
pub async fn list_captions_for_post(
	ctx: Ctx,
	mm: ModelManager,
	params: ParamsIded,
) -> Result<DataRpcResult<Vec<CaptionView>>> {
	let views = CaptionBmc::list_captions_for_post(&ctx, &mm, params.id).await?;
	Ok(views.into())
}
