use cosmwasm_std::Uint256;
use ff::*;
use poseidon_rs::Poseidon;

// Re-export Fr type for convenience
pub type Fr = poseidon_rs::Fr;

// Cache Poseidon instance for reuse
// Creating Poseidon instance is expensive due to constant loading
use std::sync::OnceLock;
static POSEIDON_INSTANCE: OnceLock<Poseidon> = OnceLock::new();

/// Get or initialize the cached Poseidon instance
fn get_poseidon() -> &'static Poseidon {
    POSEIDON_INSTANCE.get_or_init(Poseidon::new)
}

/// Converts Uint256 to Fr field element (OLD implementation - for reference and testing)
/// Uses string conversion for compatibility
#[inline]
pub fn uint256_to_fr_old(input: &Uint256) -> Fr {
    // Original implementation: String-based conversion
    Fr::from_str(&input.to_string()).unwrap()
}

/// Converts Uint256 to Fr field element
/// Optimized to use direct byte conversion instead of string operations
#[inline]
pub fn uint256_to_fr(input: &Uint256) -> Fr {
    // Optimization: Direct byte conversion using PrimeFieldRepr
    let bytes = input.to_le_bytes(); // Fr uses little-endian

    // Create FrRepr from bytes
    let mut repr = <Fr as PrimeField>::Repr::default();

    // Use read_le to parse bytes into FrRepr
    use std::io::Cursor;
    if repr.read_le(&mut Cursor::new(&bytes[..])).is_ok() {
        // Try to convert FrRepr to Fr
        match Fr::from_repr(repr) {
            Ok(fr) => return fr,
            Err(_) => {
                // Value exceeds field modulus, fallback to string conversion
            }
        }
    }

    // Fallback to string conversion for edge cases
    Fr::from_str(&input.to_string()).unwrap()
}

/// Hash a single Uint256 value
pub fn hash_uint256(data: Uint256) -> Uint256 {
    let uint256_inputs = vec![uint256_to_fr(&data)];
    hash(uint256_inputs)
}

/// Core hash function using cached Poseidon instance (OLD implementation - for reference and testing)
/// Uses string conversion for compatibility
pub fn hash_old(message: Vec<Fr>) -> Uint256 {
    use crate::conversions::uint256_from_hex_string;

    // Use cached Poseidon instance
    let poseidon = get_poseidon();

    // Original implementation: String-based conversion
    let hash_item = poseidon.hash(message).unwrap().to_string();
    let hash_res = &hash_item[5..hash_item.len() - 1];

    uint256_from_hex_string(hash_res)
}

/// Core hash function using cached Poseidon instance
pub fn hash(message: Vec<Fr>) -> Uint256 {
    // Use cached Poseidon instance instead of creating new one each time
    let poseidon = get_poseidon();
    let result_fr = poseidon.hash(message).unwrap();

    // Optimization: Direct byte conversion using PrimeFieldRepr
    let repr = result_fr.into_repr();

    // Convert FrRepr to bytes using write_le
    let mut bytes = [0u8; 32];
    use std::io::Cursor;
    let mut cursor = Cursor::new(&mut bytes[..]);

    if repr.write_le(&mut cursor).is_ok() {
        // Successfully wrote bytes, convert to Uint256
        Uint256::from_le_bytes(bytes)
    } else {
        // Fallback to string conversion (should rarely happen)
        let hash_item = result_fr.to_string();
        let hash_res = &hash_item[5..hash_item.len() - 1];
        use crate::conversions::uint256_from_hex_string;
        uint256_from_hex_string(hash_res)
    }
}

/// Hash 2 Uint256 values using OLD implementation (for testing)
pub fn hash2_old(data: [Uint256; 2]) -> Uint256 {
    let uint256_inputs: Vec<Fr> = data.iter().map(uint256_to_fr_old).collect();
    hash_old(uint256_inputs)
}

/// Hash 5 Uint256 values using OLD implementation (for testing)
pub fn hash5_old(data: [Uint256; 5]) -> Uint256 {
    let uint256_inputs: Vec<Fr> = data.iter().map(uint256_to_fr_old).collect();
    hash_old(uint256_inputs)
}

/// Hash 2 Uint256 values (commonly used for Merkle trees)
pub fn hash2(data: [Uint256; 2]) -> Uint256 {
    let uint256_inputs: Vec<Fr> = data.iter().map(uint256_to_fr).collect();
    hash(uint256_inputs)
}

/// Hash 5 Uint256 values (commonly used for message hashing)
pub fn hash5(data: [Uint256; 5]) -> Uint256 {
    let uint256_inputs: Vec<Fr> = data.iter().map(uint256_to_fr).collect();
    hash(uint256_inputs)
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

    // === Old vs New Implementation Comparison Tests ===

    #[test]
    fn test_uint256_to_fr_old_vs_new() {
        // Test that old and new conversions produce the same Fr values
        let test_values = vec![
            Uint256::zero(),
            Uint256::from_u128(1),
            Uint256::from_u128(42),
            Uint256::from_u128(12345),
            Uint256::from_u128(999999),
            Uint256::from_u128(u128::MAX / 2),
        ];

        for value in test_values {
            let fr_old = uint256_to_fr_old(&value);
            let fr_new = uint256_to_fr(&value);

            // Compare as strings to ensure exact match
            assert_eq!(
                fr_old.to_string(),
                fr_new.to_string(),
                "Old and new uint256_to_fr should produce same result for {}",
                value
            );
        }
    }

    #[test]
    fn test_hash2_old_vs_new() {
        // Test that old and new hash2 produce identical results
        let test_cases = vec![
            [Uint256::zero(), Uint256::zero()],
            [Uint256::from_u128(1), Uint256::from_u128(2)],
            [Uint256::from_u128(100), Uint256::from_u128(200)],
            [Uint256::from_u128(12345), Uint256::from_u128(67890)],
            [
                Uint256::from_u128(u128::MAX / 2),
                Uint256::from_u128(u128::MAX / 3),
            ],
        ];

        for data in test_cases {
            let result_old = hash2_old(data);
            let result_new = hash2(data);

            assert_eq!(
                result_old, result_new,
                "Old and new hash2 should produce identical results for [{}, {}]",
                data[0], data[1]
            );
        }
    }

    #[test]
    fn test_hash5_old_vs_new() {
        // Test that old and new hash5 produce identical results
        let test_cases = vec![
            [
                Uint256::zero(),
                Uint256::zero(),
                Uint256::zero(),
                Uint256::zero(),
                Uint256::zero(),
            ],
            [
                Uint256::from_u128(1),
                Uint256::from_u128(2),
                Uint256::from_u128(3),
                Uint256::from_u128(4),
                Uint256::from_u128(5),
            ],
            [
                Uint256::from_u128(100),
                Uint256::from_u128(200),
                Uint256::from_u128(300),
                Uint256::from_u128(400),
                Uint256::from_u128(500),
            ],
            [
                Uint256::from_u128(u128::MAX / 10),
                Uint256::from_u128(u128::MAX / 9),
                Uint256::from_u128(u128::MAX / 8),
                Uint256::from_u128(u128::MAX / 7),
                Uint256::from_u128(u128::MAX / 6),
            ],
        ];

        for data in test_cases {
            let result_old = hash5_old(data);
            let result_new = hash5(data);

            assert_eq!(
                result_old, result_new,
                "Old and new hash5 should produce identical results for [{}, {}, {}, {}, {}]",
                data[0], data[1], data[2], data[3], data[4]
            );
        }
    }

    #[test]
    fn test_hash_old_vs_new_with_fr() {
        // Test the core hash function with Fr inputs
        let test_cases = vec![
            vec![uint256_to_fr(&Uint256::from_u128(1))],
            vec![
                uint256_to_fr(&Uint256::from_u128(1)),
                uint256_to_fr(&Uint256::from_u128(2)),
            ],
            vec![
                uint256_to_fr(&Uint256::from_u128(10)),
                uint256_to_fr(&Uint256::from_u128(20)),
                uint256_to_fr(&Uint256::from_u128(30)),
            ],
        ];

        for message in test_cases {
            let result_old = hash_old(message.clone());
            let result_new = hash(message.clone());

            assert_eq!(
                result_old,
                result_new,
                "Old and new hash should produce identical results for {} Fr elements",
                message.len()
            );
        }
    }

    #[test]
    fn test_backward_compatibility() {
        // Critical test: Ensure optimized version is backward compatible
        // This test uses known values from the old implementation

        // Test case 1: Simple hash2
        let data2 = [Uint256::from_u128(123), Uint256::from_u128(456)];
        let expected2 = hash2_old(data2);
        let actual2 = hash2(data2);
        println!(
            "expected2: {:?}, actual2: {:?}",
            expected2.to_string(),
            actual2.to_string()
        );
        assert_eq!(
            expected2, actual2,
            "Backward compatibility failed for hash2"
        );

        // Test case 2: Simple hash5
        let data5 = [
            Uint256::from_u128(1),
            Uint256::from_u128(2),
            Uint256::from_u128(3),
            Uint256::from_u128(4),
            Uint256::from_u128(5),
        ];
        let expected5 = hash5_old(data5);
        let actual5 = hash5(data5);
        assert_eq!(
            expected5, actual5,
            "Backward compatibility failed for hash5"
        );

        // Test case 3: Edge case with zeros
        let zeros = [Uint256::zero(), Uint256::zero()];
        let expected_zeros = hash2_old(zeros);
        let actual_zeros = hash2(zeros);
        assert_eq!(
            expected_zeros, actual_zeros,
            "Backward compatibility failed for zeros"
        );

        // Test case 4: Edge case with actual large values from production
        use std::str::FromStr;
        let large_values = [
            Uint256::from_str(
                "12761031405884291514862783980916548812409192269495287387226935999678051935688",
            )
            .unwrap(),
            Uint256::from_str(
                "5560333312265220368904143333705565012889927992449600963705144275569222325479",
            )
            .unwrap(),
        ];
        let expected_large_values = hash2_old(large_values);
        let actual_large_values = hash2(large_values);

        println!(
            "Large values test - Value1: {}, Value2: {}",
            large_values[0], large_values[1]
        );
        println!(
            "Expected hash: {}, Actual hash: {}",
            expected_large_values, actual_large_values
        );

        assert_eq!(
            expected_large_values, actual_large_values,
            "Backward compatibility failed for large values"
        );
    }

    #[test]
    fn test_performance_comparison() {
        // Simple performance comparison test
        // Note: This is not a precise benchmark, just a sanity check

        use std::time::Instant;

        let data = [
            Uint256::from_u128(1),
            Uint256::from_u128(2),
            Uint256::from_u128(3),
            Uint256::from_u128(4),
            Uint256::from_u128(5),
        ];

        let iterations = 100;

        // Test old implementation
        let start_old = Instant::now();
        for _ in 0..iterations {
            let _ = hash5_old(data);
        }
        let duration_old = start_old.elapsed();

        // Test new implementation
        let start_new = Instant::now();
        for _ in 0..iterations {
            let _ = hash5(data);
        }
        let duration_new = start_new.elapsed();

        println!(
            "\n=== Performance Comparison (hash5, {} iterations) ===",
            iterations
        );
        println!("Old implementation: {:?}", duration_old);
        println!("New implementation: {:?}", duration_new);

        if duration_new < duration_old {
            let improvement = ((duration_old.as_nanos() - duration_new.as_nanos()) as f64
                / duration_old.as_nanos() as f64)
                * 100.0;
            println!("Improvement: {:.2}%", improvement);
        } else {
            println!("Note: New implementation may be slower in debug mode");
        }
        println!("========================================\n");

        // Sanity check: new should be at least not significantly slower
        // Allow 100% margin in debug mode (optimizations apply in release)
        let acceptable_ratio = 2.0;
        assert!(
            duration_new.as_nanos() < duration_old.as_nanos() * acceptable_ratio as u128,
            "New implementation is significantly slower than old"
        );
    }
}
