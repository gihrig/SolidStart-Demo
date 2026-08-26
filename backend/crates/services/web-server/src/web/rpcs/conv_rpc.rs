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

// `get_conv` / `list_convs` follow the common pattern. `create`/`update`/
// `delete` are hand-written below so each can poke the Conversation-list feed (#85).
generate_common_rpc_read_fns!(
	Bmc: ConvBmc,
	Entity: Conv,
	Filter: ConvFilter,
	Suffix: conv
);

/// Create a Conversation, then poke the Conversation-list feed so every client
/// refetches its list.
pub async fn create_conv(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForCreate<ConvForCreate>,
) -> Result<DataRpcResult<Conv>> {
	let ParamsForCreate { data } = params;
	let id = ConvBmc::create(&ctx, &mm, data).await?;
	let entity = ConvBmc::get(&ctx, &mm, id).await?;
	ws_state.broadcast_conv_update();
	Ok(entity.into())
}

/// Update a Conversation, then poke the Conversation-list feed.
pub async fn update_conv(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForUpdate<ConvForUpdate>,
) -> Result<DataRpcResult<Conv>> {
	let ParamsForUpdate { id, data } = params;
	ConvBmc::update(&ctx, &mm, id, data).await?;
	let entity = ConvBmc::get(&ctx, &mm, id).await?;
	ws_state.broadcast_conv_update();
	Ok(entity.into())
}

/// Delete a Conversation, then poke the Conversation-list feed.
pub async fn delete_conv(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsIded,
) -> Result<DataRpcResult<Conv>> {
	let ParamsIded { id } = params;
	let entity = ConvBmc::get(&ctx, &mm, id).await?;
	ConvBmc::delete(&ctx, &mm, id).await?;
	ws_state.broadcast_conv_update();
	Ok(entity.into())
}

/// Add conv_msg with WebSocket broadcast
pub async fn add_conv_msg(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForCreate<ConvMsgForCreate>,
) -> Result<DataRpcResult<ConvMsg>> {
	let ParamsForCreate { data: msg_c } = params;

	let msg_id = ConvBmc::add_msg(&ctx, &mm, msg_c).await?;
	let msg = ConvBmc::get_msg(&ctx, &mm, msg_id).await?;

	// Broadcast the new message on its Conversation's channel.
	ws_state.broadcast_conv_msg(&msg);

	Ok(msg.into())
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
