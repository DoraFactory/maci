//! Example: Generate Deactivate Root for AMACI
//!
//! This example demonstrates how to use the `gen_deactivate_root` method
//! to create a Merkle tree of deactivated account states for AMACI.
//!
//! Run with:
//! ```
//! cargo run --example gen_deactivate_root
//! ```

use maci_crypto::keypair::Keypair;
use num_bigint::BigUint;

fn main() {
    println!("=== AMACI Deactivate Root Generation Example ===\n");

    // Step 1: Create coordinator keypair
    println!("Step 1: Creating coordinator keypair...");
    let coordinator_seed = BigUint::from(12345u64);
    let coordinator = Keypair::from_priv_key(&coordinator_seed);
    println!(
        "  Coordinator public key: [{}, {}]",
        coordinator.pub_key[0], coordinator.pub_key[1]
    );
    println!();

    // Step 2: Create test account keypairs
    println!("Step 2: Creating test account keypairs...");
    let account_seeds = vec![11111u64, 22222u64, 33333u64, 44444u64, 55555u64];
    let accounts: Vec<_> = account_seeds
        .iter()
        .map(|&seed| {
            let keypair = Keypair::from_priv_key(&BigUint::from(seed));
            println!(
                "  Account (seed {}): [{}, {}]",
                seed, keypair.pub_key[0], keypair.pub_key[1]
            );
            keypair.pub_key
        })
        .collect();
    println!();

    // Step 3: Generate deactivate root
    println!("Step 3: Generating deactivate root...");
    let state_tree_depth = 3;
    println!("  State tree depth: {}", state_tree_depth);
    println!(
        "  Tree depth (state_tree_depth + 2): {}",
        state_tree_depth + 2
    );
    println!("  Tree degree: 5");
    println!();

    let (deactivates, root, leaves, tree) =
        coordinator.gen_deactivate_root(&accounts, state_tree_depth);

    // Step 4: Display results
    println!("Step 4: Results");
    println!("  Number of accounts: {}", accounts.len());
    println!("  Number of deactivate entries: {}", deactivates.len());
    println!("  Number of leaves: {}", leaves.len());
    println!();

    println!("  Merkle Tree Root:");
    println!("    {}", root);
    println!();

    println!("  Leaf Hashes:");
    for (i, leaf) in leaves.iter().enumerate() {
        println!("    Leaf {}: {}", i, leaf);
    }
    println!();

    println!("  Deactivate Entries (first 2 shown):");
    for (i, deactivate) in deactivates.iter().take(2).enumerate() {
        println!("    Entry {}:", i);
        println!("      c1.x: {}", deactivate[0]);
        println!("      c1.y: {}", deactivate[1]);
        println!("      c2.x: {}", deactivate[2]);
        println!("      c2.y: {}", deactivate[3]);
        println!("      shared_key_hash: {}", deactivate[4]);
    }
    println!();

    // Step 5: Tree properties
    println!("Step 5: Tree Properties");
    println!("  Depth: {}", tree.depth);
    println!("  Height: {}", tree.height);
    println!("  Degree: {}", tree.degree);
    println!("  Leaves count: {}", tree.leaves_count);
    println!();

    println!("=== Example Complete ===");
}
