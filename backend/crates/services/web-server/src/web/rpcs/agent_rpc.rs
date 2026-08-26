use crate::web::routes_ws::WsState;
use lib_core::model::agent::{
	Agent, AgentBmc, AgentFilter, AgentForCreate, AgentForUpdate,
};
use lib_rpc_core::prelude::*;

pub fn rpc_router_builder() -> RouterBuilder {
	router_builder!(
		// Same as RpcRouter::new().add...
		create_agent,
		get_agent,
		list_agents,
		update_agent,
		delete_agent,
	)
}

// `get_agent` / `list_agents` follow the common pattern. `create`/`update`/
// `delete` are hand-written below so each can poke the Agent-list feed (#85).
generate_common_rpc_read_fns!(
	Bmc: AgentBmc,
	Entity: Agent,
	Filter: AgentFilter,
	Suffix: agent
);

/// Create an Agent, then poke the Agent-list feed so every client refetches.
pub async fn create_agent(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForCreate<AgentForCreate>,
) -> Result<DataRpcResult<Agent>> {
	let ParamsForCreate { data } = params;
	let id = AgentBmc::create(&ctx, &mm, data).await?;
	let entity = AgentBmc::get(&ctx, &mm, id).await?;
	ws_state.broadcast_agent_update();
	Ok(entity.into())
}

/// Update an Agent, then poke the Agent-list feed.
pub async fn update_agent(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForUpdate<AgentForUpdate>,
) -> Result<DataRpcResult<Agent>> {
	let ParamsForUpdate { id, data } = params;
	AgentBmc::update(&ctx, &mm, id, data).await?;
	let entity = AgentBmc::get(&ctx, &mm, id).await?;
	ws_state.broadcast_agent_update();
	Ok(entity.into())
}

/// Delete an Agent, then poke the Agent-list feed.
pub async fn delete_agent(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsIded,
) -> Result<DataRpcResult<Agent>> {
	let ParamsIded { id } = params;
	let entity = AgentBmc::get(&ctx, &mm, id).await?;
	AgentBmc::delete(&ctx, &mm, id).await?;
	ws_state.broadcast_agent_update();
	Ok(entity.into())
}
