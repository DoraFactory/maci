import {
  SNARK_FIELD_SIZE,
  hash5,
  hash4,
  hash3,
  hash10,
  hash12,
  hashLeftRight
} from '@dorafactory/maci-sdk';
import { type WitnessTester } from 'circomkit';
import fc from 'fast-check';

import { getSignal, circomkitInstance } from './utils/utils';

const CIRCOM_PATH = './utils/hasherPoseidon';

/**
 * Poseidon Hasher Circuit Tests
 *
 * Circuit Location: packages/circuits/circom/utils/hasherPoseidon.circom
 *
 * ============================================================================
 * CIRCUIT FUNCTIONALITY
 * ============================================================================
 *
 * Poseidon is a ZK-friendly cryptographic hash function specifically designed
 * for efficient use in SNARK circuits. It's the PRIMARY hash function used
 * throughout MACI for its superior performance in zero-knowledge proofs.
 *
 * ============================================================================
 * WHY POSEIDON?
 * ============================================================================
 *
 * Comparison with SHA256:
 *
 * | Property | Poseidon | SHA256 |
 * |----------|----------|--------|
 * | Constraints | ~150 | ~25,000 |
 * | Proving time | Fast | Slow |
 * | ZK-optimized | ✓ Yes | ✗ No |
 * | Standardized | Emerging | ✓ NIST |
 *
 * Poseidon achieves 150x fewer constraints, making it ideal for:
 * - Merkle tree computations
 * - Message authentication
 * - State commitments
 * - Vote hashing
 *
 * ============================================================================
 * HOW POSEIDON WORKS
 * ============================================================================
 *
 * Architecture:
 * 1. Uses a sponge construction (similar to SHA3/Keccak)
 * 2. Operates natively on field elements (no bit packing needed!)
 * 3. Employs full and partial rounds with S-boxes
 * 4. Optimized for arithmetic circuits
 *
 * Process:
 *   Input: [field_element_1, field_element_2, ..., field_element_n]
 *   ↓
 *   Absorption phase: Mix inputs into state
 *   ↓
 *   Permutation rounds: Apply S-box and MDS matrix
 *   ↓
 *   Squeezing phase: Extract hash output
 *   ↓
 *   Output: Single field element (hash)
 *
 * ============================================================================
 * SECURITY PROPERTIES
 * ============================================================================
 *
 * 1. Collision Resistance: Computationally infeasible to find x ≠ y where h(x) = h(y)
 * 2. Preimage Resistance: Given h, hard to find x where h(x) = h
 * 3. Second Preimage Resistance: Given x, hard to find y ≠ x where h(x) = h(y)
 * 4. Pseudorandomness: Output is indistinguishable from random
 *
 * Security Level: 128-bit (equivalent to AES-128)
 *
 * ============================================================================
 * CIRCUIT VARIANTS
 * ============================================================================
 *
 * - HashLeftRight: Hash 2 elements (for binary Merkle trees)
 * - Hasher3: Hash 3 elements (for command validation)
 * - Hasher4: Hash 4 elements
 * - Hasher5: Hash 5 elements (for signature messages)
 * - Hasher10: Hash 10 elements (for message chains)
 * - Hasher12: Hash 12 elements (for large state commits)
 *
 * Each optimized for specific MACI operations.
 *
 * ============================================================================
 * TESTING METHODOLOGY
 * ============================================================================
 *
 * Property-based testing with fast-check library:
 * - Tests 100+ random inputs per test case
 * - Verifies circuit output matches JavaScript implementation
 * - Ensures deterministic behavior
 * - Validates across entire field range [0, FIELD_SIZE)
 *
 * This approach provides high confidence in correctness across
 * the vast input space (2^254 possible values).
 *
 * ============================================================================
 */
describe('Poseidon hash circuits', function test() {
  this.timeout(900000);

  describe('HashLeftRight', () => {
    let circuit: WitnessTester<['left', 'right'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('hashLeftRight', {
        file: CIRCOM_PATH,
        template: 'HashLeftRight'
      });
    });

    it('correctly hashes left and right values', async () => {
      /**
       * Property-based test: Verifies circuit matches JavaScript Poseidon implementation
       * for 100+ random pairs of field elements. Core test for binary Merkle tree operations.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }),
          fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }),
          async (left: bigint, right: bigint) => {
            const witness = await circuit.calculateWitness({
              left,
              right
            });
            await circuit.expectConstraintPass(witness);
            const output = await getSignal(circuit, witness, 'hash');
            const outputJS = hashLeftRight(left, right);

            return output === outputJS;
          }
        )
      );
    });
  });

  describe('Hasher3', () => {
    let circuit: WitnessTester<['in'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('hasher3', {
        file: CIRCOM_PATH,
        template: 'Hasher3'
      });
    });

    it('correctly hashes 3 random values', async () => {
      /** Property-based test: 3-element Poseidon hash verification, used for command validation */
      const n = 3;

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
            minLength: n,
            maxLength: n
          }),
          async (preImages: bigint[]) => {
            const witness = await circuit.calculateWitness({
              in: preImages
            });
            await circuit.expectConstraintPass(witness);
            const output = await getSignal(circuit, witness, 'hash');
            const outputJS = hash3(preImages);

            return output === outputJS;
          }
        )
      );
    });
  });

  describe('Hasher4', () => {
    let circuit: WitnessTester<['in'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('hasher4', {
        file: CIRCOM_PATH,
        template: 'Hasher4'
      });
    });

    it('correctly hashes 4 random values', async () => {
      /** Property-based test: 4-element Poseidon hash verification across random inputs */
      const n = 4;

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
            minLength: n,
            maxLength: n
          }),
          async (preImages: bigint[]) => {
            const witness = await circuit.calculateWitness({
              in: preImages
            });
            await circuit.expectConstraintPass(witness);
            const output = await getSignal(circuit, witness, 'hash');
            const outputJS = hash4(preImages);

            return output === outputJS;
          }
        )
      );
    });
  });

  describe('Hasher5', () => {
    let circuit: WitnessTester<['in'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('hasher5', {
        file: CIRCOM_PATH,
        template: 'Hasher5'
      });
    });

    it('correctly hashes 5 random values', async () => {
      /** Property-based test: 5-element Poseidon hash verification, used for signature messages */
      const n = 5;

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
            minLength: n,
            maxLength: n
          }),
          async (preImages: bigint[]) => {
            const witness = await circuit.calculateWitness({
              in: preImages
            });
            await circuit.expectConstraintPass(witness);
            const output = await getSignal(circuit, witness, 'hash');
            const outputJS = hash5(preImages);

            return output === outputJS;
          }
        )
      );
    });
  });

  describe('Hasher10', () => {
    let circuit: WitnessTester<['in'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('hasher10', {
        file: CIRCOM_PATH,
        template: 'Hasher10'
      });
    });

    it('correctly hashes 10 random values', async () => {
      /** Property-based test: 10-element Poseidon hash verification, used for message chains */
      const n = 10;

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
            minLength: n,
            maxLength: n
          }),
          async (preImages: bigint[]) => {
            const witness = await circuit.calculateWitness({
              in: preImages
            });
            await circuit.expectConstraintPass(witness);
            const output = await getSignal(circuit, witness, 'hash');
            const outputJS = hash10(preImages);

            return output === outputJS;
          }
        )
      );
    });
  });

  describe('Hasher12', () => {
    let circuit: WitnessTester<['in'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('hasher12', {
        file: CIRCOM_PATH,
        template: 'Hasher12'
      });
    });

    it('correctly hashes 12 random values', async () => {
      /** Property-based test: 12-element Poseidon hash verification, used for large state commits */
      const n = 12;

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
            minLength: n,
            maxLength: n
          }),
          async (preImages: bigint[]) => {
            const witness = await circuit.calculateWitness({
              in: preImages
            });
            await circuit.expectConstraintPass(witness);
            const output = await getSignal(circuit, witness, 'hash');
            const outputJS = hash12(preImages);

            return output === outputJS;
          }
        )
      );
    });
  });
});
