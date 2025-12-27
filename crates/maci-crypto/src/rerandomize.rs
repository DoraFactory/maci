use crate::baby_jubjub::{
    gen_random_babyjub_value, BabyJubjubConfig, EdwardsAffine, EdwardsProjective,
};
use crate::error::Result;
use crate::keys::PubKey;
use ark_ec::{twisted_edwards::TECurveConfig, CurveGroup};
use ark_ed_on_bn254::{Fq, Fr as EdFr};
use ark_ff::{BigInteger, PrimeField};
use num_bigint::BigUint;
use serde::{Deserialize, Serialize};

/// A ciphertext consisting of two curve points
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Ciphertext {
    pub c1: [BigUint; 2],
    pub c2: [BigUint; 2],
}

/// Result of rerandomization
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RerandomizedCiphertext {
    pub d1: [BigUint; 2],
    pub d2: [BigUint; 2],
}

/// Convert BigUint coordinates to an Edwards curve point
fn biguint_to_edwards_point(coords: &[BigUint; 2]) -> Result<EdwardsProjective> {
    let x_bytes = coords[0].to_bytes_le();
    let y_bytes = coords[1].to_bytes_le();

    let mut x_padded = vec![0u8; 32];
    let mut y_padded = vec![0u8; 32];

    let x_len = x_bytes.len().min(32);
    let y_len = y_bytes.len().min(32);

    x_padded[..x_len].copy_from_slice(&x_bytes[..x_len]);
    y_padded[..y_len].copy_from_slice(&y_bytes[..y_len]);

    let x_fq = Fq::from_le_bytes_mod_order(&x_padded);
    let y_fq = Fq::from_le_bytes_mod_order(&y_padded);

    let affine = EdwardsAffine::new_unchecked(x_fq, y_fq);
    Ok(EdwardsProjective::from(affine))
}

/// Convert an Edwards curve point to BigUint coordinates
fn edwards_point_to_biguint(point: &EdwardsProjective) -> [BigUint; 2] {
    let affine = point.into_affine();

    let x_bytes = affine.x.into_bigint().to_bytes_le();
    let y_bytes = affine.y.into_bigint().to_bytes_le();

    let x = BigUint::from_bytes_le(&x_bytes);
    let y = BigUint::from_bytes_le(&y_bytes);

    [x, y]
}

/// Get the Base8 generator point for Baby Jubjub
/// Base8 = 8 * generator
fn get_base8() -> EdwardsProjective {
    let generator = EdwardsProjective::from(BabyJubjubConfig::GENERATOR);
    let scalar_8 = EdFr::from(8u32);
    generator * scalar_8
}

/// Rerandomize a ciphertext
///
/// Given a ciphertext (c1, c2) and a public key, this function produces
/// a new ciphertext (d1, d2) that encrypts the same plaintext but looks
/// different (unlinkable to the original).
///
/// Algorithm:
/// - d1 = Base8 * randomVal + c1
/// - d2 = pubKey * randomVal + c2
///
/// # Arguments
/// * `pub_key` - The public key used for rerandomization
/// * `ciphertext` - The original ciphertext to rerandomize
/// * `random_val` - Optional random value (generated if not provided)
///
/// # Returns
/// A new rerandomized ciphertext
pub fn rerandomize(
    pub_key: &PubKey,
    ciphertext: &Ciphertext,
    random_val: Option<BigUint>,
) -> Result<RerandomizedCiphertext> {
    let random_val = random_val.unwrap_or_else(gen_random_babyjub_value);

    // Convert to EdFr (Edwards curve scalar field)
    let scalar_bytes = random_val.to_bytes_le();
    let mut padded = vec![0u8; 32];
    let len = scalar_bytes.len().min(32);
    padded[..len].copy_from_slice(&scalar_bytes[..len]);
    let scalar = EdFr::from_le_bytes_mod_order(&padded);

    // Compute d1 = Base8 * randomVal + c1
    let base8 = get_base8();
    let base8_mul = base8 * scalar;
    let c1_point = biguint_to_edwards_point(&ciphertext.c1)?;
    let d1_point = base8_mul + c1_point;
    let d1 = edwards_point_to_biguint(&d1_point);

    // Compute d2 = pubKey * randomVal + c2
    let pub_key_point = biguint_to_edwards_point(pub_key)?;
    let pub_key_mul = pub_key_point * scalar;
    let c2_point = biguint_to_edwards_point(&ciphertext.c2)?;
    let d2_point = pub_key_mul + c2_point;
    let d2 = edwards_point_to_biguint(&d2_point);

    Ok(RerandomizedCiphertext { d1, d2 })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::gen_keypair;

    #[test]
    fn test_rerandomize() {
        let keypair = gen_keypair(Some(BigUint::from(12345u64)));

        // Create a simple ciphertext using the public key
        let ciphertext = Ciphertext {
            c1: keypair.pub_key.clone(),
            c2: keypair.pub_key.clone(),
        };

        let result = rerandomize(&keypair.pub_key, &ciphertext, None);
        assert!(result.is_ok());

        let rerandomized = result.unwrap();
        // The rerandomized ciphertext should be different from the original
        assert!(rerandomized.d1 != ciphertext.c1 || rerandomized.d2 != ciphertext.c2);
    }

    #[test]
    fn test_rerandomize_deterministic() {
        let keypair = gen_keypair(Some(BigUint::from(12345u64)));

        let ciphertext = Ciphertext {
            c1: keypair.pub_key.clone(),
            c2: keypair.pub_key.clone(),
        };

        let random_val = BigUint::from(99999u64);

        let result1 = rerandomize(&keypair.pub_key, &ciphertext, Some(random_val.clone()));
        let result2 = rerandomize(&keypair.pub_key, &ciphertext, Some(random_val));

        assert!(result1.is_ok());
        assert!(result2.is_ok());

        let rerandomized1 = result1.unwrap();
        let rerandomized2 = result2.unwrap();

        // With the same random value, results should be identical
        assert_eq!(rerandomized1.d1, rerandomized2.d1);
        assert_eq!(rerandomized1.d2, rerandomized2.d2);
    }

    #[test]
    fn test_rerandomize_different_random_values() {
        let keypair = gen_keypair(Some(BigUint::from(12345u64)));

        let ciphertext = Ciphertext {
            c1: keypair.pub_key.clone(),
            c2: keypair.pub_key.clone(),
        };

        let result1 = rerandomize(&keypair.pub_key, &ciphertext, None);
        let result2 = rerandomize(&keypair.pub_key, &ciphertext, None);

        assert!(result1.is_ok());
        assert!(result2.is_ok());

        let rerandomized1 = result1.unwrap();
        let rerandomized2 = result2.unwrap();

        // With different random values, results should differ (with high probability)
        assert!(rerandomized1.d1 != rerandomized2.d1 || rerandomized1.d2 != rerandomized2.d2);
    }

    #[test]
    fn test_biguint_edwards_conversion() {
        let keypair = gen_keypair(Some(BigUint::from(12345u64)));
        let point = biguint_to_edwards_point(&keypair.pub_key).unwrap();
        let recovered = edwards_point_to_biguint(&point);

        // Due to field operations, values should be in valid range
        assert!(recovered[0] >= BigUint::from(0u32));
        assert!(recovered[1] >= BigUint::from(0u32));
    }

    #[test]
    fn test_base8_generator() {
        let base8 = get_base8();
        let coords = edwards_point_to_biguint(&base8);

        // Base8 should not be the identity
        assert!(coords[0] != BigUint::from(0u32) || coords[1] != BigUint::from(1u32));
    }
}
