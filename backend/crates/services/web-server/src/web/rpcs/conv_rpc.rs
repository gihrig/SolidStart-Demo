use crate::web::poke::{self, PokedRpcResult};
use crate::web::routes_ws::WsState;
use lib_core::model::conv::{
	Conv, ConvBmc, ConvFilter, ConvForCreate, ConvForUpdate,
};
use lib_core::model::conv_msg::{ConvMsg, ConvMsgFilter, ConvMsgForCreate};
use lib_rpc_core::prelude::*;

pub fn rpc_router_builder() -> RouterBuilder {
	router_builder!(
		// Same as RpcRouter::new().add...
		create_conv,
		get_conv,
		list_convs,
		update_conv,
		delete_conv,
		add_conv_msg,
		list_conv_msgs,
	)
}

// `get_conv` is the common read passthrough. `list_convs` is hand-written so it
// can hide Archived Convs by default (#25, `ConvBmc::list_active_default`).
// `create`/`update`/`delete` are hand-written so each can poke the
// Conversation-list feed (#85).

/// Fetch a single Conversation by id (owner ∪ public read scope).
pub async fn get_conv(
	ctx: Ctx,
	mm: ModelManager,
	params: ParamsIded,
) -> Result<DataRpcResult<Conv>> {
	let entity = ConvBmc::get(&ctx, &mm, params.id).await?;
	Ok(entity.into())
}

/// List Conversations as the default working set: Archived Convs are hidden
/// unless the `filter` constrains `state`, in which case it is honored verbatim
/// (so Archived Convs can be listed explicitly via `state = Archived`). #25.
pub async fn list_convs(
	ctx: Ctx,
	mm: ModelManager,
	params: ParamsList<ConvFilter>,
) -> Result<DataRpcResult<Vec<Conv>>> {
	let convs =
		ConvBmc::list_active_default(&ctx, &mm, params.filters, params.list_options)
			.await?;
	Ok(convs.into())
}

/// Create a Conversation, then poke the Conversation-list feed so every client
/// refetches its list. The poke fires on write-commit, before the re-get, so a
/// committed change reaches clients even if the re-get fails (ADR-0016).
pub async fn create_conv(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForCreate<ConvForCreate>,
) -> Result<PokedRpcResult<Conv, poke::Convs>> {
	let ParamsForCreate { data } = params;
	let id = ConvBmc::create(&ctx, &mm, data).await?;
	let receipt = ws_state.broadcast_conv_update();
	let entity = ConvBmc::get(&ctx, &mm, id).await?;
	Ok(PokedRpcResult::new(entity, receipt))
}

/// Update a Conversation, then poke the Conversation-list feed. The poke fires on
/// write-commit, before the re-get (ADR-0016).
pub async fn update_conv(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForUpdate<ConvForUpdate>,
) -> Result<PokedRpcResult<Conv, poke::Convs>> {
	let ParamsForUpdate { id, data } = params;
	ConvBmc::update(&ctx, &mm, id, data).await?;
	let receipt = ws_state.broadcast_conv_update();
	let entity = ConvBmc::get(&ctx, &mm, id).await?;
	Ok(PokedRpcResult::new(entity, receipt))
}

/// Delete a Conversation, then poke the Conversation-list feed.
pub async fn delete_conv(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsIded,
) -> Result<PokedRpcResult<Conv, poke::Convs>> {
	let ParamsIded { id } = params;
	let entity = ConvBmc::get(&ctx, &mm, id).await?;
	ConvBmc::delete(&ctx, &mm, id).await?;
	let receipt = ws_state.broadcast_conv_update();
	Ok(PokedRpcResult::new(entity, receipt))
}

/// Add conv_msg, then poke its Conversation's message channel (payload poke).
pub async fn add_conv_msg(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForCreate<ConvMsgForCreate>,
) -> Result<PokedRpcResult<ConvMsg, poke::Conv>> {
	let ParamsForCreate { data: msg_c } = params;

	let msg_id = ConvBmc::add_msg(&ctx, &mm, msg_c).await?;
	let msg = ConvBmc::get_msg(&ctx, &mm, msg_id).await?;

	// Broadcast the new message on its Conversation's channel.
	let receipt = ws_state.broadcast_conv_msg(&msg);

	Ok(PokedRpcResult::new(msg, receipt))
}

/// List conv_msgs, typically filtered by conv_id
pub async fn list_conv_msgs(
	ctx: Ctx,
	mm: ModelManager,
	params: ParamsList<ConvMsgFilter>,
) -> Result<DataRpcResult<Vec<ConvMsg>>> {
	let msgs =
		ConvBmc::list_msgs(&ctx, &mm, params.filters, params.list_options).await?;
	Ok(msgs.into())
}

/// Return conv_msg
#[allow(unused)]
pub async fn get_conv_msg(
	ctx: Ctx,
	mm: ModelManager,
	params: ParamsIded,
) -> Result<DataRpcResult<ConvMsg>> {
	let ParamsIded { id: msg_id } = params;

	let msg = ConvBmc::get_msg(&ctx, &mm, msg_id).await?;

	Ok(msg.into())
}
