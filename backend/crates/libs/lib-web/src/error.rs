use crate::middleware;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use derive_more::From;
use lib_auth::{pwd, token};
use lib_core::model;
use serde::Serialize;
use serde_json::Value;
use serde_with::{serde_as, DisplayFromStr};
use std::sync::Arc;
use tracing::{debug, warn};
use ts_rs::TS;

pub type Result<T> = core::result::Result<T, Error>;

#[serde_as]
#[derive(Debug, From, Serialize, strum_macros::AsRefStr, TS)]
#[serde(tag = "type", content = "data")]
#[ts(export, export_to = "lib_web_Error.d.ts")]
#[ts(rename = "LibWebError")]
pub enum Error {
	// -- Login
	LoginFailUsernameNotFound,
	LoginFailUserHasNoPwd {
		user_id: i64,
	},
	LoginFailPwdNotMatching {
		user_id: i64,
	},

	// -- CtxExtError
	#[from]
	CtxExt(middleware::mw_auth::CtxExtError),

	// -- Extractors
	ReqStampNotInReqExt,

	// -- Modules
	#[from]
	Model(model::Error),
	#[from]
	Pwd(pwd::Error),
	#[from]
	Token(token::Error),

	// -- RpcError (deconstructed from rpc_router::Error)
	// Simple mapping for the RpcRequestParsingError. It will have the eventual id, method context.
	#[from]
	#[ts(skip)]
	RpcRequestParsing(rpc_router::RpcRequestParsingError),

	// When it's `rpc_router::Error::Handler` but we did not handle the type,
	// we still capture the type name for information. This should not occur once the code is complete.
	RpcHandlerErrorUnhandled(&'static str),
	// When the `rpc_router::Error` is not a `Handler`, we can pass through the rpc_router::Error
	// as all variants contain concrete types.
	RpcRouter {
		#[ts(skip)]
		id: Value,
		method: String,
		#[ts(skip)]
		error: rpc_router::Error,
	},

	// -- External Modules
	#[from]
	SerdeJson(
		#[serde_as(as = "DisplayFromStr")]
		#[ts(type = "string")]
		serde_json::Error,
	),
}

// region:    --- From rpc-router::Error

/// The purpose of this `From` implementation is to extract the error types we recognize
/// from the `rpc_router`'s `RpcHandlerError` within the `rpc_router::Error::Handler`
/// and place them into the appropriate variant of our application error enum.
///
/// - The `rpc-router` provides an `RpcHandlerError` scheme to allow application RPC handlers
///   to return the errors they wish with minimal constraints.
/// - This approach requires us to "unpack" those types in our code and assign them to the correct
///   "concrete/direct" variant (not `Box<dyn Any>`...).
/// - If it's not an `rpc_router::Error::Handler` variant, then we can capture the `rpc_router::Error`
///   as it is, treating all other variants as "concrete/direct" types.
impl From<rpc_router::CallError> for Error {
	fn from(call_error: rpc_router::CallError) -> Self {
		let rpc_router::CallError { id, method, error } = call_error;
		match error {
			rpc_router::Error::Handler(mut rpc_handler_error) => {
				if let Some(lib_rpc_error) =
					rpc_handler_error.remove::<lib_rpc_core::Error>()
				{
					// Flatten the known handler error into our own concrete
					// variants, so the client mapping matches each kind once
					// (a wrapped `Model(..)` is not a 500).
					match lib_rpc_error {
						lib_rpc_core::Error::Model(model_error) => {
							Error::Model(model_error)
						}
						lib_rpc_core::Error::SerdeJson(serde_error) => {
							Error::SerdeJson(serde_error)
						}
					}
				}
				// report the unhandled error for debugging and completing code.
				else {
					let type_name = rpc_handler_error.type_name();
					warn!("Unhandled RpcHandlerError type: {type_name}");
					Error::RpcHandlerErrorUnhandled(type_name)
				}
			}
			error => Error::RpcRouter {
				id: id.to_value(),
				method,
				error,
			},
		}
	}
}

// endregion: --- From rpc-router::Error

// region:    --- Axum IntoResponse
impl IntoResponse for Error {
	fn into_response(self) -> Response {
		debug!("{:<12} - model::Error {self:?}", "INTO_RES");

		// Create a placeholder Axum response.
		let mut response = StatusCode::INTERNAL_SERVER_ERROR.into_response();

		// Insert the Error into the response.
		response.extensions_mut().insert(Arc::new(self));

		response
	}
}
// endregion: --- Axum IntoResponse

// region:    --- Error Boilerplate
impl core::fmt::Display for Error {
	fn fmt(
		&self,
		fmt: &mut core::fmt::Formatter,
	) -> core::result::Result<(), core::fmt::Error> {
		write!(fmt, "{self:?}")
	}
}

impl std::error::Error for Error {}
// endregion: --- Error Boilerplate

// region:    --- Client Error

/// From the root error to the http status code and ClientError
impl Error {
	pub(crate) fn client_status_and_error(&self) -> (StatusCode, ClientError) {
		use Error::*; // TODO: should change to `use web::Error as E`

		match self {
			// -- Login
			LoginFailUsernameNotFound
			| LoginFailUserHasNoPwd { .. }
			| LoginFailPwdNotMatching { .. } => {
				(StatusCode::UNAUTHORIZED, ClientError::LOGIN_FAIL)
			}

			// -- Auth
			CtxExt(_) => (StatusCode::UNAUTHORIZED, ClientError::NO_AUTH),

			// -- Model
			// A model error surfaces directly and — the common case — wrapped
			// by an RPC handler. `From<CallError>` flattens the wrapped form
			// into `Model(..)`, so one arm per kind serves both paths, and an
			// RPC create/update/read reject is a 400, not a 500.
			Model(model::Error::EntityNotFound { entity, id }) => (
				StatusCode::BAD_REQUEST,
				ClientError::ENTITY_NOT_FOUND { entity, id: *id },
			),
			Model(model::Error::Validation { field, reason }) => (
				StatusCode::BAD_REQUEST,
				ClientError::VALIDATION_FAIL {
					field: field.clone(),
					reason: reason.clone(),
				},
			),

			// -- Rpc
			RpcRequestParsing(req_parsing_err) => (
				StatusCode::BAD_REQUEST,
				ClientError::RPC_REQUEST_INVALID(req_parsing_err.to_string()),
			),
			RpcRouter {
				error: rpc_router::Error::MethodUnknown,
				method,
				..
			} => (
				StatusCode::BAD_REQUEST,
				ClientError::RPC_REQUEST_METHOD_UNKNOWN(format!(
					"rpc method '{method}' unknown"
				)),
			),
			RpcRouter {
				error: rpc_router::Error::ParamsParsing(params_parsing_err),
				..
			} => (
				StatusCode::BAD_REQUEST,
				ClientError::RPC_PARAMS_INVALID(params_parsing_err.to_string()),
			),
			RpcRouter {
				error: rpc_router::Error::ParamsMissingButRequested,
				method,
				..
			} => (
				StatusCode::BAD_REQUEST,
				ClientError::RPC_PARAMS_INVALID(format!(
					"Params missing. Method '{method}' requires params"
				)),
			),

			// -- Fallback.
			_ => (
				StatusCode::INTERNAL_SERVER_ERROR,
				ClientError::SERVICE_ERROR,
			),
		}
	}
}

#[derive(Debug, Serialize, strum_macros::AsRefStr)]
#[serde(tag = "message", content = "detail")]
#[allow(non_camel_case_types)]
pub(crate) enum ClientError {
	LOGIN_FAIL,
	NO_AUTH,
	ENTITY_NOT_FOUND { entity: &'static str, id: i64 },
	VALIDATION_FAIL { field: String, reason: String },

	RPC_REQUEST_INVALID(String),
	RPC_REQUEST_METHOD_UNKNOWN(String),
	RPC_PARAMS_INVALID(String),

	SERVICE_ERROR,
}
// endregion: --- Client Error

// region:    --- Tests

#[cfg(test)]
mod tests {
	use super::*;

	/// Both model errors that carry client meaning map to HTTP 400 (not the
	/// 500 fallback), each to its own `ClientError`.
	#[test]
	fn model_errors_map_to_400() {
		let not_found = Error::Model(model::Error::EntityNotFound {
			entity: "post",
			id: 42,
		});
		let (status, client) = not_found.client_status_and_error();
		assert_eq!(status, StatusCode::BAD_REQUEST);
		assert!(matches!(client, ClientError::ENTITY_NOT_FOUND { .. }));

		let validation = Error::Model(model::Error::Validation {
			field: "title".to_string(),
			reason: "control character not allowed".to_string(),
		});
		let (status, client) = validation.client_status_and_error();
		assert_eq!(status, StatusCode::BAD_REQUEST);
		assert!(matches!(client, ClientError::VALIDATION_FAIL { .. }));
	}

	/// The real RPC path: a handler that returns `model::Error::EntityNotFound`
	/// arrives as `rpc_router::Error::Handler`. `From<CallError>` must flatten
	/// it to `Error::Model(..)` so the client mapping is 400, not the 500
	/// fallback. Before the flatten this wrapped form fell through to a 500 (#114).
	#[test]
	fn rpc_wrapped_model_error_flattens_to_400() {
		let handler_error = rpc_router::HandlerError::new(
			lib_rpc_core::Error::Model(model::Error::EntityNotFound {
				entity: "post",
				id: 42,
			}),
		);
		let call_error = rpc_router::CallError {
			id: rpc_router::RpcId::Null,
			method: "get_post".to_string(),
			error: rpc_router::Error::Handler(handler_error),
		};

		let err = Error::from(call_error);

		assert!(
			matches!(err, Error::Model(model::Error::EntityNotFound { .. })),
			"expected flatten to Error::Model(EntityNotFound), got: {err:?}"
		);
		let (status, client) = err.client_status_and_error();
		assert_eq!(
			status,
			StatusCode::BAD_REQUEST,
			"RPC entity-not-found must be 400, not 500"
		);
		assert!(matches!(client, ClientError::ENTITY_NOT_FOUND { .. }));
	}
}

// endregion: --- Tests
