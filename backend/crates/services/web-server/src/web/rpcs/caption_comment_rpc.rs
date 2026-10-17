use lib_core::model::caption::CaptionBmc;
use lib_core::model::caption_comment::{
	CaptionCommentBmc, CaptionCommentForCreate, CaptionCommentForUpdate,
};
use lib_core::model::comment::{CommentRemoval, CommentSource, CommentView};
use lib_rpc_core::prelude::*;
use lib_web::ws::poke::{self, PokedRpcResult};
use lib_web::ws::WsState;

/// The authenticated Caption Comment RPCs (`/api/rpc`, login required): the
/// writes and the Owner's read of the stored text (#127).
pub fn rpc_router_builder() -> RouterBuilder {
	router_builder!(
		add_caption_comment,
		get_caption_comment,
		update_caption_comment,
		delete_caption_comment,
	)
}

/// The public Caption Comment RPC: every Caption is public (#106) and the
/// Comment read scope is `None` (#113), so the thread read runs on
/// `/api/rpc-public`.
pub fn public_rpc_router_builder() -> RouterBuilder {
	router_builder!(list_caption_comments,)
}

/// Add a Comment owned by the caller to a Caption (#127). It returns the new
/// Comment's `CommentView` and pushes the same view on
/// `caption_comment:{parent_id}`. It then pokes `post_caption:{post_id}`, so
/// every client refetches the Caption list and its comment counts. The handler
/// reads the Caption first, for its `post_id`. The write path rejects an
/// over-cap content or an unknown Caption (400).
pub async fn add_caption_comment(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForCreate<CaptionCommentForCreate>,
) -> Result<PokedRpcResult<CommentView, poke::CaptionComment>> {
	let ParamsForCreate { data } = params;
	let post_id = CaptionBmc::post_id_of(&ctx, &mm, data.caption_id).await?;
	let id = CaptionCommentBmc::create(&ctx, &mm, data).await?;
	let comment = CaptionCommentBmc::get_comment(&ctx, &mm, id).await?;
	let receipt = ws_state.broadcast_caption_comment(&comment);
	ws_state.broadcast_post_caption(post_id);
	Ok(PokedRpcResult::new(comment, receipt))
}

/// Read the stored text of the caller's own Comment (#127): the edit form
/// loads it. It returns a `CommentSource` (`id`, `content`). A non-owner read
/// is `EntityNotFound` (400).
pub async fn get_caption_comment(
	ctx: Ctx,
	mm: ModelManager,
	params: ParamsIded,
) -> Result<DataRpcResult<CommentSource>> {
	let source = CaptionCommentBmc::get_source(&ctx, &mm, params.id).await?;
	Ok(source.into())
}

/// Edit the caller's own Comment (#127). It returns the edited `CommentView`
/// and pushes the same view on `caption_comment:{parent_id}`. An edit does not
/// change the comment count, so it does not poke `post_caption`. A non-owner
/// edit is `EntityNotFound` (400), with no push.
pub async fn update_caption_comment(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForUpdate<CaptionCommentForUpdate>,
) -> Result<PokedRpcResult<CommentView, poke::CaptionComment>> {
	let ParamsForUpdate { id, data } = params;
	CaptionCommentBmc::update(&ctx, &mm, id, data).await?;
	let comment = CaptionCommentBmc::get_comment(&ctx, &mm, id).await?;
	let receipt = ws_state.broadcast_caption_comment(&comment);
	Ok(PokedRpcResult::new(comment, receipt))
}

/// Delete the caller's own Comment (#127). It returns and pushes a
/// `CommentRemoval` (the id and its `parent_id`) on
/// `caption_comment:{parent_id}`, then pokes `post_caption:{post_id}` for the
/// count. The handler reads the Comment first, for its `caption_id`, and the
/// Caption, for its `post_id`: the reads are public, the delete is owner-only.
/// A non-owner delete is `EntityNotFound` (400), with no push. `params.id` is
/// the Comment id.
pub async fn delete_caption_comment(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsIded,
) -> Result<PokedRpcResult<CommentRemoval, poke::CaptionComment>> {
	let comment = CaptionCommentBmc::get(&ctx, &mm, params.id).await?;
	let post_id = CaptionBmc::post_id_of(&ctx, &mm, comment.caption_id).await?;
	CaptionCommentBmc::delete(&ctx, &mm, comment.id).await?;
	let removal = CommentRemoval {
		id: comment.id,
		parent_id: comment.caption_id,
	};
	let receipt = ws_state.broadcast_caption_comment_removal(removal);
	ws_state.broadcast_post_caption(post_id);
	Ok(PokedRpcResult::new(removal, receipt))
}

/// List one Caption's Comments as `CommentView`s, newest first (#127).
/// `params.id` is the **Caption** id; the optional `params.list_options` pages
/// the thread (`limit` / `offset`).
pub async fn list_caption_comments(
	ctx: Ctx,
	mm: ModelManager,
	params: ParamsIdedList,
) -> Result<DataRpcResult<Vec<CommentView>>> {
	let comments = CaptionCommentBmc::list_for_caption(
		&ctx,
		&mm,
		params.id,
		params.list_options,
	)
	.await?;
	Ok(comments.into())
}
