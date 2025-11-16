use cosmwasm_std::Uint256;

/// Convert hex string to Uint256
pub fn uint256_from_hex_string(hex_string: &str) -> Uint256 {
    let padded_hex_string = if hex_string.len() < 64 {
        let padding_length = 64 - hex_string.len();
        format!("{:0>width$}{}", "", hex_string, width = padding_length)
    } else {
        hex_string.to_string()
    };

    let res = hex_to_decimal(&padded_hex_string);
    Uint256::from_be_bytes(res)
}

/// Convert Uint256 to hex string
pub fn uint256_to_hex(data: Uint256) -> String {
    hex::encode(data.to_be_bytes())
}

/// Convert hex string to 32-byte array
pub fn hex_to_decimal(hex_bytes: &str) -> [u8; 32] {
    let bytes = hex::decode(hex_bytes).unwrap_or_else(|_| vec![]);
    let mut array: [u8; 32] = [0; 32];

    let len = bytes.len().min(32);
    array[..len].copy_from_slice(&bytes[..len]);

    array
}

/// Convert hex string to Uint256
pub fn hex_to_uint256(hex_bytes: &str) -> Uint256 {
    let bytes = hex::decode(hex_bytes).unwrap_or_else(|_| vec![]);
    let mut array: [u8; 32] = [0; 32];

    let len = bytes.len().min(32);
    array[..len].copy_from_slice(&bytes[..len]);

    Uint256::from_be_bytes(array)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hex_conversions() {
        let original = Uint256::from_u128(12345678901234567890u128);
        let hex = uint256_to_hex(original);
        let recovered = uint256_from_hex_string(&hex);
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_hex_to_decimal() {
        let hex = "0000000000000000000000000000000000000000000000000000000000000001";
        let result = hex_to_decimal(hex);
        assert_eq!(result[31], 1);
        for i in 0..31 {
            assert_eq!(result[i], 0);
        }
    }

    #[test]
    fn test_short_hex_padding() {
        let hex = "ff";
        let result = uint256_from_hex_string(hex);
        assert_eq!(result, Uint256::from_u128(255));
    }

    #[test]
    fn test_zero_conversion() {
        let zero = Uint256::zero();
        let hex = uint256_to_hex(zero);
        let recovered = uint256_from_hex_string(&hex);
        assert_eq!(zero, recovered);
        assert_eq!(hex.len(), 64); // 32 bytes * 2 hex chars
    }

    #[test]
    fn test_max_u128_conversion() {
        let max = Uint256::from_u128(u128::MAX);
        let hex = uint256_to_hex(max);
        let recovered = uint256_from_hex_string(&hex);
        assert_eq!(max, recovered);
    }

    #[test]
    fn test_hex_to_uint256_empty() {
        let result = hex_to_uint256("");
        assert_eq!(result, Uint256::zero());
    }

    #[test]
    fn test_hex_to_uint256_invalid() {
        // Invalid hex characters should result in empty vec
        let result = hex_to_uint256("zzzz");
        assert_eq!(result, Uint256::zero());
    }

    #[test]
    fn test_hex_to_decimal_empty() {
        let result = hex_to_decimal("");
        let expected = [0u8; 32];
        assert_eq!(result, expected);
    }

    #[test]
    fn test_hex_to_decimal_invalid() {
        // Invalid hex should result in zero array
        let result = hex_to_decimal("xyz");
        let expected = [0u8; 32];
        assert_eq!(result, expected);
    }

    #[test]
    fn test_uint256_from_hex_string_single_byte() {
        let hex = "01";
        let result = uint256_from_hex_string(hex);
        assert_eq!(result, Uint256::from_u128(1));
    }

    #[test]
    fn test_uint256_from_hex_string_full_length() {
        let hex = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        let result = uint256_from_hex_string(hex);
        // Should not panic with full 64-char hex string
        assert_ne!(result, Uint256::zero());
    }

    #[test]
    fn test_uint256_from_hex_string_exact_64_chars() {
        let hex = "0000000000000000000000000000000000000000000000000000000000000100";
        let result = uint256_from_hex_string(hex);
        assert_eq!(result, Uint256::from_u128(256));
    }

    #[test]
    fn test_hex_to_decimal_longer_than_32_bytes() {
        // More than 64 hex chars (32 bytes) should be truncated
        let hex = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        let result = hex_to_decimal(hex);
        // Should only take first 32 bytes
        assert_eq!(result.len(), 32);
    }

    #[test]
    fn test_uint256_to_hex_deterministic() {
        let value = Uint256::from_u128(999999);
        let hex1 = uint256_to_hex(value);
        let hex2 = uint256_to_hex(value);
        assert_eq!(hex1, hex2);
    }

    #[test]
    fn test_round_trip_multiple_values() {
        let values = vec![
            Uint256::zero(),
            Uint256::from_u128(1),
            Uint256::from_u128(255),
            Uint256::from_u128(256),
            Uint256::from_u128(65535),
            Uint256::from_u128(u128::MAX),
        ];

        for value in values {
            let hex = uint256_to_hex(value);
            let recovered = uint256_from_hex_string(&hex);
            assert_eq!(value, recovered, "Round trip failed for value: {}", value);
        }
    }

    #[test]
    fn test_hex_to_uint256_case_insensitive() {
        let lower = hex_to_uint256("ff");
        let upper = hex_to_uint256("FF");
        assert_eq!(lower, upper);
    }

    #[test]
    fn test_uint256_to_hex_always_64_chars() {
        let test_values = vec![
            Uint256::zero(),
            Uint256::from_u128(1),
            Uint256::from_u128(u128::MAX),
        ];

        for value in test_values {
            let hex = uint256_to_hex(value);
            assert_eq!(
                hex.len(),
                64,
                "Hex should always be 64 chars for value: {}",
                value
            );
        }
    }

    #[test]
    fn test_hex_padding_various_lengths() {
        let test_cases = vec![
            ("1", Uint256::from_u128(1)),
            ("10", Uint256::from_u128(16)),
            ("100", Uint256::from_u128(256)),
            ("1000", Uint256::from_u128(4096)),
        ];

        for (hex, expected) in test_cases {
            let result = uint256_from_hex_string(hex);
            assert_eq!(result, expected, "Failed for hex: {}", hex);
        }
    }
}
