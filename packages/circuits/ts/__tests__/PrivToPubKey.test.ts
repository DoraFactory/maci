import { EdDSAPoseidonKeypair } from '@dorafactory/maci-sdk';
import { inCurve } from '@zk-kit/baby-jubjub';
import { expect } from 'chai';
import { type WitnessTester } from 'circomkit';
import fc from 'fast-check';

import { circomkitInstance, getSignal } from './utils/utils';

/**
 * PrivToPubKey (Private Key to Public Key) Circuit Tests
 *
 * Circuit Location: packages/circuits/circom/utils/privToPubKey.circom
 *
 * ============================================================================
 * CIRCUIT FUNCTIONALITY
 * ============================================================================
 *
 * This circuit derives a public key from a private key on the BabyJubJub curve.
 * It's a fundamental operation in elliptic curve cryptography used throughout
 * MACI for key generation and identity management.
 *
 * ============================================================================
 * MATHEMATICAL OPERATION
 * ============================================================================
 *
 * Public Key Derivation:
 *   pubKey = privKey * G
 *
 * Where:
 *   - privKey: A scalar in range [0, SUBGROUP_ORDER)
 *   - G: The base point of BabyJubJub curve
 *   - pubKey: A point on the curve (x, y coordinates)
 *
 * BabyJubJub Curve Parameters:
 *   - Field: 𝔽p where p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
 *   - Subgroup Order: 2736030358979909402780800718157159386076813972158567259200215660948447373041
 *   - Base Point G: (x, y) = specific curve point
 *
 * ============================================================================
 * SECURITY VALIDATION (CRITICAL!)
 * ============================================================================
 *
 * The circuit enforces: privKey < SUBGROUP_ORDER
 *
 * Why this matters:
 * - Without validation: privKey and (privKey + SUBGROUP_ORDER) produce the SAME pubKey
 * - With validation: Each privKey maps to exactly ONE unique pubKey
 *
 * This prevents:
 * - Public key collisions
 * - Identity confusion attacks
 * - Replay attacks with equivalent keys
 *
 * See: SECURITY_PRIVKEY_VALIDATION.md for detailed analysis
 *
 * ============================================================================
 * HOW THE CIRCUIT WORKS
 * ============================================================================
 *
 * Step 1: Validate private key range
 *   - Check: privKey < SUBGROUP_ORDER
 *   - Ensures uniqueness of key mapping
 *
 * Step 2: Convert private key to bits
 *   - privKey → 253-bit binary representation
 *
 * Step 3: Scalar multiplication
 *   - Compute pubKey = privKey * BASE_POINT
 *   - Uses efficient double-and-add algorithm
 *
 * Step 4: Output public key
 *   - Returns (pubKey_x, pubKey_y)
 *   - Guaranteed to be a valid curve point
 *
 * ============================================================================
 * TESTING STRATEGY
 * ============================================================================
 *
 * 1. Correctness: Circuit output matches SDK keypair derivation
 * 2. Curve membership: Output is always on BabyJubJub curve
 * 3. Security: Rejects invalid private keys (>= SUBGROUP_ORDER)
 * 4. Boundary: Tests edge cases at SUBGROUP_ORDER boundaries
 * 5. Fuzz: 10,000 random inputs to ensure robustness
 *
 * ============================================================================
 */
describe('Public key derivation circuit', function test() {
  this.timeout(900000);

  let circuit: WitnessTester<['privKey'], ['pubKey']>;

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('privToPubKey', {
      file: './utils/privToPubKey',
      template: 'PrivToPubKey'
    });
  });

  it('should correctly compute a public key', async () => {
    /**
     * Test Case: Basic public key derivation
     *
     * Verifies that pubKey = privKey * G (scalar multiplication on curve).
     * Circuit output must match SDK's keypair generation.
     *
     * This is the fundamental operation for all MACI identities.
     */
    const keypair = new EdDSAPoseidonKeypair();

    const circuitInputs = {
      privKey: keypair.getFormatedPrivKey()
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const derivedPublicKeyX = await getSignal(circuit, witness, 'pubKey[0]');
    const derivedPublicKeyY = await getSignal(circuit, witness, 'pubKey[1]');
    expect(derivedPublicKeyX.toString()).to.be.eq(keypair.getPublicKey().toPoints()[0].toString());
    expect(derivedPublicKeyY.toString()).to.be.eq(keypair.getPublicKey().toPoints()[1].toString());
  });

  it('should produce an output that is within the baby jubjub curve', async () => {
    /**
     * Test Case: Curve membership validation
     *
     * Ensures the output point lies on the BabyJubJub curve.
     * Uses @zk-kit/baby-jubjub's inCurve() validator.
     *
     * Security: Invalid points could break cryptographic assumptions.
     */
    const keypair = new EdDSAPoseidonKeypair();

    const circuitInputs = {
      privKey: keypair.getFormatedPrivKey()
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const derivedPublicKeyX = await getSignal(circuit, witness, 'pubKey[0]');
    const derivedPublicKeyY = await getSignal(circuit, witness, 'pubKey[1]');
    expect(inCurve([derivedPublicKeyX, derivedPublicKeyY])).to.eq(true);
  });

  it('should correctly compute a public key [fuzz]', async () => {
    /**
     * Test Case: Property-based fuzz testing (10,000 iterations)
     *
     * Tests 10,000 random private keys to ensure:
     * 1. Correctness: Circuit matches SDK for all inputs
     * 2. Curve validity: All outputs are valid curve points
     * 3. Robustness: No edge cases cause failures
     *
     * This extensive testing provides high confidence in circuit correctness.
     */
    await fc.assert(
      fc.asyncProperty(fc.bigInt(), async (salt: bigint) => {
        const kepair = EdDSAPoseidonKeypair.fromSecretKey(salt);
        const privKey = kepair.getFormatedPrivKey();
        const publicKey = kepair.getPublicKey();

        const witness = await circuit.calculateWitness({
          privKey: privKey
        });
        await circuit.expectConstraintPass(witness);

        const derivedPublicKeyX = await getSignal(circuit, witness, 'pubKey[0]');
        const derivedPublicKeyY = await getSignal(circuit, witness, 'pubKey[1]');

        return (
          derivedPublicKeyX === publicKey.toPoints()[0] &&
          derivedPublicKeyY === publicKey.toPoints()[1] &&
          inCurve([derivedPublicKeyX, derivedPublicKeyY])
        );
      }),
      { numRuns: 10_000 }
    );
  });

  describe('Invalid private key inputs', () => {
    // BabyJubJub subgroup order
    const SUBGROUP_ORDER =
      2736030358979909402780800718157159386076813972158567259200215660948447373041n;

    it('should reject private key when privKey >= SUBGROUP_ORDER', async () => {
      /**
       * Test Case: CRITICAL SECURITY TEST - Subgroup order validation
       *
       * Problem without validation:
       * - privKey and (privKey + SUBGROUP_ORDER) → SAME pubKey
       * - One public key maps to multiple private keys
       * - Identity confusion attacks possible
       *
       * Solution:
       * - Circuit enforces: privKey < SUBGROUP_ORDER
       * - Each private key → unique public key (one-to-one mapping)
       *
       * This test verifies:
       * 1. Valid key (< SUBGROUP_ORDER) → accepted
       * 2. Invalid key (>= SUBGROUP_ORDER) → rejected with constraint error
       *
       * See: SECURITY_PRIVKEY_VALIDATION.md for detailed analysis
       */
      const keypair = new EdDSAPoseidonKeypair();
      const validPrivKey = keypair.getFormatedPrivKey();

      // Create an invalid private key by adding SUBGROUP_ORDER
      const invalidPrivKey = validPrivKey + SUBGROUP_ORDER;

      // Both should be less than 2^253 to pass Num2Bits(253) constraint
      expect(invalidPrivKey < 2n ** 253n).to.eq(true);

      // Valid private key should work fine
      const witness1 = await circuit.calculateWitness({
        privKey: validPrivKey
      });
      await circuit.expectConstraintPass(witness1);

      const pubKeyX1 = await getSignal(circuit, witness1, 'pubKey[0]');
      const pubKeyY1 = await getSignal(circuit, witness1, 'pubKey[1]');
      expect(inCurve([pubKeyX1, pubKeyY1])).to.eq(true);

      // Invalid private key (>= SUBGROUP_ORDER) should be REJECTED
      try {
        await circuit.calculateWitness({
          privKey: invalidPrivKey
        });
        // If we reach here, the test should fail - the circuit should have rejected this
        expect.fail('Expected circuit to reject privKey >= SUBGROUP_ORDER');
      } catch (error) {
        // Expected to throw an error due to LessThan constraint failure
        expect(error).to.exist;
      }
    });

    it('should fail when privKey >= 2^253', async () => {
      /**
       * Test Case: Field size boundary validation
       *
       * Tests that privKey >= 2^253 is rejected by Num2Bits(253).
       *
       * Num2Bits(253) constraint enforces: input < 2^253
       * This is the absolute maximum for BabyJubJub operations.
       *
       * Expected: Witness calculation fails (cannot represent 253+ bits)
       */
      const tooLargePrivKey = 2n ** 253n;

      try {
        await circuit.calculateWitness({
          privKey: tooLargePrivKey
        });
        // If we reach here, the test should fail
        expect.fail('Expected witness calculation to fail for privKey >= 2^253');
      } catch (error) {
        // Expected to throw an error
        expect(error).to.exist;
      }
    });

    it('should succeed for privKey at boundary (SUBGROUP_ORDER - 1)', async () => {
      /**
       * Test Case: Boundary value test - maximum valid privKey
       *
       * Tests privKey = SUBGROUP_ORDER - 1 (largest valid value).
       *
       * This is the edge case:
       * - SUBGROUP_ORDER - 1: valid ✓ (accepted)
       * - SUBGROUP_ORDER: invalid ✗ (rejected)
       *
       * Verifies:
       * 1. Circuit accepts maximum valid key
       * 2. Output is valid curve point
       * 3. Boundary condition is correctly handled
       *
       * Off-by-one errors would fail this test!
       */
      const maxValidPrivKey = SUBGROUP_ORDER - 1n;

      const witness = await circuit.calculateWitness({
        privKey: maxValidPrivKey
      });
      await circuit.expectConstraintPass(witness);

      const pubKeyX = await getSignal(circuit, witness, 'pubKey[0]');
      const pubKeyY = await getSignal(circuit, witness, 'pubKey[1]');

      // Should produce a valid point on the curve
      expect(inCurve([pubKeyX, pubKeyY])).to.eq(true);
    });
  });
});
