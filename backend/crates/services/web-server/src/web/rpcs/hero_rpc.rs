use lib_core::model::hero::{HeroBmc, HeroForUpdate, HeroView};
use lib_rpc_core::prelude::*;

/// The authenticated Hero RPC: the one mutation. Hero write is unscoped for
/// now — Admin-only write-gating is deferred until a privilege system exists
/// (ADR-0011 addendum) — but it still requires a login.
pub fn rpc_router_builder() -> RouterBuilder {
	router_builder!(update_hero,)
}

/// The public Hero RPC: the anonymous home page reads the banner (#119).
pub fn public_rpc_router_builder() -> RouterBuilder {
	router_builder!(get_hero,)
}

/// Fetch the Hero singleton as its `HeroView` public projection — never the
/// audit columns (ADR-0021).
pub async fn get_hero(
	ctx: Ctx,
	mm: ModelManager,
) -> Result<DataRpcResult<HeroView>> {
	let view = HeroBmc::get_hero(&ctx, &mm).await?;
	Ok(view.into())
}

/// Update the Hero singleton and return the updated `HeroView`. The write path
/// rejects over-cap text and an unsafe `background_image` (ADR-0019).
pub async fn update_hero(
	ctx: Ctx,
	mm: ModelManager,
	params: ParamsForUpdate<HeroForUpdate>,
) -> Result<DataRpcResult<HeroView>> {
	let ParamsForUpdate { id, data } = params;
	HeroBmc::update(&ctx, &mm, id, data).await?;
	let view = HeroBmc::get_hero(&ctx, &mm).await?;
	Ok(view.into())
}
