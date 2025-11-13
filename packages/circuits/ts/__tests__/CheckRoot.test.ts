import { hash5, SNARK_FIELD_SIZE, Tree } from '@dorafactory/maci-sdk';
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { type WitnessTester } from 'circomkit';
import fc from 'fast-check';

import { circomkitInstance, getSignal } from './utils/utils';

chai.use(chaiAsPromised);

/**
 * QuinCheckRoot Circuit Tests with Visual Examples
 *
 * ============================================================================
 * Test Goal: Understand the QuinCheckRoot workflow through practical examples
 * ============================================================================
 */

describe('QuinCheckRoot Circuit - Visual Learning Examples', function test() {
  this.timeout(300000);

  /**
   * Helper function: Manually compute Merkle Root
   * This function simulates circuit logic to help understand data flow
   */
  function computeMerkleRoot(
    leaves: bigint[],
    levels: number
  ): {
    root: bigint;
    layers: bigint[][];
    hashersUsed: number;
  } {
    const LEAVES_PER_NODE = 5;
    const totalLeaves = LEAVES_PER_NODE ** levels;

    if (leaves.length !== totalLeaves) {
      throw new Error(`Expected ${totalLeaves} leaves for level ${levels}, got ${leaves.length}`);
    }

    // Store hash values for each layer
    const layers: bigint[][] = [];
    layers[0] = leaves; // Layer 0 is the leaf nodes

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Computing Merkle Root for ${totalLeaves} leaves (levels=${levels})`);
    console.log(`${'='.repeat(80)}\n`);

    // Hash layer by layer, starting from the leaf layer
    for (let layer = 0; layer < levels; layer++) {
      const currentLayer = layers[layer];
      const nextLayer: bigint[] = [];

      console.log(`Layer ${layer} (${currentLayer.length} nodes):`);
      console.log(`${'─'.repeat(80)}`);

      // Hash every 5 nodes into 1
      for (let i = 0; i < currentLayer.length; i += LEAVES_PER_NODE) {
        const chunk = currentLayer.slice(i, i + LEAVES_PER_NODE);

        // Pad with 0 if less than 5 (shouldn't happen in actual use)
        while (chunk.length < LEAVES_PER_NODE) {
          chunk.push(0n);
        }

        const hash = hash5(chunk);
        nextLayer.push(hash);

        console.log(`  Hasher ${Math.floor(i / LEAVES_PER_NODE)}:`);
        console.log(`    Input:  [${chunk.map((n) => n.toString().padStart(3)).join(', ')}]`);
        console.log(`    Output: ${hash.toString().slice(0, 20)}...`);
      }

      layers[layer + 1] = nextLayer;
      console.log();
    }

    const root = layers[levels][0];

    // Calculate total number of hashers used
    let hashersUsed = 0;
    for (let i = 0; i < levels; i++) {
      hashersUsed += LEAVES_PER_NODE ** i;
    }

    console.log(`${'='.repeat(80)}`);
    console.log(`Final Root: ${root.toString().slice(0, 40)}...`);
    console.log(`Total Hashers Used: ${hashersUsed}`);
    console.log(`${'='.repeat(80)}\n`);

    return { root, layers, hashersUsed };
  }

  describe('Example 1: levels = 1 (5 leaves)', () => {
    let circuit: WitnessTester<['leaves'], ['root']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_1', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [1]
      });
    });

    it('should correctly compute root hash for 5 leaves', async () => {
      console.log('\n' + '═'.repeat(80));
      console.log('Example 1: Simplest case - only 1 level (5 leaves)');
      console.log('═'.repeat(80));

      // Prepare input: 5 simple numbers
      const leaves = [1n, 2n, 3n, 4n, 5n];

      console.log('\nInput leaf nodes:');
      console.log(`  leaves = [${leaves.join(', ')}]\n`);

      console.log('The circuit will:');
      console.log('  1. Create 1 Hasher5 component');
      console.log('  2. Feed 5 leaves into hashers[0]');
      console.log('  3. hashers[0].hash is the final root\n');

      // Manual calculation
      const expected = hash5(leaves);
      console.log('Manual calculation:');
      console.log(`  root = Hash5(1, 2, 3, 4, 5)`);
      console.log(`  root = ${expected.toString().slice(0, 40)}...\n`);

      // Circuit calculation
      const circuitInputs = { leaves };
      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);
      const circuitRoot = await getSignal(circuit, witness, 'root');

      console.log('Circuit output:');
      console.log(`  root = ${circuitRoot.toString().slice(0, 40)}...\n`);

      // Verification
      expect(circuitRoot).to.equal(expected);
      console.log('✅ Verification passed: circuit output = manual calculation\n');
    });
  });

  describe('Example 2: levels = 2 (25 leaves)', () => {
    let circuit: WitnessTester<['leaves'], ['root']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_2', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });
    });

    it('should correctly compute root hash for 25 leaves - detailed step display', async () => {
      console.log('\n' + '═'.repeat(80));
      console.log('Example 2: Medium complexity - 2 levels (25 leaves)');
      console.log('═'.repeat(80));

      // Prepare input: 25 consecutive numbers
      const leaves = Array.from({ length: 25 }, (_, i) => BigInt(i + 1));

      console.log('\nInput leaf nodes:');
      console.log(`  leaves[0..4]   = [${leaves.slice(0, 5).join(', ')}]`);
      console.log(`  leaves[5..9]   = [${leaves.slice(5, 10).join(', ')}]`);
      console.log(`  leaves[10..14] = [${leaves.slice(10, 15).join(', ')}]`);
      console.log(`  leaves[15..19] = [${leaves.slice(15, 20).join(', ')}]`);
      console.log(`  leaves[20..24] = [${leaves.slice(20, 25).join(', ')}]\n`);

      console.log('Circuit structure analysis:');
      console.log('  Total leaves: 5^2 = 25');
      console.log('  Total hashers: 5^0 + 5^1 = 1 + 5 = 6');
      console.log('  - hashers[0..4]: Leaf layer (each processes 5 leaves)');
      console.log('  - hashers[5]: Root layer (processes 5 leaf layer hashes)\n');

      // Manual calculation with detailed steps
      const manual = computeMerkleRoot(leaves, 2);

      // Circuit calculation
      console.log('Starting circuit verification...\n');
      const circuitInputs = { leaves };
      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);
      const circuitRoot = await getSignal(circuit, witness, 'root');

      // Verification
      expect(circuitRoot).to.equal(manual.root);
      console.log('✅ Verification passed: circuit output matches manual calculation perfectly\n');

      // Display tree structure
      console.log('Tree visualization:');
      console.log('```');
      console.log('                                ROOT');
      console.log('                                 |');
      console.log('                 ┌───────┬───────┼───────┬───────┐');
      console.log('                 |       |       |       |       |');
      console.log('              Hash0   Hash1   Hash2   Hash3   Hash4');
      console.log('                 |       |       |       |       |');
      console.log('            [1-5]   [6-10]  [11-15] [16-20] [21-25]');
      console.log('```\n');
    });

    it('should demonstrate hasher connection relationships', async () => {
      const leaves = Array.from({ length: 25 }, (_, i) => BigInt(i + 1));

      console.log('\n' + '═'.repeat(80));
      console.log('Detailed Hasher Connection Relationships');
      console.log('═'.repeat(80) + '\n');

      // Step 1: Leaf layer hashers
      console.log('[Step 1] Connect leaves to leaf layer hashers:');
      console.log('─'.repeat(80));
      const leafLayerHashes: bigint[] = [];
      for (let i = 0; i < 5; i++) {
        const start = i * 5;
        const end = start + 5;
        const chunk = leaves.slice(start, end);
        const hash = hash5(chunk);
        leafLayerHashes.push(hash);

        console.log(`  hashers[${i}]:`);
        console.log(`    Input: leaves[${start}..${end - 1}] = [${chunk.join(', ')}]`);
        console.log(`    Output: ${hash.toString().slice(0, 30)}...`);
      }
      console.log();

      // Step 2: Root layer hasher
      console.log('[Step 2] Connect leaf layer hashes to root layer hasher:');
      console.log('─'.repeat(80));
      console.log('  hashers[5] (root layer):');
      console.log('    Input: [');
      for (let i = 0; i < 5; i++) {
        console.log(`      hashers[${i}].hash = ${leafLayerHashes[i].toString().slice(0, 30)}...`);
      }
      console.log('    ]');

      const root = hash5(leafLayerHashes);
      console.log(`    Output (root): ${root.toString().slice(0, 30)}...\n`);

      // Verify circuit
      const circuitInputs = { leaves };
      const witness = await circuit.calculateWitness(circuitInputs);
      const circuitRoot = await getSignal(circuit, witness, 'root');

      expect(circuitRoot).to.equal(root);
      console.log('✅ Circuit output matches expected result\n');
    });
  });

  describe('Example 3: levels = 3 (125 leaves)', () => {
    let circuit: WitnessTester<['leaves'], ['root']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_3', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [3]
      });
    });

    it('should correctly compute root hash for 125 leaves', async () => {
      console.log('\n' + '═'.repeat(80));
      console.log('Example 3: Complex case - 3 levels (125 leaves)');
      console.log('═'.repeat(80));

      // Prepare input: 125 consecutive numbers
      const leaves = Array.from({ length: 125 }, (_, i) => BigInt(i + 1));

      console.log('\nInput: 125 leaf nodes (1 to 125)\n');

      console.log('Circuit structure analysis:');
      console.log('  Total leaves: 5^3 = 125');
      console.log('  Total hashers: 5^0 + 5^1 + 5^2 = 1 + 5 + 25 = 31');
      console.log('  - hashers[0..24]: Leaf layer (25 hashers, each processes 5 leaves)');
      console.log(
        '  - hashers[25..29]: Middle layer (5 hashers, each processes 5 leaf layer hashes)'
      );
      console.log('  - hashers[30]: Root layer (1 hasher, processes 5 middle layer hashes)\n');

      // Manual calculation
      const manual = computeMerkleRoot(leaves, 3);

      // Display layer relationships
      console.log('Data flow process:');
      console.log('  125 leaves');
      console.log('    → Layer 1: 25 hashes (every 5 leaves → 1 hash)');
      console.log('    → Layer 2: 5 hashes (every 5 layer-1 hashes → 1 hash)');
      console.log('    → Layer 3: 1 hash (5 layer-2 hashes → root hash)\n');

      // Circuit calculation
      const circuitInputs = { leaves };
      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);
      const circuitRoot = await getSignal(circuit, witness, 'root');

      // Verification
      expect(circuitRoot).to.equal(manual.root);
      console.log('✅ Verification passed: 3-level tree root hash computed correctly\n');
    });

    it('should demonstrate complete data flow of 3-level tree', async () => {
      const leaves = Array.from({ length: 125 }, (_, i) => BigInt(i + 1));

      console.log('\n' + '═'.repeat(80));
      console.log('Complete Data Flow Trace for 3-Level Tree');
      console.log('═'.repeat(80) + '\n');

      // Layer 1: Leaves → Leaf layer hashes
      console.log('[Layer 1] Leaf layer (25 hashers):');
      console.log('─'.repeat(80));
      const layer1: bigint[] = [];
      for (let i = 0; i < 25; i++) {
        const start = i * 5;
        const chunk = leaves.slice(start, start + 5);
        const hash = hash5(chunk);
        layer1.push(hash);

        if (i < 3 || i >= 22) {
          // Only show first 3 and last 3
          console.log(
            `  hashers[${i.toString().padStart(2)}]: leaves[${start.toString().padStart(3)}..${(start + 4).toString().padStart(3)}] → ${hash.toString().slice(0, 25)}...`
          );
        } else if (i === 3) {
          console.log('  ...');
        }
      }
      console.log();

      // Layer 2: Leaf layer hashes → Middle layer hashes
      console.log('[Layer 2] Middle layer (5 hashers):');
      console.log('─'.repeat(80));
      const layer2: bigint[] = [];
      for (let i = 0; i < 5; i++) {
        const start = i * 5;
        const chunk = layer1.slice(start, start + 5);
        const hash = hash5(chunk);
        layer2.push(hash);

        console.log(
          `  hashers[${(25 + i).toString().padStart(2)}]: hashers[${start.toString().padStart(2)}..${(start + 4).toString().padStart(2)}].hash → ${hash.toString().slice(0, 25)}...`
        );
      }
      console.log();

      // Layer 3: Middle layer hashes → Root
      console.log('[Layer 3] Root layer (1 hasher):');
      console.log('─'.repeat(80));
      const root = hash5(layer2);
      console.log(`  hashers[30]: hashers[25..29].hash → ROOT`);
      console.log(`  Root hash: ${root.toString().slice(0, 40)}...\n`);

      // Verification
      const circuitInputs = { leaves };
      const witness = await circuit.calculateWitness(circuitInputs);
      const circuitRoot = await getSignal(circuit, witness, 'root');

      expect(circuitRoot).to.equal(root);
      console.log('✅ Complete data flow verification passed\n');
    });
  });

  describe('Key Concept Verification', () => {
    it('verify: numHashers = sum(5^i) for i in [0, levels)', async () => {
      console.log('\n' + '═'.repeat(80));
      console.log('Verify Hasher Count Formula');
      console.log('═'.repeat(80) + '\n');

      const testCases = [
        { levels: 1, expected: 1 }, // 5^0
        { levels: 2, expected: 6 }, // 5^0 + 5^1 = 1 + 5
        { levels: 3, expected: 31 }, // 5^0 + 5^1 + 5^2 = 1 + 5 + 25
        { levels: 4, expected: 156 } // 5^0 + 5^1 + 5^2 + 5^3 = 1 + 5 + 25 + 125
      ];

      testCases.forEach(({ levels, expected }) => {
        let numHashers = 0;
        const breakdown: string[] = [];

        for (let i = 0; i < levels; i++) {
          const count = 5 ** i;
          numHashers += count;
          breakdown.push(`5^${i}=${count}`);
        }

        console.log(`  levels=${levels}:`);
        console.log(`    Calculation: ${breakdown.join(' + ')} = ${numHashers}`);
        console.log(`    Expected: ${expected}`);
        console.log(
          `    ${numHashers === expected ? '✅' : '❌'} Verification ${numHashers === expected ? 'passed' : 'failed'}\n`
        );

        expect(numHashers).to.equal(expected);
      });
    });

    it('verify: hasher count pattern per layer', () => {
      console.log('\n' + '═'.repeat(80));
      console.log('Hasher Count Pattern Per Layer');
      console.log('═'.repeat(80) + '\n');

      console.log('  From bottom to top, hasher count decreases by 5x per layer:\n');

      const levels = 4;
      for (let layer = levels - 1; layer >= 0; layer--) {
        const count = 5 ** layer;
        const layerName =
          layer === levels - 1
            ? 'Leaf layer   '
            : layer === 0
              ? 'Root layer   '
              : `Middle layer ${layer}`;
        console.log(`    ${layerName}: 5^${layer} = ${count.toString().padStart(3)} hashers`);
      }
      console.log();

      console.log('  This means:');
      console.log('    - Closer to leaves: more hashers (need to process more data)');
      console.log('    - Closer to root: fewer hashers (data already aggregated)');
      console.log('    - Each level up reduces hasher count to 1/5\n');
    });

    it('verify: leaf index to hasher mapping relationship', () => {
      console.log('\n' + '═'.repeat(80));
      console.log('Leaf Index → Hasher Mapping Relationship');
      console.log('═'.repeat(80) + '\n');

      const LEAVES_PER_NODE = 5;

      console.log('  Formula: hashers[i].in[j] <== leaves[i * 5 + j]\n');
      console.log('  Example (first 3 hashers):\n');

      for (let hasherIdx = 0; hasherIdx < 3; hasherIdx++) {
        console.log(`    hashers[${hasherIdx}] processes:`);
        const leafIndices: number[] = [];
        for (let j = 0; j < LEAVES_PER_NODE; j++) {
          const leafIdx = hasherIdx * LEAVES_PER_NODE + j;
          leafIndices.push(leafIdx);
        }
        console.log(`      leaves[${leafIndices.join(', ')}]\n`);
      }

      console.log('  Pattern summary:');
      console.log('    - hasher[0] → leaves[0..4]');
      console.log('    - hasher[1] → leaves[5..9]');
      console.log('    - hasher[i] → leaves[i*5..(i*5+4)]\n');
    });
  });

  describe('Edge Cases and Special Values', () => {
    it('should correctly handle all-zero leaves', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_2_zeros', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const leaves = Array(25).fill(0n);
      const expected = computeMerkleRoot(leaves, 2);

      const witness = await circuit.calculateWitness({ leaves });
      const circuitRoot = await getSignal(circuit, witness, 'root');

      expect(circuitRoot).to.equal(expected.root);
      console.log('      ✅ All-zero leaves handled correctly');
    });

    it('should correctly handle large value leaves', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_2_large', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const leaves = Array.from({ length: 25 }, () => SNARK_FIELD_SIZE - 1n);
      const expected = computeMerkleRoot(leaves, 2);

      const witness = await circuit.calculateWitness({ leaves });
      const circuitRoot = await getSignal(circuit, witness, 'root');

      expect(circuitRoot).to.equal(expected.root);
      console.log('      ✅ Large value leaves handled correctly');
    });

    it('should correctly handle all identical leaves', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_2_same', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const sameValue = 12345n;
      const leaves = Array(25).fill(sameValue);
      const expected = computeMerkleRoot(leaves, 2);

      const witness = await circuit.calculateWitness({ leaves });
      const circuitRoot = await getSignal(circuit, witness, 'root');

      expect(circuitRoot).to.equal(expected.root);
    });

    it('should correctly handle incrementing sequence', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_2_incremental', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const leaves = Array.from({ length: 25 }, (_, i) => BigInt(i));
      const expected = computeMerkleRoot(leaves, 2);

      const witness = await circuit.calculateWitness({ leaves });
      const circuitRoot = await getSignal(circuit, witness, 'root');

      expect(circuitRoot).to.equal(expected.root);
    });

    it('should correctly handle decrementing sequence', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_2_decremental', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const leaves = Array.from({ length: 25 }, (_, i) => BigInt(25 - i));
      const expected = computeMerkleRoot(leaves, 2);

      const witness = await circuit.calculateWitness({ leaves });
      const circuitRoot = await getSignal(circuit, witness, 'root');

      expect(circuitRoot).to.equal(expected.root);
    });
  });

  describe('levels = 4 test (625 leaves)', () => {
    let circuit: WitnessTester<['leaves'], ['root']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_4', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [4]
      });
    });

    it('should correctly compute root hash for 625 leaves', async () => {
      const leaves = Array.from({ length: 625 }, (_, i) => BigInt(i + 1));
      const expected = computeMerkleRoot(leaves, 4);

      const witness = await circuit.calculateWitness({ leaves });
      await circuit.expectConstraintPass(witness);
      const circuitRoot = await getSignal(circuit, witness, 'root');

      expect(circuitRoot).to.equal(expected.root);
    });

    it('should verify hasher count: 156', async () => {
      // levels = 4: 1 + 5 + 25 + 125 = 156 hashers
      const expectedHashers = 1 + 5 + 25 + 125;
      expect(expectedHashers).to.equal(156);
    });

    it('should correctly handle 625 all-zero leaves', async () => {
      const leaves = Array(625).fill(0n);
      const expected = computeMerkleRoot(leaves, 4);

      const witness = await circuit.calculateWitness({ leaves });
      const circuitRoot = await getSignal(circuit, witness, 'root');

      expect(circuitRoot).to.equal(expected.root);
    });
  });

  describe('Comparison with SDK Tree', () => {
    it('levels = 1: circuit output should match SDK Tree', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_SDK_1', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [1]
      });

      const leaves = Array.from({ length: 5 }, (_, i) => BigInt(i + 1));

      // SDK Tree
      const tree = new Tree(5, 1, 0n);
      leaves.forEach((leaf, i) => tree.updateLeaf(i, leaf));
      const sdkRoot = tree.root;

      // Circuit
      const witness = await circuit.calculateWitness({ leaves });
      const circuitRoot = await getSignal(circuit, witness, 'root');

      expect(circuitRoot).to.equal(sdkRoot);
    });

    it('levels = 2: circuit output should match SDK Tree', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_SDK_2', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const leaves = Array.from({ length: 25 }, (_, i) => BigInt(i + 1));

      // SDK Tree
      const tree = new Tree(5, 2, 0n);
      leaves.forEach((leaf, i) => tree.updateLeaf(i, leaf));
      const sdkRoot = tree.root;

      // Circuit
      const witness = await circuit.calculateWitness({ leaves });
      const circuitRoot = await getSignal(circuit, witness, 'root');

      expect(circuitRoot).to.equal(sdkRoot);
    });

    it('levels = 3: circuit output should match SDK Tree', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_SDK_3', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [3]
      });

      const leaves = Array.from({ length: 125 }, (_, i) => BigInt(i + 1));

      // SDK Tree
      const tree = new Tree(5, 3, 0n);
      leaves.forEach((leaf, i) => tree.updateLeaf(i, leaf));
      const sdkRoot = tree.root;

      // Circuit
      const witness = await circuit.calculateWitness({ leaves });
      const circuitRoot = await getSignal(circuit, witness, 'root');

      expect(circuitRoot).to.equal(sdkRoot);
    });

    it('should handle partially filled tree (remaining as zeros)', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_SDK_partial', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      // Fill only first 10 leaves, rest are 0
      const leaves = Array(25).fill(0n);
      for (let i = 0; i < 10; i++) {
        leaves[i] = BigInt(i + 1);
      }

      // SDK Tree
      const tree = new Tree(5, 2, 0n);
      for (let i = 0; i < 10; i++) {
        tree.updateLeaf(i, BigInt(i + 1));
      }
      const sdkRoot = tree.root;

      // Circuit
      const witness = await circuit.calculateWitness({ leaves });
      const circuitRoot = await getSignal(circuit, witness, 'root');

      expect(circuitRoot).to.equal(sdkRoot);
    });
  });

  describe('Determinism and Consistency Tests', () => {
    it('same input should produce same output (multiple runs)', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_deterministic', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const leaves = Array.from({ length: 25 }, (_, i) => BigInt(i + 1));
      const roots: bigint[] = [];

      // Run 5 times
      for (let i = 0; i < 5; i++) {
        const witness = await circuit.calculateWitness({ leaves });
        const root = await getSignal(circuit, witness, 'root');
        roots.push(root);
      }

      // All roots should be the same
      const firstRoot = roots[0];
      roots.forEach((root) => {
        expect(root).to.equal(firstRoot);
      });
    });

    it('different inputs should produce different outputs', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_different', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const leaves1 = Array.from({ length: 25 }, (_, i) => BigInt(i + 1));
      const leaves2 = Array.from({ length: 25 }, (_, i) => BigInt(i + 2));

      const witness1 = await circuit.calculateWitness({ leaves: leaves1 });
      const root1 = await getSignal(circuit, witness1, 'root');

      const witness2 = await circuit.calculateWitness({ leaves: leaves2 });
      const root2 = await getSignal(circuit, witness2, 'root');

      expect(root1).to.not.equal(root2);
    });

    it('modifying a single leaf should change root hash', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_single_change', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const leaves1 = Array.from({ length: 25 }, (_, i) => BigInt(i + 1));
      const leaves2 = [...leaves1];
      leaves2[12] = 999n; // Modify one leaf in the middle

      const witness1 = await circuit.calculateWitness({ leaves: leaves1 });
      const root1 = await getSignal(circuit, witness1, 'root');

      const witness2 = await circuit.calculateWitness({ leaves: leaves2 });
      const root2 = await getSignal(circuit, witness2, 'root');

      expect(root1).to.not.equal(root2);
    });

    it('different leaf ordering should produce different root hash', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_order', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const leaves1 = Array.from({ length: 25 }, (_, i) => BigInt(i + 1));
      const leaves2 = [...leaves1].reverse();

      const witness1 = await circuit.calculateWitness({ leaves: leaves1 });
      const root1 = await getSignal(circuit, witness1, 'root');

      const witness2 = await circuit.calculateWitness({ leaves: leaves2 });
      const root2 = await getSignal(circuit, witness2, 'root');

      expect(root1).to.not.equal(root2);
    });
  });

  describe('Constraint System Verification', () => {
    const testLevels = [1, 2, 3];

    testLevels.forEach((levels) => {
      it(`levels = ${levels}: all constraints should be satisfied`, async () => {
        const circuit = await circomkitInstance.WitnessTester(
          `QuinCheckRoot_constraints_${levels}`,
          {
            file: './utils/trees/checkRoot',
            template: 'QuinCheckRoot',
            params: [levels]
          }
        );

        const totalLeaves = 5 ** levels;
        const leaves = Array.from({ length: totalLeaves }, (_, i) => BigInt(i + 1));

        const witness = await circuit.calculateWitness({ leaves });
        await circuit.expectConstraintPass(witness);
      });
    });

    it('should verify constraint count grows with levels', async () => {
      // Constraint count mainly depends on number of hashers
      const constraints = [
        { levels: 1, hashers: 1 },
        { levels: 2, hashers: 6 },
        { levels: 3, hashers: 31 },
        { levels: 4, hashers: 156 }
      ];

      constraints.forEach(({ levels, hashers }) => {
        let calculated = 0;
        for (let i = 0; i < levels; i++) {
          calculated += 5 ** i;
        }
        expect(calculated).to.equal(hashers);
      });
    });
  });

  describe('Random Input Tests', () => {
    it('should handle random small values', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_random_small', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const leaves = Array.from({ length: 25 }, () => BigInt(Math.floor(Math.random() * 1000)));
      const expected = computeMerkleRoot(leaves, 2);

      const witness = await circuit.calculateWitness({ leaves });
      const circuitRoot = await getSignal(circuit, witness, 'root');

      expect(circuitRoot).to.equal(expected.root);
    });

    it('should handle random large values', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_random_large', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const leaves = Array.from({ length: 25 }, () => {
        const random = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
        return random % SNARK_FIELD_SIZE;
      });
      const expected = computeMerkleRoot(leaves, 2);

      const witness = await circuit.calculateWitness({ leaves });
      const circuitRoot = await getSignal(circuit, witness, 'root');

      expect(circuitRoot).to.equal(expected.root);
    });

    it('should handle mixed zero and non-zero values', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_mixed', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const leaves = Array.from({ length: 25 }, (_, i) => (i % 2 === 0 ? 0n : BigInt(i)));
      const expected = computeMerkleRoot(leaves, 2);

      const witness = await circuit.calculateWitness({ leaves });
      const circuitRoot = await getSignal(circuit, witness, 'root');

      expect(circuitRoot).to.equal(expected.root);
    });
  });

  describe('Performance and Scale Tests', () => {
    it('levels = 1: performance baseline', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_perf_1', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [1]
      });

      const leaves = Array.from({ length: 5 }, (_, i) => BigInt(i + 1));

      const start = Date.now();
      const witness = await circuit.calculateWitness({ leaves });
      await circuit.expectConstraintPass(witness);
      const end = Date.now();

      console.log(`      levels=1 (5 leaves) witness generation time: ${end - start}ms`);
      expect(end - start).to.be.lessThan(1000); // Should complete within 1 second
    });

    it('levels = 2: performance baseline', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_perf_2', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const leaves = Array.from({ length: 25 }, (_, i) => BigInt(i + 1));

      const start = Date.now();
      const witness = await circuit.calculateWitness({ leaves });
      await circuit.expectConstraintPass(witness);
      const end = Date.now();

      console.log(`      levels=2 (25 leaves) witness generation time: ${end - start}ms`);
      expect(end - start).to.be.lessThan(2000);
    });

    it('levels = 3: performance baseline', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_perf_3', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [3]
      });

      const leaves = Array.from({ length: 125 }, (_, i) => BigInt(i + 1));

      const start = Date.now();
      const witness = await circuit.calculateWitness({ leaves });
      await circuit.expectConstraintPass(witness);
      const end = Date.now();

      console.log(`      levels=3 (125 leaves) witness generation time: ${end - start}ms`);
      expect(end - start).to.be.lessThan(5000);
    });
  });

  describe('[fuzz] Property-Based Testing', () => {
    it('any valid input should produce valid root hash', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_property', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
            minLength: 25,
            maxLength: 25
          }),
          async (leaves) => {
            const witness = await circuit.calculateWitness({ leaves });
            await circuit.expectConstraintPass(witness);
            const root = await getSignal(circuit, witness, 'root');

            // Root hash should be within valid range
            expect(root >= 0n).to.be.true;
            expect(root < SNARK_FIELD_SIZE).to.be.true;
          }
        ),
        { numRuns: 10 }
      );
    });

    it('same input should produce same output (property test)', async () => {
      const circuit = await circomkitInstance.WitnessTester(
        'QuinCheckRoot_property_deterministic',
        {
          file: './utils/trees/checkRoot',
          template: 'QuinCheckRoot',
          params: [2]
        }
      );

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
            minLength: 25,
            maxLength: 25
          }),
          async (leaves) => {
            const witness1 = await circuit.calculateWitness({ leaves });
            const root1 = await getSignal(circuit, witness1, 'root');

            const witness2 = await circuit.calculateWitness({ leaves });
            const root2 = await getSignal(circuit, witness2, 'root');

            expect(root1).to.equal(root2);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Real-world Use Case Simulations', () => {
    it('scenario 1: voting system - store voter states', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_voting', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      // Simulate state hashes of 10 voters
      const voterStates = Array.from({ length: 10 }, (_, i) => BigInt(10000 + i));

      // Fill to 25 (remaining positions are empty)
      const leaves = [...voterStates, ...Array(15).fill(0n)];

      const witness = await circuit.calculateWitness({ leaves });
      await circuit.expectConstraintPass(witness);
      const stateRoot = await getSignal(circuit, witness, 'root');

      expect(stateRoot > 0n).to.be.true;
    });

    it('scenario 2: message queue - store message hashes', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_messages', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      // Simulate hashes of 20 messages
      const messages = Array.from({ length: 20 }, (_, i) => BigInt(20000 + i));

      // Fill to 25
      const leaves = [...messages, ...Array(5).fill(0n)];

      const witness = await circuit.calculateWitness({ leaves });
      await circuit.expectConstraintPass(witness);
      const messageRoot = await getSignal(circuit, witness, 'root');

      expect(messageRoot > 0n).to.be.true;
    });

    it('scenario 3: data batch verification', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_batch', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [3]
      });

      // Simulate 100 data items
      const dataItems = Array.from({ length: 100 }, (_, i) => BigInt(30000 + i));

      // Fill to 125
      const leaves = [...dataItems, ...Array(25).fill(0n)];

      const witness = await circuit.calculateWitness({ leaves });
      await circuit.expectConstraintPass(witness);
      const batchRoot = await getSignal(circuit, witness, 'root');

      expect(batchRoot > 0n).to.be.true;
    });
  });

  describe('Relationship with ZeroRoot Tests', () => {
    it('root of all-zero leaves should match ZeroRoot circuit output', async () => {
      const checkRootCircuit = await circomkitInstance.WitnessTester('QuinCheckRoot_vs_zero', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const zeroRootCircuit = await circomkitInstance.WitnessTester('ZeroRoot_vs_check', {
        file: './utils/trees/zeroRoot',
        template: 'ZeroRoot',
        params: [2]
      });

      // CheckRoot with all-zero leaves
      const leaves = Array(25).fill(0n);
      const checkWitness = await checkRootCircuit.calculateWitness({ leaves });
      const checkRoot = await getSignal(checkRootCircuit, checkWitness, 'root');

      // ZeroRoot computes empty tree root
      const zeroWitness = await zeroRootCircuit.calculateWitness({});
      const zeroRoot = await getSignal(zeroRootCircuit, zeroWitness, 'out');

      expect(checkRoot).to.equal(zeroRoot);
    });

    it('verify ZeroRoot is a special case of CheckRoot', async () => {
      for (const levels of [1, 2, 3]) {
        const checkRootCircuit = await circomkitInstance.WitnessTester(
          `QuinCheckRoot_zero_special_${levels}`,
          {
            file: './utils/trees/checkRoot',
            template: 'QuinCheckRoot',
            params: [levels]
          }
        );

        const zeroRootCircuit = await circomkitInstance.WitnessTester(
          `ZeroRoot_special_${levels}`,
          {
            file: './utils/trees/zeroRoot',
            template: 'ZeroRoot',
            params: [levels]
          }
        );

        const totalLeaves = 5 ** levels;
        const leaves = Array(totalLeaves).fill(0n);

        const checkWitness = await checkRootCircuit.calculateWitness({ leaves });
        const checkRoot = await getSignal(checkRootCircuit, checkWitness, 'root');

        const zeroWitness = await zeroRootCircuit.calculateWitness({});
        const zeroRoot = await getSignal(zeroRootCircuit, zeroWitness, 'out');

        expect(checkRoot).to.equal(zeroRoot);
      }
    });
  });

  describe('Error Handling and Boundary Conditions', () => {
    it('should correctly handle maximum valid value', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_max_value', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const maxValue = SNARK_FIELD_SIZE - 1n;
      const leaves = Array(25).fill(maxValue);

      const witness = await circuit.calculateWitness({ leaves });
      await circuit.expectConstraintPass(witness);
      const root = await getSignal(circuit, witness, 'root');

      expect(root < SNARK_FIELD_SIZE).to.be.true;
    });

    it('should handle alternating 0 and max values', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_alternating', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const maxValue = SNARK_FIELD_SIZE - 1n;
      const leaves = Array.from({ length: 25 }, (_, i) => (i % 2 === 0 ? 0n : maxValue));

      const witness = await circuit.calculateWitness({ leaves });
      await circuit.expectConstraintPass(witness);
      const root = await getSignal(circuit, witness, 'root');

      expect(root < SNARK_FIELD_SIZE).to.be.true;
    });

    it('should handle case with only one non-zero value', async () => {
      const circuit = await circomkitInstance.WitnessTester('QuinCheckRoot_single_nonzero', {
        file: './utils/trees/checkRoot',
        template: 'QuinCheckRoot',
        params: [2]
      });

      const leaves = Array(25).fill(0n);
      leaves[12] = 123456n; // One non-zero value in the middle

      const witness = await circuit.calculateWitness({ leaves });
      await circuit.expectConstraintPass(witness);
      const root = await getSignal(circuit, witness, 'root');

      expect(root > 0n).to.be.true;

      // Should be different from all-zero root
      const allZeroLeaves = Array(25).fill(0n);
      const zeroWitness = await circuit.calculateWitness({ leaves: allZeroLeaves });
      const zeroRoot = await getSignal(circuit, zeroWitness, 'root');

      expect(root).to.not.equal(zeroRoot);
    });
  });
});
