use cosmwasm_std::Uint256;
use ff::*;
use poseidon_rs::Poseidon;

// Re-export Fr type for convenience
pub type Fr = poseidon_rs::Fr;

use crate::conversions::uint256_from_hex_string;

// Cache Poseidon instance for reuse
// Creating Poseidon instance is expensive due to constant loading
use std::sync::OnceLock;
static POSEIDON_INSTANCE: OnceLock<Poseidon> = OnceLock::new();

/// Get or initialize the cached Poseidon instance
fn get_poseidon() -> &'static Poseidon {
    POSEIDON_INSTANCE.get_or_init(|| Poseidon::new())
}

/// Converts Uint256 to Fr field element
/// This helper centralizes the conversion logic for future optimization
#[inline]
pub fn uint256_to_fr(input: &Uint256) -> Fr {
    // Currently using from_str for compatibility
    // Future optimization: Direct byte conversion when stable API is available
    Fr::from_str(&input.to_string()).unwrap()
}

/// Hash a single Uint256 value
pub fn hash_uint256(data: Uint256) -> Uint256 {
    let uint256_inputs = vec![uint256_to_fr(&data)];
    hash(uint256_inputs)
}

/// Core hash function using cached Poseidon instance
pub fn hash(message: Vec<Fr>) -> Uint256 {
    // Use cached Poseidon instance instead of creating new one each time
    let poseidon = get_poseidon();

    let hash_item = poseidon.hash(message).unwrap().to_string();
    let hash_res = &hash_item[5..hash_item.len() - 1];

    uint256_from_hex_string(hash_res)
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
}
