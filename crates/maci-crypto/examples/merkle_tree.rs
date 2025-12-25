//! Merkle Tree example for maci-crypto
//!
//! Run with: cargo run --example merkle_tree

use maci_crypto::{tree::biguint_to_node, Tree};
use num_bigint::BigUint;

fn print_tree_info(tree: &Tree) {
    println!("Tree Configuration:");
    println!("  Degree:       {}", tree.degree);
    println!("  Depth:        {}", tree.depth);
    println!("  Height:       {}", tree.height);
    println!("  Leaves Count: {}", tree.leaves_count);
    println!("  Nodes Count:  {}", tree.nodes_count);
    println!("  Root:         {}", tree.root());
}

fn main() {
    println!("🌳 MACI Crypto - Merkle Tree Example\n");
    println!("{}", "=".repeat(60));

    // 1. Create a Binary Tree (degree=2)
    println!("\n📝 1. Create Binary Merkle Tree");
    println!("{}", "-".repeat(60));
    let zero = biguint_to_node(&BigUint::from(0u32));
    let mut tree = Tree::new(2, 3, zero);
    print_tree_info(&tree);

    // 2. Initialize Leaves
    println!("\n🌱 2. Initialize Leaf Nodes");
    println!("{}", "-".repeat(60));
    let leaves = vec![
        biguint_to_node(&BigUint::from(100u32)),
        biguint_to_node(&BigUint::from(200u32)),
        biguint_to_node(&BigUint::from(300u32)),
        biguint_to_node(&BigUint::from(400u32)),
    ];
    println!("Leaves: {:?}", leaves);
    tree.init_leaves(&leaves);
    println!("Root after initialization: {}", tree.root());

    // 3. Get All Leaves
    println!("\n📋 3. Read All Leaves");
    println!("{}", "-".repeat(60));
    let all_leaves = tree.leaves();
    for (i, leaf) in all_leaves.iter().enumerate() {
        println!("  Leaf[{}]: {}", i, leaf);
    }

    // 4. Update a Leaf
    println!("\n✏️  4. Update Single Leaf");
    println!("{}", "-".repeat(60));
    println!("Before update:");
    let leaves_before = tree.leaves();
    println!("  Leaf[1]: {}", leaves_before.get(1).unwrap());
    println!("  Root:    {}", tree.root());

    tree.update_leaf(1, biguint_to_node(&BigUint::from(250u32)))
        .unwrap();

    println!("\nAfter updating Leaf[1] to 250:");
    let leaves_after = tree.leaves();
    println!("  Leaf[1]: {}", leaves_after.get(1).unwrap());
    println!("  Root:    {}", tree.root());

    // 5. Generate Merkle Proof
    println!("\n🔍 5. Generate Merkle Proof");
    println!("{}", "-".repeat(60));
    let leaf_index = 2;
    let proof_elements = tree.path_element_of(leaf_index).unwrap();
    let proof_indices = tree.path_idx_of(leaf_index).unwrap();

    println!("Proof for Leaf[{}]:", leaf_index);
    let current_leaves = tree.leaves();
    println!("  Leaf Value: {}", current_leaves.get(leaf_index).unwrap());
    println!("  Proof Path Elements:");
    for (i, elem) in proof_elements.iter().enumerate() {
        println!("    Level {}: {} siblings", i, elem.len());
    }
    println!("  Proof Path Indices: {:?}", proof_indices);

    // 6. Get Subtree Root
    println!("\n🌿 6. Get Subtree Root");
    println!("{}", "-".repeat(60));
    let subtree = tree.sub_tree(1);
    println!("Subtree root: {}", subtree.root());

    // 7. Compute Zero Hashes
    println!("\n0️⃣  7. Compute Zero Hash Array");
    println!("{}", "-".repeat(60));
    let zero_node = biguint_to_node(&BigUint::from(0u32));
    let zero_hashes = Tree::compute_zero_hashes(2, 5, zero_node);
    println!("Zero hashes for depth 5:");
    for (i, hash) in zero_hashes.iter().enumerate() {
        println!("  Level {}: {}", i, hash);
    }

    // 8. Extend Tree Root
    println!("\n📏 8. Extend Tree Root");
    println!("{}", "-".repeat(60));
    let small_root = tree.root().clone();
    let extended = Tree::extend_tree_root(
        &small_root, // Pass by reference
        3,           // from_depth
        5,           // to_depth
        &zero_hashes,
        2, // degree
    );

    match extended {
        Ok(new_root) => {
            println!("Small tree root (depth 3): {}", small_root);
            println!("Extended root (depth 5):   {}", new_root);
        }
        Err(e) => {
            println!("Error extending tree: {}", e);
        }
    }

    // 9. Create a Ternary Tree (degree=3)
    println!("\n🔺 9. Create Ternary Merkle Tree");
    println!("{}", "-".repeat(60));
    let ternary_zero = biguint_to_node(&BigUint::from(0u32));
    let mut ternary_tree = Tree::new(3, 2, ternary_zero);
    println!("Ternary Tree:");
    print_tree_info(&ternary_tree);

    let ternary_leaves = vec![
        biguint_to_node(&BigUint::from(10u32)),
        biguint_to_node(&BigUint::from(20u32)),
        biguint_to_node(&BigUint::from(30u32)),
    ];
    ternary_tree.init_leaves(&ternary_leaves);
    println!(
        "\nAfter initialization with {} leaves:",
        ternary_leaves.len()
    );
    println!("Root: {}", ternary_tree.root());

    // 10. Large Tree Example
    println!("\n🏗️  10. Large Tree Example");
    println!("{}", "-".repeat(60));
    let large_zero = biguint_to_node(&BigUint::from(0u32));
    let mut large_tree = Tree::new(2, 10, large_zero);
    println!("Large Tree Configuration:");
    println!("  Degree:       {}", large_tree.degree);
    println!("  Depth:        {}", large_tree.depth);
    println!(
        "  Max Leaves:   {} (2^{})",
        large_tree.leaves_count, large_tree.depth
    );
    println!("  Total Nodes:  {}", large_tree.nodes_count);

    // Initialize with a few leaves
    let large_leaves: Vec<_> = (1..=10)
        .map(|i| biguint_to_node(&BigUint::from(i * 100u32)))
        .collect();
    large_tree.init_leaves(&large_leaves);
    println!("\nInitialized with {} leaves", large_leaves.len());
    println!("Root: {}", large_tree.root());

    // Update and verify
    large_tree
        .update_leaf(5, biguint_to_node(&BigUint::from(999u32)))
        .unwrap();
    println!("\nAfter updating leaf[5]:");
    println!("Root: {}", large_tree.root());

    // 11. Direct String Usage (IMTNode native)
    println!("\n🔤 11. Direct String Usage (IMTNode Native Way)");
    println!("{}", "-".repeat(60));
    println!("No BigUint conversion needed, directly use strings to operate on tree:\n");

    // Create tree with string zero value
    let mut string_tree = Tree::new(2, 2, "0".to_string());
    println!("Create tree with zero = \"0\"");

    // Initialize with string leaves directly
    let string_leaves = vec![
        "12345".to_string(),
        "67890".to_string(),
        "11111".to_string(),
        "22222".to_string(),
    ];
    string_tree.init_leaves(&string_leaves);
    println!("Initialize leaves: {:?}", string_leaves);
    println!("Root: {}", string_tree.root());

    // Update with string
    string_tree.update_leaf(1, "99999".to_string()).unwrap();
    println!("\nUpdate leaf[1] = \"99999\"");
    println!("New Root: {}", string_tree.root());

    // Get leaves and display
    let current_leaves = string_tree.leaves();
    println!("\nAll current leaves:");
    for (i, leaf) in current_leaves.iter().enumerate().take(4) {
        println!("  Leaf[{}]: {}", i, leaf);
    }

    // Get proof for a leaf
    let proof_idx = 2;
    let proof_elements = string_tree.path_element_of(proof_idx).unwrap();
    let proof_indices = string_tree.path_idx_of(proof_idx).unwrap();
    println!("\nMerkle Proof for Leaf[{}]:", proof_idx);
    println!("  Leaf Value: {}", current_leaves[proof_idx]);
    println!("  Path Indices: {:?}", proof_indices);
    println!("  Siblings at each level: {} levels", proof_elements.len());

    println!();
    println!("{}", "=".repeat(60));
    println!("✅ Example completed!");
    println!("💡 Tip: IMTNode is String, you can directly use string operations!");
}
