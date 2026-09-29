use lib_core::model::user::{AuthorRef, UserBmc};
use lib_rpc_core::prelude::*;

/// The authenticated profile RPC: the current User needs a login (#119).
pub fn rpc_router_builder() -> RouterBuilder {
	router_builder!(get_profile,)
}

/// The current User's profile as an `AuthorRef` (`id`, `name`, `avatar_url`).
/// The nav avatar reads it.
pub async fn get_profile(
	ctx: Ctx,
	mm: ModelManager,
) -> Result<DataRpcResult<AuthorRef>> {
	let profile = UserBmc::get_profile(&ctx, &mm).await?;
	Ok(profile.into())
}
