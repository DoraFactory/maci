//! Constants for baby-jubjub elliptic curve operations

use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use num_bigint::BigUint;
use once_cell::sync::Lazy;

/// The order of the BabyJubJub curve (SNARK field size)
/// This is the same as the scalar field order r of BN254/BN128
pub static SNARK_FIELD_SIZE: Lazy<BigUint> = Lazy::new(|| {
    BigUint::parse_bytes(
        b"21888242871839275222246405745257275088548364400416034343698204186575808495617",
        10,
    )
    .expect("Failed to parse SNARK_FIELD_SIZE")
});

/// Convert BigUint to Arkworks Fr field element
pub fn biguint_to_fr(value: &BigUint) -> Fr {
    let bytes = value.to_bytes_le();
    let mut padded = [0u8; 32];
    let len = bytes.len().min(32);
    padded[..len].copy_from_slice(&bytes[..len]);
    Fr::from_le_bytes_mod_order(&padded)
}

/// Convert Arkworks Fr field element to BigUint
pub fn fr_to_biguint(fr: &Fr) -> BigUint {
    let bigint = fr.into_bigint();
    let bytes = bigint.to_bytes_le();
    BigUint::from_bytes_le(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_snark_field_size() {
        let expected = BigUint::parse_bytes(
            b"21888242871839275222246405745257275088548364400416034343698204186575808495617",
            10,
        )
        .unwrap();
        assert_eq!(*SNARK_FIELD_SIZE, expected);
    }

    #[test]
    fn test_biguint_fr_conversion() {
        let value = BigUint::from(12345u64);
        let fr = biguint_to_fr(&value);
        let recovered = fr_to_biguint(&fr);
        assert_eq!(value, recovered);
    }
}
