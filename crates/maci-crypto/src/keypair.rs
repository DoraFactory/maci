//! Keypair Module
//!
//! Adapted for MACI with BigUint compatibility

use crate::baby_jubjub::{BabyJubjubConfig, EdwardsAffine};
use crate::keys::{PrivKey, PubKey};
use ark_ec::{twisted_edwards::TECurveConfig, CurveGroup};
use ark_ed_on_bn254::{Fq, Fr as EdFr};
use ark_ff::{BigInteger, PrimeField};
use light_poseidon::{Poseidon, PoseidonHasher};
use num_bigint::{BigInt, BigUint, Sign};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::ops::Mul;

/// A keypair containing private key, public key, and formatted private key
#[derive(Debug, Clone)]
pub struct Keypair {
    /// Private key bytes
    pub private_key: Vec<u8>,
    /// Secret scalar (Fr field element)
    secret_scalar: EdFr,
    /// Public key point
    public_key: PublicKey,
    /// Identity commitment (Poseidon hash of public key)
    commitment: Fq,
    /// Legacy fields for backward compatibility
    pub priv_key: PrivKey,
    pub pub_key: PubKey,
    pub formated_priv_key: PrivKey,
}

// Custom serialization: only serialize the BigUint fields
impl Serialize for Keypair {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("Keypair", 3)?;
        state.serialize_field("priv_key", &self.priv_key)?;
        state.serialize_field("pub_key", &self.pub_key)?;
        state.serialize_field("formated_priv_key", &self.formated_priv_key)?;
        state.end()
    }
}

// Custom deserialization: deserialize BigUint fields and reconstruct others
impl<'de> Deserialize<'de> for Keypair {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct KeypairHelper {
            priv_key: PrivKey,
            #[allow(dead_code)]
            pub_key: PubKey,
            #[allow(dead_code)]
            formated_priv_key: PrivKey,
        }

        let helper = KeypairHelper::deserialize(deserializer)?;
        // Reconstruct from priv_key
        Ok(Keypair::from_priv_key(&helper.priv_key))
    }
}

impl Keypair {
    /// Creates a new keypair from a private key
    pub fn new(private_key: &[u8]) -> Self {
        // Hash the private key
        let secret_scalar = Self::gen_secret_scalar(private_key);

        // Get the public key by multiplying the secret scalar by the base point
        let public_key = PublicKey::from_scalar(&secret_scalar);

        // Generate the identity commitment
        let commitment = public_key.commitment();

        // Convert to BigUint for backward compatibility
        let priv_key_biguint = BigUint::from_bytes_le(private_key);
        let pub_key_biguint = public_key.to_biguint_array();
        // Convert EdFr to BigUint
        let formated_priv_key_biguint = {
            let bigint = secret_scalar.into_bigint();
            let bytes = bigint.to_bytes_le();
            BigUint::from_bytes_le(&bytes)
        };

        Self {
            private_key: private_key.to_vec(),
            secret_scalar,
            public_key,
            commitment,
            priv_key: priv_key_biguint,
            pub_key: pub_key_biguint,
            formated_priv_key: formated_priv_key_biguint,
        }
    }

    /// Creates a new keypair from a BigUint private key (for backward compatibility)
    pub fn from_priv_key(priv_key: &PrivKey) -> Self {
        let priv_key_bytes = priv_key.to_bytes_le();
        let mut padded = vec![0u8; 32];
        let len = priv_key_bytes.len().min(32);
        padded[..len].copy_from_slice(&priv_key_bytes[..len]);
        Self::new(&padded)
    }

    /// Returns the private key bytes
    pub fn private_key(&self) -> &[u8] {
        &self.private_key
    }

    /// Returns the secret scalar
    pub fn secret_scalar(&self) -> &EdFr {
        &self.secret_scalar
    }

    /// Returns the public key
    pub fn public_key(&self) -> &PublicKey {
        &self.public_key
    }

    /// Returns the identity commitment
    pub fn commitment(&self) -> &Fq {
        &self.commitment
    }

    /// Generates the secret scalar from the private key
    fn gen_secret_scalar(private_key: &[u8]) -> EdFr {
        // Hash the private key
        let mut hash = crate::keys::blake_512(private_key);

        // Prune hash
        hash[0] &= 0xF8;
        hash[31] &= 0x7F;
        hash[31] |= 0x40;

        // Use first half of hash and divide by cofactor (equivalent to shifting right by 3 bits)
        let shifted: BigInt = BigInt::from_bytes_le(Sign::Plus, &hash[..32]) >> 3;

        EdFr::from_le_bytes_mod_order(&shifted.to_bytes_le().1)
    }
}

/// Public key
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublicKey {
    point: EdwardsAffine,
}

impl PublicKey {
    /// Creates a new public key instance from a point
    pub fn from_point(point: EdwardsAffine) -> Self {
        Self { point }
    }

    /// Creates a new subgroup public key from a scalar
    pub fn from_scalar(secret_scalar: &EdFr) -> Self {
        let point = BabyJubjubConfig::GENERATOR.mul(secret_scalar).into_affine();

        Self { point }
    }

    /// Generates an identity commitment
    pub fn commitment(&self) -> Fq {
        Poseidon::<Fq>::new_circom(2)
            .unwrap()
            .hash(&[self.point.x, self.point.y])
            .unwrap()
    }

    /// Returns the public key point in Affine form
    pub fn point(&self) -> EdwardsAffine {
        self.point
    }

    /// Returns the x coordinate of the public key point
    pub fn x(&self) -> Fq {
        self.point.x
    }

    /// Returns the y coordinate of the public key point
    pub fn y(&self) -> Fq {
        self.point.y
    }

    /// Converts to BigUint array for backward compatibility
    pub fn to_biguint_array(&self) -> PubKey {
        let x_bytes = self.point.x.into_bigint().to_bytes_le();
        let y_bytes = self.point.y.into_bigint().to_bytes_le();
        [
            BigUint::from_bytes_le(&x_bytes),
            BigUint::from_bytes_le(&y_bytes),
        ]
    }
}

/// Signature (kept for potential future use)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Signature {
    /// `r` point
    pub r: EdwardsAffine,
    /// `s` scalar
    pub s: EdFr,
}

impl Signature {
    /// Creates a new signature from a point and scalar
    pub fn new(r: EdwardsAffine, s: EdFr) -> Self {
        Self { r, s }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keypair_new() {
        let mut bytes = [0u8; 32];
        bytes[0] = 1;
        let keypair = Keypair::new(&bytes);
        assert_eq!(keypair.private_key(), &bytes);
    }

    #[test]
    fn test_keypair_from_priv_key() {
        let priv_key = BigUint::from(12345u64);
        let keypair = Keypair::from_priv_key(&priv_key);
        assert_eq!(keypair.priv_key, priv_key);
    }
}
