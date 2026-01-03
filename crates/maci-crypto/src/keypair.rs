//! Keypair Module
//!
//! Adapted for MACI with BigUint compatibility
//! Uses eddsa-poseidon for key derivation and signing

use crate::keys::{EcdhSharedKey, PrivKey, PubKey};
use ark_bn254::Fr as Bn254Fr;
use ark_ff::{BigInteger, PrimeField};
use baby_jubjub::{base8, mul_point_escalar, EdFr, EdwardsAffine, Fq};
use eddsa_poseidon::{derive_secret_scalar, HashingAlgorithm};
use light_poseidon::{Poseidon, PoseidonHasher};
use num_bigint::BigUint;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// A keypair containing private key, public key, and formatted private key
#[derive(Debug, Clone)]
pub struct Keypair {
    /// Private key bytes
    pub private_key: Vec<u8>,
    /// Secret scalar (Fr field element)
    secret_scalar: EdFr,
    /// Public key point
    public_key: PublicKey,
    /// Identity commitment (Poseidon hash of public key) using BN254 Fr field
    commitment: Bn254Fr,
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
    /// Note: Expects private_key bytes in big-endian format (to match TypeScript bigInt2Buffer)
    pub fn new(private_key: &[u8]) -> Self {
        // Hash the private key
        let secret_scalar = Self::gen_secret_scalar(private_key);

        // Get the public key by multiplying the secret scalar by the base point
        // Use base8() and mul_point_escalar from baby_jubjub module
        let public_key = PublicKey::from_scalar(&secret_scalar);

        // Generate the identity commitment
        let commitment = public_key.commitment();

        // Convert to BigUint for backward compatibility
        // Note: private_key is in big-endian format (matching TypeScript bigInt2Buffer)
        let priv_key_biguint = BigUint::from_bytes_be(private_key);
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
    /// Note: Converts to big-endian to match TypeScript bigInt2Buffer behavior
    /// TypeScript's bigInt2Buffer does NOT pad to 32 bytes
    pub fn from_priv_key(priv_key: &PrivKey) -> Self {
        // Convert to big-endian bytes (matching TypeScript bigInt2Buffer)
        // Important: DO NOT pad to 32 bytes - bigInt2Buffer doesn't pad
        let priv_key_bytes = priv_key.to_bytes_be();
        Self::new(&priv_key_bytes)
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
    pub fn commitment(&self) -> &Bn254Fr {
        &self.commitment
    }

    /// Generates an Elliptic-Curve Diffie–Hellman (ECDH) shared key
    ///
    /// This matches TypeScript's genEcdhSharedKey:
    /// `mulPointEscalar(pubKey as Point<bigint>, this.keypair.formatedPrivKey)`
    ///
    /// # Arguments
    /// * `pub_key` - The other party's public key (as BigUint array)
    ///
    /// # Returns
    /// The ECDH shared key as a point on the Baby Jubjub curve
    ///
    /// # Example
    /// ```
    /// use maci_crypto::keypair::Keypair;
    /// use num_bigint::BigUint;
    ///
    /// let alice = Keypair::from_priv_key(&BigUint::from(11111u64));
    /// let bob = Keypair::from_priv_key(&BigUint::from(22222u64));
    ///
    /// // Alice computes shared key with Bob's public key
    /// let shared_alice = alice.gen_ecdh_shared_key(&bob.pub_key);
    ///
    /// // Bob computes shared key with Alice's public key
    /// let shared_bob = bob.gen_ecdh_shared_key(&alice.pub_key);
    ///
    /// // Both should produce the same shared key
    /// assert_eq!(shared_alice, shared_bob);
    /// ```
    pub fn gen_ecdh_shared_key(&self, pub_key: &PubKey) -> EcdhSharedKey {
        // Convert public key BigUint coordinates to Fq (base field of Baby Jubjub)
        let pub_x_bytes = pub_key[0].to_bytes_le();
        let pub_y_bytes = pub_key[1].to_bytes_le();

        let mut x_padded = vec![0u8; 32];
        let mut y_padded = vec![0u8; 32];

        let x_len = pub_x_bytes.len().min(32);
        let y_len = pub_y_bytes.len().min(32);

        x_padded[..x_len].copy_from_slice(&pub_x_bytes[..x_len]);
        y_padded[..y_len].copy_from_slice(&pub_y_bytes[..y_len]);

        let pub_x_fq = Fq::from_le_bytes_mod_order(&x_padded);
        let pub_y_fq = Fq::from_le_bytes_mod_order(&y_padded);

        // Create Edwards affine point from the public key
        let pub_point_affine = EdwardsAffine::new_unchecked(pub_x_fq, pub_y_fq);

        // Use the pre-computed secret_scalar for scalar multiplication
        // This is more efficient than re-deriving it from formated_priv_key
        let shared_affine = mul_point_escalar(&pub_point_affine, self.secret_scalar);

        // Extract coordinates as BigUint
        let x_bytes = shared_affine.x.into_bigint().to_bytes_le();
        let y_bytes = shared_affine.y.into_bigint().to_bytes_le();

        let x = BigUint::from_bytes_le(&x_bytes);
        let y = BigUint::from_bytes_le(&y_bytes);

        [x, y]
    }

    /// Generates an ECDH shared key with another keypair's public key
    ///
    /// Convenience method that accepts a PublicKey reference directly
    ///
    /// # Arguments
    /// * `pub_key` - The other party's PublicKey
    ///
    /// # Returns
    /// The ECDH shared key as a point on the Baby Jubjub curve
    pub fn gen_ecdh_shared_key_with_public_key(&self, pub_key: &PublicKey) -> EcdhSharedKey {
        // Direct scalar multiplication using the PublicKey's point
        let shared_affine = mul_point_escalar(&pub_key.point, self.secret_scalar);

        // Extract coordinates as BigUint
        let x_bytes = shared_affine.x.into_bigint().to_bytes_le();
        let y_bytes = shared_affine.y.into_bigint().to_bytes_le();

        let x = BigUint::from_bytes_le(&x_bytes);
        let y = BigUint::from_bytes_le(&y_bytes);

        [x, y]
    }

    /// Generates the secret scalar from the private key
    /// Uses eddsa-poseidon's derive_secret_scalar for consistency
    fn gen_secret_scalar(private_key: &[u8]) -> EdFr {
        // Use eddsa-poseidon's derive_secret_scalar with Blake512
        // This matches zk-kit's default Blake-1 (Blake512) implementation
        let secret_scalar_biguint = derive_secret_scalar(private_key, HashingAlgorithm::Blake512)
            .expect("Failed to derive secret scalar");

        // Convert BigUint to EdFr
        let scalar_bytes = secret_scalar_biguint.to_bytes_le();
        EdFr::from_le_bytes_mod_order(&scalar_bytes)
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
    /// Uses base8() and mul_point_escalar from baby_jubjub module
    pub fn from_scalar(secret_scalar: &EdFr) -> Self {
        let base8_point = base8();
        let point = mul_point_escalar(&base8_point, *secret_scalar);

        Self { point }
    }

    /// Generates an identity commitment
    /// Uses BN254 Fr field to match SDK behavior (poseidonPerm uses BN254 scalar field)
    pub fn commitment(&self) -> Bn254Fr {
        // Convert Baby Jubjub Fq coordinates to BN254 Fr for Poseidon hash
        let x_bytes = self.point.x.into_bigint().to_bytes_le();
        let y_bytes = self.point.y.into_bigint().to_bytes_le();
        let x_fr = Bn254Fr::from_le_bytes_mod_order(&x_bytes);
        let y_fr = Bn254Fr::from_le_bytes_mod_order(&y_bytes);

        Poseidon::<Bn254Fr>::new_circom(2)
            .unwrap()
            .hash(&[x_fr, y_fr])
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

    #[test]
    fn test_ecdh_shared_key() {
        // Create two keypairs
        let alice = Keypair::from_priv_key(&BigUint::from(11111u64));
        let bob = Keypair::from_priv_key(&BigUint::from(22222u64));

        // Alice computes shared key with Bob's public key
        let shared_alice = alice.gen_ecdh_shared_key(&bob.pub_key);

        // Bob computes shared key with Alice's public key
        let shared_bob = bob.gen_ecdh_shared_key(&alice.pub_key);

        // Both should produce the same shared key
        assert_eq!(shared_alice, shared_bob);
        assert_eq!(shared_alice[0], shared_bob[0]);
        assert_eq!(shared_alice[1], shared_bob[1]);
    }

    #[test]
    fn test_ecdh_shared_key_with_public_key() {
        // Create two keypairs
        let alice = Keypair::from_priv_key(&BigUint::from(33333u64));
        let bob = Keypair::from_priv_key(&BigUint::from(44444u64));

        // Use the PublicKey method
        let shared_alice = alice.gen_ecdh_shared_key_with_public_key(bob.public_key());
        let shared_bob = bob.gen_ecdh_shared_key_with_public_key(alice.public_key());

        // Both should produce the same shared key
        assert_eq!(shared_alice, shared_bob);

        // Should also match the BigUint array method
        let shared_alice_biguint = alice.gen_ecdh_shared_key(&bob.pub_key);
        assert_eq!(shared_alice, shared_alice_biguint);
    }

    #[test]
    fn test_ecdh_consistency_with_keys_module() {
        use crate::keys::gen_ecdh_shared_key;

        // Create two keypairs
        let alice = Keypair::from_priv_key(&BigUint::from(55555u64));
        let bob = Keypair::from_priv_key(&BigUint::from(66666u64));

        // Compute shared key using Keypair method
        let shared_keypair = alice.gen_ecdh_shared_key(&bob.pub_key);

        // Compute shared key using keys module function
        let shared_keys = gen_ecdh_shared_key(&alice.priv_key, &bob.pub_key);

        // Both methods should produce the same result
        assert_eq!(shared_keypair, shared_keys);
    }
}
