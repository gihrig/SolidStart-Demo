use lib_core::model::caption::{CaptionBmc, CaptionForCreate, CaptionView};
use lib_rpc_core::prelude::*;
use lib_web::ws::poke::{self, PokedRpcResult};
use lib_web::ws::WsState;

/// The authenticated Caption RPCs: the mutations (`/api/rpc`, login required).
pub fn rpc_router_builder() -> RouterBuilder {
	router_builder!(add_caption,)
}

/// The public Caption RPCs: every Caption is public (#106), so the reads run on
/// `/api/rpc-public`.
pub fn public_rpc_router_builder() -> RouterBuilder {
	router_builder!(list_captions_for_post,)
}

// The reads return the `CaptionView` public projection — author and derived
// counts, never the audit columns (ADR-0021). The like and comment mutations
// land in later tickets on the authenticated surface.

/// Add a Caption owned by the caller to a Post (#121), then poke that Post's
/// `post_caption:{post_id}` feed so every subscriber refetches Top Captions. The
/// write path rejects an over-cap text or an unknown Post (400). The poke fires
/// on write-commit, before the re-get (ADR-0016).
pub async fn add_caption(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForCreate<CaptionForCreate>,
) -> Result<PokedRpcResult<CaptionView, poke::PostCaption>> {
	let ParamsForCreate { data } = params;
	let post_id = data.post_id;
	let id = CaptionBmc::create(&ctx, &mm, data).await?;
	let receipt = ws_state.broadcast_post_caption(post_id);
	let view = CaptionBmc::get_caption(&ctx, &mm, id).await?;
	Ok(PokedRpcResult::new(view, receipt))
}

/// List one Post's Captions as `CaptionView`s, ranked by like count descending
/// (Top Captions, #118). `params.id` is the **Post** id; the optional
/// `params.list_options` pages the ranked list (`limit` / `offset`).
pub async fn list_captions_for_post(
	ctx: Ctx,
	mm: ModelManager,
	params: ParamsIdedList,
) -> Result<DataRpcResult<Vec<CaptionView>>> {
	let views = CaptionBmc::list_captions_for_post(
		&ctx,
		&mm,
		params.id,
		params.list_options,
	)
	.await?;
	Ok(views.into())
}
