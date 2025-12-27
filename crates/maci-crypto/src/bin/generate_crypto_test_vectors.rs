use maci_crypto::keypair::Keypair;
/// Generate test vectors for cross-language consistency testing
///
/// This binary generates a JSON file containing test vectors for:
/// - Key generation (deterministic)
/// - ECDH shared key derivation
/// - Message packing/unpacking
/// - Merkle tree operations
/// - Ciphertext rerandomization
///
/// These vectors can be used by TypeScript tests to verify consistency
/// across SDK and Rust implementations.
use maci_crypto::{
    gen_ecdh_shared_key, gen_keypair, gen_pub_key, pack_element, rerandomize, tree::Tree,
    unpack_element, Ciphertext,
};
use num_bigint::BigUint;
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
struct TestVector {
    name: String,
    description: String,
    test_type: String, // "keypair", "ecdh", "pack", "tree", "rerandomize"
    data: serde_json::Value,
}

// Helper to convert BigUint to hex string with "0x" prefix
fn biguint_to_hex(value: &BigUint) -> String {
    format!("0x{}", hex::encode(value.to_bytes_be()))
}

fn generate_keypair_vectors() -> Vec<TestVector> {
    let mut vectors = Vec::new();

    // Test case 1: Deterministic keypair from seed
    let seed1 = BigUint::from(12345u64);
    let keypair1 = gen_keypair(Some(seed1.clone()));

    // Debug: Print intermediate values for comparison with zk-kit
    println!("\n=== DEBUG: keypair_deterministic_seed_12345 ===");
    println!("Seed: {}", seed1);
    println!("Formatted priv key: {}", keypair1.formated_priv_key);
    println!("Pub key X: {}", keypair1.pub_key[0]);
    println!("Pub key Y: {}", keypair1.pub_key[1]);
    println!("Expected (from zk-kit):");
    println!("  Secret Scalar: 921083475146619442643179851604998496289177709227506705713121993612351800214");
    println!("  Pub key X: 14242395935002927593343756622646966509827811747139415120015740884868678489730");
    println!(
        "  Pub key Y: 1051653912458042701452271225044772965942253264237453963378486069345477138204"
    );
    println!("===============================================\n");
    vectors.push(TestVector {
        name: "keypair_deterministic_seed_12345".to_string(),
        description: "Keypair generated from seed 12345".to_string(),
        test_type: "keypair".to_string(),
        data: serde_json::json!({
            "seed": biguint_to_hex(&seed1),
            "priv_key": biguint_to_hex(&keypair1.priv_key),
            "pub_key": {
                "x": biguint_to_hex(&keypair1.pub_key[0]),
                "y": biguint_to_hex(&keypair1.pub_key[1]),
            },
            "formatted_priv_key": biguint_to_hex(&keypair1.formated_priv_key),
            "packed_pub_key": biguint_to_hex(&maci_crypto::pack_pub_key(&keypair1.pub_key)),
        }),
    });

    // Test case 2: Another deterministic keypair
    let seed2 = BigUint::from(67890u64);
    let keypair2 = gen_keypair(Some(seed2.clone()));
    vectors.push(TestVector {
        name: "keypair_deterministic_seed_67890".to_string(),
        description: "Keypair generated from seed 67890".to_string(),
        test_type: "keypair".to_string(),
        data: serde_json::json!({
            "seed": biguint_to_hex(&seed2),
            "priv_key": biguint_to_hex(&keypair2.priv_key),
            "pub_key": {
                "x": biguint_to_hex(&keypair2.pub_key[0]),
                "y": biguint_to_hex(&keypair2.pub_key[1]),
            },
            "formatted_priv_key": biguint_to_hex(&keypair2.formated_priv_key),
            "packed_pub_key": biguint_to_hex(&maci_crypto::pack_pub_key(&keypair2.pub_key)),
        }),
    });

    // Test case 3: Public key derivation from private key
    let priv_key3 = BigUint::from(11111u64);
    let pub_key3 = gen_pub_key(&priv_key3);
    vectors.push(TestVector {
        name: "pubkey_from_privkey_11111".to_string(),
        description: "Public key derived from private key 11111".to_string(),
        test_type: "keypair".to_string(),
        data: serde_json::json!({
            "priv_key": biguint_to_hex(&priv_key3),
            "pub_key": {
                "x": biguint_to_hex(&pub_key3[0]),
                "y": biguint_to_hex(&pub_key3[1]),
            },
            "packed_pub_key": biguint_to_hex(&maci_crypto::pack_pub_key(&pub_key3)),
        }),
    });

    // Test case 4: Public key derivation from private key 111111 (for comparison)
    let priv_key4 = BigUint::from(111111u64);
    let keypair4 = gen_keypair(Some(priv_key4.clone()));
    let pub_key4 = gen_pub_key(&priv_key4);

    println!("\n=== DEBUG: keypair_privkey_111111 ===");
    println!("Private Key: {}", priv_key4);
    println!("Pub key X: {}", pub_key4[0]);
    println!("Pub key Y: {}", pub_key4[1]);
    println!(
        "Pub key X (hex): 0x{}",
        hex::encode(pub_key4[0].to_bytes_be())
    );
    println!(
        "Pub key Y (hex): 0x{}",
        hex::encode(pub_key4[1].to_bytes_be())
    );
    println!("=====================================\n");

    vectors.push(TestVector {
        name: "keypair_deterministic_seed_111111".to_string(),
        description: "Keypair generated from seed 111111".to_string(),
        test_type: "keypair".to_string(),
        data: serde_json::json!({
            "seed": biguint_to_hex(&priv_key4),
            "priv_key": biguint_to_hex(&keypair4.priv_key),
            "pub_key": {
                "x": biguint_to_hex(&keypair4.pub_key[0]),
                "y": biguint_to_hex(&keypair4.pub_key[1]),
            },
            "formatted_priv_key": biguint_to_hex(&keypair4.formated_priv_key),
            "packed_pub_key": biguint_to_hex(&maci_crypto::pack_pub_key(&keypair4.pub_key)),
        }),
    });

    vectors
}

fn generate_keypair_comparison_vectors() -> Vec<TestVector> {
    let mut vectors = Vec::new();

    // Helper to convert Fq to hex string
    fn fq_to_hex(fq: &baby_jubjub::Fq) -> String {
        use ark_ff::{BigInteger, PrimeField};
        let bytes = fq.into_bigint().to_bytes_le();
        format!("0x{}", hex::encode(bytes))
    }

    // Test case 1: Compare keys::Keypair vs keypair::Keypair with seed 12345
    let seed1 = BigUint::from(12345u64);
    let keys_keypair1 = gen_keypair(Some(seed1.clone()));
    let keypair1 = Keypair::from_priv_key(&seed1);

    println!("\n=== KEYPAIR COMPARISON: seed 12345 ===");
    println!("keys::Keypair:");
    println!("  priv_key: {}", keys_keypair1.priv_key);
    println!("  pub_key X: {}", keys_keypair1.pub_key[0]);
    println!("  pub_key Y: {}", keys_keypair1.pub_key[1]);
    println!("  formatted_priv_key: {}", keys_keypair1.formated_priv_key);
    println!("keypair::Keypair:");
    println!("  priv_key: {}", keypair1.priv_key);
    println!("  pub_key X: {}", keypair1.pub_key[0]);
    println!("  pub_key Y: {}", keypair1.pub_key[1]);
    println!("  formatted_priv_key: {}", keypair1.formated_priv_key);
    println!("  commitment: {}", fq_to_hex(keypair1.commitment()));
    println!(
        "  pub_key match: {}",
        keys_keypair1.pub_key == keypair1.pub_key
    );
    println!(
        "  formatted_priv_key match: {}",
        keys_keypair1.formated_priv_key == keypair1.formated_priv_key
    );
    println!("=====================================\n");

    vectors.push(TestVector {
        name: "keypair_comparison_seed_12345".to_string(),
        description: "Comparison between keys::Keypair and keypair::Keypair with seed 12345".to_string(),
        test_type: "keypair_comparison".to_string(),
        data: serde_json::json!({
            "seed": biguint_to_hex(&seed1),
            "keys_keypair": {
                "priv_key": biguint_to_hex(&keys_keypair1.priv_key),
                "pub_key": {
                    "x": biguint_to_hex(&keys_keypair1.pub_key[0]),
                    "y": biguint_to_hex(&keys_keypair1.pub_key[1]),
                },
                "formatted_priv_key": biguint_to_hex(&keys_keypair1.formated_priv_key),
            },
            "keypair": {
                "priv_key": biguint_to_hex(&keypair1.priv_key),
                "pub_key": {
                    "x": biguint_to_hex(&keypair1.pub_key[0]),
                    "y": biguint_to_hex(&keypair1.pub_key[1]),
                },
                "formatted_priv_key": biguint_to_hex(&keypair1.formated_priv_key),
                "commitment": fq_to_hex(keypair1.commitment()),
            },
            "comparison": {
                "pub_key_match": keys_keypair1.pub_key == keypair1.pub_key,
                "formatted_priv_key_match": keys_keypair1.formated_priv_key == keypair1.formated_priv_key,
                "priv_key_match": keys_keypair1.priv_key == keypair1.priv_key,
            },
        }),
    });

    // Test case 2: Compare with seed 67890
    let seed2 = BigUint::from(67890u64);
    let keys_keypair2 = gen_keypair(Some(seed2.clone()));
    let keypair2 = Keypair::from_priv_key(&seed2);

    vectors.push(TestVector {
        name: "keypair_comparison_seed_67890".to_string(),
        description: "Comparison between keys::Keypair and keypair::Keypair with seed 67890".to_string(),
        test_type: "keypair_comparison".to_string(),
        data: serde_json::json!({
            "seed": biguint_to_hex(&seed2),
            "keys_keypair": {
                "priv_key": biguint_to_hex(&keys_keypair2.priv_key),
                "pub_key": {
                    "x": biguint_to_hex(&keys_keypair2.pub_key[0]),
                    "y": biguint_to_hex(&keys_keypair2.pub_key[1]),
                },
                "formatted_priv_key": biguint_to_hex(&keys_keypair2.formated_priv_key),
            },
            "keypair": {
                "priv_key": biguint_to_hex(&keypair2.priv_key),
                "pub_key": {
                    "x": biguint_to_hex(&keypair2.pub_key[0]),
                    "y": biguint_to_hex(&keypair2.pub_key[1]),
                },
                "formatted_priv_key": biguint_to_hex(&keypair2.formated_priv_key),
                "commitment": fq_to_hex(keypair2.commitment()),
            },
            "comparison": {
                "pub_key_match": keys_keypair2.pub_key == keypair2.pub_key,
                "formatted_priv_key_match": keys_keypair2.formated_priv_key == keypair2.formated_priv_key,
                "priv_key_match": keys_keypair2.priv_key == keypair2.priv_key,
            },
        }),
    });

    // Test case 3: Compare with a larger seed
    let seed3 = BigUint::from(999999u64);
    let keys_keypair3 = gen_keypair(Some(seed3.clone()));
    let keypair3 = Keypair::from_priv_key(&seed3);

    vectors.push(TestVector {
        name: "keypair_comparison_seed_999999".to_string(),
        description: "Comparison between keys::Keypair and keypair::Keypair with seed 999999".to_string(),
        test_type: "keypair_comparison".to_string(),
        data: serde_json::json!({
            "seed": biguint_to_hex(&seed3),
            "keys_keypair": {
                "priv_key": biguint_to_hex(&keys_keypair3.priv_key),
                "pub_key": {
                    "x": biguint_to_hex(&keys_keypair3.pub_key[0]),
                    "y": biguint_to_hex(&keys_keypair3.pub_key[1]),
                },
                "formatted_priv_key": biguint_to_hex(&keys_keypair3.formated_priv_key),
            },
            "keypair": {
                "priv_key": biguint_to_hex(&keypair3.priv_key),
                "pub_key": {
                    "x": biguint_to_hex(&keypair3.pub_key[0]),
                    "y": biguint_to_hex(&keypair3.pub_key[1]),
                },
                "formatted_priv_key": biguint_to_hex(&keypair3.formated_priv_key),
                "commitment": fq_to_hex(keypair3.commitment()),
            },
            "comparison": {
                "pub_key_match": keys_keypair3.pub_key == keypair3.pub_key,
                "formatted_priv_key_match": keys_keypair3.formated_priv_key == keypair3.formated_priv_key,
                "priv_key_match": keys_keypair3.priv_key == keypair3.priv_key,
            },
        }),
    });

    // Test case 4: Compare with seed 111111 (for detailed comparison)
    let seed4 = BigUint::from(111111u64);
    let keys_keypair4 = gen_keypair(Some(seed4.clone()));
    let keypair4 = Keypair::from_priv_key(&seed4);

    println!("\n=== KEYPAIR COMPARISON: seed 111111 ===");
    println!("keys::Keypair:");
    println!("  priv_key: {}", keys_keypair4.priv_key);
    println!("  pub_key X: {}", keys_keypair4.pub_key[0]);
    println!("  pub_key Y: {}", keys_keypair4.pub_key[1]);
    println!(
        "  pub_key X (hex): 0x{}",
        hex::encode(keys_keypair4.pub_key[0].to_bytes_be())
    );
    println!(
        "  pub_key Y (hex): 0x{}",
        hex::encode(keys_keypair4.pub_key[1].to_bytes_be())
    );
    println!("  formatted_priv_key: {}", keys_keypair4.formated_priv_key);
    println!("keypair::Keypair:");
    println!("  priv_key: {}", keypair4.priv_key);
    println!("  pub_key X: {}", keypair4.pub_key[0]);
    println!("  pub_key Y: {}", keypair4.pub_key[1]);
    println!(
        "  pub_key X (hex): 0x{}",
        hex::encode(keypair4.pub_key[0].to_bytes_be())
    );
    println!(
        "  pub_key Y (hex): 0x{}",
        hex::encode(keypair4.pub_key[1].to_bytes_be())
    );
    println!("  formatted_priv_key: {}", keypair4.formated_priv_key);
    println!("  commitment: {}", fq_to_hex(keypair4.commitment()));
    println!(
        "  pub_key match: {}",
        keys_keypair4.pub_key == keypair4.pub_key
    );
    println!(
        "  formatted_priv_key match: {}",
        keys_keypair4.formated_priv_key == keypair4.formated_priv_key
    );
    println!("=====================================\n");

    vectors.push(TestVector {
        name: "keypair_comparison_seed_111111".to_string(),
        description: "Comparison between keys::Keypair and keypair::Keypair with seed 111111".to_string(),
        test_type: "keypair_comparison".to_string(),
        data: serde_json::json!({
            "seed": biguint_to_hex(&seed4),
            "keys_keypair": {
                "priv_key": biguint_to_hex(&keys_keypair4.priv_key),
                "pub_key": {
                    "x": biguint_to_hex(&keys_keypair4.pub_key[0]),
                    "y": biguint_to_hex(&keys_keypair4.pub_key[1]),
                },
                "formatted_priv_key": biguint_to_hex(&keys_keypair4.formated_priv_key),
            },
            "keypair": {
                "priv_key": biguint_to_hex(&keypair4.priv_key),
                "pub_key": {
                    "x": biguint_to_hex(&keypair4.pub_key[0]),
                    "y": biguint_to_hex(&keypair4.pub_key[1]),
                },
                "formatted_priv_key": biguint_to_hex(&keypair4.formated_priv_key),
                "commitment": fq_to_hex(keypair4.commitment()),
            },
            "comparison": {
                "pub_key_match": keys_keypair4.pub_key == keypair4.pub_key,
                "formatted_priv_key_match": keys_keypair4.formated_priv_key == keypair4.formated_priv_key,
                "priv_key_match": keys_keypair4.priv_key == keypair4.priv_key,
            },
        }),
    });

    // Test case 5: Test with byte array input (keypair::Keypair::new)
    let mut bytes = [0u8; 32];
    bytes[0] = 0x12;
    bytes[1] = 0x34;
    bytes[2] = 0x56;
    let keypair5 = Keypair::new(&bytes);
    let priv_key_from_bytes = BigUint::from_bytes_le(&bytes);
    let keys_keypair5 = gen_keypair(Some(priv_key_from_bytes.clone()));

    vectors.push(TestVector {
        name: "keypair_comparison_byte_array".to_string(),
        description: "Comparison using byte array input for keypair::Keypair::new".to_string(),
        test_type: "keypair_comparison".to_string(),
        data: serde_json::json!({
            "input_bytes": hex::encode(bytes),
            "priv_key_from_bytes": biguint_to_hex(&priv_key_from_bytes),
            "keys_keypair": {
                "priv_key": biguint_to_hex(&keys_keypair5.priv_key),
                "pub_key": {
                    "x": biguint_to_hex(&keys_keypair5.pub_key[0]),
                    "y": biguint_to_hex(&keys_keypair5.pub_key[1]),
                },
                "formatted_priv_key": biguint_to_hex(&keys_keypair5.formated_priv_key),
            },
            "keypair": {
                "priv_key": biguint_to_hex(&keypair5.priv_key),
                "pub_key": {
                    "x": biguint_to_hex(&keypair5.pub_key[0]),
                    "y": biguint_to_hex(&keypair5.pub_key[1]),
                },
                "formatted_priv_key": biguint_to_hex(&keypair5.formated_priv_key),
                "commitment": fq_to_hex(keypair5.commitment()),
            },
            "comparison": {
                "pub_key_match": keys_keypair5.pub_key == keypair5.pub_key,
                "formatted_priv_key_match": keys_keypair5.formated_priv_key == keypair5.formated_priv_key,
                "priv_key_match": keys_keypair5.priv_key == keypair5.priv_key,
            },
        }),
    });

    vectors
}

fn generate_ecdh_vectors() -> Vec<TestVector> {
    let mut vectors = Vec::new();

    // Test case 1: ECDH between two keypairs
    let seed1 = BigUint::from(100u64);
    let seed2 = BigUint::from(200u64);
    let keypair1 = gen_keypair(Some(seed1));
    let keypair2 = gen_keypair(Some(seed2));

    let shared1 = gen_ecdh_shared_key(&keypair1.priv_key, &keypair2.pub_key);
    let shared2 = gen_ecdh_shared_key(&keypair2.priv_key, &keypair1.pub_key);

    vectors.push(TestVector {
        name: "ecdh_keypair_100_200".to_string(),
        description: "ECDH shared key between keypairs from seeds 100 and 200".to_string(),
        test_type: "ecdh".to_string(),
        data: serde_json::json!({
            "keypair1": {
                "priv_key": biguint_to_hex(&keypair1.priv_key),
                "pub_key": {
                    "x": biguint_to_hex(&keypair1.pub_key[0]),
                    "y": biguint_to_hex(&keypair1.pub_key[1]),
                },
            },
            "keypair2": {
                "priv_key": biguint_to_hex(&keypair2.priv_key),
                "pub_key": {
                    "x": biguint_to_hex(&keypair2.pub_key[0]),
                    "y": biguint_to_hex(&keypair2.pub_key[1]),
                },
            },
            "shared_key": {
                "x": biguint_to_hex(&shared1[0]),
                "y": biguint_to_hex(&shared1[1]),
            },
            "shared_key_reciprocal": {
                "x": biguint_to_hex(&shared2[0]),
                "y": biguint_to_hex(&shared2[1]),
            },
        }),
    });

    // Test case 2: Another ECDH pair
    let seed3 = BigUint::from(300u64);
    let seed4 = BigUint::from(400u64);
    let keypair3 = gen_keypair(Some(seed3));
    let keypair4 = gen_keypair(Some(seed4));

    let shared3 = gen_ecdh_shared_key(&keypair3.priv_key, &keypair4.pub_key);

    vectors.push(TestVector {
        name: "ecdh_keypair_300_400".to_string(),
        description: "ECDH shared key between keypairs from seeds 300 and 400".to_string(),
        test_type: "ecdh".to_string(),
        data: serde_json::json!({
            "keypair1": {
                "priv_key": biguint_to_hex(&keypair3.priv_key),
                "pub_key": {
                    "x": biguint_to_hex(&keypair3.pub_key[0]),
                    "y": biguint_to_hex(&keypair3.pub_key[1]),
                },
            },
            "keypair2": {
                "priv_key": biguint_to_hex(&keypair4.priv_key),
                "pub_key": {
                    "x": biguint_to_hex(&keypair4.pub_key[0]),
                    "y": biguint_to_hex(&keypair4.pub_key[1]),
                },
            },
            "shared_key": {
                "x": biguint_to_hex(&shared3[0]),
                "y": biguint_to_hex(&shared3[1]),
            },
        }),
    });

    vectors
}

fn generate_pack_vectors() -> Vec<TestVector> {
    let mut vectors = Vec::new();

    // Test case 1: Basic packing
    let nonce1 = BigUint::from(1u32);
    let state_idx1 = BigUint::from(5u32);
    let vo_idx1 = BigUint::from(10u32);
    let new_votes1 = BigUint::from(100u32);
    let salt1 = BigUint::from(999u32);

    let packed1 = pack_element(&nonce1, &state_idx1, &vo_idx1, &new_votes1, Some(&salt1));
    let unpacked1 = unpack_element(&packed1);

    vectors.push(TestVector {
        name: "pack_basic".to_string(),
        description: "Basic message packing with all fields".to_string(),
        test_type: "pack".to_string(),
        data: serde_json::json!({
            "input": {
                "nonce": biguint_to_hex(&nonce1),
                "state_idx": biguint_to_hex(&state_idx1),
                "vo_idx": biguint_to_hex(&vo_idx1),
                "new_votes": biguint_to_hex(&new_votes1),
                "salt": biguint_to_hex(&salt1),
            },
            "packed": biguint_to_hex(&packed1),
            "unpacked": {
                "nonce": biguint_to_hex(&unpacked1.nonce),
                "state_idx": biguint_to_hex(&unpacked1.state_idx),
                "vo_idx": biguint_to_hex(&unpacked1.vo_idx),
                "new_votes": biguint_to_hex(&unpacked1.new_votes),
            },
        }),
    });

    // Test case 2: Packing with zero values
    let nonce2 = BigUint::from(0u32);
    let state_idx2 = BigUint::from(0u32);
    let vo_idx2 = BigUint::from(0u32);
    let new_votes2 = BigUint::from(0u32);
    let salt2 = BigUint::from(0u32);

    let packed2 = pack_element(&nonce2, &state_idx2, &vo_idx2, &new_votes2, Some(&salt2));
    let unpacked2 = unpack_element(&packed2);

    vectors.push(TestVector {
        name: "pack_zero_values".to_string(),
        description: "Packing with all zero values".to_string(),
        test_type: "pack".to_string(),
        data: serde_json::json!({
            "input": {
                "nonce": biguint_to_hex(&nonce2),
                "state_idx": biguint_to_hex(&state_idx2),
                "vo_idx": biguint_to_hex(&vo_idx2),
                "new_votes": biguint_to_hex(&new_votes2),
                "salt": biguint_to_hex(&salt2),
            },
            "packed": biguint_to_hex(&packed2),
            "unpacked": {
                "nonce": biguint_to_hex(&unpacked2.nonce),
                "state_idx": biguint_to_hex(&unpacked2.state_idx),
                "vo_idx": biguint_to_hex(&unpacked2.vo_idx),
                "new_votes": biguint_to_hex(&unpacked2.new_votes),
            },
        }),
    });

    // Test case 3: Packing with max values
    use maci_crypto::{UINT32, UINT96};
    let nonce3 = &*UINT32 - BigUint::from(1u32);
    let state_idx3 = &*UINT32 - BigUint::from(1u32);
    let vo_idx3 = &*UINT32 - BigUint::from(1u32);
    let new_votes3 = &*UINT96 - BigUint::from(1u32);
    let salt3 = BigUint::from(0xFFFFFFFFFFFFFFu64); // 56 bits max

    let packed3 = pack_element(&nonce3, &state_idx3, &vo_idx3, &new_votes3, Some(&salt3));
    let unpacked3 = unpack_element(&packed3);

    vectors.push(TestVector {
        name: "pack_max_values".to_string(),
        description: "Packing with maximum field values".to_string(),
        test_type: "pack".to_string(),
        data: serde_json::json!({
            "input": {
                "nonce": biguint_to_hex(&nonce3),
                "state_idx": biguint_to_hex(&state_idx3),
                "vo_idx": biguint_to_hex(&vo_idx3),
                "new_votes": biguint_to_hex(&new_votes3),
                "salt": biguint_to_hex(&salt3),
            },
            "packed": biguint_to_hex(&packed3),
            "unpacked": {
                "nonce": biguint_to_hex(&unpacked3.nonce),
                "state_idx": biguint_to_hex(&unpacked3.state_idx),
                "vo_idx": biguint_to_hex(&unpacked3.vo_idx),
                "new_votes": biguint_to_hex(&unpacked3.new_votes),
            },
        }),
    });

    vectors
}

fn generate_tree_vectors() -> Vec<TestVector> {
    let mut vectors = Vec::new();

    // Test case 1: Small tree with 2 leaves
    let mut tree1 = Tree::new(5, 2, "0".to_string());
    let leaves1 = vec!["1".to_string(), "2".to_string()];
    tree1.init_leaves(&leaves1);
    let root1 = tree1.root().clone();

    vectors.push(TestVector {
        name: "tree_5ary_depth2_2leaves".to_string(),
        description: "5-ary tree with depth 2, 2 leaves".to_string(),
        test_type: "tree".to_string(),
        data: serde_json::json!({
            "degree": 5,
            "depth": 2,
            "zero": "0",
            "leaves": leaves1,
            "root": root1,
        }),
    });

    // Test case 2: Tree with more leaves
    let mut tree2 = Tree::new(5, 2, "0".to_string());
    let leaves2 = vec![
        "1".to_string(),
        "2".to_string(),
        "3".to_string(),
        "4".to_string(),
        "5".to_string(),
    ];
    tree2.init_leaves(&leaves2);
    let root2 = tree2.root().clone();

    vectors.push(TestVector {
        name: "tree_5ary_depth2_5leaves".to_string(),
        description: "5-ary tree with depth 2, 5 leaves".to_string(),
        test_type: "tree".to_string(),
        data: serde_json::json!({
            "degree": 5,
            "depth": 2,
            "zero": "0",
            "leaves": leaves2,
            "root": root2,
        }),
    });

    // Test case 3: Binary tree (degree 2)
    let mut tree3 = Tree::new(2, 3, "0".to_string());
    let leaves3 = vec![
        "10".to_string(),
        "20".to_string(),
        "30".to_string(),
        "40".to_string(),
    ];
    tree3.init_leaves(&leaves3);
    let root3 = tree3.root().clone();

    vectors.push(TestVector {
        name: "tree_2ary_depth3_4leaves".to_string(),
        description: "Binary tree with depth 3, 4 leaves".to_string(),
        test_type: "tree".to_string(),
        data: serde_json::json!({
            "degree": 2,
            "depth": 3,
            "zero": "0",
            "leaves": leaves3,
            "root": root3,
        }),
    });

    vectors
}

fn generate_rerandomize_vectors() -> Vec<TestVector> {
    let mut vectors = Vec::new();

    // Test case 1: Rerandomize with deterministic random value
    let keypair1 = gen_keypair(Some(BigUint::from(500u64)));
    let ciphertext1 = Ciphertext {
        c1: keypair1.pub_key.clone(),
        c2: keypair1.pub_key.clone(),
    };
    let random_val1 = BigUint::from(12345u64);
    let rerandomized1 = rerandomize(&keypair1.pub_key, &ciphertext1, Some(random_val1.clone()))
        .expect("Rerandomization should succeed");

    vectors.push(TestVector {
        name: "rerandomize_deterministic".to_string(),
        description: "Rerandomize ciphertext with deterministic random value".to_string(),
        test_type: "rerandomize".to_string(),
        data: serde_json::json!({
            "pub_key": {
                "x": biguint_to_hex(&keypair1.pub_key[0]),
                "y": biguint_to_hex(&keypair1.pub_key[1]),
            },
            "ciphertext": {
                "c1": {
                    "x": biguint_to_hex(&ciphertext1.c1[0]),
                    "y": biguint_to_hex(&ciphertext1.c1[1]),
                },
                "c2": {
                    "x": biguint_to_hex(&ciphertext1.c2[0]),
                    "y": biguint_to_hex(&ciphertext1.c2[1]),
                },
            },
            "random_val": biguint_to_hex(&random_val1),
            "rerandomized": {
                "d1": {
                    "x": biguint_to_hex(&rerandomized1.d1[0]),
                    "y": biguint_to_hex(&rerandomized1.d1[1]),
                },
                "d2": {
                    "x": biguint_to_hex(&rerandomized1.d2[0]),
                    "y": biguint_to_hex(&rerandomized1.d2[1]),
                },
            },
        }),
    });

    // Test case 2: Another rerandomize test
    let keypair2 = gen_keypair(Some(BigUint::from(600u64)));
    let ciphertext2 = Ciphertext {
        c1: keypair2.pub_key.clone(),
        c2: keypair2.pub_key.clone(),
    };
    let random_val2 = BigUint::from(67890u64);
    let rerandomized2 = rerandomize(&keypair2.pub_key, &ciphertext2, Some(random_val2.clone()))
        .expect("Rerandomization should succeed");

    vectors.push(TestVector {
        name: "rerandomize_deterministic_2".to_string(),
        description: "Another rerandomize test with different values".to_string(),
        test_type: "rerandomize".to_string(),
        data: serde_json::json!({
            "pub_key": {
                "x": biguint_to_hex(&keypair2.pub_key[0]),
                "y": biguint_to_hex(&keypair2.pub_key[1]),
            },
            "ciphertext": {
                "c1": {
                    "x": biguint_to_hex(&ciphertext2.c1[0]),
                    "y": biguint_to_hex(&ciphertext2.c1[1]),
                },
                "c2": {
                    "x": biguint_to_hex(&ciphertext2.c2[0]),
                    "y": biguint_to_hex(&ciphertext2.c2[1]),
                },
            },
            "random_val": biguint_to_hex(&random_val2),
            "rerandomized": {
                "d1": {
                    "x": biguint_to_hex(&rerandomized2.d1[0]),
                    "y": biguint_to_hex(&rerandomized2.d1[1]),
                },
                "d2": {
                    "x": biguint_to_hex(&rerandomized2.d2[0]),
                    "y": biguint_to_hex(&rerandomized2.d2[1]),
                },
            },
        }),
    });

    vectors
}

fn main() {
    println!("🔧 Generating crypto test vectors from Rust...");

    let mut all_vectors = Vec::new();

    // Generate all test vectors
    all_vectors.extend(generate_keypair_vectors());
    all_vectors.extend(generate_keypair_comparison_vectors());
    all_vectors.extend(generate_ecdh_vectors());
    all_vectors.extend(generate_pack_vectors());
    all_vectors.extend(generate_tree_vectors());
    all_vectors.extend(generate_rerandomize_vectors());

    println!("✅ Generated {} test vectors", all_vectors.len());

    // Output to stdout (JSON)
    let json = serde_json::to_string_pretty(&all_vectors).expect("Failed to serialize");
    println!("\n{}", json);

    // Also save to file
    // Try to find the e2e directory relative to the current working directory
    let output_path = if std::path::Path::new("../../e2e/crypto-test").exists() {
        "../../e2e/crypto-test/test-vectors-rust.json"
    } else if std::path::Path::new("../../../e2e/crypto-test").exists() {
        "../../../e2e/crypto-test/test-vectors-rust.json"
    } else {
        // Fallback: try to create the directory structure
        let fallback_path = "../../e2e/crypto-test/test-vectors-rust.json";
        if let Some(parent) = std::path::Path::new(fallback_path).parent() {
            fs::create_dir_all(parent).ok();
        }
        fallback_path
    };

    fs::write(output_path, &json).expect("Failed to write file");
    println!("\n💾 Saved to {}", output_path);

    // Print summary
    println!("\n📊 Summary:");
    println!("   Total vectors: {}", all_vectors.len());
    let keypair_count = all_vectors
        .iter()
        .filter(|v| v.test_type == "keypair")
        .count();
    let keypair_comparison_count = all_vectors
        .iter()
        .filter(|v| v.test_type == "keypair_comparison")
        .count();
    let ecdh_count = all_vectors.iter().filter(|v| v.test_type == "ecdh").count();
    let pack_count = all_vectors.iter().filter(|v| v.test_type == "pack").count();
    let tree_count = all_vectors.iter().filter(|v| v.test_type == "tree").count();
    let rerandomize_count = all_vectors
        .iter()
        .filter(|v| v.test_type == "rerandomize")
        .count();

    println!("   - keypair: {}", keypair_count);
    println!("   - keypair_comparison: {}", keypair_comparison_count);
    println!("   - ecdh: {}", ecdh_count);
    println!("   - pack: {}", pack_count);
    println!("   - tree: {}", tree_count);
    println!("   - rerandomize: {}", rerandomize_count);
}
