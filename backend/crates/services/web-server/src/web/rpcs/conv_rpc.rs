use crate::web::routes_ws::WsState;
use lib_core::model::conv::{
	Conv, ConvBmc, ConvFilter, ConvForCreate, ConvForUpdate,
};
use lib_core::model::conv_msg::{ConvMsg, ConvMsgForCreate};
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
	)
}

generate_common_rpc_fns!(
	Bmc: ConvBmc,
	Entity: Conv,
	ForCreate: ConvForCreate,
	ForUpdate: ConvForUpdate,
	Filter: ConvFilter,
	Suffix: conv
);

/// Add conv_msg with WebSocket broadcast
pub async fn add_conv_msg(
	ctx: Ctx,
	mm: ModelManager,
	ws_state: WsState,
	params: ParamsForCreate<ConvMsgForCreate>,
) -> Result<DataRpcResult<ConvMsg>> {
	let ParamsForCreate { data: msg_c } = params;

	// Get conv_id before creating message (for broadcast)
	let conv_id = msg_c.conv_id;

	let msg_id = ConvBmc::add_msg(&ctx, &mm, msg_c).await?;
	let msg = ConvBmc::get_msg(&ctx, &mm, msg_id).await?;

	// Broadcast WebSocket event for new message
	if let Ok(payload) = serde_json::to_value(&msg) {
		ws_state.broadcast_conv_msg(conv_id, &payload);
	}

	Ok(msg.into())
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
