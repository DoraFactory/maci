//! Basic usage example for maci-crypto
//!
//! Run with: cargo run --example basic_usage

use maci_crypto::{
    gen_keypair, hash_left_right, pack_element, poseidon, 
    tree::biguint_to_node, unpack_element, Tree
};
use num_bigint::BigUint;

fn main() {
    println!("🚀 MACI Crypto - Basic Usage Example\n");
    println!("{}", "=".repeat(60));

    // 1. Generate Keypair
    println!("\n📝 1. Generate Key Pair");
    println!("{}", "-".repeat(60));
    let keypair = gen_keypair(None);
    println!("Private Key: {}", keypair.priv_key);
    println!("Public Key X: {}", keypair.pub_key[0]);
    println!("Public Key Y: {}", keypair.pub_key[1]);
    println!("Formatted Private Key: {}", keypair.formated_priv_key);

    // 2. Poseidon Hash
    println!("\n🔐 2. Poseidon Hashing");
    println!("{}", "-".repeat(60));
    let values = vec![BigUint::from(1u32), BigUint::from(2u32)];
    let hash = poseidon(&values);
    println!("Input: {:?}", values);
    println!("Poseidon Hash: {}", hash);

    // Hash two values (for Merkle tree)
    let left = BigUint::from(100u32);
    let right = BigUint::from(200u32);
    let parent = hash_left_right(&left, &right);
    println!("\nMerkle Parent Hash:");
    println!("  Left:   {}", left);
    println!("  Right:  {}", right);
    println!("  Parent: {}", parent);

    // 3. Message Packing
    println!("\n📦 3. Message Packing/Unpacking");
    println!("{}", "-".repeat(60));
    let packed = pack_element(
        &BigUint::from(1u32),   // nonce
        &BigUint::from(5u32),   // state_idx
        &BigUint::from(10u32),  // vo_idx
        &BigUint::from(100u32), // new_votes
        None,                   // salt (auto-generated)
    );
    println!("Packed Element: {}", packed);

    let unpacked = unpack_element(&packed);
    println!("\nUnpacked Element:");
    println!("  Nonce:       {}", unpacked.nonce);
    println!("  State Index: {}", unpacked.state_idx);
    println!("  VO Index:    {}", unpacked.vo_idx);
    println!("  New Votes:   {}", unpacked.new_votes);
    if let Some(salt) = &unpacked.salt {
        println!("  Salt:        {}", salt);
    } else {
        println!("  Salt:        None");
    }

    // 4. Merkle Tree
    println!("\n🌳 4. Merkle Tree");
    println!("{}", "-".repeat(60));
    let zero = biguint_to_node(&BigUint::from(0u32));
    let mut tree = Tree::new(2, 3, zero);
    println!("Tree Config:");
    println!("  Degree: {}", tree.degree);
    println!("  Depth:  {}", tree.depth);
    println!("  Height: {}", tree.height);

    let leaves = vec![
        biguint_to_node(&BigUint::from(100u32)),
        biguint_to_node(&BigUint::from(200u32)),
        biguint_to_node(&BigUint::from(300u32)),
    ];
    tree.init_leaves(&leaves);
    println!("\nInitial Leaves: {:?}", leaves);
    println!("Tree Root: {}", tree.root());

    // Update a leaf
    tree.update_leaf(1, biguint_to_node(&BigUint::from(250u32))).unwrap();
    println!("\nAfter updating leaf[1] to 250:");
    println!("New Tree Root: {}", tree.root());

    // Get Merkle proof
    let proof = tree.path_element_of(1);
    println!("\nMerkle Proof for leaf[1]: {:?}", proof);

    // 5. Direct String Usage (recommended for IMTNode)
    println!("\n🔤 5. Direct String Usage");
    println!("{}", "-".repeat(60));
    println!("Recommended way: directly use strings, no conversion needed");
    
    let mut simple_tree = Tree::new(2, 2, "0".to_string());
    let simple_leaves = vec!["100".to_string(), "200".to_string(), "300".to_string()];
    simple_tree.init_leaves(&simple_leaves);
    
    println!("Leaves: {:?}", simple_leaves);
    println!("Root: {}", simple_tree.root());
    
    simple_tree.update_leaf(0, "999".to_string()).unwrap();
    println!("\nAfter updating leaf[0] to \"999\":");
    println!("Root: {}", simple_tree.root());

    println!();
    println!("{}", "=".repeat(60));
    println!("✅ Example completed!");
    println!("💡 IMTNode = String, you can directly use string numbers!");
}
