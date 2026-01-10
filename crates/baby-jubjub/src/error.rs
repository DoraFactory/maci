//! Error types for the baby-jubjub library

use thiserror::Error;

/// Error types for baby-jubjub operations
#[derive(Error, Debug, Clone, PartialEq, Eq)]
pub enum BabyJubjubError {
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

    #[error("Cannot compute square root: {0}")]
    SquareRootError(String),
}

/// Result type alias for convenience
pub type Result<T> = std::result::Result<T, BabyJubjubError>;
