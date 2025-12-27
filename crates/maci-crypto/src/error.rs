//! Error types for the MACI crypto library
//!
//! This module provides unified error handling for all cryptographic operations.

use thiserror::Error;

/// Error types for the MACI crypto library
#[derive(Error, Debug, Clone, PartialEq, Eq)]
pub enum CryptoError {
    // ============ Field Element Errors ============
    #[error("Invalid field element: {0}")]
    InvalidFieldElement(String),

    // ============ Point/Curve Errors ============
    #[error("Invalid point: {0}")]
    InvalidPoint(String),

    #[error("Invalid point: packed value exceeds 32 bytes")]
    PackedPointTooLarge,

    #[error("Invalid point: y coordinate out of range")]
    YCoordinateOutOfRange,

    #[error("Invalid point: denominator is zero")]
    DenominatorZero,

    #[error("Invalid point: denominator has no inverse")]
    DenominatorNoInverse,

    #[error("Unpacked point is not on curve")]
    PointNotOnCurve,

    #[error("Cannot compute square root - value is either not a quadratic residue or sqrt() is not implemented for this field: {0}")]
    SquareRootError(String),

    // ============ Key Errors ============
    #[error("Invalid key: {0}")]
    InvalidKey(String),

    #[error("Invalid packed public key: {0}")]
    InvalidPackedPublicKey(String),

    // ============ Hash Errors ============
    #[error("Hash function error: {0}")]
    HashError(String),

    #[error("Poseidon hash error: expected {expected} inputs, got {actual}")]
    PoseidonInputCountMismatch { expected: usize, actual: usize },

    #[error("Hash error: elements length {actual} exceeds maximum {max}")]
    HashElementsExceedMax { actual: usize, max: usize },

    // ============ Tree Errors ============
    #[error("Tree operation error: {0}")]
    TreeError(String),

    #[error("Leaf index {index} out of range")]
    LeafIndexOutOfRange { index: usize },

    #[error("IMT not initialized")]
    IMTNotInitialized,

    #[error("Tree depth error: to_depth must be greater than from_depth")]
    InvalidTreeDepth,

    #[error("Tree error: zero_hashes array is too short for target depth")]
    ZeroHashesTooShort,

    #[error("Failed to update leaf: {0}")]
    LeafUpdateFailed(String),

    // ============ Rerandomization Errors ============
    #[error("Rerandomization error: {0}")]
    RerandomizationError(String),

    #[error("Invalid point coordinates: {0}")]
    InvalidPointCoordinates(String),

    // ============ Serialization Errors ============
    #[error("Serialization error: {0}")]
    SerializationError(String),

    // ============ Hex Decode Errors ============
    #[error("Hex decode error: {0}")]
    HexDecodeError(String),

    // ============ Generic Errors ============
    #[error("Generic error: {0}")]
    Generic(String),
}

impl From<hex::FromHexError> for CryptoError {
    fn from(err: hex::FromHexError) -> Self {
        CryptoError::HexDecodeError(err.to_string())
    }
}

/// Result type alias for convenience
pub type Result<T> = std::result::Result<T, CryptoError>;

impl CryptoError {
    /// Create an invalid point error with a message
    pub fn invalid_point(msg: impl Into<String>) -> Self {
        Self::InvalidPoint(msg.into())
    }

    /// Create a hash error with a message
    pub fn hash_error(msg: impl Into<String>) -> Self {
        Self::HashError(msg.into())
    }

    /// Create a tree error with a message
    pub fn tree_error(msg: impl Into<String>) -> Self {
        Self::TreeError(msg.into())
    }

    /// Create a generic error with a message
    pub fn generic(msg: impl Into<String>) -> Self {
        Self::Generic(msg.into())
    }
}
