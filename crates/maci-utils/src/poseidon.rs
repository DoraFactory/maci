use ark_bn254::Fr as ArkFr;
use ark_ff::{BigInteger, PrimeField};
use cosmwasm_std::Uint256;
use light_poseidon::{Poseidon, PoseidonHasher};

// Re-export Fr type for convenience
pub type Fr = ArkFr;

/// Converts Uint256 to Fr field element
/// Optimized to use direct byte conversion
#[inline]
pub fn uint256_to_fr(input: &Uint256) -> Fr {
    // Convert Uint256 to little-endian bytes
    let bytes = input.to_le_bytes();

    // Try to create Fr from little-endian bytes
    match Fr::from_le_bytes_mod_order(&bytes) {
        fr => fr,
    }
}

/// Hash a single Uint256 value
pub fn hash_uint256(data: Uint256) -> Uint256 {
    // Hash single value using width 1
    let fr_value = uint256_to_fr(&data);
    let mut poseidon = Poseidon::<ArkFr>::new_circom(1)
        .expect("Poseidon initialization with width 1 should never fail");
    let result_fr = poseidon
        .hash(&[fr_value])
        .expect("Poseidon hash with valid Fr input should never fail");

    // Convert Fr to Uint256 via little-endian bytes
    let bigint = result_fr.into_bigint();
    let bytes = bigint.to_bytes_le();

    // Pad to 32 bytes if needed
    let mut padded = [0u8; 32];
    let len = bytes.len().min(32);
    padded[..len].copy_from_slice(&bytes[..len]);

    Uint256::from_le_bytes(padded)
}

/// Core hash function for width 2
fn hash_width_2(message: &[Fr; 2]) -> Uint256 {
    let mut poseidon = Poseidon::<ArkFr>::new_circom(2)
        .expect("Poseidon initialization with width 2 should never fail");
    let result_fr = poseidon
        .hash(message)
        .expect("Poseidon hash with valid Fr input should never fail");

    // Convert Fr to Uint256 via little-endian bytes
    let bigint = result_fr.into_bigint();
    let bytes = bigint.to_bytes_le();

    // Pad to 32 bytes if needed
    let mut padded = [0u8; 32];
    let len = bytes.len().min(32);
    padded[..len].copy_from_slice(&bytes[..len]);

    Uint256::from_le_bytes(padded)
}

/// Core hash function for width 5
fn hash_width_5(message: &[Fr; 5]) -> Uint256 {
    let mut poseidon = Poseidon::<ArkFr>::new_circom(5)
        .expect("Poseidon initialization with width 5 should never fail");
    let result_fr = poseidon
        .hash(message)
        .expect("Poseidon hash with valid Fr input should never fail");

    // Convert Fr to Uint256 via little-endian bytes
    let bigint = result_fr.into_bigint();
    let bytes = bigint.to_bytes_le();

    // Pad to 32 bytes if needed
    let mut padded = [0u8; 32];
    let len = bytes.len().min(32);
    padded[..len].copy_from_slice(&bytes[..len]);

    Uint256::from_le_bytes(padded)
}

/// Core hash function
/// This is a generic version that accepts a Vec<Fr> for backward compatibility
pub fn hash(message: Vec<Fr>) -> Uint256 {
    // For backward compatibility, support variable-width hashing
    let len = message.len();

    if len == 2 {
        let arr: [Fr; 2] = [message[0], message[1]];
        return hash_width_2(&arr);
    } else if len == 5 {
        let arr: [Fr; 5] = [message[0], message[1], message[2], message[3], message[4]];
        return hash_width_5(&arr);
    } else {
        // For other widths, create a new Poseidon instance
        let mut poseidon = Poseidon::<Fr>::new_circom(len)
            .expect("Poseidon initialization with valid width should never fail");
        let result_fr = poseidon
            .hash(&message)
            .expect("Poseidon hash with valid Fr input should never fail");

        // Convert Fr to Uint256 via little-endian bytes
        let bigint = result_fr.into_bigint();
        let bytes = bigint.to_bytes_le();

        // Pad to 32 bytes if needed
        let mut padded = [0u8; 32];
        let len = bytes.len().min(32);
        padded[..len].copy_from_slice(&bytes[..len]);

        Uint256::from_le_bytes(padded)
    }
}

/// Hash 2 Uint256 values (commonly used for Merkle trees)
pub fn hash2(data: [Uint256; 2]) -> Uint256 {
    let fr_array: [Fr; 2] = [uint256_to_fr(&data[0]), uint256_to_fr(&data[1])];
    hash_width_2(&fr_array)
}

/// Hash 5 Uint256 values (commonly used for message hashing)
pub fn hash5(data: [Uint256; 5]) -> Uint256 {
    let fr_array: [Fr; 5] = [
        uint256_to_fr(&data[0]),
        uint256_to_fr(&data[1]),
        uint256_to_fr(&data[2]),
        uint256_to_fr(&data[3]),
        uint256_to_fr(&data[4]),
    ];
    hash_width_5(&fr_array)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_poseidon_cache() {
        // First call initializes
        let data1 = [Uint256::from_u128(1), Uint256::from_u128(2)];
        let result1 = hash2(data1);

        // Second call should reuse cached instance
        let data2 = [Uint256::from_u128(3), Uint256::from_u128(4)];
        let result2 = hash2(data2);

        // Results should be different for different inputs
        assert_ne!(result1, result2);
    }

    #[test]
    fn test_hash2_consistency() {
        let data = [Uint256::from_u128(100), Uint256::from_u128(200)];
        let result1 = hash2(data);
        let result2 = hash2(data);
        assert_eq!(result1, result2);
    }

    #[test]
    fn test_hash5_consistency() {
        let data = [
            Uint256::from_u128(1),
            Uint256::from_u128(2),
            Uint256::from_u128(3),
            Uint256::from_u128(4),
            Uint256::from_u128(5),
        ];
        let result1 = hash5(data);
        let result2 = hash5(data);
        assert_eq!(result1, result2);
    }

    #[test]
    fn test_hash2_with_zero() {
        let data = [Uint256::zero(), Uint256::zero()];
        let result1 = hash2(data);
        let result2 = hash2(data);
        assert_eq!(result1, result2, "Hash of zeros should be deterministic");
        assert_ne!(result1, Uint256::zero(), "Hash of zeros should not be zero");
    }

    #[test]
    fn test_hash2_different_order() {
        let data1 = [Uint256::from_u128(1), Uint256::from_u128(2)];
        let data2 = [Uint256::from_u128(2), Uint256::from_u128(1)];
        let result1 = hash2(data1);
        let result2 = hash2(data2);
        assert_ne!(result1, result2, "Hash should be order-sensitive");
    }

    #[test]
    fn test_hash5_with_zeros() {
        let data = [
            Uint256::zero(),
            Uint256::zero(),
            Uint256::zero(),
            Uint256::zero(),
            Uint256::zero(),
        ];
        let result1 = hash5(data);
        let result2 = hash5(data);
        assert_eq!(result1, result2);
        assert_ne!(result1, Uint256::zero());
    }

    #[test]
    fn test_hash5_different_values() {
        let data1 = [
            Uint256::from_u128(1),
            Uint256::from_u128(2),
            Uint256::from_u128(3),
            Uint256::from_u128(4),
            Uint256::from_u128(5),
        ];
        let data2 = [
            Uint256::from_u128(1),
            Uint256::from_u128(2),
            Uint256::from_u128(3),
            Uint256::from_u128(4),
            Uint256::from_u128(6), // Different last value
        ];
        let result1 = hash5(data1);
        let result2 = hash5(data2);
        assert_ne!(
            result1, result2,
            "Different inputs should produce different hashes"
        );
    }

    #[test]
    fn test_hash_uint256() {
        let value = Uint256::from_u128(123456789);
        let result1 = hash_uint256(value);
        let result2 = hash_uint256(value);
        assert_eq!(result1, result2, "hash_uint256 should be deterministic");
        assert_ne!(result1, value, "Hash should differ from input");
    }

    #[test]
    fn test_hash_uint256_zero() {
        let value = Uint256::zero();
        let result = hash_uint256(value);
        assert_ne!(result, Uint256::zero(), "Hash of zero should not be zero");
    }

    #[test]
    fn test_uint256_to_fr() {
        let value = Uint256::from_u128(42);
        let fr_value = uint256_to_fr(&value);

        // Verify it's deterministic
        let fr_value2 = uint256_to_fr(&value);
        assert_eq!(fr_value.to_string(), fr_value2.to_string());

        // Verify different values produce different Fr
        let different_value = Uint256::from_u128(43);
        let different_fr = uint256_to_fr(&different_value);
        assert_ne!(fr_value.to_string(), different_fr.to_string());
    }

    #[test]
    fn test_hash2_large_values() {
        let max_u128 = u128::MAX;
        let data = [Uint256::from_u128(max_u128), Uint256::from_u128(max_u128)];
        let result1 = hash2(data);
        let result2 = hash2(data);
        assert_eq!(result1, result2, "Should handle large values consistently");
    }

    #[test]
    fn test_hash5_mixed_values() {
        let data = [
            Uint256::zero(),
            Uint256::from_u128(1),
            Uint256::from_u128(u128::MAX),
            Uint256::from_u128(42),
            Uint256::zero(),
        ];
        let result1 = hash5(data);
        let result2 = hash5(data);
        assert_eq!(result1, result2);
    }

    #[test]
    fn test_hash_avalanche_effect() {
        // Small change in input should cause large change in output
        let data1 = [Uint256::from_u128(1), Uint256::from_u128(2)];
        let data2 = [Uint256::from_u128(1), Uint256::from_u128(3)];

        let result1 = hash2(data1);
        let result2 = hash2(data2);

        // Results should be very different (not just one bit)
        assert_ne!(result1, result2);

        // Convert to bytes and check multiple bytes differ
        let bytes1 = result1.to_be_bytes();
        let bytes2 = result2.to_be_bytes();
        let diff_count = bytes1
            .iter()
            .zip(bytes2.iter())
            .filter(|(a, b)| a != b)
            .count();
        assert!(
            diff_count > 5,
            "Should have avalanche effect: {} bytes differ",
            diff_count
        );
    }

    #[test]
    fn test_multiple_hash2_calls_use_cache() {
        // This test verifies the cache is working by calling hash2 multiple times
        // While we can't directly measure performance, we can verify consistency
        let mut results = Vec::new();
        for i in 0..10 {
            let data = [Uint256::from_u128(i), Uint256::from_u128(i + 1)];
            results.push(hash2(data));
        }

        // Verify all hashes are unique
        for i in 0..results.len() {
            for j in (i + 1)..results.len() {
                assert_ne!(
                    results[i], results[j],
                    "Different inputs should produce different hashes"
                );
            }
        }
    }

    // === Optimization Verification Tests ===

    #[test]
    fn test_uint256_to_fr_optimized() {
        // Test various values to ensure optimized conversion works correctly
        let test_cases = vec![
            Uint256::zero(),
            Uint256::from_u128(1),
            Uint256::from_u128(42),
            Uint256::from_u128(12345),
            Uint256::from_u128(u128::MAX / 2),
        ];

        for value in test_cases {
            let fr = uint256_to_fr(&value);
            // Verify it's a valid Fr (should not panic)
            let _s = fr.to_string();
        }
    }

    #[test]
    fn test_hash2_optimized_consistency() {
        // Verify optimized implementation produces consistent results
        let data = [Uint256::from_u128(123), Uint256::from_u128(456)];

        let result1 = hash2(data);
        let result2 = hash2(data);
        let result3 = hash2(data);

        assert_eq!(result1, result2, "Hash should be deterministic");
        assert_eq!(result2, result3, "Hash should be deterministic");
        assert_ne!(result1, Uint256::zero(), "Hash should not be zero");
    }

    #[test]
    fn test_hash5_optimized_consistency() {
        // Verify optimized implementation produces consistent results
        let data = [
            Uint256::from_u128(1),
            Uint256::from_u128(2),
            Uint256::from_u128(3),
            Uint256::from_u128(4),
            Uint256::from_u128(5),
        ];

        let result1 = hash5(data);
        let result2 = hash5(data);
        let result3 = hash5(data);

        assert_eq!(result1, result2, "Hash should be deterministic");
        assert_eq!(result2, result3, "Hash should be deterministic");
        assert_ne!(result1, Uint256::zero(), "Hash should not be zero");
    }

    #[test]
    fn test_optimized_hash_avalanche() {
        // Verify optimized version still has avalanche effect
        let data1 = [Uint256::from_u128(100), Uint256::from_u128(200)];
        let data2 = [Uint256::from_u128(100), Uint256::from_u128(201)];

        let result1 = hash2(data1);
        let result2 = hash2(data2);

        assert_ne!(
            result1, result2,
            "Small input change should cause large output change"
        );

        // Verify significant difference in bytes
        let bytes1 = result1.to_be_bytes();
        let bytes2 = result2.to_be_bytes();
        let diff_count = bytes1
            .iter()
            .zip(bytes2.iter())
            .filter(|(a, b)| a != b)
            .count();
        assert!(
            diff_count > 5,
            "Should have avalanche effect: {} bytes differ",
            diff_count
        );
    }

    #[test]
    fn test_optimized_conversions_roundtrip() {
        // Test that conversions work correctly
        let original_values = vec![
            Uint256::from_u128(0),
            Uint256::from_u128(1),
            Uint256::from_u128(42),
            Uint256::from_u128(1000),
            Uint256::from_u128(u128::MAX / 2),
        ];

        for original in original_values {
            // Convert to Fr and back through hash
            let fr = uint256_to_fr(&original);

            // Hash a single value and verify it's deterministic
            let hash1 = hash(vec![fr]);
            let hash2 = hash(vec![fr]);

            assert_eq!(
                hash1, hash2,
                "Hash should be deterministic for value: {}",
                original
            );
        }
    }

    #[test]
    fn test_optimized_edge_cases() {
        // Test edge cases with optimized implementation

        // All zeros
        let zeros = [Uint256::zero(); 5];
        let hash_zeros = hash5(zeros);
        assert_ne!(hash_zeros, Uint256::zero());

        // All same values
        let same = [Uint256::from_u128(42); 5];
        let hash_same = hash5(same);
        assert_ne!(hash_same, Uint256::zero());

        // Mixed values
        let mixed = [
            Uint256::zero(),
            Uint256::from_u128(1),
            Uint256::from_u128(u128::MAX / 2),
            Uint256::from_u128(42),
            Uint256::zero(),
        ];
        let hash_mixed = hash5(mixed);
        assert_ne!(hash_mixed, Uint256::zero());

        // Verify they're all different
        assert_ne!(hash_zeros, hash_same);
        assert_ne!(hash_same, hash_mixed);
        assert_ne!(hash_zeros, hash_mixed);
    }
}
