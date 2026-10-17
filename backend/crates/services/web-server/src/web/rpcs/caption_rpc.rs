use lib_core::model::caption::{
	CaptionBmc, CaptionForCreate, CaptionForUpdate, CaptionLikeBmc, CaptionView,
};
use lib_core::model::like::{LikeBmc, LikeForToggle, LikeView};
use lib_rpc_core::prelude::*;
use lib_web::ws::poke::{self, PokedRpcResult};
use lib_web::ws::WsState;

/// The authenticated Caption RPCs (`/api/rpc`, login required): the mutations,
/// and the caller's own like state, which is per-User and so not public (#123).
pub fn rpc_router_builder() -> RouterBuilder {
	router_builder!(
		add_caption,
		update_caption,
		delete_caption,
		toggle_caption_like,
		get_caption_like,
	)
}

/// The public Caption RPCs: every Caption is public (#106), so the reads run on
/// `/api/rpc-public`.
pub fn public_rpc_router_builder() -> RouterBuilder {
	router_builder!(list_captions_for_post,)
}

// The reads return the `CaptionView` public projection — author and derived
// counts, never the audit columns (ADR-0021). The Caption Comment RPCs live in
// `caption_comment_rpc` (#127).

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

/// Edit the text of the caller's own Caption (#187), only while it has no Like
/// and no Comment. It returns the edited `CaptionView` and pokes
/// `post_caption:{post_id}`; a Caption write changes no `PostView`, so it does
/// not poke `posts`. The handler reads the Caption first, for its `post_id`. A
/// locked Caption, an unknown key or an empty update is rejected (400); a
/// non-Owner edit is `EntityNotFound` (400). A rejected edit pokes nothing. The
/// poke fires on write-commit, before the re-get (ADR-0016).
pub async fn update_caption(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForUpdate<CaptionForUpdate>,
) -> Result<PokedRpcResult<CaptionView, poke::PostCaption>> {
	let ParamsForUpdate { id, data } = params;
	let post_id = CaptionBmc::get(&ctx, &mm, id).await?.post_id;
	CaptionBmc::update(&ctx, &mm, id, data).await?;
	let receipt = ws_state.broadcast_post_caption(post_id);
	let view = CaptionBmc::get_caption(&ctx, &mm, id).await?;
	Ok(PokedRpcResult::new(view, receipt))
}

/// Delete the caller's own Caption (#187). The database cascades the delete to
/// its Likes and Comments, rows that other Users own too (ADR-0032). It returns
/// the deleted id and pokes `post_caption:{post_id}`; no Event goes to a Channel
/// of a deleted row. The handler reads the Caption first, for its `post_id`: the
/// read is public, the delete is owner-only. A non-Owner delete is
/// `EntityNotFound` (400), with no poke.
pub async fn delete_caption(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsIded,
) -> Result<PokedRpcResult<i64, poke::PostCaption>> {
	let caption = CaptionBmc::get(&ctx, &mm, params.id).await?;
	CaptionBmc::delete(&ctx, &mm, caption.id).await?;
	let receipt = ws_state.broadcast_post_caption(caption.post_id);
	Ok(PokedRpcResult::new(caption.id, receipt))
}

/// Set the caller's Like on a Caption to `data.liked` (#123). Idempotent: a
/// second like or unlike is a no-op. A toggle that changed the Like pokes
/// `caption_like:{caption_id}`, so subscribers refetch the count, and
/// `post_caption:{post_id}`, so Top Captions re-ranks; a no-op pokes nothing.
/// The handler reads the Caption first, for its `post_id`; the Like module still
/// runs its own parent check. An unknown Caption is rejected (400). The pokes
/// fire on write-commit, before the re-get (ADR-0016). `data.id` is the Caption
/// id.
pub async fn toggle_caption_like(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForCreate<LikeForToggle>,
) -> Result<PokedRpcResult<LikeView, poke::CaptionLike>> {
	let ParamsForCreate { data } = params;
	let caption_id = data.id;
	let post_id = CaptionBmc::post_id_of(&ctx, &mm, caption_id).await?;
	let changed = LikeBmc::toggle::<CaptionLikeBmc>(&ctx, &mm, data).await?;
	let receipt = ws_state.broadcast_caption_like(caption_id, changed);
	if changed {
		ws_state.broadcast_post_caption(post_id);
	}
	let view = LikeBmc::get::<CaptionLikeBmc>(&ctx, &mm, caption_id).await?;
	Ok(PokedRpcResult::new(view, receipt))
}

/// Read the caller's `LikeView` of one Caption: the like count and whether the
/// caller likes it (#123). `params.id` is the Caption id.
pub async fn get_caption_like(
	ctx: Ctx,
	mm: ModelManager,
	params: ParamsIded,
) -> Result<DataRpcResult<LikeView>> {
	let view = LikeBmc::get::<CaptionLikeBmc>(&ctx, &mm, params.id).await?;
	Ok(view.into())
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
