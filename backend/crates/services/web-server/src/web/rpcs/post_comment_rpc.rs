use lib_core::model::post_comment::{
	PostComment, PostCommentBmc, PostCommentForCreate, PostCommentForUpdate,
	PostCommentRemoval,
};
use lib_rpc_core::prelude::*;
use lib_web::ws::poke::{self, PokedRpcResult};
use lib_web::ws::WsState;

/// The authenticated Post Comment RPCs (`/api/rpc`, login required): the
/// writes (#124).
pub fn rpc_router_builder() -> RouterBuilder {
	router_builder!(add_post_comment, update_post_comment, delete_post_comment,)
}

/// The public Post Comment RPC: every Post is public (#106) and the Comment
/// read scope is `None` (#113), so the thread read runs on `/api/rpc-public`.
pub fn public_rpc_router_builder() -> RouterBuilder {
	router_builder!(list_post_comments,)
}

// The thread carries the plain `PostComment` row for now; #125 changes the read
// and the upsert payload to a `CommentView` (author display).

/// Add a Comment owned by the caller to a Post (#124). It pushes the new row on
/// `post_comment:{post_id}`, then pokes `posts`, so every client refetches the
/// Post views and their comment counts. The write path rejects an over-cap
/// content or an unknown Post (400).
pub async fn add_post_comment(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForCreate<PostCommentForCreate>,
) -> Result<PokedRpcResult<PostComment, poke::PostComment>> {
	let ParamsForCreate { data } = params;
	let id = PostCommentBmc::create(&ctx, &mm, data).await?;
	let comment = PostCommentBmc::get(&ctx, &mm, id).await?;
	let receipt = ws_state.broadcast_post_comment(&comment);
	ws_state.broadcast_posts_update();
	Ok(PokedRpcResult::new(comment, receipt))
}

/// Edit the caller's own Comment (#124), and push the edited row on
/// `post_comment:{post_id}`. An edit does not change the comment count, so it
/// does not poke `posts`. A non-owner edit is `EntityNotFound` (400), with no
/// push.
pub async fn update_post_comment(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForUpdate<PostCommentForUpdate>,
) -> Result<PokedRpcResult<PostComment, poke::PostComment>> {
	let ParamsForUpdate { id, data } = params;
	PostCommentBmc::update(&ctx, &mm, id, data).await?;
	let comment = PostCommentBmc::get(&ctx, &mm, id).await?;
	let receipt = ws_state.broadcast_post_comment(&comment);
	Ok(PokedRpcResult::new(comment, receipt))
}

/// Delete the caller's own Comment (#124). It pushes the removal (the id and
/// its `post_id`) on `post_comment:{post_id}`, then pokes `posts` for the
/// count. The handler reads the Comment first, for its `post_id`: the read is
/// public, the delete is owner-only. A non-owner delete is `EntityNotFound`
/// (400), with no push. `params.id` is the Comment id.
pub async fn delete_post_comment(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsIded,
) -> Result<PokedRpcResult<PostCommentRemoval, poke::PostComment>> {
	let comment = PostCommentBmc::get(&ctx, &mm, params.id).await?;
	PostCommentBmc::delete(&ctx, &mm, comment.id).await?;
	let removal = PostCommentRemoval {
		id: comment.id,
		post_id: comment.post_id,
	};
	let receipt = ws_state.broadcast_post_comment_removal(removal);
	ws_state.broadcast_posts_update();
	Ok(PokedRpcResult::new(removal, receipt))
}

/// List one Post's Comments, oldest first (#124). `params.id` is the **Post**
/// id; the optional `params.list_options` pages the thread (`limit` /
/// `offset`).
pub async fn list_post_comments(
	ctx: Ctx,
	mm: ModelManager,
	params: ParamsIdedList,
) -> Result<DataRpcResult<Vec<PostComment>>> {
	let comments =
		PostCommentBmc::list_for_post(&ctx, &mm, params.id, params.list_options)
			.await?;
	Ok(comments.into())
}
