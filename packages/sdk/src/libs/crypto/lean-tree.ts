import { LeanIMT } from '@zk-kit/lean-imt';
import { poseidon } from './hashing';

/**
 * A Lean Incremental Merkle Tree with dynamic capacity
 * 
 * Unlike the fixed-capacity quinary tree (Tree), LeanTree uses a binary structure
 * that grows dynamically as leaves are inserted. This is ideal for scenarios
 * where the final tree size is unknown or varies significantly.
 * 
 * Key features:
 * - Dynamic depth (grows with number of leaves)
 * - Binary tree (arity = 2)
 * - No fixed capacity limit
 * - Efficient sparse tree handling (no zero hash placeholders)
 * - Suitable for Active State Tree which doesn't need ZK proofs
 * 
 * @example
 * ```typescript
 * const tree = new LeanTree();
 * tree.insert(1n);
 * tree.insert(2n);
 * console.log(tree.root); // Get current root
 * console.log(tree.depth); // Dynamic depth
 * console.log(tree.size); // Number of leaves
 * ```
 */
export class LeanTree {
  private tree: LeanIMT;

  /**
   * Create a new Lean IMT with Poseidon hash function
   * The tree starts empty and grows dynamically as leaves are inserted
   */
  constructor() {
    // LeanIMT uses a binary hash function (left, right) => hash
    this.tree = new LeanIMT((left: bigint, right: bigint) => poseidon([left, right]));
  }

  /**
   * Insert a new leaf into the tree
   * The tree will automatically grow in depth if needed
   * 
   * @param leaf - The leaf value to insert
   * @throws Error if leaf is 0 or already exists
   */
  insert(leaf: bigint): void {
    this.tree.insert(leaf);
  }

  /**
   * Insert multiple leaves in a batch
   * More efficient than calling insert() multiple times
   * 
   * @param leaves - Array of leaf values to insert
   * @throws Error if any leaf is 0 or already exists
   */
  insertMany(leaves: bigint[]): void {
    this.tree.insertMany(leaves);
  }

  /**
   * Get the root of the tree
   * 
   * @returns The current root hash
   */
  get root(): bigint {
    return this.tree.root;
  }

  /**
   * Get the current depth of the tree
   * Note: This can change as more leaves are inserted
   * 
   * @returns Current tree depth
   */
  get depth(): number {
    return this.tree.depth;
  }

  /**
   * Get the number of leaves in the tree
   * 
   * @returns Number of leaves currently in the tree
   */
  get size(): number {
    return this.tree.size;
  }

  /**
   * Get all leaves in the tree
   * 
   * @returns Array of all leaf values
   */
  get leaves(): bigint[] {
    return this.tree.leaves;
  }

  /**
   * Check if a leaf exists in the tree
   * 
   * @param leaf - The leaf value to check
   * @returns true if the leaf exists, false otherwise
   */
  has(leaf: bigint): boolean {
    return this.tree.has(leaf);
  }

  /**
   * Get the index of a leaf in the tree
   * 
   * @param leaf - The leaf value to find
   * @returns The index of the leaf, or -1 if not found
   */
  indexOf(leaf: bigint): number {
    return this.tree.indexOf(leaf);
  }

  /**
   * Update a leaf at a specific index
   * 
   * @param index - The index of the leaf to update
   * @param newLeaf - The new leaf value
   * @throws Error if index is out of bounds or new leaf already exists
   */
  update(index: number, newLeaf: bigint): void {
    this.tree.update(index, newLeaf);
  }

  /**
   * Generate a Merkle proof for a leaf at the given index
   * 
   * @param index - The index of the leaf
   * @returns Object containing the leaf, siblings path, and root
   * @throws Error if index is out of bounds
   */
  generateProof(index: number): {
    leaf: bigint;
    siblings: bigint[];
    root: bigint;
    index: number;
  } {
    const proof = this.tree.generateProof(index);
    return {
      leaf: proof.leaf,
      siblings: proof.siblings,
      root: proof.root,
      index
    };
  }

  /**
   * Verify a Merkle proof
   * 
   * @param proof - The proof object from generateProof
   * @returns true if the proof is valid, false otherwise
   */
  static verifyProof(proof: {
    leaf: bigint;
    siblings: bigint[];
    root: bigint;
    index: number;
  }): boolean {
    return LeanIMT.verifyProof(proof, (left, right) => poseidon([left, right]));
  }

  /**
   * Export tree state for serialization
   * 
   * @returns Object containing tree leaves for reconstruction
   */
  export(): { leaves: bigint[] } {
    return {
      leaves: this.leaves
    };
  }

  /**
   * Import tree state from serialization
   * Creates a new tree and inserts all leaves
   * 
   * @param data - The exported tree data
   * @returns A new LeanTree instance with the imported leaves
   */
  static import(data: { leaves: bigint[] }): LeanTree {
    const tree = new LeanTree();
    if (data.leaves.length > 0) {
      tree.insertMany(data.leaves);
    }
    return tree;
  }
}
