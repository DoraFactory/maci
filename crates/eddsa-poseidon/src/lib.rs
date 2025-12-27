//! # EdDSA-Poseidon
//!
//! A Rust implementation of EdDSA signature scheme using Poseidon hash and Baby Jubjub elliptic curve.
//! This is a port of the zk-kit TypeScript implementation to Rust.
//!
//! ## Features
//!
//! - EdDSA signatures using Baby Jubjub curve
//! - Poseidon hash function for signing
//! - Support for BLAKE-512 and BLAKE2b key derivation
//! - Compatible with zk-kit's EdDSA-Poseidon implementation

mod eddsa;
mod types;
mod utils;

pub use eddsa::{
    derive_public_key, derive_secret_scalar, pack_public_key, pack_signature, sign_message,
    unpack_public_key, unpack_signature, verify_signature, EdDSAPoseidon,
};
pub use types::{HashingAlgorithm, Signature};

// Re-export commonly used types from dependencies
pub use baby_jubjub::{base8, EdwardsAffine};
pub use num_bigint::BigUint;
