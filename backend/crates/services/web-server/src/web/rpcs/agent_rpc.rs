use lib_core::model::agent::{
	Agent, AgentBmc, AgentFilter, AgentForCreate, AgentForUpdate,
};
use lib_rpc_core::prelude::*;
use lib_web::ws::poke::{self, PokedRpcResult};
use lib_web::ws::WsState;

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

/// Create an Agent, then poke the Agent-list feed so every client refetches. The
/// poke fires on write-commit, before the re-get, so a committed change reaches
/// clients even if the re-get fails (ADR-0016).
pub async fn create_agent(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForCreate<AgentForCreate>,
) -> Result<PokedRpcResult<Agent, poke::Agents>> {
	let ParamsForCreate { data } = params;
	let id = AgentBmc::create(&ctx, &mm, data).await?;
	let receipt = ws_state.broadcast_agent_update();
	let entity = AgentBmc::get(&ctx, &mm, id).await?;
	Ok(PokedRpcResult::new(entity, receipt))
}

/// Update an Agent, then poke the Agent-list feed. The poke fires on write-commit,
/// before the re-get (ADR-0016).
pub async fn update_agent(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForUpdate<AgentForUpdate>,
) -> Result<PokedRpcResult<Agent, poke::Agents>> {
	let ParamsForUpdate { id, data } = params;
	AgentBmc::update(&ctx, &mm, id, data).await?;
	let receipt = ws_state.broadcast_agent_update();
	let entity = AgentBmc::get(&ctx, &mm, id).await?;
	Ok(PokedRpcResult::new(entity, receipt))
}

/// Delete an Agent, then poke the Agent-list feed.
pub async fn delete_agent(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsIded,
) -> Result<PokedRpcResult<Agent, poke::Agents>> {
	let ParamsIded { id } = params;
	let entity = AgentBmc::get(&ctx, &mm, id).await?;
	AgentBmc::delete(&ctx, &mm, id).await?;
	let receipt = ws_state.broadcast_agent_update();
	Ok(PokedRpcResult::new(entity, receipt))
}
