/// Create the base crud rpc functions following the common pattern.
/// - `create_...`
/// - `get_...`
///
/// NOTE: Make sure to import the Ctx, ModelManager, ... in the model that uses this macro.
#[macro_export]
macro_rules! generate_common_rpc_fns {
    (
        Bmc: $bmc:ident,
        Entity: $entity:ty,
        ForCreate: $for_create:ty,
        ForUpdate: $for_update:ty,
        Filter: $filter:ty,
        Suffix: $suffix:ident
    ) => {
        paste! {
            pub async fn [<create_ $suffix>](
                ctx: Ctx,
                mm: ModelManager,
                params: ParamsForCreate<$for_create>,
            ) -> Result<DataRpcResult<$entity>> {
                let ParamsForCreate { data } = params;
                let id = $bmc::create(&ctx, &mm, data).await?;
                let entity = $bmc::get(&ctx, &mm, id).await?;
                Ok(entity.into())
            }

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

            pub async fn [<update_ $suffix>](
                ctx: Ctx,
                mm: ModelManager,
                params: ParamsForUpdate<$for_update>,
            ) -> Result<DataRpcResult<$entity>> {
                let ParamsForUpdate { id, data } = params;
                $bmc::update(&ctx, &mm, id, data).await?;
                let entity = $bmc::get(&ctx, &mm, id).await?;
                Ok(entity.into())
            }

            pub async fn [<delete_ $suffix>](
                ctx: Ctx,
                mm: ModelManager,
                params: ParamsIded,
            ) -> Result<DataRpcResult<$entity>> {
                let ParamsIded { id } = params;
                let entity = $bmc::get(&ctx, &mm, id).await?;
                $bmc::delete(&ctx, &mm, id).await?;
                Ok(entity.into())
            }
        }
    };
}

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
