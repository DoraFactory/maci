//! Poseidon Hashing example for maci-crypto
//!
//! Run with: cargo run --example poseidon_hashing

use maci_crypto::{
    hash10, hash12, hash2, hash3, hash4, hash5, hash_left_right, hash_one, poseidon, poseidon_t3,
    poseidon_t4, poseidon_t5, poseidon_t6, sha256_hash,
};
use num_bigint::BigUint;

fn main() {
    println!("🔐 MACI Crypto - Poseidon Hashing Example\n");
    println!("{}", "=".repeat(60));

    // 1. Basic Poseidon Hash
    println!("\n📝 1. Basic Poseidon Hashing");
    println!("{}", "-".repeat(60));
    let inputs = vec![BigUint::from(1u32), BigUint::from(2u32)];
    let hash = poseidon(&inputs);
    println!("Input:  {:?}", inputs);
    println!("Output: {}", hash);

    // 2. Poseidon with Different Arities
    println!("\n🔢 2. Poseidon with Different Arities (T3-T6)");
    println!("{}", "-".repeat(60));

    // T3 (2 inputs)
    let inputs_t3 = vec![BigUint::from(10u32), BigUint::from(20u32)];
    match poseidon_t3(&inputs_t3) {
        Ok(hash) => println!("Poseidon T3 (2 inputs): {}", hash),
        Err(e) => println!("Error: {}", e),
    }

    // T4 (3 inputs)
    let inputs_t4 = vec![
        BigUint::from(10u32),
        BigUint::from(20u32),
        BigUint::from(30u32),
    ];
    match poseidon_t4(&inputs_t4) {
        Ok(hash) => println!("Poseidon T4 (3 inputs): {}", hash),
        Err(e) => println!("Error: {}", e),
    }

    // T5 (4 inputs)
    let inputs_t5 = vec![
        BigUint::from(10u32),
        BigUint::from(20u32),
        BigUint::from(30u32),
        BigUint::from(40u32),
    ];
    match poseidon_t5(&inputs_t5) {
        Ok(hash) => println!("Poseidon T5 (4 inputs): {}", hash),
        Err(e) => println!("Error: {}", e),
    }

    // T6 (5 inputs)
    let inputs_t6 = vec![
        BigUint::from(10u32),
        BigUint::from(20u32),
        BigUint::from(30u32),
        BigUint::from(40u32),
        BigUint::from(50u32),
    ];
    match poseidon_t6(&inputs_t6) {
        Ok(hash) => println!("Poseidon T6 (5 inputs): {}", hash),
        Err(e) => println!("Error: {}", e),
    }

    // 3. Hash with Padding
    println!("\n📦 3. Hashing with Automatic Padding");
    println!("{}", "-".repeat(60));

    // hash2 - pads to 2 elements
    let inputs = vec![BigUint::from(100u32)];
    match hash2(&inputs) {
        Ok(hash) => {
            println!("hash2([100]):       {} (padded with 1 zero)", hash);
        }
        Err(e) => println!("Error: {}", e),
    }

    // hash5 - pads to 5 elements
    let inputs = vec![BigUint::from(100u32), BigUint::from(200u32)];
    match hash5(&inputs) {
        Ok(hash) => {
            println!("hash5([100, 200]):  {} (padded with 3 zeros)", hash);
        }
        Err(e) => println!("Error: {}", e),
    }

    // 4. Merkle Tree Hashing
    println!("\n🌳 4. Merkle Tree Specific Hashing");
    println!("{}", "-".repeat(60));
    let left = BigUint::from(1000u32);
    let right = BigUint::from(2000u32);
    let parent = hash_left_right(&left, &right);
    println!("Left:   {}", left);
    println!("Right:  {}", right);
    println!("Parent: {}", parent);

    // Build a small Merkle tree manually
    let leaf1 = BigUint::from(10u32);
    let leaf2 = BigUint::from(20u32);
    let leaf3 = BigUint::from(30u32);
    let leaf4 = BigUint::from(40u32);

    let node1 = hash_left_right(&leaf1, &leaf2);
    let node2 = hash_left_right(&leaf3, &leaf4);
    let root = hash_left_right(&node1, &node2);

    println!("\nManual Merkle Tree:");
    println!("  Leaves: {}, {}, {}, {}", leaf1, leaf2, leaf3, leaf4);
    println!("  Level 1: {}, {}", node1, node2);
    println!("  Root:    {}", root);

    // 5. Single Element Hash
    println!("\n1️⃣  5. Single Element Hashing");
    println!("{}", "-".repeat(60));
    let value = BigUint::from(12345u32);
    let hash = hash_one(&value);
    println!("Input:  {}", value);
    println!("Output: {}", hash);

    // 6. Large Input Hashing
    println!("\n📊 6. Large Input Hashing (hash10, hash12)");
    println!("{}", "-".repeat(60));

    // hash10
    let inputs10: Vec<BigUint> = (1..=8).map(|i| BigUint::from(i * 10u32)).collect();
    match hash10(&inputs10) {
        Ok(hash) => {
            println!("hash10 (8 elements): {}", hash);
        }
        Err(e) => println!("Error: {}", e),
    }

    // hash12
    let inputs12: Vec<BigUint> = (1..=10).map(|i| BigUint::from(i * 10u32)).collect();
    match hash12(&inputs12) {
        Ok(hash) => {
            println!("hash12 (10 elements): {}", hash);
        }
        Err(e) => println!("Error: {}", e),
    }

    // 7. SHA256 for Comparison
    println!("\n🔒 7. SHA256 Hashing (for comparison)");
    println!("{}", "-".repeat(60));
    let inputs = vec![BigUint::from(1u32), BigUint::from(2u32)];
    let sha_hash = sha256_hash(&inputs);
    println!("Input (SHA256): {:?}", inputs);
    println!("Output:         {}", sha_hash);

    // 8. Deterministic Property
    println!("\n🔄 8. Deterministic Verification");
    println!("{}", "-".repeat(60));
    let inputs = vec![BigUint::from(123u32), BigUint::from(456u32)];
    let hash1 = poseidon(&inputs);
    let hash2 = poseidon(&inputs);
    println!("Input:   {:?}", inputs);
    println!("Hash 1:  {}", hash1);
    println!("Hash 2:  {}", hash2);
    if hash1 == hash2 {
        println!("✅ Same input produces same hash");
    }

    // 9. Avalanche Effect
    println!("\n⚡ 9. Avalanche Effect (tiny change produces huge difference)");
    println!("{}", "-".repeat(60));
    let inputs1 = vec![BigUint::from(100u32), BigUint::from(200u32)];
    let inputs2 = vec![BigUint::from(100u32), BigUint::from(201u32)];
    let hash1 = poseidon(&inputs1);
    let hash2 = poseidon(&inputs2);
    println!("Input 1: {:?}", inputs1);
    println!("Hash 1:  {}", hash1);
    println!("\nInput 2: {:?} (changed by 1)", inputs2);
    println!("Hash 2:  {}", hash2);
    if hash1 != hash2 {
        println!("✅ Tiny input change produces completely different hash");
    }

    // 10. Empty Input Handling
    println!("\n🚫 10. Empty Input Handling");
    println!("{}", "-".repeat(60));
    let empty_inputs: Vec<BigUint> = vec![];
    let empty_hash = poseidon(&empty_inputs);
    println!("Empty Input Hash: {}", empty_hash);

    // 11. Batch Hashing
    println!("\n⚙️  11. Batch Hashing");
    println!("{}", "-".repeat(60));
    let data: Vec<Vec<BigUint>> = vec![
        vec![BigUint::from(1u32), BigUint::from(2u32)],
        vec![BigUint::from(3u32), BigUint::from(4u32)],
        vec![BigUint::from(5u32), BigUint::from(6u32)],
    ];

    println!("Batch hashing {} items:", data.len());
    for (i, values) in data.iter().enumerate() {
        let hash = poseidon(values);
        println!("  Item {}: {:?} -> {}", i, values, hash);
    }

    println!("\n".repeat(1));
    println!("{}", "=".repeat(60));
    println!("✅ Example completed!");
}
