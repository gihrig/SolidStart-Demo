use lib_core::model::post::{PostBmc, PostFilter, PostView};
use lib_rpc_core::prelude::*;

pub fn rpc_router_builder() -> RouterBuilder {
	router_builder!(get_post, list_posts, featured_post,)
}

// Every Post is public (#106), so these are PUBLIC reads (`/api/rpc-public`):
// each returns the `PostView` public projection — author, resolved Categories,
// and derived counts, never the audit columns (ADR-0021). Post mutations (create
// / like / comment) are owner-scoped and land in later tickets on the
// authenticated surface.

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
