use lib_core::model::hero::{HeroBmc, HeroForUpdate, HeroView};
use lib_core::model::user::{User, UserBmc, UserTyp};
use lib_core::model::Error as ModelError;
use lib_rpc_core::prelude::*;

/// The authenticated Hero RPC: the one mutation. It requires a login, and an
/// interim Admin gate in `update_hero` admits only a `Sys` User (see there).
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
///
/// Interim Admin gate (#181): the Hero is site-wide content, so only an Admin
/// (`Sys`) User may edit it. The model write stays unscoped (ADR-0011
/// addendum); this RPC-layer check stands until the privilege system replaces
/// it. A non-Admin caller gets `EntityNotFound`, the permission-miss idiom of
/// #89, so the write reveals nothing.
pub async fn update_hero(
	ctx: Ctx,
	mm: ModelManager,
	params: ParamsForUpdate<HeroForUpdate>,
) -> Result<DataRpcResult<HeroView>> {
	let ParamsForUpdate { id, data } = params;
	let caller: User = UserBmc::get(&ctx, &mm, ctx.user_id()).await?;
	if !matches!(caller.typ, UserTyp::Sys) {
		return Err(ModelError::EntityNotFound { entity: "hero", id }.into());
	}
	HeroBmc::update(&ctx, &mm, id, data).await?;
	let view = HeroBmc::get_hero(&ctx, &mm).await?;
	Ok(view.into())
}
