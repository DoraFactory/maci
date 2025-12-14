/*!
# MACI Utils

Shared utility functions for MACI contracts.

## Features

- **Poseidon Hashing**: ZK-friendly hash functions (hash2, hash5, etc.)
- **Type Conversions**: Uint256 ↔ Hex ↔ Fr conversions
- **SHA256 Utilities**: Standard hashing for non-ZK contexts
- **Performance Optimized**: Cached Poseidon instance for better gas efficiency

## Usage

```rust,ignore
use maci_utils::{hash5, hash2};
use cosmwasm_std::Uint256;

let data = [Uint256::from_u128(1), Uint256::from_u128(2)];
let result = hash2(data);
```
*/

mod conversions;
mod poseidon;
mod sha256_utils;

// Re-export main types and functions
pub use conversions::{hex_to_decimal, hex_to_uint256, uint256_from_hex_string, uint256_to_hex};
pub use poseidon::{hash, hash2, hash5, hash_uint256, uint256_to_fr, Fr};
pub use sha256_utils::{encode_packed, hash_256_uint256_list};

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::Uint256;

    // === Basic Determinism Tests ===

    #[test]
    fn test_hash2_deterministic() {
        let data = [Uint256::from_u128(1), Uint256::from_u128(2)];
        let result1 = hash2(data);
        let result2 = hash2(data);
        assert_eq!(result1, result2, "Hash should be deterministic");
    }

    #[test]
    fn test_hash5_deterministic() {
        let data = [
            Uint256::from_u128(1),
            Uint256::from_u128(2),
            Uint256::from_u128(3),
            Uint256::from_u128(4),
            Uint256::from_u128(5),
        ];
        let result1 = hash5(data);
        let result2 = hash5(data);
        assert_eq!(result1, result2, "Hash should be deterministic");
    }

    #[test]
    fn test_hex_conversions() {
        let value = Uint256::from_u128(12345);
        let hex = uint256_to_hex(value);
        let recovered = uint256_from_hex_string(&hex);
        assert_eq!(value, recovered, "Hex conversion should be reversible");
    }

    // === Integration Tests ===

    #[test]
    fn test_publish_message_pattern() {
        // Simulate the publish_message pattern: 2x hash5 + 1x hash2
        let m = [
            Uint256::from_u128(1),
            Uint256::from_u128(2),
            Uint256::from_u128(3),
            Uint256::from_u128(4),
            Uint256::from_u128(5),
        ];
        let n = [
            Uint256::from_u128(6),
            Uint256::from_u128(7),
            Uint256::from_u128(8),
            Uint256::from_u128(9),
            Uint256::from_u128(10),
        ];

        let m_hash = hash5(m);
        let n_hash = hash5(n);
        let final_hash = hash2([m_hash, n_hash]);

        // Should be deterministic
        let m_hash2 = hash5(m);
        let n_hash2 = hash5(n);
        let final_hash2 = hash2([m_hash2, n_hash2]);

        assert_eq!(final_hash, final_hash2);
    }

    #[test]
    fn test_hash_then_convert_to_hex() {
        let data = [Uint256::from_u128(100), Uint256::from_u128(200)];
        let hash_result = hash2(data);

        // Convert hash result to hex
        let hex = uint256_to_hex(hash_result);
        assert_eq!(hex.len(), 64);

        // Convert back
        let recovered = uint256_from_hex_string(&hex);
        assert_eq!(hash_result, recovered);
    }

    #[test]
    fn test_merkle_tree_simulation() {
        // Simulate a simple Merkle tree with hash2
        let leaf1 = Uint256::from_u128(1);
        let leaf2 = Uint256::from_u128(2);
        let leaf3 = Uint256::from_u128(3);
        let leaf4 = Uint256::from_u128(4);

        // Level 1: Hash pairs of leaves
        let node1 = hash2([leaf1, leaf2]);
        let node2 = hash2([leaf3, leaf4]);

        // Level 2: Hash pairs of nodes
        let root = hash2([node1, node2]);

        // Root should be deterministic
        let node1_again = hash2([leaf1, leaf2]);
        let node2_again = hash2([leaf3, leaf4]);
        let root_again = hash2([node1_again, node2_again]);

        assert_eq!(root, root_again);
    }

    #[test]
    fn test_combined_hash_and_sha256() {
        let data = [Uint256::from_u128(1), Uint256::from_u128(2)];
        let poseidon_hash = hash2(data);

        // Use SHA256 on the result
        let sha_hash = hash_256_uint256_list(&[poseidon_hash]);
        assert_eq!(sha_hash.len(), 64);
    }

    // === Edge Cases ===

    #[test]
    fn test_all_zeros() {
        let data = [Uint256::zero(), Uint256::zero()];
        let result = hash2(data);
        assert_ne!(result, Uint256::zero(), "Hash of zeros should not be zero");
    }

    #[test]
    fn test_same_value_repeated() {
        let value = Uint256::from_u128(42);
        let data = [value, value];
        let result1 = hash2(data);
        let result2 = hash2(data);
        assert_eq!(result1, result2);
    }

    #[test]
    fn test_sequential_values() {
        let data: Vec<_> = (0..5).map(|i| Uint256::from_u128(i)).collect();

        let hash_result = hash5([data[0], data[1], data[2], data[3], data[4]]);

        assert_ne!(hash_result, Uint256::zero());
    }

    // === API Consistency Tests ===

    #[test]
    fn test_hash_uint256_vs_hash2_with_duplicate() {
        let value = Uint256::from_u128(42);
        let single_hash = hash_uint256(value);
        let double_hash = hash2([value, value]);

        // These should be different (different number of inputs)
        assert_ne!(single_hash, double_hash);
    }

    #[test]
    fn test_multiple_conversions_preserve_value() {
        let original = Uint256::from_u128(999999);

        // Multiple round trips
        for _ in 0..5 {
            let hex = uint256_to_hex(original);
            let recovered = uint256_from_hex_string(&hex);
            assert_eq!(original, recovered);
        }
    }

    #[test]
    fn test_hex_conversion_preserves_leading_zeros() {
        let value = Uint256::from_u128(1); // Very small number
        let hex = uint256_to_hex(value);

        // Should be 64 chars even for small numbers
        assert_eq!(hex.len(), 64);

        let recovered = uint256_from_hex_string(&hex);
        assert_eq!(value, recovered);
    }

    // === Performance/Cache Tests ===

    #[test]
    fn test_repeated_hashing_consistency() {
        let data = [Uint256::from_u128(1), Uint256::from_u128(2)];

        // Hash many times to ensure cache works
        let results: Vec<_> = (0..100).map(|_| hash2(data)).collect();

        // All results should be identical
        for result in &results {
            assert_eq!(result, &results[0]);
        }
    }

    #[test]
    fn test_mixed_function_calls() {
        // Test that mixing different hash functions works correctly
        let v1 = Uint256::from_u128(1);
        let v2 = Uint256::from_u128(2);

        let h1 = hash_uint256(v1);
        let h2 = hash2([v1, v2]);
        let h3 = hash_uint256(v2);

        // All should be different
        assert_ne!(h1, h2);
        assert_ne!(h2, h3);
        assert_ne!(h1, h3);

        // But deterministic
        assert_eq!(h1, hash_uint256(v1));
        assert_eq!(h2, hash2([v1, v2]));
        assert_eq!(h3, hash_uint256(v2));
    }

    // === Real-world Scenario Tests ===

    #[test]
    fn test_message_chain() {
        // Simulate a chain of messages where each includes previous hash
        let mut prev_hash = Uint256::zero();
        let mut hashes = Vec::new();

        for i in 0..5 {
            let message_data = [
                Uint256::from_u128(i),
                Uint256::from_u128(i + 1),
                Uint256::from_u128(i + 2),
                Uint256::from_u128(i + 3),
                prev_hash,
            ];

            prev_hash = hash5(message_data);
            hashes.push(prev_hash);
        }

        // Each hash should be unique
        for i in 0..hashes.len() {
            for j in (i + 1)..hashes.len() {
                assert_ne!(hashes[i], hashes[j]);
            }
        }
    }

    #[test]
    fn test_state_commitment_pattern() {
        // Simulate computing a state commitment from multiple values
        let state_data = [
            Uint256::from_u128(100),  // user_id
            Uint256::from_u128(1000), // balance
            Uint256::from_u128(5),    // vote_count
            Uint256::from_u128(42),   // nonce
            Uint256::from_u128(0),    // flags
        ];

        let commitment = hash5(state_data);

        // Changing any field should change commitment
        let mut modified_data = state_data;
        modified_data[1] = Uint256::from_u128(1001); // Changed balance
        let modified_commitment = hash5(modified_data);

        assert_ne!(commitment, modified_commitment);
    }

    #[test]
    fn test_batch_processing() {
        // Test processing multiple items efficiently
        let items: Vec<_> = (0..10)
            .map(|i| [Uint256::from_u128(i), Uint256::from_u128(i + 1)])
            .collect();

        let hashes: Vec<_> = items.iter().map(|&item| hash2(item)).collect();

        // All hashes should be unique
        for i in 0..hashes.len() {
            for j in (i + 1)..hashes.len() {
                assert_ne!(hashes[i], hashes[j]);
            }
        }

        // Verify determinism by recomputing
        for (i, &item) in items.iter().enumerate() {
            assert_eq!(hashes[i], hash2(item));
        }
    }
}
