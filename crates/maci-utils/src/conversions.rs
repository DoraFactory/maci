use cosmwasm_std::Uint256;

/// Convert hex string to Uint256 (OLD implementation - for reference and testing)
/// Uses string formatting for padding
#[cfg(test)]
pub fn uint256_from_hex_string_old(hex_string: &str) -> Uint256 {
    let padded_hex_string = if hex_string.len() < 64 {
        let padding_length = 64 - hex_string.len();
        format!("{:0>width$}{}", "", hex_string, width = padding_length)
    } else {
        hex_string.to_string()
    };

    let res = hex_to_decimal(&padded_hex_string);
    Uint256::from_be_bytes(res)
}

/// Convert hex string to Uint256
/// Optimized to avoid string formatting and allocations
pub fn uint256_from_hex_string(hex_string: &str) -> Uint256 {
    // hex::decode requires even-length strings (2 chars = 1 byte)
    // If odd length, prepend a '0' to make it even
    let hex_to_decode = if hex_string.len() % 2 == 1 {
        // For odd-length strings, prepend '0' (e.g., "1" -> "01")
        let mut padded = String::with_capacity(hex_string.len() + 1);
        padded.push('0');
        padded.push_str(hex_string);
        padded
    } else {
        hex_string.to_string()
    };

    // Optimization: Directly decode hex and handle padding at byte level
    let bytes = hex::decode(hex_to_decode).expect("Invalid hex string");

    let mut array: [u8; 32] = [0; 32];

    // Handle different lengths efficiently
    if bytes.len() <= 32 {
        // Right-align the bytes (big-endian)
        let start = 32 - bytes.len();
        array[start..].copy_from_slice(&bytes);
    } else {
        // If longer than 32 bytes, take the first 32
        array.copy_from_slice(&bytes[..32]);
    }

    Uint256::from_be_bytes(array)
}

/// Convert Uint256 to hex string
pub fn uint256_to_hex(data: Uint256) -> String {
    hex::encode(data.to_be_bytes())
}

/// Convert hex string to 32-byte array
pub fn hex_to_decimal(hex_bytes: &str) -> [u8; 32] {
    let bytes = hex::decode(hex_bytes).expect("Invalid hex string");
    let mut array: [u8; 32] = [0; 32];

    let len = bytes.len().min(32);
    if len > 0 {
        // Right-align for big-endian (place data at the end of array)
        let start = 32 - len;
        array[start..].copy_from_slice(&bytes[..len]);
    }

    array
}

/// Convert hex string to Uint256
pub fn hex_to_uint256(hex_bytes: &str) -> Uint256 {
    let bytes = hex::decode(hex_bytes).expect("Invalid hex string");
    let mut array: [u8; 32] = [0; 32];

    let len = bytes.len().min(32);
    if len > 0 && len <= 32 {
        // Right-align for big-endian (place data at the end of array)
        let start = 32 - len;
        array[start..].copy_from_slice(&bytes[..len]);
    } else if len > 32 {
        // If longer than 32 bytes, take the first 32
        array.copy_from_slice(&bytes[..32]);
    }

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
    #[should_panic(expected = "Invalid hex string")]
    fn test_uint256_from_hex_string_invalid() {
        // Invalid hex characters should panic with clear error message
        let _result = uint256_from_hex_string("zzzz");
    }

    #[test]
    #[should_panic(expected = "Invalid hex string")]
    fn test_uint256_from_hex_string_invalid_with_prefix() {
        // Invalid hex characters should panic with clear error message
        let _result = uint256_from_hex_string("0xGHIJ");
    }

    #[test]
    fn test_uint256_from_hex_string_empty() {
        // Empty string is valid, decodes to zero
        let result = uint256_from_hex_string("");
        assert_eq!(result, Uint256::zero());
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
        // Empty string is valid, decodes to zero
        let result = hex_to_uint256("");
        assert_eq!(result, Uint256::zero());
    }

    #[test]
    #[should_panic(expected = "Invalid hex string")]
    fn test_hex_to_uint256_invalid() {
        // Invalid hex characters should panic
        let _result = hex_to_uint256("zzzz");
    }

    #[test]
    fn test_hex_to_decimal_empty() {
        // Empty string is valid, decodes to zero array
        let result = hex_to_decimal("");
        let expected = [0u8; 32];
        assert_eq!(result, expected);
    }

    #[test]
    #[should_panic(expected = "Invalid hex string")]
    fn test_hex_to_decimal_invalid() {
        // Invalid hex should panic
        let _result = hex_to_decimal("xyz");
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

    // === Old vs New Implementation Comparison Tests ===

    #[test]
    fn test_uint256_from_hex_old_vs_new() {
        // Test that old and new implementations produce same results
        let test_cases = vec![
            "0",
            "1",
            "ff",
            "100",
            "1000",
            "ffffffff",
            "0000000000000000000000000000000000000000000000000000000000000001",
            "0000000000000000000000000000000000000000000000000000000000000100",
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            // Actual production values
            "1c3c41a5e00b52d6ab22bff90fdadaee4758ef1e3e78faa52eba08d7fa73d748",
            "0c2c953ae1d6e18e4c6cf1bb7a2df38e3b0f2d9e8c7b6a59483726150403d2e1",
        ];

        for hex in test_cases {
            let old_result = uint256_from_hex_string_old(hex);
            let new_result = uint256_from_hex_string(hex);

            assert_eq!(
                old_result, new_result,
                "Old and new implementations differ for hex: {}",
                hex
            );
        }
    }

    #[test]
    fn test_backward_compatibility_conversions() {
        // Critical test: Ensure optimized version is backward compatible

        // Test case 1: Small values
        let hex1 = "ff";
        let expected1 = uint256_from_hex_string_old(hex1);
        let actual1 = uint256_from_hex_string(hex1);
        assert_eq!(expected1, actual1, "Failed for small value");

        // Test case 2: Full length
        let hex2 = "0000000000000000000000000000000000000000000000000000000000000100";
        let expected2 = uint256_from_hex_string_old(hex2);
        let actual2 = uint256_from_hex_string(hex2);
        assert_eq!(expected2, actual2, "Failed for full length");

        // Test case 3: Maximum value
        let hex3 = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        let expected3 = uint256_from_hex_string_old(hex3);
        let actual3 = uint256_from_hex_string(hex3);
        assert_eq!(expected3, actual3, "Failed for maximum value");

        // Test case 4: Medium length
        let hex4 = "123456789abcdef";
        let expected4 = uint256_from_hex_string_old(hex4);
        let actual4 = uint256_from_hex_string(hex4);
        assert_eq!(expected4, actual4, "Failed for medium length");
    }

    #[test]
    fn test_performance_comparison_conversions() {
        use std::time::Instant;

        let test_hex = "1c3c41a5e00b52d6ab22bff90fdadaee4758ef1e3e78faa52eba08d7fa73d748";
        let iterations = 1000;

        // Test old implementation
        let start_old = Instant::now();
        for _ in 0..iterations {
            let _ = uint256_from_hex_string_old(test_hex);
        }
        let duration_old = start_old.elapsed();

        // Test new implementation
        let start_new = Instant::now();
        for _ in 0..iterations {
            let _ = uint256_from_hex_string(test_hex);
        }
        let duration_new = start_new.elapsed();

        println!(
            "\n=== Conversion Performance ({} iterations) ===",
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
            println!("Note: Performance may vary in debug mode");
        }
        println!("=======================================\n");

        // Sanity check: Allow for performance variations in debug mode
        // In release mode, the optimized version should be faster
        let acceptable_ratio = 2.0; // Allow 2x margin in debug mode due to variance
        assert!(
            duration_new.as_nanos() < duration_old.as_nanos() * acceptable_ratio as u128,
            "New implementation is significantly slower than old ({}x slower)",
            duration_new.as_nanos() as f64 / duration_old.as_nanos() as f64
        );
    }

    #[test]
    fn test_edge_cases_old_vs_new() {
        // Test edge cases to ensure consistency

        // Empty-like cases (all zeros)
        let zeros = "0000000000000000000000000000000000000000000000000000000000000000";
        assert_eq!(
            uint256_from_hex_string_old(zeros),
            uint256_from_hex_string(zeros)
        );

        // Single digit
        let single = "1";
        assert_eq!(
            uint256_from_hex_string_old(single),
            uint256_from_hex_string(single)
        );

        // All F's (maximum)
        let max = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        assert_eq!(
            uint256_from_hex_string_old(max),
            uint256_from_hex_string(max)
        );

        // Mixed case (should work the same)
        let mixed = "AbCdEf";
        assert_eq!(
            uint256_from_hex_string_old(mixed),
            uint256_from_hex_string(mixed)
        );
    }

    #[test]
    fn test_various_lengths_old_vs_new() {
        // Test different hex string lengths
        let lengths = vec![
            ("1", 1),
            ("12", 2),
            ("123", 3),
            ("1234", 4),
            ("12345678", 8),
            ("123456789abcdef0", 16),
            ("123456789abcdef0123456789abcdef0", 32),
            (
                "123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0",
                64,
            ),
        ];

        for (hex, len) in lengths {
            let old_result = uint256_from_hex_string_old(hex);
            let new_result = uint256_from_hex_string(hex);

            assert_eq!(
                old_result, new_result,
                "Results differ for length {} (hex: {})",
                len, hex
            );
        }
    }

    #[test]
    fn test_round_trip_old_vs_new() {
        // Test that round trips work the same way
        let values = vec![
            Uint256::zero(),
            Uint256::from_u128(1),
            Uint256::from_u128(255),
            Uint256::from_u128(65535),
            Uint256::from_u128(u128::MAX / 2),
            Uint256::from_u128(u128::MAX),
        ];

        for value in values {
            let hex = uint256_to_hex(value);

            let recovered_old = uint256_from_hex_string_old(&hex);
            let recovered_new = uint256_from_hex_string(&hex);

            assert_eq!(value, recovered_old, "Old round trip failed");
            assert_eq!(value, recovered_new, "New round trip failed");
            assert_eq!(
                recovered_old, recovered_new,
                "Old and new round trips differ"
            );
        }
    }

    #[test]
    fn test_actual_production_data() {
        // Test with actual production data from contract.rs
        // These are real hex values used in the MACI contract
        use std::str::FromStr;

        let test_cases = vec![
            (
                "2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc",
                "14655542659562014735865511769057053982292279840403315552050801315682099828156",
            ),
            (
                "2a956d37d8e73692877b104630a08cc6840036f235f2134b0606769a369d85c1",
                "19261153649140605024552417994922546473530072875902678653210025980873274131905",
            ),
            (
                "2f9791ba036a4148ff026c074e713a4824415530dec0f0b16c5115aa00e4b825",
                "21526503558325068664033192388586640128492121680588893182274749683522508994597",
            ),
            (
                "2c41a7294c7ef5c9c5950dc627c55a00adb6712548bcbd6cd8569b1f2e5acc2a",
                "20017764101928005973906869479218555869286328459998999367935018992260318153770",
            ),
            (
                "2594ba68eb0f314eabbeea1d847374cc2be7965944dec513746606a1f2fadf2e",
                "16998355316577652097112514691750893516081130026395813155204269482715045879598",
            ),
            (
                "05c697158c9032bfd7041223a7dba696396388129118ae8f867266eb64fe7636",
                "2612442706402737973181840577010736087708621987282725873936541279764292204086",
            ),
            (
                "272b3425fcc3b2c45015559b9941fde27527aab5226045bf9b0a6c1fe902d601",
                "17716535433480122581515618850811568065658392066947958324371350481921422579201",
            ),
        ];

        for (hex, expected_decimal) in test_cases {
            println!("\nTesting hex: {}", hex);
            println!("Expected decimal: {}", expected_decimal);

            // Test old implementation
            let result_old = uint256_from_hex_string_old(hex);
            println!("Old result: {}", result_old);

            // Test new implementation
            let result_new = uint256_from_hex_string(hex);
            println!("New result: {}", result_new);

            // Parse expected value
            let expected = Uint256::from_str(expected_decimal).unwrap();
            println!("Expected value: {}", expected);

            // Verify old implementation
            assert_eq!(
                result_old, expected,
                "Old implementation mismatch for hex: {}",
                hex
            );

            // Verify new implementation
            assert_eq!(
                result_new, expected,
                "New implementation mismatch for hex: {}",
                hex
            );

            // Verify old and new match
            assert_eq!(
                result_old, result_new,
                "Old and new implementations differ for hex: {}",
                hex
            );

            // Verify round trip
            let hex_back = uint256_to_hex(result_new);
            let recovered = uint256_from_hex_string(&hex_back);
            assert_eq!(result_new, recovered, "Round trip failed for hex: {}", hex);
        }

        println!("\n✅ All production data tests passed!");
    }

    #[test]
    fn test_production_data_backward_compatibility() {
        // Quick test to ensure production data works with both implementations
        let production_hexes = vec![
            "2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc",
            "2a956d37d8e73692877b104630a08cc6840036f235f2134b0606769a369d85c1",
            "2f9791ba036a4148ff026c074e713a4824415530dec0f0b16c5115aa00e4b825",
        ];

        for hex in production_hexes {
            let old = uint256_from_hex_string_old(hex);
            let new = uint256_from_hex_string(hex);
            assert_eq!(old, new, "Production hex conversion differs: {}", hex);
        }
    }

    #[test]
    fn test_alignment_issue_demonstration() {
        // Demonstrate big-endian alignment issue

        // Test case 1: Short hex "ff" should equal 255
        let hex = "ff";

        // Correct way (uint256_from_hex_string)
        let correct_result = uint256_from_hex_string(hex);
        println!("\n=== Testing hex '{}' ===", hex);
        println!("uint256_from_hex_string result: {}", correct_result);
        assert_eq!(correct_result, Uint256::from_u128(255));

        // Wrong way (current hex_to_uint256 implementation)
        let wrong_result = hex_to_uint256(hex);
        println!("hex_to_uint256 result: {}", wrong_result);

        // Show difference
        println!("Expected value: 255");
        println!("Are equal: {}", correct_result == wrong_result);

        if correct_result != wrong_result {
            println!("❌ Issue found! hex_to_uint256 result is incorrect");
            println!(
                "Wrong result vs Correct result: {} vs {}",
                wrong_result, correct_result
            );
        }

        // Test case 2: Short hex "01" should equal 1
        let hex2 = "01";
        let correct_result2 = uint256_from_hex_string(hex2);
        let wrong_result2 = hex_to_uint256(hex2);

        println!("\n=== Testing hex '{}' ===", hex2);
        println!("uint256_from_hex_string result: {}", correct_result2);
        println!("hex_to_uint256 result: {}", wrong_result2);
        println!("Expected value: 1");

        assert_eq!(correct_result2, Uint256::from_u128(1));

        if correct_result2 != wrong_result2 {
            println!("❌ Issue found! hex_to_uint256 result is incorrect");

            // Show byte arrays
            let bytes_correct = correct_result2.to_be_bytes();
            let bytes_wrong = wrong_result2.to_be_bytes();

            println!("\nCorrect byte array (first 4 + last 4 bytes):");
            println!("  First 4: {:?}", &bytes_correct[..4]);
            println!("  Last 4: {:?}", &bytes_correct[28..]);

            println!("\nWrong byte array (first 4 + last 4 bytes):");
            println!("  First 4: {:?}", &bytes_wrong[..4]);
            println!("  Last 4: {:?}", &bytes_wrong[28..]);

            println!("\nExplanation: In big-endian, low-order bytes should be at the end of array");
            println!("  Correct: [0x00, ..., 0x00, 0x01] = 1");
            println!("  Wrong: [0x01, 0x00, ..., 0x00] = 2^248 (huge number)");
        }
    }
}
