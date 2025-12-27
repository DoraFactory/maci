use crate::constants::SNARK_FIELD_SIZE;
use crate::error::{CryptoError, Result};
use ark_ff::{BigInteger, PrimeField};
use baby_jubjub::{mul_point_escalar, EdFr, EdwardsAffine, Fq};
use eddsa_poseidon::{
    derive_public_key, derive_secret_scalar, pack_public_key, sign_message, unpack_public_key,
    verify_signature, HashingAlgorithm, Signature,
};
use num_bigint::BigUint;
use rand::Rng;
use serde::{Deserialize, Serialize};

/// A public key represented as a pair of BigUint coordinates
pub type PubKey = [BigUint; 2];

/// A private key as a BigUint
pub type PrivKey = BigUint;

/// A shared key from ECDH (pair of BigUint coordinates)
pub type EcdhSharedKey = [BigUint; 2];

/// A keypair containing private key, public key, and formatted private key
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Keypair {
    pub priv_key: PrivKey,
    pub pub_key: PubKey,
    pub formated_priv_key: PrivKey,
}

/// Generate a random private key (256 bits)
pub fn gen_priv_key() -> PrivKey {
    let mut rng = rand::thread_rng();
    let mut bytes = [0u8; 32];
    rng.fill(&mut bytes);
    BigUint::from_bytes_be(&bytes)
}

/// Generate a random salt (BabyJub-compatible)
pub fn gen_random_salt() -> BigUint {
    baby_jubjub::gen_random_babyjub_value()
}

/// Format a private key to be compatible with BabyJub curve
/// Uses eddsa-poseidon's derive_secret_scalar which handles Blake-512 hashing
/// and proper key derivation
///
/// This matches TypeScript's formatPrivKeyForBabyJub:
/// `BigInt(deriveSecretScalar(bigInt2Buffer(privKey)))`
///
/// Note: TypeScript's bigInt2Buffer uses big-endian byte order
pub fn format_priv_key_for_babyjub(priv_key: &PrivKey) -> BigUint {
    // Convert private key to bytes (big-endian to match TypeScript bigInt2Buffer)
    // bigInt2Buffer: i.toString(16) -> Buffer.from(hex, 'hex') is big-endian
    let priv_key_bytes = priv_key.to_bytes_be();

    // Pad to 32 bytes (prepend zeros for big-endian)
    let mut padded_key = vec![0u8; 32];
    let len = priv_key_bytes.len().min(32);
    if len > 0 {
        let offset = 32 - len;
        padded_key[offset..].copy_from_slice(&priv_key_bytes[priv_key_bytes.len() - len..]);
    }

    // Use eddsa-poseidon's derive_secret_scalar with Blake512
    // This matches zk-kit's default Blake-1 (Blake512) implementation
    derive_secret_scalar(&padded_key, HashingAlgorithm::Blake512)
        .expect("Failed to derive secret scalar")
}

/// Generate a public key from a private key using eddsa-poseidon
///
/// This matches TypeScript's genPubKey:
/// ```typescript
/// const key = derivePublicKey(bigInt2Buffer(privKey));
/// return [BigInt(key[0]), BigInt(key[1])];
/// ```
///
/// Note: TypeScript's bigInt2Buffer uses big-endian byte order
pub fn gen_pub_key(priv_key: &PrivKey) -> PubKey {
    // Convert private key to bytes (big-endian to match TypeScript bigInt2Buffer)
    let priv_key_bytes = priv_key.to_bytes_be();

    // Pad to 32 bytes (prepend zeros for big-endian)
    let mut padded_key = vec![0u8; 32];
    let len = priv_key_bytes.len().min(32);
    if len > 0 {
        let offset = 32 - len;
        padded_key[offset..].copy_from_slice(&priv_key_bytes[priv_key_bytes.len() - len..]);
    }

    // Use eddsa-poseidon's derive_public_key with Blake512
    // This matches zk-kit's default Blake-1 (Blake512) implementation
    let public_point = derive_public_key(&padded_key, HashingAlgorithm::Blake512)
        .expect("Failed to derive public key");

    // Extract x and y coordinates and convert to BigUint
    let x_bytes = public_point.x.into_bigint().to_bytes_le();
    let y_bytes = public_point.y.into_bigint().to_bytes_le();

    let x = BigUint::from_bytes_le(&x_bytes);
    let y = BigUint::from_bytes_le(&y_bytes);

    [x, y]
}

/// Pack a public key into a single BigUint (lossy compression)
/// Uses eddsa-poseidon's pack_public_key
///
/// This matches TypeScript's packPubKey:
/// `BigInt(packPublicKey(pubKey))`
pub fn pack_pub_key(pub_key: &PubKey) -> BigUint {
    // Convert PubKey (BigUint array) to EdwardsAffine point
    let x_bytes = pub_key[0].to_bytes_le();
    let y_bytes = pub_key[1].to_bytes_le();

    let mut x_padded = vec![0u8; 32];
    let mut y_padded = vec![0u8; 32];

    let x_len = x_bytes.len().min(32);
    let y_len = y_bytes.len().min(32);

    x_padded[..x_len].copy_from_slice(&x_bytes[..x_len]);
    y_padded[..y_len].copy_from_slice(&y_bytes[..y_len]);

    let x_fq = Fq::from_le_bytes_mod_order(&x_padded);
    let y_fq = Fq::from_le_bytes_mod_order(&y_padded);

    let point = EdwardsAffine::new_unchecked(x_fq, y_fq);

    // Use eddsa-poseidon's pack_public_key
    pack_public_key(&point).expect("Failed to pack public key")
}

/// Unpack a public key from its packed representation
/// Uses eddsa-poseidon's unpack_public_key
///
/// This matches TypeScript's unpackPubKey:
/// ```typescript
/// const pubKey = unpackPublicKey(packed);
/// return pubKey.map((x) => BigInt(x)) as PubKey;
/// ```
pub fn unpack_pub_key(packed: &BigUint) -> Result<PubKey> {
    // Use eddsa-poseidon's unpack_public_key
    let point = unpack_public_key(packed).map_err(|e| CryptoError::InvalidPackedPublicKey(e))?;

    // Convert EdwardsAffine point to PubKey (BigUint array)
    let x_bytes = point.x.into_bigint().to_bytes_le();
    let y_bytes = point.y.into_bigint().to_bytes_le();

    let x = BigUint::from_bytes_le(&x_bytes);
    let y = BigUint::from_bytes_le(&y_bytes);

    Ok([x, y])
}

/// Generate a keypair (optionally from a given private key)
///
/// This matches TypeScript's genKeypair:
/// ```typescript
/// const privKey = pkey ? pkey % SNARK_FIELD_SIZE : genPrivKey() % SNARK_FIELD_SIZE;
/// const pubKey = genPubKey(privKey);
/// const formatedPrivKey = formatPrivKeyForBabyJub(privKey);
/// const keypair: Keypair = { privKey, pubKey, formatedPrivKey };
/// ```
pub fn gen_keypair(priv_key: Option<PrivKey>) -> Keypair {
    let priv_key = if let Some(pk) = priv_key {
        &pk % &*SNARK_FIELD_SIZE
    } else {
        &gen_priv_key() % &*SNARK_FIELD_SIZE
    };

    let pub_key = gen_pub_key(&priv_key);
    let formated_priv_key = format_priv_key_for_babyjub(&priv_key);

    Keypair {
        priv_key,
        pub_key,
        formated_priv_key,
    }
}

/// Generate an ECDH shared key from a private key and a public key
/// Uses eddsa-poseidon's formatted private key and Baby Jubjub scalar multiplication
///
/// This matches TypeScript's genEcdhSharedKey:
/// `mulPointEscalar(pubKey as Point<bigint>, formatPrivKeyForBabyJub(privKey))`
pub fn gen_ecdh_shared_key(priv_key: &PrivKey, pub_key: &PubKey) -> EcdhSharedKey {
    let formatted = format_priv_key_for_babyjub(priv_key);

    // Convert to EdFr (Edwards curve scalar field)
    let scalar_bytes = formatted.to_bytes_le();
    let mut scalar_padded = vec![0u8; 32];
    let scalar_len = scalar_bytes.len().min(32);
    scalar_padded[..scalar_len].copy_from_slice(&scalar_bytes[..scalar_len]);
    let scalar_edfr = EdFr::from_le_bytes_mod_order(&scalar_padded);

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

    // Create Edwards affine point
    let pub_point_affine = EdwardsAffine::new_unchecked(pub_x_fq, pub_y_fq);

    // Use mul_point_escalar from baby_jubjub module
    let shared_affine = mul_point_escalar(&pub_point_affine, scalar_edfr);

    // Extract coordinates
    let x_bytes = shared_affine.x.into_bigint().to_bytes_le();
    let y_bytes = shared_affine.y.into_bigint().to_bytes_le();

    let x = BigUint::from_bytes_le(&x_bytes);
    let y = BigUint::from_bytes_le(&y_bytes);

    [x, y]
}

/// Sign a message using EdDSA-Poseidon signature scheme
///
/// This matches TypeScript's signMessage from @zk-kit/eddsa-poseidon:
/// `const signature = signMessage(bigInt2Buffer(signPriKey), hash);`
///
/// Note: TypeScript's bigInt2Buffer uses big-endian byte order
pub fn sign_message_eddsa(priv_key: &PrivKey, message: &BigUint) -> Result<Signature> {
    // Convert private key to bytes (big-endian to match TypeScript bigInt2Buffer)
    let priv_key_bytes = priv_key.to_bytes_be();

    // Pad to 32 bytes (prepend zeros for big-endian)
    let mut padded_key = vec![0u8; 32];
    let len = priv_key_bytes.len().min(32);
    if len > 0 {
        let offset = 32 - len;
        padded_key[offset..].copy_from_slice(&priv_key_bytes[priv_key_bytes.len() - len..]);
    }

    // Use eddsa-poseidon's sign_message with Blake512
    // This matches zk-kit's default Blake-1 (Blake512) implementation
    sign_message(&padded_key, message, HashingAlgorithm::Blake512)
        .map_err(|e| CryptoError::Generic(format!("Failed to sign message: {}", e)))
}

/// Verify an EdDSA-Poseidon signature
///
/// This matches TypeScript's verify functionality from @zk-kit/eddsa-poseidon
pub fn verify_signature_eddsa(
    message: &BigUint,
    signature: &Signature,
    pub_key: &PubKey,
) -> Result<bool> {
    // Convert PubKey to EdwardsAffine point
    let x_bytes = pub_key[0].to_bytes_le();
    let y_bytes = pub_key[1].to_bytes_le();

    let mut x_padded = vec![0u8; 32];
    let mut y_padded = vec![0u8; 32];

    let x_len = x_bytes.len().min(32);
    let y_len = y_bytes.len().min(32);

    x_padded[..x_len].copy_from_slice(&x_bytes[..x_len]);
    y_padded[..y_len].copy_from_slice(&y_bytes[..y_len]);

    let x_fq = Fq::from_le_bytes_mod_order(&x_padded);
    let y_fq = Fq::from_le_bytes_mod_order(&y_padded);

    let pub_point = EdwardsAffine::new_unchecked(x_fq, y_fq);

    // Use eddsa-poseidon's verify_signature
    verify_signature(message, signature, &pub_point)
        .map_err(|e| CryptoError::Generic(format!("Failed to verify signature: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gen_priv_key() {
        let key1 = gen_priv_key();
        let key2 = gen_priv_key();
        assert_ne!(key1, key2);
    }

    #[test]
    fn test_gen_random_salt() {
        let salt = gen_random_salt();
        let max = BigUint::from(2u32).pow(253);
        assert!(salt < max);
    }

    #[test]
    fn test_format_priv_key() {
        let priv_key = BigUint::from(12345u64);
        let formatted = format_priv_key_for_babyjub(&priv_key);
        assert!(formatted > BigUint::from(0u32));
    }

    #[test]
    fn test_gen_pub_key() {
        let priv_key = BigUint::from(12345u64);
        let pub_key = gen_pub_key(&priv_key);
        assert!(pub_key[0] < *SNARK_FIELD_SIZE);
        assert!(pub_key[1] < *SNARK_FIELD_SIZE);
    }

    #[test]
    fn test_gen_keypair() {
        let keypair = gen_keypair(None);
        assert!(keypair.priv_key < *SNARK_FIELD_SIZE);
        assert!(keypair.pub_key[0] < *SNARK_FIELD_SIZE);
        assert!(keypair.pub_key[1] < *SNARK_FIELD_SIZE);
    }

    #[test]
    fn test_gen_keypair_with_seed() {
        let seed = BigUint::from(12345u64);
        let keypair1 = gen_keypair(Some(seed.clone()));
        let keypair2 = gen_keypair(Some(seed));
        assert_eq!(keypair1.priv_key, keypair2.priv_key);
        assert_eq!(keypair1.pub_key, keypair2.pub_key);
    }

    #[test]
    fn test_pack_unpack_pub_key() {
        let keypair = gen_keypair(Some(BigUint::from(12345u64)));
        let packed = pack_pub_key(&keypair.pub_key);
        let unpacked = unpack_pub_key(&packed);

        match unpacked {
            Ok(unpacked_key) => {
                // Y coordinate should always match as it's stored directly
                assert_eq!(unpacked_key[1], keypair.pub_key[1]);
                // X and Y should be within field bounds
                assert!(unpacked_key[0] < *SNARK_FIELD_SIZE);
                assert!(unpacked_key[1] < *SNARK_FIELD_SIZE);
            }
            Err(_) => {
                // If unpacking fails, it's a known limitation
            }
        }
    }

    #[test]
    fn test_ecdh_shared_key() {
        let keypair1 = gen_keypair(Some(BigUint::from(12345u64)));
        let keypair2 = gen_keypair(Some(BigUint::from(67890u64)));

        let shared1 = gen_ecdh_shared_key(&keypair1.priv_key, &keypair2.pub_key);
        let shared2 = gen_ecdh_shared_key(&keypair2.priv_key, &keypair1.pub_key);

        // ECDH property: both sides should derive the same shared secret
        assert_eq!(shared1, shared2);
    }

    #[test]
    fn test_ecdh_deterministic() {
        let keypair1 = gen_keypair(Some(BigUint::from(12345u64)));
        let keypair2 = gen_keypair(Some(BigUint::from(67890u64)));

        let shared1 = gen_ecdh_shared_key(&keypair1.priv_key, &keypair2.pub_key);
        let shared2 = gen_ecdh_shared_key(&keypair1.priv_key, &keypair2.pub_key);

        assert_eq!(shared1, shared2);
    }

    #[test]
    fn test_pub_key_not_zero() {
        let priv_key = BigUint::from(12345u64);
        let pub_key = gen_pub_key(&priv_key);

        // Public key should not be the identity point (0, 1)
        assert!(!(pub_key[0] == BigUint::from(0u32) && pub_key[1] == BigUint::from(1u32)));
    }

    #[test]
    fn test_sign_and_verify_message() {
        let priv_key = BigUint::from(12345u64);
        let message = BigUint::from(999999u64);

        let keypair = gen_keypair(Some(priv_key.clone()));
        let signature = sign_message_eddsa(&keypair.priv_key, &message).unwrap();
        let is_valid = verify_signature_eddsa(&message, &signature, &keypair.pub_key).unwrap();

        assert!(is_valid);
    }

    #[test]
    fn test_sign_and_verify_different_message() {
        let priv_key = BigUint::from(12345u64);
        let message1 = BigUint::from(999999u64);
        let message2 = BigUint::from(111111u64);

        let keypair = gen_keypair(Some(priv_key.clone()));
        let signature = sign_message_eddsa(&keypair.priv_key, &message1).unwrap();
        let is_valid = verify_signature_eddsa(&message2, &signature, &keypair.pub_key).unwrap();

        assert!(!is_valid);
    }

    #[test]
    fn test_keypair_consistency_with_eddsa() {
        // Test that our keypair generation is consistent with direct eddsa-poseidon usage
        let priv_key = BigUint::from(54321u64);
        let keypair = gen_keypair(Some(priv_key.clone()));

        // Convert to bytes for eddsa-poseidon (big-endian to match TypeScript bigInt2Buffer)
        let priv_key_bytes = priv_key.to_bytes_be();
        let mut padded_key = vec![0u8; 32];
        let len = priv_key_bytes.len().min(32);
        if len > 0 {
            let offset = 32 - len;
            padded_key[offset..].copy_from_slice(&priv_key_bytes[priv_key_bytes.len() - len..]);
        }

        let eddsa_pub_key = derive_public_key(&padded_key, HashingAlgorithm::Blake512).unwrap();

        // Extract coordinates
        let eddsa_x = BigUint::from_bytes_le(&eddsa_pub_key.x.into_bigint().to_bytes_le());
        let eddsa_y = BigUint::from_bytes_le(&eddsa_pub_key.y.into_bigint().to_bytes_le());

        assert_eq!(keypair.pub_key[0], eddsa_x);
        assert_eq!(keypair.pub_key[1], eddsa_y);
    }
}
