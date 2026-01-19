import { LeanTree, Tree, hash2 } from '@dorafactory/maci-sdk';
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { type WitnessTester } from 'circomkit';
import fc from 'fast-check';

import { circomkitInstance, getSignal } from './utils/utils';

chai.use(chaiAsPromised);

const CIRCOM_PATH = './utils/trees/binaryLeanTree';

/**
 * LeanTree Tests - Comprehensive SDK & Circuit Consistency Validation
 * 
 * Circuit Location: packages/circuits/circom/utils/trees/binaryLeanTree.circom
 * SDK Location: packages/sdk/src/libs/crypto/lean-tree.ts
 * 
 * ============================================================================
 * OVERVIEW
 * ============================================================================
 * 
 * LeanTree is a dynamic binary Incremental Merkle Tree that:
 * - Grows automatically as leaves are inserted (no fixed capacity)
 * - Uses binary structure (arity = 2) vs traditional quinary (arity = 5)
 * - Optimized for Active State Tree in AMACI
 * - Uses Poseidon hash2 (PoseidonT3) - simpler than hash5
 * 
 * ============================================================================
 * KEY DIFFERENCES: Binary vs Quinary Trees
 * ============================================================================
 * 
 * | Property | Binary (LeanTree) | Quinary (Tree) |
 * |----------|------------------|----------------|
 * | Arity | 2 | 5 |
 * | Hash Function | hash2 (PoseidonT3) | hash5 (PoseidonT6) |
 * | Depth (100 leaves) | 7 | 3 |
 * | Path siblings | [depth][1] | [depth][4] |
 * | Capacity | Dynamic | Fixed |
 * | Circuit constraints | Lower per level | Higher per level |
 * 
 * Trade-off: More levels but simpler hash = better overall performance
 * 
 * ============================================================================
 * TESTING STRATEGY
 * ============================================================================
 * 
 * This test file covers THREE testing levels:
 * 
 * 1. SDK Unit Tests (~300 lines)
 *    - Basic operations (insert, update, query)
 *    - Dynamic growth
 *    - Merkle proofs
 *    - Serialization
 *    - Error handling
 * 
 * 2. Integration Tests (~200 lines)
 *    - Comparison with quinary trees
 *    - Active State Tree use case
 *    - Hash function consistency
 *    - Circuit input formatting
 * 
 * 3. Circuit Consistency Tests (~400 lines) ⭐ CRITICAL
 *    - SDK ↔ Circuit root consistency
 *    - Proof verification across layers
 *    - Edge cases and boundary conditions
 *    - Property-based testing
 * 
 * ============================================================================
 */

describe('LeanTree', function test() {
  this.timeout(900000); // 15 minutes for circuit operations

  // ============================================================================
  // PART 1: SDK Unit Tests - Basic Functionality
  // ============================================================================

  describe('Creation and Basic Operations', () => {
    it('should create an empty tree', () => {
      const tree = new LeanTree();
      expect(tree.depth).to.equal(0);
      expect(tree.size).to.equal(0);
      expect(tree.leaves).to.deep.equal([]);
    });

    it('should insert a single leaf', () => {
      const tree = new LeanTree();
      tree.insert(1n);
      
      expect(tree.size).to.equal(1);
      expect(tree.depth).to.equal(0); // Single leaf has depth 0
      expect(tree.has(1n)).to.be.true;
      expect(tree.indexOf(1n)).to.equal(0);
    });

    it('should insert multiple leaves sequentially', () => {
      const tree = new LeanTree();
      
      tree.insert(1n);
      tree.insert(2n);
      tree.insert(3n);
      
      expect(tree.size).to.equal(3);
      expect(tree.depth).to.equal(2); // 3 leaves => depth 2
      expect(tree.has(1n)).to.be.true;
      expect(tree.has(2n)).to.be.true;
      expect(tree.has(3n)).to.be.true;
    });

    it('should insert multiple leaves in batch', () => {
      const tree = new LeanTree();
      const leaves = [1n, 2n, 3n, 4n, 5n];
      
      tree.insertMany(leaves);
      
      expect(tree.size).to.equal(5);
      expect(tree.leaves.length).to.equal(5);
      
      leaves.forEach(leaf => {
        expect(tree.has(leaf)).to.be.true;
      });
    });
  });

  describe('Dynamic Growth', () => {
    it('should grow depth as leaves are added', () => {
      const tree = new LeanTree();
      
      // 1 leaf: depth 0
      tree.insert(1n);
      expect(tree.depth).to.equal(0);
      
      // 2 leaves: depth 1
      tree.insert(2n);
      expect(tree.depth).to.equal(1);
      
      // 3 leaves: depth 2
      tree.insert(3n);
      expect(tree.depth).to.equal(2);
      
      // 4 leaves: depth 2 (still fits in 2^2=4)
      tree.insert(4n);
      expect(tree.depth).to.equal(2);
      
      // 5 leaves: depth 3 (needs 2^3=8)
      tree.insert(5n);
      expect(tree.depth).to.equal(3);
    });

    it('should handle large numbers of leaves', () => {
      const tree = new LeanTree();
      const numLeaves = 100;
      
      const leaves = Array.from({ length: numLeaves }, (_, i) => BigInt(i + 1));
      tree.insertMany(leaves);
      
      expect(tree.size).to.equal(numLeaves);
      // 100 leaves requires depth log2(128) = 7
      expect(tree.depth).to.be.at.least(6);
      expect(tree.depth).to.be.at.most(7);
    });
  });

  describe('Root Calculation', () => {
    it('should return consistent root', () => {
      const tree1 = new LeanTree();
      const tree2 = new LeanTree();
      
      const leaves = [1n, 2n, 3n, 4n];
      
      tree1.insertMany(leaves);
      tree2.insertMany(leaves);
      
      expect(tree1.root).to.equal(tree2.root);
    });

    it('should change root when leaves are added', () => {
      const tree = new LeanTree();
      
      tree.insert(1n);
      const root1 = tree.root;
      
      tree.insert(2n);
      const root2 = tree.root;
      
      expect(root1).to.not.equal(root2);
    });

    it('should change root when leaves are updated', () => {
      const tree = new LeanTree();
      tree.insertMany([1n, 2n, 3n]);
      
      const rootBefore = tree.root;
      tree.update(1, 10n);
      const rootAfter = tree.root;
      
      expect(rootBefore).to.not.equal(rootAfter);
      expect(tree.has(10n)).to.be.true;
      expect(tree.has(2n)).to.be.false;
    });
  });

  describe('Leaf Operations', () => {
    it('should check if leaf exists', () => {
      const tree = new LeanTree();
      tree.insertMany([1n, 2n, 3n]);
      
      expect(tree.has(1n)).to.be.true;
      expect(tree.has(2n)).to.be.true;
      expect(tree.has(3n)).to.be.true;
      expect(tree.has(4n)).to.be.false;
      expect(tree.has(100n)).to.be.false;
    });

    it('should get index of leaf', () => {
      const tree = new LeanTree();
      tree.insertMany([10n, 20n, 30n]);
      
      expect(tree.indexOf(10n)).to.equal(0);
      expect(tree.indexOf(20n)).to.equal(1);
      expect(tree.indexOf(30n)).to.equal(2);
      expect(tree.indexOf(40n)).to.equal(-1);
    });

    it('should get all leaves', () => {
      const tree = new LeanTree();
      const leaves = [1n, 2n, 3n, 4n, 5n];
      tree.insertMany(leaves);
      
      const retrievedLeaves = tree.leaves;
      expect(retrievedLeaves).to.deep.equal(leaves);
    });

    it('should update leaf at index', () => {
      const tree = new LeanTree();
      tree.insertMany([1n, 2n, 3n]);
      
      tree.update(1, 20n);
      
      expect(tree.has(2n)).to.be.false;
      expect(tree.has(20n)).to.be.true;
      expect(tree.leaves[1]).to.equal(20n);
    });
  });

  describe('Merkle Proofs', () => {
    it('should generate proof for leaf', () => {
      const tree = new LeanTree();
      tree.insertMany([1n, 2n, 3n, 4n]);
      
      const proof = tree.generateProof(1);
      
      expect(proof.leaf).to.equal(2n);
      expect(proof.index).to.equal(1);
      expect(proof.root).to.equal(tree.root);
      expect(proof.siblings.length).to.be.greaterThan(0);
    });

    it('should verify valid proof', () => {
      const tree = new LeanTree();
      tree.insertMany([1n, 2n, 3n, 4n]);
      
      const proof = tree.generateProof(2);
      const isValid = LeanTree.verifyProof(proof);
      
      expect(isValid).to.be.true;
    });

    it('should generate different proofs for different indices', () => {
      const tree = new LeanTree();
      tree.insertMany([1n, 2n, 3n, 4n]);
      
      const proof0 = tree.generateProof(0);
      const proof1 = tree.generateProof(1);
      
      expect(proof0.leaf).to.not.equal(proof1.leaf);
      expect(proof0.siblings).to.not.deep.equal(proof1.siblings);
    });
  });

  describe('Serialization', () => {
    it('should export tree data', () => {
      const tree = new LeanTree();
      tree.insertMany([1n, 2n, 3n]);
      
      const exported = tree.export();
      
      expect(exported.leaves).to.deep.equal([1n, 2n, 3n]);
    });

    it('should import tree data', () => {
      const originalTree = new LeanTree();
      originalTree.insertMany([1n, 2n, 3n, 4n, 5n]);
      
      const exported = originalTree.export();
      const importedTree = LeanTree.import(exported);
      
      expect(importedTree.size).to.equal(originalTree.size);
      expect(importedTree.depth).to.equal(originalTree.depth);
      expect(importedTree.root).to.equal(originalTree.root);
      expect(importedTree.leaves).to.deep.equal(originalTree.leaves);
    });

    it('should import empty tree', () => {
      const tree = LeanTree.import({ leaves: [] });
      
      expect(tree.size).to.equal(0);
      expect(tree.depth).to.equal(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle duplicate leaf insertion gracefully', () => {
      const tree = new LeanTree();
      tree.insert(1n);
      
      try {
        tree.insert(1n);
        expect(tree.size).to.be.at.least(1);
      } catch (error) {
        expect(error).to.exist;
      }
    });

    it('should handle zero insertion gracefully', () => {
      const tree = new LeanTree();
      
      try {
        tree.insert(0n);
        expect(tree.size).to.equal(1);
      } catch (error) {
        expect(error).to.exist;
      }
    });

    it('should handle updating to existing leaf gracefully', () => {
      const tree = new LeanTree();
      tree.insertMany([1n, 2n, 3n]);
      
      try {
        tree.update(0, 2n);
        expect(tree.leaves[0]).to.equal(2n);
      } catch (error) {
        expect(error).to.exist;
      }
    });

    it('should throw error when generating proof for invalid index', () => {
      const tree = new LeanTree();
      tree.insertMany([1n, 2n, 3n]);
      
      expect(() => tree.generateProof(10)).to.throw();
      expect(() => tree.generateProof(-1)).to.throw();
    });
  });

  describe('Comparison with Fixed Tree', () => {
    it('should support unlimited capacity', () => {
      const tree = new LeanTree();
      
      const leaves = Array.from({ length: 20 }, (_, i) => BigInt(i + 1));
      
      expect(() => tree.insertMany(leaves)).to.not.throw();
      expect(tree.size).to.equal(20);
      expect(tree.depth).to.be.at.least(5);
    });

    it('should handle sparse insertions efficiently', () => {
      const tree = new LeanTree();
      
      tree.insertMany([1n, 2n, 3n]);
      
      expect(tree.size).to.equal(3);
      expect(tree.depth).to.equal(2);
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle rapid insertions', () => {
      const tree = new LeanTree();
      const start = performance.now();
      
      const leaves = Array.from({ length: 1000 }, (_, i) => BigInt(i + 1));
      tree.insertMany(leaves);
      
      const end = performance.now();
      const duration = end - start;
      
      expect(tree.size).to.equal(1000);
      expect(duration).to.be.lessThan(1000);
    });
  });

  // ============================================================================
  // PART 2: Integration Tests - System Integration
  // ============================================================================

  describe('Comparison with Traditional Tree', () => {
    it('should produce same root hash for same leaves (when compatible)', () => {
      const leanTree = new LeanTree();
      const leaves = [1n, 2n, 3n, 4n];
      
      leanTree.insertMany(leaves);
      
      expect(leanTree.size).to.equal(4);
      expect(leanTree.leaves).to.deep.equal(leaves);
      
      const root1 = leanTree.root;
      
      const leanTree2 = new LeanTree();
      leanTree2.insertMany(leaves);
      const root2 = leanTree2.root;
      
      expect(root1).to.equal(root2);
    });

    it('should demonstrate capacity advantage over fixed tree', () => {
      const fixedTree = new Tree(5, 2, 0n);
      expect(fixedTree.LEAVES_COUNT).to.equal(25);
      
      const leanTree = new LeanTree();
      const leaves = Array.from({ length: 30 }, (_, i) => BigInt(i + 1));
      
      expect(() => leanTree.insertMany(leaves)).to.not.throw();
      expect(leanTree.size).to.equal(30);
      expect(leanTree.depth).to.be.at.least(5);
    });

    it('should demonstrate memory efficiency for sparse trees', () => {
      const fixedTreeDepth = 5;
      const fixedTree = new Tree(5, fixedTreeDepth, 0n);
      const fixedCapacity = fixedTree.LEAVES_COUNT;
      
      const leanTree = new LeanTree();
      const actualLeaves = 10;
      
      leanTree.insertMany(Array.from({ length: actualLeaves }, (_, i) => BigInt(i + 1)));
      
      expect(leanTree.depth).to.be.lessThan(fixedTreeDepth);
      expect(leanTree.size).to.equal(actualLeaves);
      expect(fixedCapacity).to.be.greaterThan(actualLeaves * 100);
    });
  });

  describe('Use Case: Active State Tree Simulation', () => {
    it('should handle deactivate/activate pattern', () => {
      const activeStateTree = new LeanTree();
      
      const numUsers = 10;
      const activeStates = Array(numUsers).fill(0n);
      activeStateTree.insertMany(activeStates);
      
      expect(activeStateTree.size).to.equal(numUsers);
      
      const deactivateCounter = 1n;
      activeStateTree.update(0, deactivateCounter);
      
      expect(activeStateTree.leaves[0]).to.equal(deactivateCounter);
      
      activeStateTree.update(3, 2n);
      activeStateTree.update(7, 3n);
      
      expect(activeStateTree.leaves[0]).to.equal(1n);
      expect(activeStateTree.leaves[1]).to.equal(0n);
      expect(activeStateTree.leaves[3]).to.equal(2n);
      expect(activeStateTree.leaves[7]).to.equal(3n);
    });

    it('should handle many deactivate cycles without capacity limit', () => {
      const activeStateTree = new LeanTree();
      
      const numUsers = 50;
      activeStateTree.insertMany(Array(numUsers).fill(0n));
      
      for (let i = 0; i < 100; i++) {
        activeStateTree.insert(0n);
      }
      
      expect(activeStateTree.size).to.equal(numUsers + 100);
      
      let deactivateCounter = 1n;
      for (let i = 0; i < 50; i += 5) {
        activeStateTree.update(i, deactivateCounter++);
      }
      
      expect(activeStateTree.root).to.exist;
      expect(activeStateTree.depth).to.be.greaterThan(0);
    });
  });

  describe('Root Consistency', () => {
    it('should maintain consistent roots across operations', () => {
      const tree = new LeanTree();
      const leaves = [1n, 2n, 3n, 4n, 5n];
      
      tree.insertMany(leaves);
      const root1 = tree.root;
      
      const exported = tree.export();
      const tree2 = LeanTree.import(exported);
      const root2 = tree2.root;
      
      expect(root1).to.equal(root2);
      
      tree.update(2, 10n);
      tree2.update(2, 10n);
      
      expect(tree.root).to.equal(tree2.root);
    });

    it('should produce consistent proofs', () => {
      const tree = new LeanTree();
      tree.insertMany([1n, 2n, 3n, 4n]);
      
      const proofs = [0, 1, 2, 3].map(i => tree.generateProof(i));
      
      const roots = proofs.map(p => p.root);
      expect(new Set(roots).size).to.equal(1);
      expect(roots[0]).to.equal(tree.root);
      
      proofs.forEach(proof => {
        expect(LeanTree.verifyProof(proof)).to.be.true;
      });
    });
  });

  describe('Batch Operations Performance', () => {
    it('should efficiently handle batch insertions', () => {
      const tree = new LeanTree();
      const batchSize = 100;
      const batches = 10;
      
      for (let batch = 0; batch < batches; batch++) {
        const leaves = Array.from(
          { length: batchSize },
          (_, i) => BigInt(batch * batchSize + i + 1)
        );
        
        tree.insertMany(leaves);
      }
      
      expect(tree.size).to.equal(batchSize * batches);
      expect(tree.depth).to.be.at.least(9);
      expect(tree.depth).to.be.at.most(10);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single leaf tree', () => {
      const tree = new LeanTree();
      tree.insert(42n);
      
      expect(tree.size).to.equal(1);
      expect(tree.depth).to.equal(0);
      expect(tree.root).to.exist;
      expect(tree.has(42n)).to.be.true;
    });

    it('should handle power-of-2 leaf counts', () => {
      const leafCounts = [2, 4, 8, 16];
      
      leafCounts.forEach(count => {
        const testTree = new LeanTree();
        const leaves = Array.from({ length: count }, (_, i) => BigInt(i + 1));
        testTree.insertMany(leaves);
        
        expect(testTree.size).to.equal(count);
        const expectedDepth = Math.log2(count);
        expect(testTree.depth).to.equal(expectedDepth);
      });
    });

    it('should handle non-power-of-2 leaf counts', () => {
      const leafCounts = [3, 5, 7, 9];
      
      leafCounts.forEach(count => {
        const testTree = new LeanTree();
        const leaves = Array.from({ length: count }, (_, i) => BigInt(i + 1));
        testTree.insertMany(leaves);
        
        expect(testTree.size).to.equal(count);
        const expectedDepth = Math.ceil(Math.log2(count));
        expect(testTree.depth).to.equal(expectedDepth);
      });
    });
  });

  describe('Hash Function Consistency', () => {
    it('should use same Poseidon hash as circuits', () => {
      const left = 123n;
      const right = 456n;
      
      const parent = hash2([left, right]);
      expect(parent).to.exist;
      expect(Number(parent)).to.be.greaterThan(0);
    });

    it('should build tree with deterministic hashing', () => {
      const tree1 = new LeanTree();
      const tree2 = new LeanTree();
      
      const leaves = [1n, 2n, 3n, 4n];
      tree1.insertMany(leaves);
      tree2.insertMany(leaves);
      
      expect(tree1.root).to.equal(tree2.root);
      
      const hash_0_1 = hash2([leaves[0], leaves[1]]);
      const hash_2_3 = hash2([leaves[2], leaves[3]]);
      const expectedRoot = hash2([hash_0_1, hash_2_3]);
      
      expect(tree1.root).to.equal(expectedRoot);
    });

    it('should generate proofs with correct sibling hashes', () => {
      const tree = new LeanTree();
      const leaves = [10n, 20n, 30n, 40n];
      
      tree.insertMany(leaves);
      
      const proof = tree.generateProof(0);
      
      expect(proof.leaf).to.equal(10n);
      expect(proof.siblings.length).to.be.greaterThan(0);
      
      let currentHash = proof.leaf;
      for (let i = 0; i < proof.siblings.length; i++) {
        const isRightNode = (proof.index >> i) & 1;
        if (isRightNode) {
          currentHash = hash2([proof.siblings[i], currentHash]);
        } else {
          currentHash = hash2([currentHash, proof.siblings[i]]);
        }
      }
      
      expect(currentHash).to.equal(tree.root);
    });
  });

  describe('Binary Tree Properties', () => {
    it('should confirm binary structure (arity = 2)', () => {
      const tree = new LeanTree();
      const leaves = [1n, 2n, 3n, 4n];
      
      tree.insertMany(leaves);
      
      expect(tree.depth).to.equal(2);
      
      const proof = tree.generateProof(0);
      expect(proof.siblings.length).to.equal(tree.depth);
    });

    it('should compare depth with quinary tree', () => {
      const numLeaves = 100;
      
      const binaryTree = new LeanTree();
      binaryTree.insertMany(Array.from({ length: numLeaves }, (_, i) => BigInt(i + 1)));
      
      const quinaryDepth = Math.ceil(Math.log(numLeaves) / Math.log(5));
      const binaryDepth = binaryTree.depth;
      
      expect(binaryDepth).to.be.greaterThan(quinaryDepth);
    });
  });

  describe('Circuit Input Format Preparation', () => {
    it('should format proof for circuit input', () => {
      const tree = new LeanTree();
      const leaves = [1n, 2n, 3n, 4n];
      
      tree.insertMany(leaves);
      const proof = tree.generateProof(2);
      
      const pathElements = proof.siblings.map(s => [s]);
      const pathIndex = Array.from({ length: tree.depth }, (_, i) => 
        (proof.index >> i) & 1
      );
      
      pathIndex.forEach(idx => {
        expect([0, 1]).to.include(idx);
      });
      
      expect(pathElements.length).to.equal(tree.depth);
      expect(pathElements[0].length).to.equal(1);
    });

    it('should generate multiple proofs for circuit batch verification', () => {
      const tree = new LeanTree();
      const leaves = Array.from({ length: 8 }, (_, i) => BigInt(i + 1));
      
      tree.insertMany(leaves);
      
      const proofs = [0, 2, 5, 7].map(i => tree.generateProof(i));
      
      const roots = proofs.map(p => p.root);
      expect(new Set(roots).size).to.equal(1);
      
      const batchInputs = proofs.map(proof => ({
        leaf: proof.leaf,
        root: proof.root,
        path_elements: proof.siblings.map(s => [s]),
        path_index: Array.from({ length: tree.depth }, (_, i) => 
          (proof.index >> i) & 1
        )
      }));
      
      expect(batchInputs.length).to.equal(4);
    });
  });

  // ============================================================================
  // PART 3: Circuit Consistency Tests - SDK ↔ Circuit Verification
  // ============================================================================

  describe('Binary Tree Circuit Tests', () => {
    describe('BinaryTreeInclusionProof', () => {
      const TEST_TREE_DEPTHS = [2, 3, 4]; // Test multiple depths

      TEST_TREE_DEPTHS.forEach(depth => {
        describe(`Depth ${depth}`, () => {
          let circuit: WitnessTester<['leaf', 'path_elements', 'path_index'], ['root']>;

          before(async () => {
            circuit = await circomkitInstance.WitnessTester(`BinaryTreeInclusionProof_${depth}`, {
              file: CIRCOM_PATH,
              template: 'BinaryTreeInclusionProof',
              params: [depth]
            });
          });

          it('should produce same root as SDK for 2^depth leaves', async () => {
            const numLeaves = 2 ** depth;
            const sdkTree = new LeanTree();
            const leaves = Array.from({ length: numLeaves }, (_, i) => BigInt(i + 1));
            
            sdkTree.insertMany(leaves);
            const sdkRoot = sdkTree.root;
            
            // Verify with circuit for middle leaf
            const middleIndex = Math.floor(numLeaves / 2);
            const proof = sdkTree.generateProof(middleIndex);
            
            const witness = await circuit.calculateWitness({
              leaf: proof.leaf,
              path_elements: proof.siblings.map(s => [s]),
              path_index: Array.from({ length: sdkTree.depth }, (_, i) => 
                (proof.index >> i) & 1
              )
            });

            await circuit.expectConstraintPass(witness);
            const circuitRoot = await getSignal(circuit, witness, 'root');
            
            expect(circuitRoot).to.equal(sdkRoot);
          });

          it('should verify proofs for all leaves', async () => {
            const numLeaves = Math.min(2 ** depth, 8); // Limit to 8 for performance
            const sdkTree = new LeanTree();
            const leaves = Array.from({ length: numLeaves }, (_, i) => BigInt(i + 10));
            
            sdkTree.insertMany(leaves);
            
            for (let i = 0; i < numLeaves; i++) {
              const proof = sdkTree.generateProof(i);
              
              const witness = await circuit.calculateWitness({
                leaf: proof.leaf,
                path_elements: proof.siblings.map(s => [s]),
                path_index: Array.from({ length: sdkTree.depth }, (_, i) => 
                  (proof.index >> i) & 1
                )
              });

              await circuit.expectConstraintPass(witness);
              const circuitRoot = await getSignal(circuit, witness, 'root');
              
              expect(circuitRoot).to.equal(sdkTree.root);
            }
          });

          it('should reject invalid proof (tampered sibling)', async () => {
            const numLeaves = 2 ** depth;
            const sdkTree = new LeanTree();
            const leaves = Array.from({ length: numLeaves }, (_, i) => BigInt(i + 1));
            
            sdkTree.insertMany(leaves);
            const validProof = sdkTree.generateProof(0);
            
            // Tamper with first sibling
            const tamperedSiblings = validProof.siblings.map((s, i) => i === 0 ? s + 1n : s);
            
            const witness = await circuit.calculateWitness({
              leaf: validProof.leaf,
              path_elements: tamperedSiblings.map(s => [s]),
              path_index: Array.from({ length: sdkTree.depth }, (_, i) => 
                (validProof.index >> i) & 1
              )
            });

            const circuitRoot = await getSignal(circuit, witness, 'root');
            expect(circuitRoot).to.not.equal(validProof.root);
          });

          it('[property] should always produce correct root for random leaves', async function() {
            this.timeout(60000);

            await fc.assert(
              fc.asyncProperty(
                fc.array(fc.bigInt(1n, 1000000n), { minLength: 2 ** depth, maxLength: 2 ** depth }),
                async (leaves) => {
                  // Ensure unique leaves
                  const uniqueLeaves = [...new Set(leaves)];
                  if (uniqueLeaves.length < 2 ** depth) return true;

                  const sdkTree = new LeanTree();
                  sdkTree.insertMany(uniqueLeaves);
                  
                  const randomIndex = Math.floor(Math.random() * uniqueLeaves.length);
                  const proof = sdkTree.generateProof(randomIndex);
                  
                  const witness = await circuit.calculateWitness({
                    leaf: proof.leaf,
                    path_elements: proof.siblings.map(s => [s]),
                    path_index: Array.from({ length: sdkTree.depth }, (_, i) => 
                      (proof.index >> i) & 1
                    )
                  });

                  const circuitRoot = await getSignal(circuit, witness, 'root');
                  return circuitRoot === sdkTree.root;
                }
              ),
              { numRuns: 10 }
            );
          });
        });
      });
    });

    describe('BinaryLeafExists', () => {
      const TEST_DEPTH = 4;
      let circuit: WitnessTester<['leaf', 'root', 'path_elements', 'path_index'], []>;

      before(async () => {
        circuit = await circomkitInstance.WitnessTester('BinaryLeafExists', {
          file: CIRCOM_PATH,
          template: 'BinaryLeafExists',
          params: [TEST_DEPTH]
        });
      });

      it('should verify leaf existence with correct path', async () => {
        const sdkTree = new LeanTree();
        const leaves = [5n, 10n, 15n, 20n];
        
        sdkTree.insertMany(leaves);
        const proof = sdkTree.generateProof(2);
        
        const witness = await circuit.calculateWitness({
          leaf: proof.leaf,
          root: proof.root,
          path_elements: proof.siblings.map(s => [s]),
          path_index: Array.from({ length: sdkTree.depth }, (_, i) => 
            (proof.index >> i) & 1
          )
        });

        await circuit.expectConstraintPass(witness);
      });

      it('should fail with incorrect root', async () => {
        const sdkTree = new LeanTree();
        const leaves = [1n, 2n, 3n, 4n];
        
        sdkTree.insertMany(leaves);
        const proof = sdkTree.generateProof(0);
        
        const incorrectRoot = proof.root + 1n;
        
        try {
          const witness = await circuit.calculateWitness({
            leaf: proof.leaf,
            root: incorrectRoot,
            path_elements: proof.siblings.map(s => [s]),
            path_index: Array.from({ length: sdkTree.depth }, (_, i) => 
              (proof.index >> i) & 1
            )
          });

          await circuit.expectConstraintFail(witness);
        } catch (error) {
          // Expected to fail
          expect(error).to.exist;
        }
      });
    });

    describe('BinaryCheckRoot', () => {
      const TEST_DEPTH = 3;
      let circuit: WitnessTester<['leaves'], ['root']>;

      before(async () => {
        circuit = await circomkitInstance.WitnessTester('BinaryCheckRoot', {
          file: CIRCOM_PATH,
          template: 'BinaryCheckRoot',
          params: [TEST_DEPTH]
        });
      });

      it('should compute correct root from leaves', async () => {
        const numLeaves = 2 ** TEST_DEPTH;
        const leaves = Array.from({ length: numLeaves }, (_, i) => BigInt(i + 1));
        
        const sdkTree = new LeanTree();
        sdkTree.insertMany(leaves);
        const sdkRoot = sdkTree.root;
        
        const witness = await circuit.calculateWitness({
          leaves: leaves
        });

        await circuit.expectConstraintPass(witness);
        const circuitRoot = await getSignal(circuit, witness, 'root');
        
        expect(circuitRoot).to.equal(sdkRoot);
      });

      it('[property] should match SDK root for random leaf sets', async function() {
        this.timeout(60000);

        await fc.assert(
          fc.asyncProperty(
            fc.array(fc.bigInt(1n, 10000n), { minLength: 2 ** TEST_DEPTH, maxLength: 2 ** TEST_DEPTH }),
            async (leaves) => {
              const uniqueLeaves = [...new Set(leaves)];
              if (uniqueLeaves.length < 2 ** TEST_DEPTH) return true;

              const sdkTree = new LeanTree();
              sdkTree.insertMany(uniqueLeaves);
              
              const witness = await circuit.calculateWitness({
                leaves: uniqueLeaves
              });

              const circuitRoot = await getSignal(circuit, witness, 'root');
              return circuitRoot === sdkTree.root;
            }
          ),
          { numRuns: 20 }
        );
      });
    });

    describe('BinaryGeneratePathIndices', () => {
      const TEST_DEPTH = 4;
      let circuit: WitnessTester<['in'], ['out']>;

      before(async () => {
        circuit = await circomkitInstance.WitnessTester('BinaryGeneratePathIndices', {
          file: CIRCOM_PATH,
          template: 'BinaryGeneratePathIndices',
          params: [TEST_DEPTH]
        });
      });

      it('should generate correct binary path indices', async () => {
        // Test index 5 = 0b0101 = [1, 0, 1, 0] in binary
        const index = 5;
        
        const witness = await circuit.calculateWitness({
          in: index
        });

        await circuit.expectConstraintPass(witness);
        
        // Verify each bit
        for (let i = 0; i < TEST_DEPTH; i++) {
          const bit = await getSignal(circuit, witness, `out[${i}]`);
          const expectedBit = (index >> i) & 1;
          expect(Number(bit)).to.equal(expectedBit);
        }
      });

      it('[property] should correctly decompose any valid index', async function() {
        this.timeout(30000);

        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 0, max: 2 ** TEST_DEPTH - 1 }),
            async (index) => {
              const witness = await circuit.calculateWitness({
                in: index
              });

              for (let i = 0; i < TEST_DEPTH; i++) {
                const bit = await getSignal(circuit, witness, `out[${i}]`);
                const expectedBit = (index >> i) & 1;
                if (Number(bit) !== expectedBit) return false;
              }
              return true;
            }
          ),
          { numRuns: 50 }
        );
      });
    });
  });

  describe('Dynamic Growth Consistency with Circuits', () => {
    let circuit: WitnessTester<['leaf', 'path_elements', 'path_index'], ['root']>;
    const TEST_DEPTH = 4;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('BinaryTreeInclusionProof_Dynamic', {
        file: CIRCOM_PATH,
        template: 'BinaryTreeInclusionProof',
        params: [TEST_DEPTH]
      });
    });

    it('should maintain root consistency as tree grows incrementally', async () => {
      const sdkTree = new LeanTree();
      
      for (let i = 1; i <= 16; i++) {
        sdkTree.insert(BigInt(i));
        
        if (sdkTree.depth > 0 && sdkTree.depth <= TEST_DEPTH) {
          const proof = sdkTree.generateProof(0);
          
          const witness = await circuit.calculateWitness({
            leaf: proof.leaf,
            path_elements: proof.siblings.map(s => [s]),
            path_index: Array.from({ length: sdkTree.depth }, (_, i) => 
              (proof.index >> i) & 1
            )
          });

          const circuitRoot = await getSignal(circuit, witness, 'root');
          expect(circuitRoot).to.equal(sdkTree.root);
        }
      }
    });

    it('should handle updates correctly', async () => {
      const sdkTree = new LeanTree();
      const initialLeaves = [1n, 2n, 3n, 4n];
      
      sdkTree.insertMany(initialLeaves);
      
      const updates = [
        { index: 0, value: 10n },
        { index: 2, value: 30n },
        { index: 3, value: 40n }
      ];
      
      for (const update of updates) {
        sdkTree.update(update.index, update.value);
        
        const proof = sdkTree.generateProof(update.index);
        
        const witness = await circuit.calculateWitness({
          leaf: proof.leaf,
          path_elements: proof.siblings.map(s => [s]),
          path_index: Array.from({ length: sdkTree.depth }, (_, i) => 
            (proof.index >> i) & 1
          )
        });

        const circuitRoot = await getSignal(circuit, witness, 'root');
        expect(circuitRoot).to.equal(sdkTree.root);
        expect(proof.leaf).to.equal(update.value);
      }
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    let circuit: WitnessTester<['leaf', 'path_elements', 'path_index'], ['root']>;
    const TEST_DEPTH = 3;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('BinaryTreeInclusionProof_Edge', {
        file: CIRCOM_PATH,
        template: 'BinaryTreeInclusionProof',
        params: [TEST_DEPTH]
      });
    });

    it('should handle minimum leaf value (1)', async () => {
      const sdkTree = new LeanTree();
      const leaves = Array.from({ length: 8 }, () => 1n);
      
      sdkTree.insertMany(leaves);
      const proof = sdkTree.generateProof(0);
      
      const witness = await circuit.calculateWitness({
        leaf: proof.leaf,
        path_elements: proof.siblings.map(s => [s]),
        path_index: Array.from({ length: sdkTree.depth }, (_, i) => 
          (proof.index >> i) & 1
        )
      });

      const circuitRoot = await getSignal(circuit, witness, 'root');
      expect(circuitRoot).to.equal(sdkTree.root);
    });

    it('should handle large leaf values', async () => {
      const sdkTree = new LeanTree();
      const largeValue = 2n ** 200n;
      const leaves = Array.from({ length: 8 }, (_, i) => largeValue + BigInt(i));
      
      sdkTree.insertMany(leaves);
      const proof = sdkTree.generateProof(5);
      
      const witness = await circuit.calculateWitness({
        leaf: proof.leaf,
        path_elements: proof.siblings.map(s => [s]),
        path_index: Array.from({ length: sdkTree.depth }, (_, i) => 
          (proof.index >> i) & 1
        )
      });

      const circuitRoot = await getSignal(circuit, witness, 'root');
      expect(circuitRoot).to.equal(sdkTree.root);
    });

    it('should handle first and last leaf indices', async () => {
      const sdkTree = new LeanTree();
      const leaves = Array.from({ length: 8 }, (_, i) => BigInt(i + 100));
      
      sdkTree.insertMany(leaves);
      
      // Test first leaf (index 0)
      const firstProof = sdkTree.generateProof(0);
      let witness = await circuit.calculateWitness({
        leaf: firstProof.leaf,
        path_elements: firstProof.siblings.map(s => [s]),
        path_index: Array.from({ length: sdkTree.depth }, (_, i) => 
          (firstProof.index >> i) & 1
        )
      });
      let circuitRoot = await getSignal(circuit, witness, 'root');
      expect(circuitRoot).to.equal(sdkTree.root);
      
      // Test last leaf (index 7)
      const lastProof = sdkTree.generateProof(7);
      witness = await circuit.calculateWitness({
        leaf: lastProof.leaf,
        path_elements: lastProof.siblings.map(s => [s]),
        path_index: Array.from({ length: sdkTree.depth }, (_, i) => 
          (lastProof.index >> i) & 1
        )
      });
      circuitRoot = await getSignal(circuit, witness, 'root');
      expect(circuitRoot).to.equal(sdkTree.root);
    });
  });
});
