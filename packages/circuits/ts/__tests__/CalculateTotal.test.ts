import { SNARK_FIELD_SIZE } from '@dorafactory/maci-sdk';
import { type WitnessTester } from 'circomkit';
import fc from 'fast-check';

import { circomkitInstance, getSignal } from './utils/utils';

/**
 * CalculateTotal Circuit Tests
 *
 * ============================================================================
 * CIRCUIT OVERVIEW
 * ============================================================================
 *
 * The CalculateTotal circuit computes the sum of n input values.
 *
 * Circuit Definition:
 *   template CalculateTotal(n) {
 *     signal input nums[n];
 *     signal output sum;
 *
 *     signal sums[n];
 *     sums[0] <== nums[0];
 *
 *     for (var i=1; i < n; i++) {
 *       sums[i] <== sums[i - 1] + nums[i];
 *     }
 *
 *     sum <== sums[n - 1];
 *   }
 *
 * Key Features:
 * - Uses intermediate signals (sums[]) to accumulate values
 * - Constraint operator (<==) ensures deterministic computation
 * - Works with finite field arithmetic (modulo SNARK_FIELD_SIZE)
 *
 * ============================================================================
 * FINITE FIELD ARITHMETIC
 * ============================================================================
 *
 * All operations in circom happen modulo SNARK_FIELD_SIZE (BN254 prime field):
 *   SNARK_FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617
 *
 * Important Properties:
 * 1. Addition wraps around: (SNARK_FIELD_SIZE + x) % SNARK_FIELD_SIZE = x
 * 2. Negative numbers: -x ≡ SNARK_FIELD_SIZE - x (mod SNARK_FIELD_SIZE)
 * 3. Zero equivalence: SNARK_FIELD_SIZE ≡ 0 (mod SNARK_FIELD_SIZE)
 *
 * ============================================================================
 * TEST STRATEGY
 * ============================================================================
 *
 * 1. Basic Functionality: Simple sums with small values
 * 2. Boundary Conditions: Single values, zeros, maximum safe values
 * 3. Different Array Sizes: n=1, n=2, n=10, etc.
 * 4. Field Arithmetic: Overflow/underflow behavior
 * 5. Negative Values: Proper handling of field negatives
 * 6. Fuzz Testing: Randomized property-based testing (optimized for performance)
 *
 * ============================================================================
 */

describe('CalculateTotal Circuit', function test() {
  this.timeout(900000);

  let circuit: WitnessTester<['nums'], ['sum']>;

  before(async () => {
    // Create a circuit instance with n=6 for most tests
    circuit = await circomkitInstance.WitnessTester('calculateTotal', {
      file: './utils/trees/calculateTotal',
      template: 'CalculateTotal',
      params: [6]
    });
  });

  describe('Basic Functionality', () => {
    it('should correctly sum a list of random positive values', async () => {
      /**
       * Test Case: Sum 6 random values (0-99)
       *
       * This verifies basic accumulation logic with small, safe integers.
       */
      const nums: number[] = [];

      for (let i = 0; i < 6; i += 1) {
        nums.push(Math.floor(Math.random() * 100));
      }

      const sum = nums.reduce((a, b) => a + b, 0);

      await circuit.expectPass({ nums }, { sum });
    });

    it('should correctly sum known values', async () => {
      /**
       * Test Case: Sum [1, 2, 3, 4, 5, 6] = 21
       *
       * Deterministic test with known input/output.
       */
      const nums = [1, 2, 3, 4, 5, 6];
      const expectedSum = 21;

      await circuit.expectPass({ nums }, { sum: expectedSum });
    });

    it('should correctly sum all zeros', async () => {
      /**
       * Test Case: Sum [0, 0, 0, 0, 0, 0] = 0
       *
       * Edge case: verify zero handling.
       */
      const nums = [0, 0, 0, 0, 0, 0];

      await circuit.expectPass({ nums }, { sum: 0 });
    });

    it('should correctly sum when only first element is non-zero', async () => {
      /**
       * Test Case: Sum [100, 0, 0, 0, 0, 0] = 100
       *
       * Tests initialization: sums[0] <== nums[0]
       */
      const nums = [100, 0, 0, 0, 0, 0];

      await circuit.expectPass({ nums }, { sum: 100 });
    });

    it('should correctly sum when only last element is non-zero', async () => {
      /**
       * Test Case: Sum [0, 0, 0, 0, 0, 100] = 100
       *
       * Tests final accumulation: sum <== sums[n - 1]
       */
      const nums = [0, 0, 0, 0, 0, 100];

      await circuit.expectPass({ nums }, { sum: 100 });
    });

    it('should correctly sum identical values', async () => {
      /**
       * Test Case: Sum [10, 10, 10, 10, 10, 10] = 60
       *
       * Tests uniform distribution.
       */
      const nums = [10, 10, 10, 10, 10, 10];

      await circuit.expectPass({ nums }, { sum: 60 });
    });

    it('should correctly sum large safe values', async () => {
      /**
       * Test Case: Sum large but safe integers
       *
       * Use values well within Number.MAX_SAFE_INTEGER to ensure precision.
       */
      const nums = [1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000];
      const expectedSum = 21_000_000;

      await circuit.expectPass({ nums }, { sum: expectedSum });
    });
  });

  describe('Different Array Sizes', () => {
    it('should work with n=1 (single element)', async () => {
      /**
       * Test Case: Minimal array size (n=1)
       *
       * Edge case: no loop iterations, just sums[0] <== nums[0]
       */
      const testCircuit = await circomkitInstance.WitnessTester('calculateTotal_n1', {
        file: './utils/trees/calculateTotal',
        template: 'CalculateTotal',
        params: [1]
      });

      await testCircuit.expectPass({ nums: [42] }, { sum: 42 });
    });

    it('should work with n=2 (two elements)', async () => {
      /**
       * Test Case: Minimal loop iteration (n=2)
       *
       * Only one loop iteration: sums[1] <== sums[0] + nums[1]
       */
      const testCircuit = await circomkitInstance.WitnessTester('calculateTotal_n2', {
        file: './utils/trees/calculateTotal',
        template: 'CalculateTotal',
        params: [2]
      });

      await testCircuit.expectPass({ nums: [10, 20] }, { sum: 30 });
    });

    it('should work with n=10 (larger array)', async () => {
      /**
       * Test Case: Larger array size (n=10)
       *
       * Tests accumulation over more iterations.
       */
      const testCircuit = await circomkitInstance.WitnessTester('calculateTotal_n10', {
        file: './utils/trees/calculateTotal',
        template: 'CalculateTotal',
        params: [10]
      });

      const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const expectedSum = 55; // Sum of 1..10

      await testCircuit.expectPass({ nums }, { sum: expectedSum });
    });

    it('should work with n=100 (large array)', async () => {
      /**
       * Test Case: Large array size (n=100)
       *
       * Tests circuit scalability and constraint generation.
       */
      const testCircuit = await circomkitInstance.WitnessTester('calculateTotal_n100', {
        file: './utils/trees/calculateTotal',
        template: 'CalculateTotal',
        params: [100]
      });

      const nums = Array.from({ length: 100 }, (_, i) => i + 1);
      const expectedSum = (100 * 101) / 2; // Sum of 1..100 = 5050

      await testCircuit.expectPass({ nums }, { sum: expectedSum });
    });
  });

  describe('Finite Field Arithmetic', () => {
    it('should wrap around when sum equals SNARK_FIELD_SIZE (overflow to 0)', async () => {
      /**
       * Test Case: Sum equals SNARK_FIELD_SIZE exactly
       *
       * In finite field arithmetic:
       *   SNARK_FIELD_SIZE ≡ 0 (mod SNARK_FIELD_SIZE)
       *
       * This tests the modular wrap-around behavior.
       */
      const nums: bigint[] = [
        SNARK_FIELD_SIZE,
        SNARK_FIELD_SIZE,
        SNARK_FIELD_SIZE,
        SNARK_FIELD_SIZE,
        SNARK_FIELD_SIZE,
        SNARK_FIELD_SIZE
      ];

      // 6 * SNARK_FIELD_SIZE ≡ 0 (mod SNARK_FIELD_SIZE)
      await circuit.expectPass({ nums }, { sum: 0n });
    });

    it('should wrap around with negative SNARK_FIELD_SIZE values', async () => {
      /**
       * Test Case: Sum of negative SNARK_FIELD_SIZE values
       *
       * In finite field arithmetic:
       *   -SNARK_FIELD_SIZE ≡ 0 (mod SNARK_FIELD_SIZE)
       *
       * Therefore: 6 * (-SNARK_FIELD_SIZE) ≡ 0 (mod SNARK_FIELD_SIZE)
       */
      const nums: bigint[] = [
        -SNARK_FIELD_SIZE,
        -SNARK_FIELD_SIZE,
        -SNARK_FIELD_SIZE,
        -SNARK_FIELD_SIZE,
        -SNARK_FIELD_SIZE,
        -SNARK_FIELD_SIZE
      ];

      await circuit.expectPass({ nums }, { sum: 0n });
    });

    it('should correctly sum mixed positive and negative SNARK_FIELD_SIZE values', async () => {
      /**
       * Test Case: Cancellation of +SNARK_FIELD_SIZE and -SNARK_FIELD_SIZE
       *
       * Input: [-p, +p, -p, +p, 1, 2] where p = SNARK_FIELD_SIZE
       * Result: 0 + 0 + 0 + 0 + 1 + 2 = 3
       *
       * This tests that field additions and subtractions cancel correctly.
       */
      const nums: bigint[] = [
        -SNARK_FIELD_SIZE,
        SNARK_FIELD_SIZE,
        -SNARK_FIELD_SIZE,
        SNARK_FIELD_SIZE,
        1n,
        2n
      ];

      await circuit.expectPass({ nums }, { sum: 3n });
    });

    it('should wrap around when sum slightly exceeds SNARK_FIELD_SIZE', async () => {
      /**
       * Test Case: Sum = SNARK_FIELD_SIZE + 5
       *
       * Expected: (SNARK_FIELD_SIZE + 5) mod SNARK_FIELD_SIZE = 5
       */
      const nums: bigint[] = [SNARK_FIELD_SIZE + 5n, 0n, 0n, 0n, 0n, 0n];

      await circuit.expectPass({ nums }, { sum: 5n });
    });

    it('should handle SNARK_FIELD_SIZE - 1 (maximum valid field element)', async () => {
      /**
       * Test Case: Maximum valid field element
       *
       * SNARK_FIELD_SIZE - 1 is the largest representable positive value.
       * Adding 1 should wrap to 0.
       */
      const maxFieldElement = SNARK_FIELD_SIZE - 1n;
      const nums: bigint[] = [maxFieldElement, 1n, 0n, 0n, 0n, 0n];

      // (p-1) + 1 = p ≡ 0 (mod p)
      await circuit.expectPass({ nums }, { sum: 0n });
    });
  });

  describe('Negative Values (Field Representation)', () => {
    it('should correctly handle small negative values', async () => {
      /**
       * Test Case: Sum [10, -5, -3, 0, 0, 0]
       *
       * In field arithmetic:
       *   -5 is represented as SNARK_FIELD_SIZE - 5
       *   -3 is represented as SNARK_FIELD_SIZE - 3
       *
       * Expected: 10 + (p-5) + (p-3) = 2p + 2 ≡ 2 (mod p)
       */
      const nums: bigint[] = [10n, -5n, -3n, 0n, 0n, 0n];

      await circuit.expectPass({ nums }, { sum: 2n });
    });

    it('should correctly handle all negative values', async () => {
      /**
       * Test Case: Sum [-1, -2, -3, -4, -5, -6] = -21
       *
       * Expected: -21 ≡ SNARK_FIELD_SIZE - 21 (mod SNARK_FIELD_SIZE)
       */
      const nums: bigint[] = [-1n, -2n, -3n, -4n, -5n, -6n];
      const expectedSum = SNARK_FIELD_SIZE - 21n;

      await circuit.expectPass({ nums }, { sum: expectedSum });
    });

    it('should correctly handle mix of positive and negative values summing to zero', async () => {
      /**
       * Test Case: Sum [100, -50, -30, -20, 0, 0] = 0
       *
       * Tests that positive and negative values cancel correctly.
       */
      const nums: bigint[] = [100n, -50n, -30n, -20n, 0n, 0n];

      await circuit.expectPass({ nums }, { sum: 0n });
    });

    it('should correctly handle large negative value', async () => {
      /**
       * Test Case: Sum [-1000000, 0, 0, 0, 0, 0]
       *
       * Expected: -1000000 ≡ SNARK_FIELD_SIZE - 1000000 (mod SNARK_FIELD_SIZE)
       */
      const nums: bigint[] = [-1_000_000n, 0n, 0n, 0n, 0n, 0n];
      const expectedSum = SNARK_FIELD_SIZE - 1_000_000n;

      await circuit.expectPass({ nums }, { sum: expectedSum });
    });
  });

  describe('Edge Cases and Special Values', () => {
    it('should handle powers of 2', async () => {
      /**
       * Test Case: Sum [1, 2, 4, 8, 16, 32] = 63
       *
       * Tests binary-friendly values.
       */
      const nums = [1, 2, 4, 8, 16, 32];

      await circuit.expectPass({ nums }, { sum: 63 });
    });

    it('should handle alternating pattern', async () => {
      /**
       * Test Case: Sum [1, 0, 1, 0, 1, 0] = 3
       *
       * Tests alternating on/off pattern.
       */
      const nums = [1, 0, 1, 0, 1, 0];

      await circuit.expectPass({ nums }, { sum: 3 });
    });

    it('should handle maximum safe JavaScript integer', async () => {
      /**
       * Test Case: Use Number.MAX_SAFE_INTEGER (2^53 - 1)
       *
       * This is the largest integer that can be exactly represented in JavaScript.
       */
      const maxSafeInt = BigInt(Number.MAX_SAFE_INTEGER); // 9,007,199,254,740,991
      const nums: bigint[] = [maxSafeInt, 0n, 0n, 0n, 0n, 0n];

      await circuit.expectPass({ nums }, { sum: maxSafeInt });
    });

    it('should handle increasing sequence', async () => {
      /**
       * Test Case: Sum [1, 2, 3, 4, 5, 6] = 21
       *
       * Tests monotonically increasing values.
       */
      const nums = [1, 2, 3, 4, 5, 6];

      await circuit.expectPass({ nums }, { sum: 21 });
    });

    it('should handle decreasing sequence', async () => {
      /**
       * Test Case: Sum [6, 5, 4, 3, 2, 1] = 21
       *
       * Tests monotonically decreasing values.
       */
      const nums = [6, 5, 4, 3, 2, 1];

      await circuit.expectPass({ nums }, { sum: 21 });
    });
  });

  describe('Constraint Verification', () => {
    it('should pass all constraints for complex accumulation', async () => {
      /**
       * Test Case: Verify constraint satisfaction
       *
       * Note: The intermediate signals (sums[i]) are internal to the circuit
       * and not exposed as outputs. We can only verify that:
       * 1. All constraints are satisfied
       * 2. The final sum is correct
       *
       * This test uses a complex set of values to ensure the accumulation
       * logic is working correctly through all iterations.
       */
      const nums = [10, 20, 30, 40, 50, 60];
      const expectedSum = 210;

      const witness = await circuit.calculateWitness({ nums });
      await circuit.expectConstraintPass(witness);

      // Verify final sum
      const finalSum = await getSignal(circuit, witness, 'sum');
      if (finalSum !== BigInt(expectedSum)) {
        throw new Error(`Final sum is incorrect: expected ${expectedSum}, got ${finalSum}`);
      }
    });

    it('should satisfy constraints with mixed values', async () => {
      /**
       * Test Case: Constraint satisfaction with varied input patterns
       *
       * Uses different patterns to stress-test the accumulation constraints.
       */
      const testCases = [
        { nums: [1, 2, 3, 4, 5, 6], expected: 21 },
        { nums: [100, 200, 300, 400, 500, 600], expected: 2100 },
        { nums: [1, 0, 1, 0, 1, 0], expected: 3 },
        { nums: [999, 1, 999, 1, 999, 1], expected: 3000 }
      ];

      for (const testCase of testCases) {
        const witness = await circuit.calculateWitness({ nums: testCase.nums });
        await circuit.expectConstraintPass(witness);

        const finalSum = await getSignal(circuit, witness, 'sum');
        if (finalSum !== BigInt(testCase.expected)) {
          throw new Error(
            `Sum mismatch for ${JSON.stringify(testCase.nums)}: ` +
              `expected ${testCase.expected}, got ${finalSum}`
          );
        }
      }
    });
  });

  describe('Fuzz Testing (Property-Based)', () => {
    it('should correctly sum random lists of values [fuzz]', async () => {
      /**
       * Test Case: Property-based fuzz testing
       *
       * Strategy:
       * 1. Use fixed-size arrays to avoid recreating circuits (performance)
       * 2. Generate random values in valid field range
       * 3. Ensure sum doesn't exceed field size
       * 4. Verify computed sum matches expected sum
       *
       * Runs: 100 iterations with 6-element arrays
       *
       * IMPORTANT: We limit iterations for performance.
       * Creating new circuits for each test is very slow (would take hours for 10K runs).
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 0n, max: 1000000n }), {
            minLength: 6,
            maxLength: 6
          }),
          async (nums: bigint[]) => {
            const sum = nums.reduce((a, b) => a + b, 0n);

            // Precondition: sum must not overflow
            fc.pre(sum <= SNARK_FIELD_SIZE - 1n);

            const witness = await circuit.calculateWitness({ nums });
            await circuit.expectConstraintPass(witness);

            const total = await getSignal(circuit, witness, 'sum');

            return total === sum;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly sum random positive and negative values [fuzz]', async () => {
      /**
       * Test Case: Fuzz testing with negative values
       *
       * Tests proper field arithmetic with both positive and negative inputs.
       * Uses the pre-created circuit (n=6) for performance.
       *
       * Runs: 50 iterations
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: -1000000n, max: 1000000n }), {
            minLength: 6,
            maxLength: 6
          }),
          async (nums: bigint[]) => {
            // Calculate expected sum in field arithmetic
            let sum = 0n;
            for (const num of nums) {
              sum = (sum + num) % SNARK_FIELD_SIZE;
              if (sum < 0n) {
                sum += SNARK_FIELD_SIZE;
              }
            }

            const witness = await circuit.calculateWitness({ nums });
            await circuit.expectConstraintPass(witness);

            const total = await getSignal(circuit, witness, 'sum');

            return total === sum;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle various array sizes with random values', async () => {
      /**
       * Test Case: Multiple array sizes with random values
       *
       * This test creates circuits of different sizes and tests each with
       * random values. It's more comprehensive but still performance-conscious.
       *
       * Sizes tested: 1, 2, 5, 10, 20
       * Iterations per size: 10
       */
      const testSizes = [1, 2, 5, 10, 20];

      for (const size of testSizes) {
        // Create circuit once for this size
        const sizeCircuit = await circomkitInstance.WitnessTester(`calculateTotal_size_${size}`, {
          file: './utils/trees/calculateTotal',
          template: 'CalculateTotal',
          params: [size]
        });

        // Test 10 times with random values
        for (let i = 0; i < 10; i += 1) {
          const nums: bigint[] = [];
          for (let j = 0; j < size; j += 1) {
            nums.push(BigInt(Math.floor(Math.random() * 1000)));
          }

          const expectedSum = nums.reduce((a, b) => a + b, 0n);

          const witness = await sizeCircuit.calculateWitness({ nums });
          await sizeCircuit.expectConstraintPass(witness);

          const total = await getSignal(sizeCircuit, witness, 'sum');

          if (total !== expectedSum) {
            throw new Error(`Size ${size}, iteration ${i}: expected ${expectedSum}, got ${total}`);
          }
        }
      }
    });
  });
});
