use lib_core::model::like::{LikeBmc, LikeForToggle, LikeView};
use lib_core::model::post::{
	PostBmc, PostFilter, PostForCreate, PostLikeBmc, PostView,
};
use lib_rpc_core::prelude::*;
use lib_web::ws::poke::{self, PokedRpcResult};
use lib_web::ws::WsState;

/// The authenticated Post RPCs (`/api/rpc`, login required): the mutations, and
/// the caller's own like state, which is per-User and so not public (#122).
pub fn rpc_router_builder() -> RouterBuilder {
	router_builder!(create_post, toggle_post_like, get_post_like,)
}

/// The public Post RPCs: every Post is public (#106), so the reads run on
/// `/api/rpc-public`.
pub fn public_rpc_router_builder() -> RouterBuilder {
	router_builder!(get_post, list_posts, featured_post,)
}

// The public reads each return the `PostView` public projection — author,
// resolved Categories, and derived counts, never the audit columns (ADR-0021).
// The comment mutations land in later tickets on the authenticated surface.

/// Create a Post owned by the caller, with at least one Category (#120), then
/// poke the `posts` feed so every client refetches the list. The write path
/// rejects an unsafe URL or an over-cap title (ADR-0019). The poke fires on
/// write-commit, before the re-get (ADR-0016).
pub async fn create_post(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForCreate<PostForCreate>,
) -> Result<PokedRpcResult<PostView, poke::Posts>> {
	let ParamsForCreate { data } = params;
	let id = PostBmc::create(&ctx, &mm, data).await?;
	let receipt = ws_state.broadcast_posts_update();
	let view = PostBmc::get_post(&ctx, &mm, id).await?;
	Ok(PokedRpcResult::new(view, receipt))
}

/// Set the caller's Like on a Post to `data.liked` (#122). Idempotent: a second
/// like or unlike is a no-op. A toggle that changed the Like pokes
/// `post_like:{post_id}`, so subscribers refetch the count, and `posts`, so the
/// Top Photos ranking refetches; a no-op pokes nothing. The pokes fire on
/// write-commit, before the re-get (ADR-0016). An unknown Post is rejected
/// (400). The `{ data }` params shape matches the other mutations; `data.id` is
/// the Post id.
pub async fn toggle_post_like(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForCreate<LikeForToggle>,
) -> Result<PokedRpcResult<LikeView, poke::PostLike>> {
	let ParamsForCreate { data } = params;
	let post_id = data.id;
	let changed = LikeBmc::toggle::<PostLikeBmc>(&ctx, &mm, data).await?;
	let receipt = ws_state.broadcast_post_like(post_id, changed);
	if changed {
		ws_state.broadcast_posts_update();
	}
	let view = LikeBmc::get::<PostLikeBmc>(&ctx, &mm, post_id).await?;
	Ok(PokedRpcResult::new(view, receipt))
}

/// Read the caller's `LikeView` of one Post: the like count and whether the
/// caller likes it (#122). `params.id` is the Post id.
pub async fn get_post_like(
	ctx: Ctx,
	mm: ModelManager,
	params: ParamsIded,
) -> Result<DataRpcResult<LikeView>> {
	let view = LikeBmc::get::<PostLikeBmc>(&ctx, &mm, params.id).await?;
	Ok(view.into())
}

/// Fetch a single Post as its enriched `PostView`.
pub async fn get_post(
	ctx: Ctx,
	mm: ModelManager,
	params: ParamsIded,
) -> Result<DataRpcResult<PostView>> {
	let view = PostBmc::get_post(&ctx, &mm, params.id).await?;
	Ok(view.into())
}

/// List Posts as `PostView`s, ranked by like count descending (Top Photos, #117).
pub async fn list_posts(
	ctx: Ctx,
	mm: ModelManager,
	params: ParamsList<PostFilter>,
) -> Result<DataRpcResult<Vec<PostView>>> {
	let views =
		PostBmc::list_posts(&ctx, &mm, params.filters, params.list_options).await?;
	Ok(views.into())
}

/// The single featured Post: the top-ranked `PostView`. Takes the list params
/// shape for a uniform wire, but ignores them — "featured" is always the top Post.
pub async fn featured_post(
	ctx: Ctx,
	mm: ModelManager,
	_params: ParamsList<PostFilter>,
) -> Result<DataRpcResult<PostView>> {
	let view = PostBmc::featured_post(&ctx, &mm).await?;
	Ok(view.into())
}
