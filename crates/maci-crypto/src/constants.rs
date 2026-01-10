use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use num_bigint::BigUint;
use once_cell::sync::Lazy;
use tiny_keccak::{Hasher, Keccak};

/// The order of the BabyJubJub curve (SNARK field size)
/// This is the same as the scalar field order r of BN254/BN128
pub static SNARK_FIELD_SIZE: Lazy<BigUint> = Lazy::new(|| {
    BigUint::parse_bytes(
        b"21888242871839275222246405745257275088548364400416034343698204186575808495617",
        10,
    )
    .expect("Failed to parse SNARK_FIELD_SIZE")
});

/// The modulus of the BN254 scalar field as an Arkworks Fr element
pub static SNARK_FIELD_MODULUS: Lazy<Fr> = Lazy::new(|| {
    Fr::from_le_bytes_mod_order(&[
        0x01, 0x00, 0x00, 0xf0, 0x93, 0xf5, 0xe1, 0x43, 0x91, 0x70, 0xb9, 0x79, 0x48, 0xe8, 0x33,
        0x28, 0x5d, 0x58, 0x81, 0x81, 0xb6, 0x45, 0x50, 0xb8, 0x29, 0xa0, 0x31, 0xe1, 0x72, 0x4e,
        0x64, 0x30,
    ])
});

/// A nothing-up-my-sleeve zero value
/// Computed as: keccak256("Maci") % SNARK_FIELD_SIZE
/// Should equal: 8370432830353022751713833565135785980866757267633941821328460903436894336785
pub static NOTHING_UP_MY_SLEEVE: Lazy<BigUint> = Lazy::new(|| {
    let mut hasher = Keccak::v256();
    let mut output = [0u8; 32];
    hasher.update(b"Maci");
    hasher.finalize(&mut output);

    let hash_value = BigUint::from_bytes_be(&output);
    &hash_value % &*SNARK_FIELD_SIZE
});

/// Nothing-up-my-sleeve value as an Arkworks Fr element
pub static NOTHING_UP_MY_SLEEVE_FR: Lazy<Fr> = Lazy::new(|| biguint_to_fr(&NOTHING_UP_MY_SLEEVE));

/// Padding key hash constant
/// Used in various MACI operations
pub static PAD_KEY_HASH: Lazy<BigUint> = Lazy::new(|| {
    BigUint::parse_bytes(
        b"1309255631273308531193241901289907343161346846555918942743921933037802809814",
        10,
    )
    .expect("Failed to parse PAD_KEY_HASH")
});

/// Padding key hash as an Arkworks Fr element
pub static PAD_KEY_HASH_FR: Lazy<Fr> = Lazy::new(|| biguint_to_fr(&PAD_KEY_HASH));

/// 2^32 - used for packing/unpacking
pub static UINT32: Lazy<BigUint> = Lazy::new(|| BigUint::from(4294967296u64)); // 2^32

/// 2^96 - used for packing/unpacking
pub static UINT96: Lazy<BigUint> = Lazy::new(|| {
    BigUint::parse_bytes(b"79228162514264337593543950336", 10).expect("Failed to parse UINT96")
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
    fn test_nothing_up_my_sleeve() {
        let expected = BigUint::parse_bytes(
            b"8370432830353022751713833565135785980866757267633941821328460903436894336785",
            10,
        )
        .unwrap();
        assert_eq!(*NOTHING_UP_MY_SLEEVE, expected);
    }

    #[test]
    fn test_pad_key_hash() {
        let expected = BigUint::parse_bytes(
            b"1309255631273308531193241901289907343161346846555918942743921933037802809814",
            10,
        )
        .unwrap();
        assert_eq!(*PAD_KEY_HASH, expected);
    }

    #[test]
    fn test_uint32() {
        assert_eq!(*UINT32, BigUint::from(4294967296u64));
    }

    #[test]
    fn test_uint96() {
        let expected = BigUint::parse_bytes(b"79228162514264337593543950336", 10).unwrap();
        assert_eq!(*UINT96, expected);
    }

    #[test]
    fn test_biguint_fr_conversion() {
        let value = BigUint::from(12345u64);
        let fr = biguint_to_fr(&value);
        let recovered = fr_to_biguint(&fr);
        assert_eq!(value, recovered);
    }

    #[test]
    fn test_fr_field_operations() {
        let a = biguint_to_fr(&BigUint::from(100u64));
        let b = biguint_to_fr(&BigUint::from(200u64));
        let c = a + b;
        let c_uint = fr_to_biguint(&c);
        assert_eq!(c_uint, BigUint::from(300u64));
    }

    #[test]
    fn test_nothing_up_my_sleeve_fr() {
        let fr = *NOTHING_UP_MY_SLEEVE_FR;
        let recovered = fr_to_biguint(&fr);
        assert_eq!(recovered, *NOTHING_UP_MY_SLEEVE);
    }
}
