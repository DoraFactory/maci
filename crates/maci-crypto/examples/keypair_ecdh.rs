//! Example: ECDH Shared Key Generation using Keypair
//!
//! This example demonstrates how to use the Keypair struct to generate
//! ECDH shared keys for secure communication.
//!
//! Run with:
//! ```bash
//! cargo run --example keypair_ecdh
//! ```

use maci_crypto::keypair::Keypair;
use num_bigint::BigUint;

fn main() {
    println!("🔐 ECDH Shared Key Generation Example");
    println!("{}", "=".repeat(60));

    // 1. Create keypairs for Alice and Bob
    println!("\n1️⃣  Creating keypairs for Alice and Bob...");
    let alice = Keypair::from_priv_key(&BigUint::from(11111u64));
    let bob = Keypair::from_priv_key(&BigUint::from(22222u64));

    println!("\n👩 Alice:");
    println!("  Private Key: {}", alice.priv_key);
    println!(
        "  Public Key:  [{}, {}]",
        alice.pub_key[0], alice.pub_key[1]
    );

    println!("\n👨 Bob:");
    println!("  Private Key: {}", bob.priv_key);
    println!("  Public Key:  [{}, {}]", bob.pub_key[0], bob.pub_key[1]);

    // 2. Generate shared key using BigUint array method
    println!("\n2️⃣  Generating shared key (BigUint array method)...");
    let shared_alice = alice.gen_ecdh_shared_key(&bob.pub_key);
    println!("\n👩 Alice computes shared key:");
    println!("  Shared: [{}, {}]", shared_alice[0], shared_alice[1]);

    let shared_bob = bob.gen_ecdh_shared_key(&alice.pub_key);
    println!("\n👨 Bob computes shared key:");
    println!("  Shared: [{}, {}]", shared_bob[0], shared_bob[1]);

    // Verify they match
    if shared_alice == shared_bob {
        println!("\n✅ ECDH successful! Both parties computed the same shared key");
    } else {
        println!("\n❌ ECDH failed! Shared keys do not match");
    }

    // 3. Generate shared key using PublicKey method
    println!("\n3️⃣  Generating shared key (PublicKey method)...");
    let shared_alice_pk = alice.gen_ecdh_shared_key_with_public_key(bob.public_key());
    let shared_bob_pk = bob.gen_ecdh_shared_key_with_public_key(alice.public_key());

    println!("\n👩 Alice (using PublicKey):");
    println!("  Shared: [{}, {}]", shared_alice_pk[0], shared_alice_pk[1]);

    println!("\n👨 Bob (using PublicKey):");
    println!("  Shared: [{}, {}]", shared_bob_pk[0], shared_bob_pk[1]);

    if shared_alice_pk == shared_bob_pk && shared_alice_pk == shared_alice {
        println!("\n✅ Both methods produce the same shared key!");
    } else {
        println!("\n❌ Methods produced different shared keys!");
    }

    // 4. Multi-party example
    println!("\n4️⃣  Multi-party ECDH example...");
    println!("{}", "-".repeat(60));
    let charlie = Keypair::from_priv_key(&BigUint::from(33333u64));

    println!("\n👤 Charlie:");
    println!("  Private Key: {}", charlie.priv_key);
    println!(
        "  Public Key:  [{}, {}]",
        charlie.pub_key[0], charlie.pub_key[1]
    );

    // Alice and Charlie establish a shared key
    let shared_alice_charlie = alice.gen_ecdh_shared_key(&charlie.pub_key);
    let shared_charlie_alice = charlie.gen_ecdh_shared_key(&alice.pub_key);

    println!("\n👩↔️👤 Alice-Charlie shared key:");
    println!(
        "  Alice's view:   [{}, {}]",
        shared_alice_charlie[0], shared_alice_charlie[1]
    );
    println!(
        "  Charlie's view: [{}, {}]",
        shared_charlie_alice[0], shared_charlie_alice[1]
    );

    if shared_alice_charlie == shared_charlie_alice {
        println!("  ✅ Alice and Charlie share the same key");
    }

    // Bob and Charlie establish a shared key
    let shared_bob_charlie = bob.gen_ecdh_shared_key(&charlie.pub_key);
    let shared_charlie_bob = charlie.gen_ecdh_shared_key(&bob.pub_key);

    println!("\n👨↔️👤 Bob-Charlie shared key:");
    println!(
        "  Bob's view:     [{}, {}]",
        shared_bob_charlie[0], shared_bob_charlie[1]
    );
    println!(
        "  Charlie's view: [{}, {}]",
        shared_charlie_bob[0], shared_charlie_bob[1]
    );

    if shared_bob_charlie == shared_charlie_bob {
        println!("  ✅ Bob and Charlie share the same key");
    }

    // Verify all three pairs have different shared keys
    println!("\n5️⃣  Verifying uniqueness of shared keys...");
    let all_different = shared_alice != shared_alice_charlie
        && shared_alice != shared_bob_charlie
        && shared_alice_charlie != shared_bob_charlie;

    if all_different {
        println!("✅ Each pair has a unique shared key (as expected)");
    } else {
        println!("❌ Some shared keys are not unique (unexpected)");
    }

    println!("\n{}", "=".repeat(60));
    println!("🎉 Example completed successfully!");
}
