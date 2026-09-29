use lib_core::model::post::{PostBmc, PostFilter, PostForCreate, PostView};
use lib_rpc_core::prelude::*;
use lib_web::ws::poke::{self, PokedRpcResult};
use lib_web::ws::WsState;

/// The authenticated Post RPCs: the mutations (`/api/rpc`, login required).
pub fn rpc_router_builder() -> RouterBuilder {
	router_builder!(create_post,)
}

/// The public Post RPCs: every Post is public (#106), so the reads run on
/// `/api/rpc-public`.
pub fn public_rpc_router_builder() -> RouterBuilder {
	router_builder!(get_post, list_posts, featured_post,)
}

// The reads each return the `PostView` public projection — author, resolved
// Categories, and derived counts, never the audit columns (ADR-0021). The like
// and comment mutations land in later tickets on the authenticated surface.

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
