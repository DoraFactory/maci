//! Test vector generator for crypto primitives
//!
//! This crate provides utilities to generate test vectors for:
//! - Baby Jubjub curve operations
//! - EdDSA-Poseidon signatures

use serde::{Deserialize, Serialize};

/// Point on the Baby Jubjub curve
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PointJson {
    pub x: String,
    pub y: String,
}

/// Baby Jubjub test vector
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BabyJubjubTestVector {
    pub name: String,
    pub description: String,
    pub vector_type: String,
    pub data: BabyJubjubData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum BabyJubjubData {
    AddPoint {
        p1: PointJson,
        p2: PointJson,
        result: PointJson,
    },
    MulPointEscalar {
        base: PointJson,
        scalar: String,
        result: PointJson,
    },
    PackUnpack {
        point: PointJson,
        packed: String,
    },
    InCurve {
        point: PointJson,
        on_curve: bool,
    },
}

/// EdDSA-Poseidon test vector
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdDSAPoseidonTestVector {
    pub name: String,
    pub description: String,
    pub vector_type: String,
    pub data: EdDSAData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EdDSAData {
    DerivePublicKey {
        private_key: String,
        private_key_bytes: String,
        secret_scalar: String,
        public_key: PointJson,
    },
    SignVerify {
        private_key: String,
        private_key_bytes: String,
        message: String,
        public_key: PointJson,
        signature: SignatureJson,
        valid: bool,
    },
    PackSignature {
        signature: SignatureJson,
        packed: String,
    },
    SdkKeys {
        priv_key: String,
        priv_key_mod_snark: String,
        formatted_priv_key: String,
        pub_key: PointJson,
        packed_pub_key: String,
    },
    KeypairModule {
        priv_key: String,
        priv_key_mod_snark: String,
        secret_scalar: String,
        pub_key: PointJson,
        commitment: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignatureJson {
    pub r8: PointJson,
    pub s: String,
}
