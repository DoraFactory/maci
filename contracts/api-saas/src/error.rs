use cosmwasm_std::{OverflowError, StdError};
use cw_utils::PaymentError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized")]
    Unauthorized {},

    #[error("Operator not found")]
    OperatorNotFound {},

    #[error("Operator already exists")]
    OperatorAlreadyExists {},

    #[error("Insufficient balance in SaaS contract")]
    InsufficientBalance {},

    #[error("Invalid address prefix, expected: {expected}, got: {actual}")]
    InvalidAddressPrefix { expected: String, actual: String },

    #[error("Invalid address: {address}")]
    InvalidAddress { address: String },

    #[error("No registry contract set")]
    NoRegistryContract {},

    #[error("Invalid Oracle MACI parameters: {reason}")]
    InvalidOracleMaciParameters { reason: String },

    #[error("Message serialization failed: {msg}")]
    SerializationError { msg: String },

    #[error("No funds sent")]
    NoFunds {},

    #[error("Cannot withdraw zero amount")]
    InvalidWithdrawAmount {},

    #[error("Value too large for conversion")]
    ValueTooLarge {},

    #[error("Payment error: {0}")]
    Payment(#[from] PaymentError),

    #[error("Overflow error: {0}")]
    Overflow(#[from] OverflowError),

    #[error("Contract instantiation failed")]
    ContractInstantiationFailed {},

    #[error("Treasury manager unauthorized")]
    TreasuryManagerUnauthorized {},
}
