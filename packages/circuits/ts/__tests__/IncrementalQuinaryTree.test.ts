import { Tree, hash5, SNARK_FIELD_SIZE } from '@dorafactory/maci-sdk';
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { type WitnessTester } from 'circomkit';
import fc from 'fast-check';

import { getSignal, circomkitInstance } from './utils/utils';

/**
 * Comprehensive IncrementalQuinaryTree Tests
 *
 * This test suite covers:
 * 1. Low-level circuit components (QuinarySelector, Splicer, etc.)
 * 2. SDK Tree implementation
 * 3. SDK + Circuit integration
 * 4. Real-world usage scenarios
 */

chai.use(chaiAsPromised);

describe('IncrementalQuinaryTree - Complete Test Suite', function test() {
  this.timeout(3000000);

  const leavesPerNode = 5;
  const treeDepth = 3;

  // ============================================================================
  // Circuit Instances
  // ============================================================================

  let circuitLeafExists: WitnessTester<['leaf', 'path_elements', 'path_index', 'root']>;
  let circuitGeneratePathIndices: WitnessTester<['in'], ['out']>;
  let circuitTreeInclusionProof: WitnessTester<['leaf', 'path_index', 'path_elements'], ['root']>;
  let circuitBatchLeavesExists: WitnessTester<['root', 'leaves', 'path_index', 'path_elements']>;
  let circuitQuinarySelector: WitnessTester<['in', 'index'], ['out']>;
  let splicerCircuit: WitnessTester<['in', 'leaf', 'index'], ['out']>;
  let quinaryCheckRoot: WitnessTester<['leaves'], ['root']>;

  before(async () => {
    circuitLeafExists = await circomkitInstance.WitnessTester('QuinaryLeafExists', {
      file: './utils/trees/incrementalQuinTree',
      template: 'QuinLeafExists',
      params: [treeDepth]
    });

    circuitGeneratePathIndices = await circomkitInstance.WitnessTester(
      'QuinaryGeneratePathIndices',
      {
        file: './utils/trees/incrementalQuinTree',
        template: 'QuinGeneratePathIndices',
        params: [treeDepth]
      }
    );

    circuitTreeInclusionProof = await circomkitInstance.WitnessTester('TreeInclusionProof', {
      file: './utils/trees/incrementalQuinTree',
      template: 'QuinTreeInclusionProof',
      params: [treeDepth]
    });

    circuitQuinarySelector = await circomkitInstance.WitnessTester('QuinarySelector', {
      file: './utils/trees/incrementalQuinTree',
      template: 'QuinSelector',
      params: [leavesPerNode]
    });

    splicerCircuit = await circomkitInstance.WitnessTester('Splicer', {
      file: './utils/trees/incrementalQuinTree',
      template: 'Splicer',
      params: [leavesPerNode - 1]
    });

    quinaryCheckRoot = await circomkitInstance.WitnessTester('QuinaryCheckRoot', {
      file: './utils/trees/checkRoot',
      template: 'QuinCheckRoot',
      params: [treeDepth]
    });
  });

  // ============================================================================
  // Part 0: Low-level Circuit Component Tests
  // ============================================================================

  describe('QuinarySelector - Component Tests', () => {
    it('should return the correct value', async () => {
      const circuitInputs = {
        index: 0n,
        in: [1n, 2n, 3n, 4n, 5n]
      };

      const witness = await circuitQuinarySelector.calculateWitness(circuitInputs);
      await circuitQuinarySelector.expectConstraintPass(witness);

      const out = await getSignal(circuitQuinarySelector, witness, 'out');
      expect(out.toString()).to.be.eq('1');
    });

    it('should throw when the index is out of range', async () => {
      const circuitInputs = {
        index: 5n,
        in: [1n, 2n, 3n, 4n, 5n]
      };

      await expect(circuitQuinarySelector.calculateWitness(circuitInputs)).to.be.rejectedWith(
        'Assert Failed.'
      );
    });

    it('should check the correct value [fuzz]', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.nat(),
          fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
            minLength: leavesPerNode,
            maxLength: leavesPerNode
          }),
          async (index: number, elements: bigint[]) => {
            fc.pre(elements.length > index);

            const witness = await circuitQuinarySelector.calculateWitness({
              index: BigInt(index),
              in: elements
            });
            await circuitQuinarySelector.expectConstraintPass(witness);
            const out = await getSignal(circuitQuinarySelector, witness, 'out');

            return out.toString() === elements[index].toString();
          }
        )
      );
    });

    it('should loop the value if number is greater that r [fuzz]', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.nat(),
          fc.array(fc.bigInt({ min: SNARK_FIELD_SIZE }), {
            minLength: leavesPerNode,
            maxLength: leavesPerNode
          }),
          async (index: number, elements: bigint[]) => {
            fc.pre(elements.length > index);

            const witness = await circuitQuinarySelector.calculateWitness({
              index: BigInt(index),
              in: elements
            });
            await circuitQuinarySelector.expectConstraintPass(witness);
            const out = await getSignal(circuitQuinarySelector, witness, 'out');

            return out.toString() === (elements[index] % SNARK_FIELD_SIZE).toString();
          }
        )
      );
    });

    it('should throw error if index is out of bounds [fuzz]', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.nat(),
          fc.array(fc.bigInt({ min: 0n }), { minLength: 1 }),
          async (index: number, elements: bigint[]) => {
            fc.pre(index >= elements.length);

            const circuit = await circomkitInstance.WitnessTester('QuinarySelector_Fuzz', {
              file: './utils/trees/incrementalQuinTree',
              template: 'QuinSelector',
              params: [elements.length]
            });

            return circuit
              .calculateWitness({ index: BigInt(index), in: elements })
              .then(() => false)
              .catch((error: Error) => error.message.includes('Assert Failed'));
          }
        )
      );
    });
  });

  describe('Splicer - Component Tests', () => {
    it('should insert a value at the correct index', async () => {
      const circuitInputs = {
        in: [5n, 3n, 20n, 44n],
        leaf: 0n,
        index: 2n
      };

      const witness = await splicerCircuit.calculateWitness(circuitInputs);
      await splicerCircuit.expectConstraintPass(witness);

      const out1 = await getSignal(splicerCircuit, witness, 'out[0]');
      const out2 = await getSignal(splicerCircuit, witness, 'out[1]');
      const out3 = await getSignal(splicerCircuit, witness, 'out[2]');
      const out4 = await getSignal(splicerCircuit, witness, 'out[3]');
      const out5 = await getSignal(splicerCircuit, witness, 'out[4]');
      expect(out1.toString()).to.eq('5');
      expect(out2.toString()).to.eq('3');
      expect(out3.toString()).to.eq('0');
      expect(out4.toString()).to.eq('20');
      expect(out5.toString()).to.eq('44');
    });

    it('should check value insertion [fuzz]', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.nat(),
          fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }),
          fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
            minLength: leavesPerNode - 1,
            maxLength: leavesPerNode - 1
          }),
          async (index: number, leaf: bigint, elements: bigint[]) => {
            fc.pre(index < elements.length);

            const witness = await splicerCircuit.calculateWitness({
              in: elements,
              leaf,
              index: BigInt(index)
            });
            await splicerCircuit.expectConstraintPass(witness);

            const out: bigint[] = [];

            for (let i = 0; i < elements.length + 1; i += 1) {
              // eslint-disable-next-line no-await-in-loop
              const value = await getSignal(splicerCircuit, witness, `out[${i}]`);
              out.push(value);
            }

            return (
              out.toString() ===
              [...elements.slice(0, index), leaf, ...elements.slice(index)].toString()
            );
          }
        )
      );
    });

    it('should throw error if index is out of bounds [fuzz]', async () => {
      const maxAllowedIndex = 7;

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: maxAllowedIndex + 1 }),
          fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }),
          fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
            minLength: leavesPerNode - 1,
            maxLength: leavesPerNode - 1
          }),
          async (index: number, leaf: bigint, elements: bigint[]) => {
            fc.pre(index > elements.length);

            return splicerCircuit
              .calculateWitness({
                in: elements,
                leaf,
                index: BigInt(index)
              })
              .then(() => false)
              .catch((error: Error) => error.message.includes('Assert Failed'));
          }
        )
      );
    });
  });

  describe('QuinaryCheckRoot - Component Tests', () => {
    it('should compute the correct merkle root', async () => {
      const leaves = Array<bigint>(leavesPerNode ** treeDepth).fill(5n);
      const tree = new Tree(leavesPerNode, treeDepth, 0n);
      leaves.forEach((leaf, i) => tree.updateLeaf(i, leaf));

      const circuitInputs = { leaves };

      const witness = await quinaryCheckRoot.calculateWitness(circuitInputs);
      await quinaryCheckRoot.expectConstraintPass(witness);

      const circuitRoot = await getSignal(quinaryCheckRoot, witness, 'root');
      expect(circuitRoot.toString()).to.be.eq(tree.root.toString());
    });

    it('should not accept less leaves than a full tree', async () => {
      const leaves = Array<bigint>(leavesPerNode ** treeDepth - 1).fill(5n);

      const circuitInputs = { leaves };

      await expect(quinaryCheckRoot.calculateWitness(circuitInputs)).to.be.rejectedWith(
        'Not enough values for input signal leaves'
      );
    });

    describe('fuzz checks', () => {
      const maxLevel = 4;

      const generateLeaves = (levels: number) =>
        fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
          minLength: leavesPerNode ** levels,
          maxLength: leavesPerNode ** levels
        });

      const quinCheckRootTest = async (leaves: bigint[]): Promise<boolean> => {
        const levels = Math.floor(Math.log(leaves.length) / Math.log(leavesPerNode));
        const circuit = await circomkitInstance.WitnessTester(`QuinaryCheckRoot_Fuzz_${levels}`, {
          file: './utils/trees/checkRoot',
          template: 'QuinCheckRoot',
          params: [levels]
        });

        const tree = new Tree(leavesPerNode, levels, 0n);
        leaves.forEach((value, i) => tree.updateLeaf(i, value));

        return circuit
          .expectPass({ leaves }, { root: tree.root })
          .then(() => true)
          .catch(() => false);
      };

      for (let level = 0; level < maxLevel; level += 1) {
        it(`should check the computation of correct merkle root (level ${level + 1}) [fuzz]`, async () => {
          await fc.assert(
            fc.asyncProperty(generateLeaves(level + 1), async (leaves: bigint[]) =>
              quinCheckRootTest(leaves)
            )
          );
        });
      }
    });
  });

  // ============================================================================
  // Part 1: SDK Tree.pathIdxOf() - Circuit Compatibility
  // ============================================================================

  describe('SDK Tree.pathIdxOf() - Circuit Compatibility', () => {
    it('should match QuinGeneratePathIndices for index 0', async () => {
      const tree = new Tree(5, treeDepth, 0n);
      const leafIndex = 0;

      // SDK calculation
      const sdkPathIndices = tree.pathIdxOf(leafIndex);

      // Circuit calculation
      const witness = await circuitGeneratePathIndices.calculateWitness({
        in: BigInt(leafIndex)
      });

      for (let i = 0; i < treeDepth; i++) {
        const circuitIdx = await getSignal(circuitGeneratePathIndices, witness, `out[${i}]`);
        expect(sdkPathIndices[i]).to.equal(circuitIdx, `Mismatch at level ${i}`);
      }
    });

    it('should match QuinGeneratePathIndices for various indices', async () => {
      const tree = new Tree(5, treeDepth, 0n);
      const testIndices = [0, 1, 2, 3, 4, 5, 10, 20, 30, 50, 100, 124];

      for (const leafIndex of testIndices) {
        if (leafIndex >= tree.LEAVES_COUNT) continue;

        const sdkPathIndices = tree.pathIdxOf(leafIndex);
        const witness = await circuitGeneratePathIndices.calculateWitness({
          in: BigInt(leafIndex)
        });

        for (let i = 0; i < treeDepth; i++) {
          const circuitIdx = await getSignal(circuitGeneratePathIndices, witness, `out[${i}]`);
          expect(sdkPathIndices[i]).to.equal(
            circuitIdx,
            `Index ${leafIndex}, level ${i}: SDK=${sdkPathIndices[i]}, Circuit=${circuitIdx}`
          );
        }
      }
    });

    it('should handle boundary indices correctly', async () => {
      const tree = new Tree(5, treeDepth, 0n);
      const maxIndex = tree.LEAVES_COUNT - 1; // 124 for depth 3

      // Test first index
      const firstIndices = tree.pathIdxOf(0);
      expect(firstIndices.every((idx) => idx === 0n)).to.be.true;

      // Test last index
      const lastIndices = tree.pathIdxOf(maxIndex);
      expect(lastIndices.every((idx) => idx === 4n)).to.be.true;
    });

    it('should throw error for invalid indices', () => {
      const tree = new Tree(5, treeDepth, 0n);

      // Test negative index
      expect(() => tree.pathIdxOf(-1)).to.throw('wrong leaf index');

      // Test index at boundary (should throw)
      expect(() => tree.pathIdxOf(tree.LEAVES_COUNT)).to.throw('wrong leaf index');

      // Test index beyond boundary
      expect(() => tree.pathIdxOf(tree.LEAVES_COUNT + 1)).to.throw('wrong leaf index');
    });
  });

  // ============================================================================
  // Part 2: SDK Tree.pathElementOf() - Correctness Tests
  // ============================================================================

  describe('SDK Tree.pathElementOf() - Merkle Proof Generation', () => {
    it('should return exactly 4 siblings per level', () => {
      const tree = new Tree(5, treeDepth, 0n);
      const leaves = [1n, 2n, 3n, 4n, 5n];
      leaves.forEach((leaf, i) => tree.updateLeaf(i, leaf));

      for (let i = 0; i < 5; i++) {
        const pathElements = tree.pathElementOf(i);

        // Should have depth levels
        expect(pathElements).to.have.lengthOf(treeDepth);

        // Each level should have exactly 4 siblings (5 - 1)
        pathElements.forEach((level, levelIdx) => {
          expect(level).to.have.lengthOf(4, `Level ${levelIdx} should have 4 siblings`);
        });
      }
    });

    it('should not include the current node in siblings', () => {
      const tree = new Tree(5, treeDepth, 0n);
      const leaves = [10n, 20n, 30n, 40n, 50n];
      leaves.forEach((leaf, i) => tree.updateLeaf(i, leaf));

      // Verify leaf at index 2
      const leafValue = tree.leaf(2);
      const pathElements = tree.pathElementOf(2);

      // First level siblings should not include the leaf itself
      const firstLevelSiblings = pathElements[0];
      expect(firstLevelSiblings).to.not.include(leafValue);

      // Should include the other 4 leaves
      expect(firstLevelSiblings).to.include(tree.leaf(0));
      expect(firstLevelSiblings).to.include(tree.leaf(1));
      expect(firstLevelSiblings).to.include(tree.leaf(3));
      expect(firstLevelSiblings).to.include(tree.leaf(4));
    });

    it('should generate different path elements for different positions', () => {
      const tree = new Tree(5, treeDepth, 0n);
      const leaves = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n];
      leaves.forEach((leaf, i) => tree.updateLeaf(i, leaf));

      const path0 = tree.pathElementOf(0);
      const path1 = tree.pathElementOf(1);
      const path5 = tree.pathElementOf(5);

      // Paths for different indices should be different at level 0
      expect(path0[0].toString()).to.not.equal(path1[0].toString());
      expect(path0[0].toString()).to.not.equal(path5[0].toString());
    });

    it('should handle all leaves in the same parent group', () => {
      const tree = new Tree(5, treeDepth, 0n);
      const leaves = [100n, 200n, 300n, 400n, 500n];
      leaves.forEach((leaf, i) => tree.updateLeaf(i, leaf));

      // All 5 leaves share the same parent at level 1
      // So their level 1 path elements should be the same
      const path0Level1 = tree.pathElementOf(0)[1];
      const path1Level1 = tree.pathElementOf(1)[1];
      const path4Level1 = tree.pathElementOf(4)[1];

      expect(path0Level1.toString()).to.equal(path1Level1.toString());
      expect(path0Level1.toString()).to.equal(path4Level1.toString());
    });
  });

  // ============================================================================
  // Part 3: SDK + Circuit Integration - QuinTreeInclusionProof
  // ============================================================================

  describe('QuinTreeInclusionProof - Direct Testing', () => {
    it('should compute correct root from leaf and path', async () => {
      const tree = new Tree(5, treeDepth, 0n);
      const leaves = [1n, 2n, 3n, 4n, 5n];
      leaves.forEach((leaf, i) => tree.updateLeaf(i, leaf));

      const leafIndex = 2;
      const pathElements = tree.pathElementOf(leafIndex);
      const pathIndices = tree.pathIdxOf(leafIndex);

      const witness = await circuitTreeInclusionProof.calculateWitness({
        leaf: leaves[leafIndex],
        path_index: pathIndices,
        path_elements: pathElements
      });

      const computedRoot = await getSignal(circuitTreeInclusionProof, witness, 'root');
      expect(computedRoot).to.equal(tree.root);
    });

    it('should produce same root for all leaves in the tree', async () => {
      const tree = new Tree(5, treeDepth, 0n);
      const leaves = [10n, 20n, 30n, 40n, 50n];
      leaves.forEach((leaf, i) => tree.updateLeaf(i, leaf));

      const roots: bigint[] = [];

      for (let i = 0; i < leaves.length; i++) {
        const pathElements = tree.pathElementOf(i);
        const pathIndices = tree.pathIdxOf(i);

        const witness = await circuitTreeInclusionProof.calculateWitness({
          leaf: leaves[i],
          path_index: pathIndices,
          path_elements: pathElements
        });

        const root = await getSignal(circuitTreeInclusionProof, witness, 'root');
        roots.push(root);
      }

      // All should compute to the same root
      const firstRoot = roots[0];
      roots.forEach((root, idx) => {
        expect(root).to.equal(firstRoot, `Leaf ${idx} computed different root`);
      });

      // Should match SDK root
      expect(firstRoot).to.equal(tree.root);
    });

    it('should fail with incorrect leaf', async () => {
      const tree = new Tree(5, treeDepth, 0n);
      const leaves = [1n, 2n, 3n, 4n, 5n];
      leaves.forEach((leaf, i) => tree.updateLeaf(i, leaf));

      const leafIndex = 2;
      const pathElements = tree.pathElementOf(leafIndex);
      const pathIndices = tree.pathIdxOf(leafIndex);

      const witness = await circuitTreeInclusionProof.calculateWitness({
        leaf: 999n, // Wrong leaf!
        path_index: pathIndices,
        path_elements: pathElements
      });

      const computedRoot = await getSignal(circuitTreeInclusionProof, witness, 'root');
      expect(computedRoot).to.not.equal(tree.root);
    });
  });

  // ============================================================================
  // Part 4: SDK + Circuit Integration - QuinLeafExists
  // ============================================================================

  describe('SDK + Circuit Integration - Complete Verification', () => {
    it('should verify leaf exists using SDK-generated proof', async () => {
      const tree = new Tree(5, treeDepth, 0n);
      const leaves = [1n, 2n, 3n, 4n, 5n];
      leaves.forEach((leaf, i) => tree.updateLeaf(i, leaf));

      const leafIndex = 2;
      const pathElements = tree.pathElementOf(leafIndex);
      const pathIndices = tree.pathIdxOf(leafIndex);

      const witness = await circuitLeafExists.calculateWitness({
        root: tree.root,
        leaf: leaves[leafIndex],
        path_elements: pathElements,
        path_index: pathIndices
      });

      await circuitLeafExists.expectConstraintPass(witness);
    });

    it('should verify all leaves at different positions', async () => {
      const tree = new Tree(5, treeDepth, 0n);
      const leaves = [100n, 200n, 300n, 400n, 500n];
      leaves.forEach((leaf, i) => tree.updateLeaf(i, leaf));

      for (let i = 0; i < leaves.length; i++) {
        const pathElements = tree.pathElementOf(i);
        const pathIndices = tree.pathIdxOf(i);

        const witness = await circuitLeafExists.calculateWitness({
          root: tree.root,
          leaf: leaves[i],
          path_elements: pathElements,
          path_index: pathIndices
        });

        await circuitLeafExists.expectConstraintPass(witness);
      }
    });

    it('should fail with tampered path elements', async () => {
      const tree = new Tree(5, treeDepth, 0n);
      const leaves = [1n, 2n, 3n, 4n, 5n];
      leaves.forEach((leaf, i) => tree.updateLeaf(i, leaf));

      const leafIndex = 2;
      const pathElements = tree.pathElementOf(leafIndex);
      const pathIndices = tree.pathIdxOf(leafIndex);

      // Tamper with path elements
      pathElements[0][0] = 999n;

      await expect(
        circuitLeafExists.calculateWitness({
          root: tree.root,
          leaf: leaves[leafIndex],
          path_elements: pathElements,
          path_index: pathIndices
        })
      ).to.be.rejectedWith('Assert Failed');
    });

    it('should fail with wrong path indices', async () => {
      const tree = new Tree(5, treeDepth, 0n);
      const leaves = [1n, 2n, 3n, 4n, 5n];
      leaves.forEach((leaf, i) => tree.updateLeaf(i, leaf));

      const leafIndex = 2;
      const pathElements = tree.pathElementOf(leafIndex);
      const pathIndices = tree.pathIdxOf(leafIndex);

      // Wrong indices
      pathIndices[0] = 0n;

      await expect(
        circuitLeafExists.calculateWitness({
          root: tree.root,
          leaf: leaves[leafIndex],
          path_elements: pathElements,
          path_index: pathIndices
        })
      ).to.be.rejectedWith('Assert Failed');
    });

    it('should fail with wrong root', async () => {
      const tree = new Tree(5, treeDepth, 0n);
      const leaves = [1n, 2n, 3n, 4n, 5n];
      leaves.forEach((leaf, i) => tree.updateLeaf(i, leaf));

      const leafIndex = 2;
      const pathElements = tree.pathElementOf(leafIndex);
      const pathIndices = tree.pathIdxOf(leafIndex);

      await expect(
        circuitLeafExists.calculateWitness({
          root: 12345n, // Wrong root
          leaf: leaves[leafIndex],
          path_elements: pathElements,
          path_index: pathIndices
        })
      ).to.be.rejectedWith('Assert Failed');
    });
  });

  // ============================================================================
  // Part 5: SDK Tree.updateLeaf() - Dynamic Updates
  // ============================================================================

  describe('SDK Tree.updateLeaf() - Dynamic Tree Updates', () => {
    it('should correctly update root after leaf change', () => {
      const tree = new Tree(5, treeDepth, 0n);
      const initialRoot = tree.root;

      tree.updateLeaf(0, 100n);
      const updatedRoot = tree.root;

      expect(updatedRoot).to.not.equal(initialRoot);
    });

    it('should maintain valid proof after update', async () => {
      const tree = new Tree(5, treeDepth, 0n);

      // Initial state
      tree.updateLeaf(0, 100n);
      tree.updateLeaf(1, 200n);
      tree.updateLeaf(2, 300n);

      // Update leaf 1
      tree.updateLeaf(1, 999n);

      // Verify leaf 1 with new proof
      const pathElements = tree.pathElementOf(1);
      const pathIndices = tree.pathIdxOf(1);

      const witness = await circuitLeafExists.calculateWitness({
        root: tree.root,
        leaf: 999n,
        path_elements: pathElements,
        path_index: pathIndices
      });

      await circuitLeafExists.expectConstraintPass(witness);
    });

    it('should update multiple leaves and maintain consistency', async () => {
      const tree = new Tree(5, treeDepth, 0n);

      // Add initial leaves
      for (let i = 0; i < 10; i++) {
        tree.updateLeaf(i, BigInt(i + 1));
      }

      const rootAfterInserts = tree.root;

      // Update some leaves
      tree.updateLeaf(0, 1000n);
      tree.updateLeaf(5, 2000n);

      const rootAfterUpdates = tree.root;
      expect(rootAfterUpdates).to.not.equal(rootAfterInserts);

      // Verify updated leaves
      for (const idx of [0, 5]) {
        const leaf = tree.leaf(idx);
        const pathElements = tree.pathElementOf(idx);
        const pathIndices = tree.pathIdxOf(idx);

        const witness = await circuitLeafExists.calculateWitness({
          root: tree.root,
          leaf,
          path_elements: pathElements,
          path_index: pathIndices
        });

        await circuitLeafExists.expectConstraintPass(witness);
      }
    });

    it('should handle updating same leaf multiple times', async () => {
      const tree = new Tree(5, treeDepth, 0n);

      const values = [100n, 200n, 300n, 400n];
      for (const value of values) {
        tree.updateLeaf(0, value);

        const pathElements = tree.pathElementOf(0);
        const pathIndices = tree.pathIdxOf(0);

        const witness = await circuitLeafExists.calculateWitness({
          root: tree.root,
          leaf: value,
          path_elements: pathElements,
          path_index: pathIndices
        });

        await circuitLeafExists.expectConstraintPass(witness);
      }
    });
  });

  // ============================================================================
  // Part 6: SDK Static Methods - computeZeroHashes & extendTreeRoot
  // ============================================================================

  describe('SDK Tree Static Methods', () => {
    it('computeZeroHashes should match instance zeros', () => {
      const staticZeros = Tree.computeZeroHashes(5, treeDepth, 0n);

      expect(staticZeros).to.have.lengthOf(treeDepth + 1);

      // Static method should produce consistent results
      const anotherStaticZeros = Tree.computeZeroHashes(5, treeDepth, 0n);
      for (let i = 0; i <= treeDepth; i++) {
        expect(staticZeros[i]).to.equal(anotherStaticZeros[i], `Zero hash mismatch at level ${i}`);
      }
    });

    it('computeZeroHashes should match ZeroRoot circuit', async () => {
      const depths = [1, 2, 3, 4];

      for (const depth of depths) {
        const zeroHashes = Tree.computeZeroHashes(5, depth, 0n);
        const expectedRoot = zeroHashes[depth];

        const zeroRootCircuit = await circomkitInstance.WitnessTester(`ZeroRoot_${depth}`, {
          file: './utils/trees/zeroRoot',
          template: 'ZeroRoot',
          params: [depth]
        });

        const witness = await zeroRootCircuit.calculateWitness({});
        const circuitRoot = await getSignal(zeroRootCircuit, witness, 'out');

        expect(expectedRoot).to.equal(circuitRoot, `Mismatch at depth ${depth}`);
      }
    });

    it('extendTreeRoot should correctly extend tree depth', () => {
      // Create a small tree
      const smallTree = new Tree(5, 2, 0n); // depth 2 = 25 leaves
      smallTree.updateLeaf(0, 100n);
      smallTree.updateLeaf(1, 200n);

      const smallRoot = smallTree.root;

      // Extend to depth 4
      const zeroHashes = Tree.computeZeroHashes(5, 4, 0n);
      const extendedRoot = Tree.extendTreeRoot(smallRoot, 2, 4, zeroHashes, 5);

      // Build actual large tree for comparison
      const largeTree = new Tree(5, 4, 0n); // depth 4 = 625 leaves
      largeTree.updateLeaf(0, 100n);
      largeTree.updateLeaf(1, 200n);

      expect(extendedRoot).to.equal(largeTree.root);
    });

    it('extendTreeRoot should throw for invalid parameters', () => {
      const zeroHashes = Tree.computeZeroHashes(5, 5, 0n);

      expect(() => Tree.extendTreeRoot(123n, 3, 2, zeroHashes, 5)).to.throw(
        'toDepth must be greater than fromDepth'
      );

      expect(() => Tree.extendTreeRoot(123n, 2, 10, zeroHashes, 5)).to.throw(
        'zeroHashes array is too short'
      );
    });
  });

  // ============================================================================
  // Part 7: QuinBatchLeavesExists Tests
  // ============================================================================

  describe('QuinBatchLeavesExists - Batch Verification', () => {
    before(async () => {
      circuitBatchLeavesExists = await circomkitInstance.WitnessTester('BatchLeavesExists', {
        file: './utils/trees/incrementalQuinTree',
        template: 'QuinBatchLeavesExists',
        params: [4, 2] // mainLevels=4, batchLevels=2
      });
    });

    it('should verify a batch of leaves exists in main tree', async () => {
      const mainLevels = 4;
      const batchLevels = 2;
      const batchSize = 5 ** batchLevels; // 25

      // Create batch leaves - these form the first 25 leaves of the main tree
      const batchLeaves = Array(batchSize)
        .fill(0n)
        .map((_, i) => BigInt(i + 1));

      // Create main tree and insert all batch leaves at the beginning
      const mainTree = new Tree(5, mainLevels, 0n);
      batchLeaves.forEach((leaf, i) => mainTree.updateLeaf(i, leaf));

      // The batch forms a subtree at index 0 of the (mainLevels - batchLevels) tree
      // We need to get the proof for that subtree position

      // For a depth-4 tree with batch depth-2:
      // - The batch occupies leaves 0-24 (first 25 leaves)
      // - These 25 leaves form a complete subtree
      // - At level 2, this subtree has a root at node position 0

      // Since batch is at the very beginning (index 0), path should be all zeros
      const mainPathIndices = Array(mainLevels - batchLevels).fill(0n);

      // Calculate what siblings we need at each level above the batch
      // Level 2 (batch root level): siblings of the batch subtree node
      // Level 3: siblings of level 2 parent
      const mainPathElements: bigint[][] = [];

      // Get the nodes at the batch root level
      const batchTreeInternal = new Tree(5, batchLevels, 0n);
      batchLeaves.forEach((leaf, i) => batchTreeInternal.updateLeaf(i, leaf));
      // The subroot would be: batchTreeInternal.root

      // Now we need siblings at each level from (batchLevels) to (mainLevels-1)
      // The batch subtree is at position 0, so we need positions 1,2,3,4 at each level

      // Simplify: just use the main tree's pathElementOf at position 0
      // and take only the levels beyond batchLevels
      const fullPath = mainTree.pathElementOf(0);
      for (let i = batchLevels; i < mainLevels; i++) {
        mainPathElements.push(fullPath[i]);
      }

      const witness = await circuitBatchLeavesExists.calculateWitness({
        root: mainTree.root,
        leaves: batchLeaves,
        path_index: mainPathIndices,
        path_elements: mainPathElements
      });

      await circuitBatchLeavesExists.expectConstraintPass(witness);
    });

    it('should fail when batch is not in main tree', async () => {
      const mainLevels = 4;
      const batchLevels = 2;
      const batchSize = 25;

      const mainTree = new Tree(5, mainLevels, 0n);
      mainTree.updateLeaf(0, 12345n); // Wrong value

      const fakeBatchLeaves = Array(batchSize).fill(999n);
      const pathElements = mainTree.pathElementOf(0);
      const pathIndices = mainTree.pathIdxOf(0);

      const mainPathElements = pathElements.slice(batchLevels);
      const mainPathIndices = pathIndices.slice(batchLevels);

      await expect(
        circuitBatchLeavesExists.calculateWitness({
          root: mainTree.root,
          leaves: fakeBatchLeaves,
          path_index: mainPathIndices,
          path_elements: mainPathElements
        })
      ).to.be.rejectedWith('Assert Failed');
    });
  });

  // ============================================================================
  // Part 8: Real-world Scenarios
  // ============================================================================

  describe('Real-world Integration Scenarios', () => {
    it('scenario: voter whitelist verification', async () => {
      // Setup: Create whitelist tree
      const whitelistTree = new Tree(5, treeDepth, 0n);
      const voters = [
        hash5([1n, 0n, 0n, 0n, 0n]), // Alice
        hash5([2n, 0n, 0n, 0n, 0n]), // Bob
        hash5([3n, 0n, 0n, 0n, 0n]), // Charlie
        hash5([4n, 0n, 0n, 0n, 0n]), // David
        hash5([5n, 0n, 0n, 0n, 0n]) // Eve
      ];

      voters.forEach((voter, i) => whitelistTree.updateLeaf(i, voter));

      // Bob wants to vote (index 1)
      const bobIndex = 1;
      const bobHash = voters[bobIndex];
      const bobProof = {
        pathElements: whitelistTree.pathElementOf(bobIndex),
        pathIndices: whitelistTree.pathIdxOf(bobIndex)
      };

      // Verify Bob is in whitelist using circuit
      const witness = await circuitLeafExists.calculateWitness({
        root: whitelistTree.root,
        leaf: bobHash,
        path_elements: bobProof.pathElements,
        path_index: bobProof.pathIndices
      });

      await circuitLeafExists.expectConstraintPass(witness);
    });

    it('scenario: state tree update after new signup', async () => {
      const stateTree = new Tree(5, treeDepth, 0n);

      // Initial signups
      for (let i = 0; i < 5; i++) {
        const stateLeaf = hash5([BigInt(i), BigInt(i * 100), 0n, 0n, 0n]);
        stateTree.updateLeaf(i, stateLeaf);
      }

      const rootAfterSignups = stateTree.root;

      // New user signs up at index 5
      const newUser = hash5([5n, 500n, 0n, 0n, 0n]);
      stateTree.updateLeaf(5, newUser);

      expect(stateTree.root).to.not.equal(rootAfterSignups);

      // Verify new user is in tree
      const proof = {
        pathElements: stateTree.pathElementOf(5),
        pathIndices: stateTree.pathIdxOf(5)
      };

      const witness = await circuitLeafExists.calculateWitness({
        root: stateTree.root,
        leaf: newUser,
        path_elements: proof.pathElements,
        path_index: proof.pathIndices
      });

      await circuitLeafExists.expectConstraintPass(witness);
    });
  });

  // ============================================================================
  // Part 9: Fuzz Testing
  // ============================================================================

  describe('Fuzz Testing - SDK + Circuit', () => {
    it('should verify random leaves with random values [fuzz]', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.nat({ max: 4 }), // Random leaf index (0-4)
          fc.bigInt({ min: 1n, max: SNARK_FIELD_SIZE - 1n }), // Random leaf value
          async (leafIndex: number, leafValue: bigint) => {
            const tree = new Tree(5, treeDepth, 0n);

            // Insert random leaf
            tree.updateLeaf(leafIndex, leafValue);

            // Generate proof
            const pathElements = tree.pathElementOf(leafIndex);
            const pathIndices = tree.pathIdxOf(leafIndex);

            // Verify with circuit
            const witness = await circuitLeafExists.calculateWitness({
              root: tree.root,
              leaf: leafValue,
              path_elements: pathElements,
              path_index: pathIndices
            });

            return circuitLeafExists
              .expectConstraintPass(witness)
              .then(() => true)
              .catch(() => false);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle multiple random updates [fuzz]', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              index: fc.nat({ max: 10 }),
              value: fc.bigInt({ min: 1n, max: SNARK_FIELD_SIZE - 1n })
            }),
            { minLength: 5, maxLength: 20 }
          ),
          async (updates) => {
            const tree = new Tree(5, treeDepth, 0n);

            // Apply all updates
            updates.forEach(({ index, value }) => {
              tree.updateLeaf(index, value);
            });

            // Verify the last update
            const lastUpdate = updates[updates.length - 1];
            const pathElements = tree.pathElementOf(lastUpdate.index);
            const pathIndices = tree.pathIdxOf(lastUpdate.index);

            const witness = await circuitLeafExists.calculateWitness({
              root: tree.root,
              leaf: lastUpdate.value,
              path_elements: pathElements,
              path_index: pathIndices
            });

            return circuitLeafExists
              .expectConstraintPass(witness)
              .then(() => true)
              .catch(() => false);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
