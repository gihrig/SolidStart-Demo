/// Generate only the read rpc functions (`get_...`, `list_...s`).
///
/// Use this when an entity's `create`/`update`/`delete` must do more than the
/// common pattern — e.g. broadcast a WebSocket event — so those three are
/// hand-written with the extra resource (see `agent_rpc`, `conv_rpc`), while the
/// two read functions stay generated.
///
/// NOTE: Make sure to import the Ctx, ModelManager, ... in the model that uses this macro.
#[macro_export]
macro_rules! generate_common_rpc_read_fns {
    (
        Bmc: $bmc:ident,
        Entity: $entity:ty,
        Filter: $filter:ty,
        Suffix: $suffix:ident
    ) => {
        paste! {
            pub async fn [<get_ $suffix>](
                ctx: Ctx,
                mm: ModelManager,
                params: ParamsIded,
            ) -> Result<DataRpcResult<$entity>> {
                let entity = $bmc::get(&ctx, &mm, params.id).await?;
                Ok(entity.into())
            }

            // Note: for now just add `s` after the suffix.
            pub async fn [<list_ $suffix s>](
                ctx: Ctx,
                mm: ModelManager,
                params: ParamsList<$filter>,
            ) -> Result<DataRpcResult<Vec<$entity>>> {
                let entities = $bmc::list(&ctx, &mm, params.filters, params.list_options).await?;
                Ok(entities.into())
            }
        }
    };
}
