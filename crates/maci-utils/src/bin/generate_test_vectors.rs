/// Generate test vectors for cross-language consistency testing
///
/// This binary generates a JSON file containing Poseidon hash test vectors
/// that can be used by TypeScript tests to verify consistency across
/// SDK, circuits, and Rust implementations.
use cosmwasm_std::Uint256;
use maci_utils::{hash2, hash5, uint256_from_hex_string};
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
struct TestVector {
    name: String,
    description: String,
    hash_type: String,   // "hash2" or "hash5"
    inputs: Vec<String>, // Hex strings
    rust_result: String, // Hex string
}

// Local helper to convert Uint256 to hex with "0x" prefix
fn uint256_to_hex(value: &Uint256) -> String {
    format!("0x{}", hex::encode(value.to_be_bytes()))
}

fn generate_test_vectors() -> Vec<TestVector> {
    let mut vectors = Vec::new();

    // Basic hash2 tests
    vectors.push(TestVector {
        name: "basic_hash2_small".to_string(),
        description: "Simple small integers".to_string(),
        hash_type: "hash2".to_string(),
        inputs: vec!["0x01".to_string(), "0x02".to_string()],
        rust_result: uint256_to_hex(&hash2([Uint256::from_u128(1), Uint256::from_u128(2)])),
    });

    // Basic hash5 tests
    vectors.push(TestVector {
        name: "basic_hash5_sequential".to_string(),
        description: "Sequential integers".to_string(),
        hash_type: "hash5".to_string(),
        inputs: vec![
            "0x01".to_string(),
            "0x02".to_string(),
            "0x03".to_string(),
            "0x04".to_string(),
            "0x05".to_string(),
        ],
        rust_result: uint256_to_hex(&hash5([
            Uint256::from_u128(1),
            Uint256::from_u128(2),
            Uint256::from_u128(3),
            Uint256::from_u128(4),
            Uint256::from_u128(5),
        ])),
    });

    // Zero values
    vectors.push(TestVector {
        name: "hash2_both_zeros".to_string(),
        description: "Both inputs zero".to_string(),
        hash_type: "hash2".to_string(),
        inputs: vec!["0x00".to_string(), "0x00".to_string()],
        rust_result: uint256_to_hex(&hash2([Uint256::zero(), Uint256::zero()])),
    });

    vectors.push(TestVector {
        name: "hash2_one_zero".to_string(),
        description: "First input zero".to_string(),
        hash_type: "hash2".to_string(),
        inputs: vec!["0x00".to_string(), "0x3039".to_string()], // 0, 12345
        rust_result: uint256_to_hex(&hash2([Uint256::zero(), Uint256::from_u128(12345)])),
    });

    vectors.push(TestVector {
        name: "hash5_all_zeros".to_string(),
        description: "All inputs zero".to_string(),
        hash_type: "hash5".to_string(),
        inputs: vec![
            "0x00".to_string(),
            "0x00".to_string(),
            "0x00".to_string(),
            "0x00".to_string(),
            "0x00".to_string(),
        ],
        rust_result: uint256_to_hex(&hash5([
            Uint256::zero(),
            Uint256::zero(),
            Uint256::zero(),
            Uint256::zero(),
            Uint256::zero(),
        ])),
    });

    // Order sensitivity
    vectors.push(TestVector {
        name: "hash2_order_a".to_string(),
        description: "Original order".to_string(),
        hash_type: "hash2".to_string(),
        inputs: vec!["0x7B".to_string(), "0x01C8".to_string()], // 123, 456
        rust_result: uint256_to_hex(&hash2([Uint256::from_u128(123), Uint256::from_u128(456)])),
    });

    vectors.push(TestVector {
        name: "hash2_order_b".to_string(),
        description: "Reversed order (should differ)".to_string(),
        hash_type: "hash2".to_string(),
        inputs: vec!["0x01C8".to_string(), "0x7B".to_string()], // 456, 123
        rust_result: uint256_to_hex(&hash2([Uint256::from_u128(456), Uint256::from_u128(123)])),
    });

    // Large values (near field boundary)
    // SNARK_FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617
    // We'll use hex representation for the large value
    let snark_field_hex = "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001";
    let snark_field_size = uint256_from_hex_string(snark_field_hex);
    let large_value_1 = snark_field_size - Uint256::from_u128(1);
    let large_value_2 = snark_field_size - Uint256::from_u128(2);

    vectors.push(TestVector {
        name: "hash2_large_values".to_string(),
        description: "Near max field elements".to_string(),
        hash_type: "hash2".to_string(),
        inputs: vec![
            uint256_to_hex(&large_value_1),
            uint256_to_hex(&large_value_2),
        ],
        rust_result: uint256_to_hex(&hash2([large_value_1, large_value_2])),
    });

    // Real-world MACI scenarios
    // Use the exact same decimal values as TypeScript: 12345678901234567890 and 98765432109876543210
    let merkle_leaf_1 = Uint256::from_u128(12345678901234567890u128);
    let merkle_leaf_2 = Uint256::from_u128(98765432109876543210u128);

    vectors.push(TestVector {
        name: "merkle_tree_hash".to_string(),
        description: "Typical Merkle tree leaf hash".to_string(),
        hash_type: "hash2".to_string(),
        inputs: vec![
            uint256_to_hex(&merkle_leaf_1),
            uint256_to_hex(&merkle_leaf_2),
        ],
        rust_result: uint256_to_hex(&hash2([merkle_leaf_1, merkle_leaf_2])),
    });

    vectors.push(TestVector {
        name: "hash5_order_a".to_string(),
        description: "Sequential order".to_string(),
        hash_type: "hash5".to_string(),
        inputs: vec![
            "0x01".to_string(),
            "0x02".to_string(),
            "0x03".to_string(),
            "0x04".to_string(),
            "0x05".to_string(),
        ],
        rust_result: uint256_to_hex(&hash5([
            Uint256::from_u128(1),
            Uint256::from_u128(2),
            Uint256::from_u128(3),
            Uint256::from_u128(4),
            Uint256::from_u128(5),
        ])),
    });

    vectors.push(TestVector {
        name: "hash5_order_b".to_string(),
        description: "Reversed order (should differ)".to_string(),
        hash_type: "hash5".to_string(),
        inputs: vec![
            "0x05".to_string(),
            "0x04".to_string(),
            "0x03".to_string(),
            "0x02".to_string(),
            "0x01".to_string(),
        ],
        rust_result: uint256_to_hex(&hash5([
            Uint256::from_u128(5),
            Uint256::from_u128(4),
            Uint256::from_u128(3),
            Uint256::from_u128(2),
            Uint256::from_u128(1),
        ])),
    });

    // Real-world MACI scenarios
    vectors.push(TestVector {
        name: "message_hash_realistic".to_string(),
        description: "Realistic MACI message".to_string(),
        hash_type: "hash5".to_string(),
        inputs: vec![
            "0x01".to_string(), // state index
            "0x02".to_string(), // vote option index
            "0x64".to_string(), // vote weight (100)
            "0x03".to_string(), // nonce
            "0x2A".to_string(), // poll id (42)
        ],
        rust_result: uint256_to_hex(&hash5([
            Uint256::from_u128(1),
            Uint256::from_u128(2),
            Uint256::from_u128(100),
            Uint256::from_u128(3),
            Uint256::from_u128(42),
        ])),
    });

    // Identical values
    vectors.push(TestVector {
        name: "hash2_identical".to_string(),
        description: "Both inputs identical".to_string(),
        hash_type: "hash2".to_string(),
        inputs: vec!["0x03E7".to_string(), "0x03E7".to_string()], // 999, 999
        rust_result: uint256_to_hex(&hash2([Uint256::from_u128(999), Uint256::from_u128(999)])),
    });

    vectors.push(TestVector {
        name: "hash5_identical".to_string(),
        description: "All inputs identical".to_string(),
        hash_type: "hash5".to_string(),
        inputs: vec![
            "0x0309".to_string(), // 777
            "0x0309".to_string(),
            "0x0309".to_string(),
            "0x0309".to_string(),
            "0x0309".to_string(),
        ],
        rust_result: uint256_to_hex(&hash5([
            Uint256::from_u128(777),
            Uint256::from_u128(777),
            Uint256::from_u128(777),
            Uint256::from_u128(777),
            Uint256::from_u128(777),
        ])),
    });

    // Special patterns
    vectors.push(TestVector {
        name: "hash5_alternating".to_string(),
        description: "Alternating zero/one pattern".to_string(),
        hash_type: "hash5".to_string(),
        inputs: vec![
            "0x00".to_string(),
            "0x01".to_string(),
            "0x00".to_string(),
            "0x01".to_string(),
            "0x00".to_string(),
        ],
        rust_result: uint256_to_hex(&hash5([
            Uint256::zero(),
            Uint256::from_u128(1),
            Uint256::zero(),
            Uint256::from_u128(1),
            Uint256::zero(),
        ])),
    });

    vectors.push(TestVector {
        name: "hash5_powers_of_two".to_string(),
        description: "Powers of two sequence".to_string(),
        hash_type: "hash5".to_string(),
        inputs: vec![
            "0x01".to_string(),
            "0x02".to_string(),
            "0x04".to_string(),
            "0x08".to_string(),
            "0x10".to_string(),
        ],
        rust_result: uint256_to_hex(&hash5([
            Uint256::from_u128(1),
            Uint256::from_u128(2),
            Uint256::from_u128(4),
            Uint256::from_u128(8),
            Uint256::from_u128(16),
        ])),
    });

    vectors
}

fn main() {
    println!("🔧 Generating Poseidon hash test vectors from Rust...");

    let vectors = generate_test_vectors();

    println!("✅ Generated {} test vectors", vectors.len());

    // Output to stdout (JSON)
    let json = serde_json::to_string_pretty(&vectors).expect("Failed to serialize");
    println!("\n{}", json);

    // Also save to file
    let output_path = "../../e2e/poseidon-test/test-vectors-rust.json";
    fs::write(output_path, &json).expect("Failed to write file");
    println!("\n💾 Saved to {}", output_path);
}
