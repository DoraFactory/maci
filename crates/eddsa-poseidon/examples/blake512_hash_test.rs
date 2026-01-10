//! Blake-512 Hash Test
//!
//! This example tests the Blake-512 hash function with various inputs
//! to compare with the TypeScript implementation.
//!
//! Run with: cargo run --example blake512_hash_test

use blake::Blake;

fn test_hash(data: &[u8], description: &str) {
    let mut hasher = Blake::new(512).expect("Failed to create Blake-512 hasher");
    hasher.update(data);
    let mut hash = vec![0u8; 64];
    hasher.finalise(&mut hash);

    let input_str = if data.is_empty() {
        "[empty]".to_string()
    } else {
        format!("'{}'", String::from_utf8_lossy(data))
    };

    println!("{}:", description);
    println!("  Input: {}", input_str);
    println!("  Hash:  {}", hex::encode(&hash));
    println!();
}

fn main() {
    println!("=== Blake-512 Hash Test ===\n");

    // Test 1: Empty string
    test_hash(b"", "Empty String");

    // Test 2: Single byte
    test_hash(b"a", "Single Character 'a'");

    // Test 3: "secret" (zk-kit example)
    test_hash(b"secret", "zk-kit Example: 'secret'");

    // Test 4: "my-secret-key" (our example)
    test_hash(b"my-secret-key", "Our Example: 'my-secret-key'");

    // Test 5: "message"
    test_hash(b"message", "Message Example: 'message'");

    // Test 6: Longer string
    test_hash(
        b"The quick brown fox jumps over the lazy dog",
        "Standard Test String",
    );

    println!("=== Comparison ===");
    println!("Run the TypeScript version with:");
    println!("  npx tsx scripts/blake512-example.ts");
    println!("\nThe hash outputs should match exactly!");
}
