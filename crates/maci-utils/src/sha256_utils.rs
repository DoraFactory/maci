use cosmwasm_std::Uint256;
use sha2::{Digest, Sha256};

/// Hash a list of Uint256 values using SHA256
pub fn hash_256_uint256_list(arrays: &[Uint256]) -> String {
    let total_length = arrays.len() * 32;
    let mut result: Vec<u8> = Vec::with_capacity(total_length);

    for array in arrays {
        result.extend_from_slice(&array.to_be_bytes());
    }

    let hash_result = Sha256::digest(&result);

    // Use hex crate to convert binary data to hexadecimal string
    hex::encode(hash_result)
}

/// Pack multiple 32-byte arrays into a single byte vector
pub fn encode_packed(arrays: &[&[u8; 32]]) -> Vec<u8> {
    let total_length = arrays.len() * 32;
    let mut result: Vec<u8> = Vec::with_capacity(total_length);

    for array in arrays {
        result.extend_from_slice(*array);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_256_uint256_list() {
        let arrays = vec![
            Uint256::from_u128(1),
            Uint256::from_u128(2),
            Uint256::from_u128(3),
        ];
        let hash1 = hash_256_uint256_list(&arrays);
        let hash2 = hash_256_uint256_list(&arrays);

        // Should be deterministic
        assert_eq!(hash1, hash2);

        // Should be 64 characters (32 bytes in hex)
        assert_eq!(hash1.len(), 64);
    }

    #[test]
    fn test_encode_packed() {
        let arr1: [u8; 32] = [1; 32];
        let arr2: [u8; 32] = [2; 32];
        let result = encode_packed(&[&arr1, &arr2]);

        assert_eq!(result.len(), 64);
        assert_eq!(&result[0..32], &arr1[..]);
        assert_eq!(&result[32..64], &arr2[..]);
    }

    #[test]
    fn test_hash_256_uint256_list_empty() {
        let arrays: Vec<Uint256> = vec![];
        let hash = hash_256_uint256_list(&arrays);

        // Empty input should still produce valid hash
        assert_eq!(hash.len(), 64);

        // Should be deterministic
        let hash2 = hash_256_uint256_list(&arrays);
        assert_eq!(hash, hash2);
    }

    #[test]
    fn test_hash_256_uint256_list_single() {
        let arrays = vec![Uint256::from_u128(42)];
        let hash = hash_256_uint256_list(&arrays);

        assert_eq!(hash.len(), 64);

        // Different single value should produce different hash
        let arrays2 = vec![Uint256::from_u128(43)];
        let hash2 = hash_256_uint256_list(&arrays2);
        assert_ne!(hash, hash2);
    }

    #[test]
    fn test_hash_256_uint256_list_order_matters() {
        let arrays1 = vec![Uint256::from_u128(1), Uint256::from_u128(2)];
        let arrays2 = vec![Uint256::from_u128(2), Uint256::from_u128(1)];

        let hash1 = hash_256_uint256_list(&arrays1);
        let hash2 = hash_256_uint256_list(&arrays2);

        assert_ne!(hash1, hash2, "Hash should be order-sensitive");
    }

    #[test]
    fn test_hash_256_uint256_list_large() {
        let arrays: Vec<Uint256> = (0..100).map(|i| Uint256::from_u128(i)).collect();

        let hash1 = hash_256_uint256_list(&arrays);
        let hash2 = hash_256_uint256_list(&arrays);

        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 64);
    }

    #[test]
    fn test_hash_256_uint256_list_with_zeros() {
        let arrays = vec![Uint256::zero(), Uint256::zero(), Uint256::zero()];

        let hash1 = hash_256_uint256_list(&arrays);
        let hash2 = hash_256_uint256_list(&arrays);

        assert_eq!(hash1, hash2);

        // Should differ from hash of empty array
        let empty_hash = hash_256_uint256_list(&[]);
        assert_ne!(hash1, empty_hash);
    }

    #[test]
    fn test_hash_256_uint256_list_max_values() {
        let arrays = vec![Uint256::from_u128(u128::MAX), Uint256::from_u128(u128::MAX)];

        let hash = hash_256_uint256_list(&arrays);
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn test_encode_packed_single() {
        let arr: [u8; 32] = [5; 32];
        let result = encode_packed(&[&arr]);

        assert_eq!(result.len(), 32);
        assert_eq!(&result[..], &arr[..]);
    }

    #[test]
    fn test_encode_packed_empty() {
        let result = encode_packed(&[]);
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn test_encode_packed_multiple() {
        let arr1: [u8; 32] = [1; 32];
        let arr2: [u8; 32] = [2; 32];
        let arr3: [u8; 32] = [3; 32];

        let result = encode_packed(&[&arr1, &arr2, &arr3]);

        assert_eq!(result.len(), 96);
        assert_eq!(&result[0..32], &arr1[..]);
        assert_eq!(&result[32..64], &arr2[..]);
        assert_eq!(&result[64..96], &arr3[..]);
    }

    #[test]
    fn test_encode_packed_different_values() {
        let mut arr1 = [0u8; 32];
        arr1[0] = 1;

        let mut arr2 = [0u8; 32];
        arr2[31] = 1;

        let result = encode_packed(&[&arr1, &arr2]);

        assert_eq!(result.len(), 64);
        assert_eq!(result[0], 1);
        assert_eq!(result[63], 1);
    }

    #[test]
    fn test_hash_256_avalanche_effect() {
        let arrays1 = vec![Uint256::from_u128(1)];
        let arrays2 = vec![Uint256::from_u128(2)];

        let hash1 = hash_256_uint256_list(&arrays1);
        let hash2 = hash_256_uint256_list(&arrays2);

        assert_ne!(hash1, hash2);

        // Check that multiple characters differ (avalanche effect)
        let diff_count = hash1
            .chars()
            .zip(hash2.chars())
            .filter(|(a, b)| a != b)
            .count();

        assert!(
            diff_count > 10,
            "Should have avalanche effect: {} chars differ",
            diff_count
        );
    }

    #[test]
    fn test_hash_output_is_hex() {
        let arrays = vec![Uint256::from_u128(123)];
        let hash = hash_256_uint256_list(&arrays);

        // All characters should be valid hex
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_encode_packed_capacity() {
        let arr1: [u8; 32] = [1; 32];
        let arr2: [u8; 32] = [2; 32];

        let result = encode_packed(&[&arr1, &arr2]);

        // Capacity should be exactly what we need
        assert_eq!(result.len(), 64);
        assert_eq!(result.capacity(), 64);
    }
}
