/**
 * Poseidon Hash Consistency E2E Test
 *
 * This test validates that Poseidon hash operations produce identical results
 * across all three components of the MACI system:
 * 1. SDK (TypeScript) - using @dorafactory/maci-sdk
 * 2. Circuits (Circom) - using circomkit + WitnessTester
 * 3. Smart Contracts (CosmWasm/Rust) - using maci-utils
 *
 * Test Coverage:
 * - Basic hashing (hash2, hash5)
 * - Edge cases (zero values, max values)
 * - Boundary conditions
 * - Order sensitivity
 * - Real-world message scenarios
 *
 * Key Libraries:
 * - circomkit: High-level circuit testing framework (wraps snarkjs)
 * - WitnessTester: Efficient witness calculation and constraint checking
 */

import { expect } from 'chai';
import { hash2, hash5, hashLeftRight, SNARK_FIELD_SIZE } from '@dorafactory/maci-sdk';
import { Circomkit, type WitnessTester, type CircomkitConfig } from 'circomkit';
import * as path from 'path';
import * as fs from 'fs';
import { loadRustTestVectors, vectorsExist, findVector } from '../poseidon-test/load-vectors';
import type { RustTestVector } from '../poseidon-test/test-vectors';

// Circuit configuration
const CIRCUITS_DIR = path.resolve(__dirname, '../../packages/circuits');
const CIRCOM_PATH = './utils/hasherPoseidon';
const CIRCOMKIT_CONFIG_PATH = path.join(CIRCUITS_DIR, 'circomkit.json');

// Helper to get signal from witness
const getSignal = async (
  tester: WitnessTester,
  witness: bigint[],
  name: string
): Promise<bigint> => {
  const signalFullName = `main.${name}`;
  const out = await tester.readWitness(witness, [signalFullName]);
  return BigInt(out[signalFullName]);
};

// Test vectors for comprehensive testing
interface TestVector {
  name: string;
  inputs: bigint[];
  hashType: 'hash2' | 'hash5';
  description: string;
}

const TEST_VECTORS: TestVector[] = [
  // Basic functionality
  {
    name: 'basic_hash2_small',
    inputs: [BigInt(1), BigInt(2)],
    hashType: 'hash2',
    description: 'Simple small integers'
  },
  {
    name: 'basic_hash5_sequential',
    inputs: [BigInt(1), BigInt(2), BigInt(3), BigInt(4), BigInt(5)],
    hashType: 'hash5',
    description: 'Sequential integers'
  },

  // Zero values
  {
    name: 'hash2_both_zeros',
    inputs: [BigInt(0), BigInt(0)],
    hashType: 'hash2',
    description: 'Both inputs zero'
  },
  {
    name: 'hash2_one_zero',
    inputs: [BigInt(0), BigInt(12345)],
    hashType: 'hash2',
    description: 'First input zero'
  },
  {
    name: 'hash5_all_zeros',
    inputs: [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)],
    hashType: 'hash5',
    description: 'All inputs zero'
  },

  // Large values (near field boundary)
  {
    name: 'hash2_large_values',
    inputs: [SNARK_FIELD_SIZE - BigInt(1), SNARK_FIELD_SIZE - BigInt(2)],
    hashType: 'hash2',
    description: 'Near max field elements'
  },

  // Order sensitivity tests
  {
    name: 'hash2_order_a',
    inputs: [BigInt(123), BigInt(456)],
    hashType: 'hash2',
    description: 'Original order'
  },
  {
    name: 'hash2_order_b',
    inputs: [BigInt(456), BigInt(123)],
    hashType: 'hash2',
    description: 'Reversed order (should differ)'
  },
  {
    name: 'hash5_order_a',
    inputs: [BigInt(1), BigInt(2), BigInt(3), BigInt(4), BigInt(5)],
    hashType: 'hash5',
    description: 'Sequential order'
  },
  {
    name: 'hash5_order_b',
    inputs: [BigInt(5), BigInt(4), BigInt(3), BigInt(2), BigInt(1)],
    hashType: 'hash5',
    description: 'Reversed order (should differ)'
  },

  // Real-world MACI scenarios
  {
    name: 'merkle_tree_hash',
    inputs: [BigInt('12345678901234567890'), BigInt('98765432109876543210')],
    hashType: 'hash2',
    description: 'Typical Merkle tree leaf hash'
  },
  {
    name: 'message_hash_realistic',
    inputs: [
      BigInt(1), // state index
      BigInt(2), // vote option index
      BigInt(100), // vote weight
      BigInt(3), // nonce
      BigInt(42) // poll id
    ],
    hashType: 'hash5',
    description: 'Realistic MACI message'
  },

  // Identical values
  {
    name: 'hash2_identical',
    inputs: [BigInt(999), BigInt(999)],
    hashType: 'hash2',
    description: 'Both inputs identical'
  },
  {
    name: 'hash5_identical',
    inputs: [BigInt(777), BigInt(777), BigInt(777), BigInt(777), BigInt(777)],
    hashType: 'hash5',
    description: 'All inputs identical'
  },

  // Special patterns
  {
    name: 'hash5_alternating',
    inputs: [BigInt(0), BigInt(1), BigInt(0), BigInt(1), BigInt(0)],
    hashType: 'hash5',
    description: 'Alternating zero/one pattern'
  },
  {
    name: 'hash5_powers_of_two',
    inputs: [BigInt(1), BigInt(2), BigInt(4), BigInt(8), BigInt(16)],
    hashType: 'hash5',
    description: 'Powers of two sequence'
  }
];

describe('Poseidon Hash Consistency E2E Tests', function () {
  this.timeout(900000); // 15 minutes for comprehensive tests

  let circomkit: Circomkit;
  let hashLeftRightCircuit: WitnessTester<['left', 'right'], ['hash']>;
  let hasher5Circuit: WitnessTester<['in'], ['hash']>;
  let rustTestVectors: RustTestVector[] = [];

  before(async function () {
    this.timeout(300000); // 5 minutes for setup

    console.log('Setting up Poseidon consistency tests...');

    // Load Rust test vectors (REQUIRED)
    if (!vectorsExist()) {
      throw new Error(
        'Rust test vectors not found. They should be auto-generated by pretest:poseidon hook.\n' +
          'If this error occurs, try running: pnpm generate:vectors'
      );
    }

    rustTestVectors = loadRustTestVectors();
    console.log(`✓ Loaded ${rustTestVectors.length} Rust test vectors`);

    // Initialize circomkit (REQUIRED)
    if (!fs.existsSync(CIRCOMKIT_CONFIG_PATH)) {
      throw new Error(
        `Circomkit config not found at: ${CIRCOMKIT_CONFIG_PATH}\n` +
          'Circuit tests are required. Please ensure circuits are set up properly.'
      );
    }

    const config = JSON.parse(fs.readFileSync(CIRCOMKIT_CONFIG_PATH, 'utf-8')) as CircomkitConfig;

    // Convert relative paths to absolute paths based on CIRCUITS_DIR
    const absoluteInclude = (config.include || []).map((includePath: string) =>
      path.isAbsolute(includePath) ? includePath : path.join(CIRCUITS_DIR, includePath)
    );

    circomkit = new Circomkit({
      ...config,
      dirPtau: path.join(CIRCUITS_DIR, config.dirPtau || './ptau'),
      dirCircuits: path.join(CIRCUITS_DIR, config.dirCircuits || './circom'),
      dirInputs: path.join(CIRCUITS_DIR, config.dirInputs || './inputs'),
      dirBuild: path.join(CIRCUITS_DIR, config.dirBuild || './build'),
      include: absoluteInclude,
      verbose: false,
      logLevel: 'WARN'
    });

    console.log('✓ Circomkit initialized');

    // Load circuits (REQUIRED)
    try {
      hashLeftRightCircuit = await circomkit.WitnessTester('hashLeftRight', {
        file: CIRCOM_PATH,
        template: 'HashLeftRight'
      });
      console.log('✓ HashLeftRight circuit loaded');

      hasher5Circuit = await circomkit.WitnessTester('hasher5', {
        file: CIRCOM_PATH,
        template: 'Hasher5'
      });
      console.log('✓ Hasher5 circuit loaded');
    } catch (error) {
      throw new Error(
        `Failed to load circuits. Please compile them first:\n` +
          `  cd packages/circuits && pnpm circom:build\n\n` +
          `Original error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  describe('1. SDK Poseidon Hash Tests', () => {
    it('should compute hash2 correctly', () => {
      const result = hash2([BigInt(1), BigInt(2)]);

      expect(result).to.be.a('bigint');
      expect(result > BigInt(0)).to.be.true;

      console.log('  SDK hash2([1, 2]):', result.toString());
    });

    it('should compute hashLeftRight correctly', () => {
      const result = hashLeftRight(BigInt(1), BigInt(2));

      expect(result).to.be.a('bigint');
      expect(result > BigInt(0)).to.be.true;

      console.log('  SDK hashLeftRight(1, 2):', result.toString());
    });

    it('hashLeftRight should equal hash2 for same inputs', () => {
      const left = BigInt(123);
      const right = BigInt(456);

      const hashLeftRightResult = hashLeftRight(left, right);
      const hash2Result = hash2([left, right]);

      expect(hashLeftRightResult).to.equal(
        hash2Result,
        'hashLeftRight and hash2 should produce identical results for the same inputs'
      );

      console.log(
        '  ✓ hashLeftRight(123, 456) === hash2([123, 456]):',
        hashLeftRightResult.toString()
      );
    });

    it('should compute hash5 correctly', () => {
      const result = hash5([BigInt(1), BigInt(2), BigInt(3), BigInt(4), BigInt(5)]);

      expect(result).to.be.a('bigint');
      expect(result > BigInt(0)).to.be.true;

      console.log('  SDK hash5([1,2,3,4,5]):', result.toString());
    });

    it('should be deterministic', () => {
      const input = [BigInt(42), BigInt(84)];
      const result1 = hash2(input);
      const result2 = hash2(input);

      expect(result1).to.equal(result2);
    });

    it('should be order-sensitive', () => {
      const result1 = hash2([BigInt(1), BigInt(2)]);
      const result2 = hash2([BigInt(2), BigInt(1)]);

      expect(result1).to.not.equal(result2);
    });

    describe('All Test Vectors - SDK', () => {
      TEST_VECTORS.forEach((vector) => {
        it(`should handle ${vector.name}: ${vector.description}`, () => {
          let result: bigint;

          if (vector.hashType === 'hash2') {
            expect(vector.inputs).to.have.lengthOf(2);
            result = hash2(vector.inputs);
          } else {
            expect(vector.inputs).to.have.lengthOf(5);
            result = hash5(vector.inputs);
          }

          expect(result).to.be.a('bigint');
          console.log(`  ${vector.name}: ${result.toString().substring(0, 20)}...`);
        });
      });
    });
  });

  describe('2. Circuit Poseidon Hash Tests', () => {
    it('should compute hash2 via circuit witness', async function () {
      expect(hashLeftRightCircuit, 'hashLeftRightCircuit must be initialized').to.exist;

      const left = BigInt(1);
      const right = BigInt(2);

      const witness = await hashLeftRightCircuit.calculateWitness({
        left,
        right
      });

      await hashLeftRightCircuit.expectConstraintPass(witness);
      const circuitResult = await getSignal(hashLeftRightCircuit, witness, 'hash');

      expect(circuitResult).to.be.a('bigint');
      expect(circuitResult > BigInt(0)).to.be.true;

      console.log('  Circuit hash2([1, 2]):', circuitResult.toString());
    });

    it('should match SDK hashLeftRight with circuit', async function () {
      expect(hashLeftRightCircuit, 'hashLeftRightCircuit must be initialized').to.exist;

      const left = BigInt(123);
      const right = BigInt(456);

      // SDK computation
      const sdkResult = hashLeftRight(left, right);

      // Circuit computation
      const witness = await hashLeftRightCircuit.calculateWitness({
        left,
        right
      });

      await hashLeftRightCircuit.expectConstraintPass(witness);
      const circuitResult = await getSignal(hashLeftRightCircuit, witness, 'hash');

      expect(circuitResult).to.equal(
        sdkResult,
        'Circuit hashLeftRight should match SDK hashLeftRight'
      );

      console.log('  ✓ SDK hashLeftRight === Circuit HashLeftRight:', sdkResult.toString());
    });

    it('should compute hash5 via circuit witness', async function () {
      expect(hasher5Circuit, 'hasher5Circuit must be initialized').to.exist;

      const inputs = [BigInt(1), BigInt(2), BigInt(3), BigInt(4), BigInt(5)];

      const witness = await hasher5Circuit.calculateWitness({
        in: inputs
      });

      await hasher5Circuit.expectConstraintPass(witness);
      const circuitResult = await getSignal(hasher5Circuit, witness, 'hash');

      expect(circuitResult).to.be.a('bigint');
      expect(circuitResult > BigInt(0)).to.be.true;

      console.log('  Circuit hash5([1,2,3,4,5]):', circuitResult.toString());
    });
  });

  describe('3. Cross-Component Consistency Tests', () => {
    describe('hash2 consistency', () => {
      const hash2Vectors = TEST_VECTORS.filter((v) => v.hashType === 'hash2');

      hash2Vectors.forEach((vector) => {
        it(`${vector.name} - SDK vs Circuit vs Rust`, async function () {
          // SDK computation
          const sdkResult = hash2(vector.inputs);
          console.log(`\n  ${vector.name}:`);
          console.log(`    Description: ${vector.description}`);
          console.log(`    Inputs: [${vector.inputs.join(', ')}]`);
          console.log(`    SDK Result: ${sdkResult.toString()}`);

          // Rust computation (from generated vectors - REQUIRED)
          const rustVector = findVector(rustTestVectors, vector.name);
          if (!rustVector) {
            throw new Error(
              `Rust test vector not found for "${vector.name}". ` +
                `Please ensure TypeScript TEST_VECTORS and Rust generate_test_vectors.rs are synchronized.`
            );
          }

          const rustResultBigInt = BigInt(rustVector.rust_result);
          console.log(`    Rust Result: ${rustResultBigInt.toString()}`);
          expect(sdkResult).to.equal(rustResultBigInt, 'SDK and Rust results should match');
          console.log('    ✓ SDK ↔ Rust: MATCH');

          // Circuit computation (must be available)
          expect(
            hashLeftRightCircuit,
            'hashLeftRightCircuit must be initialized for cross-component tests'
          ).to.exist;

          const witness = await hashLeftRightCircuit.calculateWitness({
            left: vector.inputs[0],
            right: vector.inputs[1]
          });

          await hashLeftRightCircuit.expectConstraintPass(witness);
          const circuitResult = await getSignal(hashLeftRightCircuit, witness, 'hash');

          console.log(`    Circuit Result: ${circuitResult.toString()}`);

          expect(sdkResult).to.equal(circuitResult, 'SDK and Circuit results should match');
          console.log('    ✓ SDK ↔ Circuit: MATCH');

          // Also verify Circuit ↔ Rust
          if (rustVector) {
            const rustResultBigInt = BigInt(rustVector.rust_result);
            expect(circuitResult).to.equal(
              rustResultBigInt,
              'Circuit and Rust results should match'
            );
            console.log('    ✓ Circuit ↔ Rust: MATCH');
            console.log('    ✅ All three implementations match!');
          }
        });
      });
    });

    describe('hash5 consistency', () => {
      const hash5Vectors = TEST_VECTORS.filter((v) => v.hashType === 'hash5');

      hash5Vectors.forEach((vector) => {
        it(`${vector.name} - SDK vs Circuit vs Rust`, async function () {
          // SDK computation
          const sdkResult = hash5(vector.inputs);
          console.log(`\n  ${vector.name}:`);
          console.log(`    Description: ${vector.description}`);
          console.log(`    Inputs: [${vector.inputs.slice(0, 3).join(', ')}, ...]`);
          console.log(`    SDK Result: ${sdkResult.toString()}`);

          // Rust computation (from generated vectors - REQUIRED)
          const rustVector = findVector(rustTestVectors, vector.name);
          if (!rustVector) {
            throw new Error(
              `Rust test vector not found for "${vector.name}". ` +
                `Please ensure TypeScript TEST_VECTORS and Rust generate_test_vectors.rs are synchronized.`
            );
          }

          const rustResultBigInt = BigInt(rustVector.rust_result);
          console.log(`    Rust Result: ${rustResultBigInt.toString()}`);
          expect(sdkResult).to.equal(rustResultBigInt, 'SDK and Rust results should match');
          console.log('    ✓ SDK ↔ Rust: MATCH');

          // Circuit computation (must be available)
          expect(hasher5Circuit, 'hasher5Circuit must be initialized for cross-component tests').to
            .exist;

          const witness = await hasher5Circuit.calculateWitness({
            in: vector.inputs
          });

          await hasher5Circuit.expectConstraintPass(witness);
          const circuitResult = await getSignal(hasher5Circuit, witness, 'hash');

          console.log(`    Circuit Result: ${circuitResult.toString()}`);

          expect(sdkResult).to.equal(circuitResult, 'SDK and Circuit results should match');
          console.log('    ✓ SDK ↔ Circuit: MATCH');

          // Also verify Circuit ↔ Rust
          if (rustVector) {
            const rustResultBigInt = BigInt(rustVector.rust_result);
            expect(circuitResult).to.equal(
              rustResultBigInt,
              'Circuit and Rust results should match'
            );
            console.log('    ✓ Circuit ↔ Rust: MATCH');
            console.log('    ✅ All three implementations match!');
          }
        });
      });
    });
  });

  describe('4. Edge Cases and Security Properties', () => {
    it('should produce different hashes for zero vs non-zero', () => {
      const zeroHash = hash2([BigInt(0), BigInt(0)]);
      const nonZeroHash = hash2([BigInt(1), BigInt(1)]);

      expect(zeroHash).to.not.equal(nonZeroHash);
    });

    it('should have avalanche effect', () => {
      // Small change in input should cause large change in output
      const hash1 = hash2([BigInt(1), BigInt(2)]);
      const hash2Changed = hash2([BigInt(1), BigInt(3)]);

      // Convert to binary and count differing bits
      const hash1Str = hash1.toString(2).padStart(256, '0');
      const hash2Str = hash2Changed.toString(2).padStart(256, '0');

      let differingBits = 0;
      for (let i = 0; i < Math.min(hash1Str.length, hash2Str.length); i++) {
        if (hash1Str[i] !== hash2Str[i]) differingBits++;
      }

      // Should differ in many bits (typically ~50% for good hash functions)
      expect(differingBits > 50).to.be.true;
      console.log(
        `  Avalanche effect: ${differingBits}/256 bits differ (${((differingBits / 256) * 100).toFixed(2)}%)`
      );
    });

    it('should handle maximum field element safely', () => {
      const maxField = SNARK_FIELD_SIZE - BigInt(1);

      expect(() => {
        const result = hash2([maxField, BigInt(1)]);
        console.log('  Max field hash:', result.toString().substring(0, 30), '...');
      }).to.not.throw();
    });

    it('should produce collision-resistant hashes', () => {
      const hashes = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const hash = hash2([BigInt(i), BigInt(i + 1)]);
        const hashStr = hash.toString();

        expect(hashes.has(hashStr)).to.be.false;
        hashes.add(hashStr);
      }

      console.log('  Generated 100 unique hashes with no collisions');
    });
  });

  describe('5. Real-World MACI Scenarios', () => {
    it('should compute message hash like publish_message', () => {
      // Simulate publish_message hash structure
      const messageData = [
        BigInt(1), // stateIndex
        BigInt(2), // voteOptionIndex
        BigInt(100), // voteWeight
        BigInt(3), // nonce
        BigInt(42) // pollId
      ];

      const messageHash = hash5(messageData);
      console.log('  Message hash:', messageHash.toString());

      // Additional processing
      const encPubKey = [BigInt(5), BigInt(6)];
      const finalHash = hash2([messageHash, encPubKey[0]]);

      const finalHashLeftRight = hashLeftRight(messageHash, encPubKey[0]);
      console.log('  Final hash (with pubkey):', finalHash.toString());
      console.log('  Final hashLeftRight (with pubkey):', finalHashLeftRight.toString());

      expect(messageHash).to.be.a('bigint');
      expect(finalHash).to.be.a('bigint');
      expect(finalHashLeftRight).to.equal(finalHash);
    });

    it('should compute Merkle tree hash like state tree', () => {
      // Simulate Merkle tree construction
      const leftLeaf = hash5([BigInt(1), BigInt(2), BigInt(3), BigInt(4), BigInt(5)]);
      const rightLeaf = hash5([BigInt(6), BigInt(7), BigInt(8), BigInt(9), BigInt(10)]);

      // Parent hash
      const parentHash = hash2([leftLeaf, rightLeaf]);

      console.log('  Left leaf:', leftLeaf.toString().substring(0, 30), '...');
      console.log('  Right leaf:', rightLeaf.toString().substring(0, 30), '...');
      console.log('  Parent hash:', parentHash.toString().substring(0, 30), '...');

      expect(parentHash).to.be.a('bigint');
    });
  });

  after(() => {
    console.log('\n================================');
    console.log('Poseidon Consistency Test Complete');
    console.log('================================\n');
  });
});
