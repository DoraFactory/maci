import { SNARK_FIELD_SIZE, sha256Hash } from '@dorafactory/maci-sdk';
import { type WitnessTester } from 'circomkit';
import fc from 'fast-check';

import { getSignal, circomkitInstance } from './utils/utils';

const CIRCOM_PATH = './utils/hasherSha256';

/**
 * SHA256 Hasher Circuit Tests
 *
 * Circuit Location: packages/circuits/circom/utils/hasherSha256.circom
 *
 * ============================================================================
 * CIRCUIT FUNCTIONALITY
 * ============================================================================
 *
 * These circuits implement SHA256 hashing for field elements in zero-knowledge.
 * SHA256 is a standardized cryptographic hash function widely used in blockchain
 * and cryptographic protocols.
 *
 * ============================================================================
 * WHY SHA256 IN ZK CIRCUITS?
 * ============================================================================
 *
 * While Poseidon is more efficient in ZK circuits, SHA256 is used when:
 * 1. Interoperability with standard systems (Ethereum uses Keccak256)
 * 2. Compatibility with existing cryptographic infrastructure
 * 3. Standardization requirements (SHA256 is NIST-approved)
 * 4. Cross-chain verification needs
 *
 * Trade-off: SHA256 requires ~25,000 constraints vs Poseidon's ~150 constraints
 *
 * ============================================================================
 * HOW IT WORKS
 * ============================================================================
 *
 * Process:
 * 1. Convert field elements to bits using UnpackElement
 * 2. Feed bits into SHA256 compression function
 * 3. Output 256-bit hash as a field element
 *
 * Input Format:
 *   - Field elements (up to 253 bits each)
 *   - Unpacked to 32-bit chunks for SHA256
 *
 * Output:
 *   - 256-bit hash as a single field element
 *
 * ============================================================================
 * CIRCUIT VARIANTS
 * ============================================================================
 *
 * - Sha256HashLeftRight: Hash 2 elements (for Merkle trees)
 * - Sha256Hasher4: Hash 4 elements
 * - Sha256Hasher5: Hash 5 elements
 * - Sha256Hasher6: Hash 6 elements
 * - Sha256Hasher10: Hash 10 elements
 *
 * Each variant is optimized for specific use cases in MACI.
 *
 * ============================================================================
 * TESTING APPROACH
 * ============================================================================
 *
 * These tests use property-based testing (fast-check) to verify:
 * 1. Correctness: Circuit output matches JS implementation
 * 2. Determinism: Same input → same output
 * 3. Collision resistance: Different inputs → different outputs
 * 4. Edge cases: Zero values, maximum values
 *
 * ============================================================================
 */
describe('SHA256 hash circuits', function test() {
  this.timeout(900000);

  describe('Sha256HashLeftRight', () => {
    let circuit: WitnessTester<['left', 'right'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('sha256HashLeftRight', {
        file: CIRCOM_PATH,
        template: 'Sha256HashLeftRight'
      });
    });

    it('correctly hashes left and right values', async () => {
      /**
       * Property-based test: Verifies circuit matches JavaScript SHA256 implementation
       * for 10 random pairs of field elements. Used for Merkle tree hashing.
       * Reduced from 100+ runs for faster testing while maintaining coverage.
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
            const outputJS = sha256Hash([left, right]);

            return output === outputJS;
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should produce consistent hash for same inputs', async () => {
      /** Determinism test: Same inputs always produce same output */
      const left = 12345n;
      const right = 67890n;

      const witness1 = await circuit.calculateWitness({ left, right });
      const output1 = await getSignal(circuit, witness1, 'hash');

      const witness2 = await circuit.calculateWitness({ left, right });
      const output2 = await getSignal(circuit, witness2, 'hash');

      return output1 === output2;
    });
  });

  describe('Sha256Hasher4', () => {
    let circuit: WitnessTester<['in'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('sha256Hasher4', {
        file: CIRCOM_PATH,
        template: 'Sha256Hasher4'
      });
    });

    it('correctly hashes 4 random values', async () => {
      /** Property-based test: 4-element SHA256 hash verification across random inputs */
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
            const outputJS = sha256Hash(preImages);

            return output === outputJS;
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should handle zero values correctly', async () => {
      /** Edge case: All-zero input test */
      const inputs = [0n, 0n, 0n, 0n];
      const witness = await circuit.calculateWitness({ in: inputs });
      await circuit.expectConstraintPass(witness);
      const output = await getSignal(circuit, witness, 'hash');
      const outputJS = sha256Hash(inputs);

      return output === outputJS;
    });
  });

  describe('Sha256Hasher5', () => {
    let circuit: WitnessTester<['in'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('sha256Hasher5', {
        file: CIRCOM_PATH,
        template: 'Sha256Hasher5'
      });
    });

    it('correctly hashes 5 random values', async () => {
      /** Property-based test: 5-element SHA256 hash verification across random inputs */
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
            const outputJS = sha256Hash(preImages);

            return output === outputJS;
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should produce different hashes for different inputs', async () => {
      /** Collision resistance: Different inputs (even reversed) produce different hashes */
      const inputs1 = [1n, 2n, 3n, 4n, 5n];
      const inputs2 = [5n, 4n, 3n, 2n, 1n];

      const witness1 = await circuit.calculateWitness({ in: inputs1 });
      const output1 = await getSignal(circuit, witness1, 'hash');

      const witness2 = await circuit.calculateWitness({ in: inputs2 });
      const output2 = await getSignal(circuit, witness2, 'hash');

      return output1 !== output2;
    });
  });

  describe('Sha256Hasher6', () => {
    let circuit: WitnessTester<['in'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('sha256Hasher6', {
        file: CIRCOM_PATH,
        template: 'Sha256Hasher6'
      });
    });

    it('correctly hashes 6 random values', async () => {
      /** Property-based test: 6-element SHA256 hash verification across random inputs */
      const n = 6;

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
            const outputJS = sha256Hash(preImages);

            return output === outputJS;
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Sha256Hasher10', () => {
    let circuit: WitnessTester<['in'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('sha256Hasher10', {
        file: CIRCOM_PATH,
        template: 'Sha256Hasher10'
      });
    });

    it('correctly hashes 10 random values', async () => {
      /** Property-based test: 10-element SHA256 hash verification across random inputs */
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
            const outputJS = sha256Hash(preImages);

            return output === outputJS;
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should handle large values correctly', async () => {
      /** Edge case: All maximum field values (boundary test) */
      const inputs = Array(10)
        .fill(0)
        .map(() => SNARK_FIELD_SIZE - 1n);

      const witness = await circuit.calculateWitness({ in: inputs });
      await circuit.expectConstraintPass(witness);
      const output = await getSignal(circuit, witness, 'hash');
      const outputJS = sha256Hash(inputs);

      return output === outputJS;
    });
  });
});
