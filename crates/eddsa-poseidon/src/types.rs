use baby_jubjub::EdwardsAffine;
use num_bigint::BigUint;

/// Signature structure for EdDSA-Poseidon
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Signature {
    /// R8 point on the curve
    pub r8: EdwardsAffine,
    /// Scalar S
    pub s: BigUint,
}

/// Supported hashing algorithms for key derivation
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HashingAlgorithm {
    /// BLAKE-512 (original Blake algorithm)
    Blake512,
    /// BLAKE2b
    Blake2b,
}
