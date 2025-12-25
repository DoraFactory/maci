//! Keys and ECDH example for maci-crypto
//!
//! Run with: cargo run --example keys_and_ecdh

use maci_crypto::{
    format_priv_key_for_babyjub, gen_ecdh_shared_key, gen_keypair, gen_priv_key, gen_pub_key,
    pack_pub_key, unpack_pub_key,
};
use num_bigint::BigUint;

fn main() {
    println!("🔑 MACI Crypto - Keys and ECDH Example\n");
    println!("{}", "=".repeat(60));

    // 1. Generate Random Keypair
    println!("\n📝 1. Generate Random Key Pair");
    println!("{}", "-".repeat(60));
    let keypair = gen_keypair(None);
    println!("Private Key: {}", keypair.priv_key);
    println!(
        "Public Key:  [{}, {}]",
        keypair.pub_key[0], keypair.pub_key[1]
    );

    // 2. Generate Deterministic Keypair
    println!("\n🎲 2. Generate Deterministic Key Pair (from seed)");
    println!("{}", "-".repeat(60));
    let seed = BigUint::from(12345u64);
    let keypair1 = gen_keypair(Some(seed.clone()));
    let keypair2 = gen_keypair(Some(seed));
    println!("Seed: {}", keypair1.priv_key);
    println!(
        "Keypair 1 Public Key: [{}, {}]",
        keypair1.pub_key[0], keypair1.pub_key[1]
    );
    println!(
        "Keypair 2 Public Key: [{}, {}]",
        keypair2.pub_key[0], keypair2.pub_key[1]
    );
    assert_eq!(keypair1.pub_key, keypair2.pub_key);
    println!("✅ Same seed produces same key pair");

    // 3. Key Formatting
    println!("\n🔧 3. Private Key Formatting (Baby Jubjub)");
    println!("{}", "-".repeat(60));
    let priv_key = gen_priv_key();
    let formatted = format_priv_key_for_babyjub(&priv_key);
    println!("Original Private Key:  {}", priv_key);
    println!("Formatted Private Key: {}", formatted);

    // 4. Public Key Derivation
    println!("\n🔓 4. Derive Public Key from Private Key");
    println!("{}", "-".repeat(60));
    let priv_key = BigUint::from(99999u64);
    let pub_key = gen_pub_key(&priv_key);
    println!("Private Key: {}", priv_key);
    println!("Public Key:  [{}, {}]", pub_key[0], pub_key[1]);

    // 5. Public Key Packing/Unpacking
    println!("\n📦 5. Public Key Packing/Unpacking");
    println!("{}", "-".repeat(60));
    let keypair = gen_keypair(Some(BigUint::from(54321u64)));
    let packed = pack_pub_key(&keypair.pub_key);
    println!(
        "Original Public Key: [{}, {}]",
        keypair.pub_key[0], keypair.pub_key[1]
    );
    println!("Packed: {}", packed);

    match unpack_pub_key(&packed) {
        Ok(unpacked) => {
            println!("Unpacked: [{}, {}]", unpacked[0], unpacked[1]);
        }
        Err(e) => {
            println!("⚠️  Unpacking failed: {} (using simplified implementation)", e);
        }
    }

    // 6. ECDH Shared Key
    println!("\n🤝 6. ECDH Shared Key");
    println!("{}", "-".repeat(60));
    let alice = gen_keypair(Some(BigUint::from(11111u64)));
    let bob = gen_keypair(Some(BigUint::from(22222u64)));

    println!("Alice:");
    println!("  Private Key: {}", alice.priv_key);
    println!(
        "  Public Key:  [{}, {}]",
        alice.pub_key[0], alice.pub_key[1]
    );

    println!("\nBob:");
    println!("  Private Key: {}", bob.priv_key);
    println!("  Public Key:  [{}, {}]", bob.pub_key[0], bob.pub_key[1]);

    // Alice computes shared key with Bob's public key
    let shared_alice = gen_ecdh_shared_key(&alice.priv_key, &bob.pub_key);
    println!("\nAlice computes shared key:");
    println!("  Shared: [{}, {}]", shared_alice[0], shared_alice[1]);

    // Bob computes shared key with Alice's public key
    let shared_bob = gen_ecdh_shared_key(&bob.priv_key, &alice.pub_key);
    println!("\nBob computes shared key:");
    println!("  Shared: [{}, {}]", shared_bob[0], shared_bob[1]);

    // Verify they match
    if shared_alice == shared_bob {
        println!("\n✅ ECDH successful! Both parties computed the same shared key");
    } else {
        println!("\n❌ ECDH failed! Shared keys do not match");
    }

    // 7. Multiple ECDH Sessions
    println!("\n🔄 7. Multiple ECDH Sessions");
    println!("{}", "-".repeat(60));
    let charlie = gen_keypair(Some(BigUint::from(33333u64)));

    let alice_charlie = gen_ecdh_shared_key(&alice.priv_key, &charlie.pub_key);
    let bob_charlie = gen_ecdh_shared_key(&bob.priv_key, &charlie.pub_key);

    println!(
        "Alice-Charlie Shared Key: [{}, {}]",
        alice_charlie[0], alice_charlie[1]
    );
    println!(
        "Bob-Charlie Shared Key:   [{}, {}]",
        bob_charlie[0], bob_charlie[1]
    );

    if alice_charlie != bob_charlie {
        println!("✅ Different key pairs produce different shared keys");
    }

    println!("\n".repeat(1));
    println!("{}", "=".repeat(60));
    println!("✅ Example completed!");
}
