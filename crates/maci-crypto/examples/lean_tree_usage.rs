//! Example demonstrating LeanTree usage in maci-crypto
//!
//! Run with: cargo run --example lean_tree_usage

use maci_crypto::LeanTree;

fn main() {
    println!("=== LeanTree Usage Example ===\n");

    // 1. Create a new LeanTree
    println!("1. Creating new LeanTree...");
    let mut tree = LeanTree::new();
    println!("   Initial depth: {}", tree.depth());
    println!("   Initial size: {}", tree.size());
    println!();

    // 2. Insert leaves one by one
    println!("2. Inserting leaves sequentially...");
    tree.insert("1".to_string()).unwrap();
    println!("   After 1 leaf - depth: {}, size: {}", tree.depth(), tree.size());

    tree.insert("2".to_string()).unwrap();
    println!("   After 2 leaves - depth: {}, size: {}", tree.depth(), tree.size());

    tree.insert("3".to_string()).unwrap();
    println!("   After 3 leaves - depth: {}, size: {}", tree.depth(), tree.size());
    println!();

    // 3. Insert multiple leaves at once
    println!("3. Batch inserting leaves...");
    let batch_leaves = vec![
        "4".to_string(),
        "5".to_string(),
        "6".to_string(),
        "7".to_string(),
        "8".to_string(),
    ];
    tree.insert_many(&batch_leaves).unwrap();
    println!("   After batch insert - depth: {}, size: {}", tree.depth(), tree.size());
    println!();

    // 4. Get root
    println!("4. Current root:");
    println!("   Root: {}", tree.root().unwrap());
    println!();

    // 5. Check if leaves exist
    println!("5. Checking leaf existence:");
    println!("   Has '1'? {}", tree.has(&"1".to_string()));
    println!("   Has '5'? {}", tree.has(&"5".to_string()));
    println!("   Has '100'? {}", tree.has(&"100".to_string()));
    println!();

    // 6. Get leaf indices
    println!("6. Getting leaf indices:");
    println!("   Index of '1': {:?}", tree.index_of(&"1".to_string()));
    println!("   Index of '5': {:?}", tree.index_of(&"5".to_string()));
    println!();

    // 7. Get all leaves
    println!("7. All leaves in tree:");
    let all_leaves = tree.leaves();
    println!("   Leaves: {:?}", all_leaves);
    println!();

    // 8. Generate proof
    println!("8. Generating Merkle proof for index 2:");
    let proof = tree.generate_proof(2).unwrap();
    println!("   Leaf: {}", all_leaves[2]);
    println!("   Number of siblings: {}", proof.len());
    println!("   Siblings: {:?}", proof);
    println!();

    // 9. Verify proof
    println!("9. Verifying proof:");
    let root = tree.root().unwrap();
    let is_valid = LeanTree::verify_proof(&all_leaves[2], &proof, 2, &root);
    println!("   Proof valid? {}", is_valid);
    println!();

    // 10. Demonstrate dynamic growth
    println!("10. Demonstrating unlimited capacity:");
    let mut large_tree = LeanTree::new();
    
    // Insert 100 leaves
    println!("   Inserting 100 leaves...");
    for i in 1..=100 {
        large_tree.insert(i.to_string()).unwrap();
    }
    
    println!("   Final depth: {} (grows automatically)", large_tree.depth());
    println!("   Final size: {}", large_tree.size());
    println!("   Final root: {}", large_tree.root().unwrap());
    println!();

    // 11. Compare with fixed-capacity approach
    println!("11. Capacity comparison:");
    println!("   Fixed tree (depth=5, arity=5): capacity = 5^5 = 3,125");
    println!("   LeanTree: unlimited capacity, depth grows as needed");
    println!("   For 100 leaves, LeanTree only needs depth 7 (2^7 = 128 > 100)");
    println!();

    println!("=== Example Complete ===");
    println!();
    println!("Key takeaways:");
    println!("  ✓ LeanTree grows dynamically - no fixed capacity");
    println!("  ✓ Memory efficient - only allocates what's needed");
    println!("  ✓ Perfect for Active State Tree (no circuit constraints)");
    println!("  ✓ Binary tree structure (arity=2)");
}
