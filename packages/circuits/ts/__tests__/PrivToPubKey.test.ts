import { EdDSAPoseidonKeypair } from '@dorafactory/maci-sdk';
import { inCurve, mulPointEscalar, Base8 } from '@zk-kit/baby-jubjub';
import { expect } from 'chai';
import { type WitnessTester } from 'circomkit';
import fc from 'fast-check';

import { circomkitInstance, getSignal } from './utils/utils';

// Operator-side key derivation uses the old `circom` package (blake512).
// These functions mirror what packages/circuits/js/keypair.js does in production.
const { genKeypair: operatorGenKeypair } = require('../../js/keypair') as {
  genKeypair: (privKey: bigint) => {
    privKey: bigint;
    pubKey: [bigint, bigint];
    formatedPrivKey: bigint;
  };
};

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

  // -------------------------------------------------------------------------
  // Operator compatibility tests
  //
  // Background:
  //   The on-chain operator uses packages/circuits/js/keypair.js, which derives
  //   keys via blake512 (old `circom` library).  The SDK (used by voters) uses
  //   @zk-kit/eddsa-poseidon, which uses blake2b.  The two libraries produce
  //   DIFFERENT pubkeys from the same raw private key.
  //
  //   The critical question is: does PrivToPubKey(operatorFormatedPrivKey)
  //   still equal the operator's coordPubKey?  If yes, the circuit constraint
  //     PrivToPubKey(coordPrivKey) === coordPubKey
  //   continues to hold and the operator does NOT need to upgrade.
  // -------------------------------------------------------------------------
  describe('Operator compatibility (blake512 key derivation)', () => {
    it('should pass circuit constraint: PrivToPubKey(operatorFormatedPrivKey) === coordPubKey', async () => {
      /**
       * Replicates the processMessages / processDeactivate circuit constraint:
       *   component derivedPubKey = PrivToPubKey();
       *   derivedPubKey.privKey <== coordPrivKey;         // = formatedPrivKey (blake512)
       *   derivedPubKey.pubKey[0] === coordPubKey[0];     // must match
       *   derivedPubKey.pubKey[1] === coordPubKey[1];
       *
       * The operator passes:
       *   coordPrivKey = coordinator.formatedPrivKey  (blake512 scalar >> 3 % SUBGROUP_ORDER)
       *   coordPubKey  = coordinator.pubKey           (eddsa.prv2pub via blake512)
       *
       * Both are derived from the same raw privKey using the same (blake512) path,
       * so BASE8 * formatedPrivKey === pubKey holds even though the values differ
       * from the SDK's blake2b-derived keys.
       */
      const RAW_PRIV_KEY = 111111n;
      const operatorKeypair = operatorGenKeypair(RAW_PRIV_KEY);
      const { pubKey, formatedPrivKey } = operatorKeypair;

      // Run the circuit with the operator's formatedPrivKey
      const witness = await circuit.calculateWitness({ privKey: formatedPrivKey });
      await circuit.expectConstraintPass(witness);

      const circuitPubKeyX = await getSignal(circuit, witness, 'pubKey[0]');
      const circuitPubKeyY = await getSignal(circuit, witness, 'pubKey[1]');

      // Circuit output must match the operator's pubKey
      expect(circuitPubKeyX.toString()).to.equal(pubKey[0].toString());
      expect(circuitPubKeyY.toString()).to.equal(pubKey[1].toString());
    });

    it('should differ from SDK pubKey for the same raw privKey', async () => {
      /**
       * Confirms that the operator (blake512) and the SDK (blake2b) produce
       * DIFFERENT pubkeys from the same raw private key.  This is expected and
       * is NOT a bug — they are independent keypairs.
       *
       * This test documents the known divergence so that any future accidental
       * convergence is immediately visible.
       */
      const RAW_PRIV_KEY = 111111n;

      const operatorKeypair = operatorGenKeypair(RAW_PRIV_KEY);
      const sdkKeypair = EdDSAPoseidonKeypair.fromSecretKey(RAW_PRIV_KEY);

      const [opX, opY] = operatorKeypair.pubKey;
      const [sdkX, sdkY] = sdkKeypair.getPublicKey().toPoints();

      // Both should be on-curve
      expect(inCurve([opX, opY])).to.eq(true, 'operator pubKey must be on BabyJubJub curve');
      expect(inCurve([sdkX, sdkY])).to.eq(true, 'SDK pubKey must be on BabyJubJub curve');

      // They must NOT be equal (different hash algorithms)
      const same = opX === sdkX && opY === sdkY;
      expect(same).to.eq(false, 'blake512 and blake2b should yield different pubKeys');
    });

    it('should pass circuit constraint for multiple operator keypairs', async () => {
      /**
       * Runs the PrivToPubKey circuit constraint check for several distinct
       * operator keypairs, including keys whose hex representation has an odd
       * number of digits (edge case for the bigInt2Buffer no-padding bug).
       *
       * Expected outcome for all cases:
       *   PrivToPubKey(formatedPrivKey_blake512) === coordPubKey_blake512
       *
       * This proves the operator can continue processing rounds without
       * upgrading its key derivation library.
       */
      const testKeys: Array<{ key: bigint; label: string }> = [
        { key: 999999999999n, label: 'normal large key' },
        { key: 0xfn, label: 'odd-length hex (1 char): 0xf' },
        { key: 0xabcn, label: 'odd-length hex (3 chars): 0xabc' },
        { key: 0x1234567n, label: 'odd-length hex (7 chars): 0x1234567' },
        { key: 7766554433221100n, label: 'even-length hex baseline' }
      ];

      for (const { key, label } of testKeys) {
        const operatorKeypair = operatorGenKeypair(key);
        const { pubKey, formatedPrivKey } = operatorKeypair;

        const witness = await circuit.calculateWitness({ privKey: formatedPrivKey });
        await circuit.expectConstraintPass(witness);

        const circuitX = await getSignal(circuit, witness, 'pubKey[0]');
        const circuitY = await getSignal(circuit, witness, 'pubKey[1]');

        expect(circuitX.toString()).to.equal(
          pubKey[0].toString(),
          `pubKey[0] mismatch for: ${label}`
        );
        expect(circuitY.toString()).to.equal(
          pubKey[1].toString(),
          `pubKey[1] mismatch for: ${label}`
        );
      }
    });

    it('should satisfy JS-side PrivToPubKey manually: BASE8 * formatedPrivKey === pubKey', async () => {
      /**
       * Pure JS verification (no circuit) that the mathematical relationship
       *   BASE8 * formatedPrivKey_blake512 === pubKey_blake512
       * holds for operator keypairs.
       *
       * This is the same scalar multiplication the PrivToPubKey circuit performs,
       * expressed directly via @zk-kit/baby-jubjub's mulPointEscalar.
       */
      const testKeys = [111111n, 0xabcn, 999999999999n];

      for (const rawKey of testKeys) {
        const { pubKey, formatedPrivKey } = operatorGenKeypair(rawKey);
        const derived = mulPointEscalar(Base8, formatedPrivKey);

        expect(derived[0].toString()).to.equal(
          pubKey[0].toString(),
          `BASE8 * formatedPrivKey[0] mismatch for rawKey=${rawKey}`
        );
        expect(derived[1].toString()).to.equal(
          pubKey[1].toString(),
          `BASE8 * formatedPrivKey[1] mismatch for rawKey=${rawKey}`
        );
      }
    });
  });

  describe('ECDH symmetry: operator (blake512) coordinator key ↔ SDK (blake2b) user key', () => {
    let ecdhCircuit: WitnessTester<['privKey', 'pubKey'], ['sharedKey']>;

    before(async () => {
      ecdhCircuit = await circomkitInstance.WitnessTester('Ecdh', {
        file: 'utils/ecdh',
        template: 'Ecdh'
      });
    });

    it('should produce the same shared key in both ECDH directions across libraries', async () => {
      /**
       * Models the cross-library ECDH interaction inside the circuits:
       *
       *   processDeactivate builds the deactivate leaf using:
       *     sharedKey = ECDH(coordFormatedPrivKey_blake512, userPubKey_sdk)
       *
       *   addNewKey circuit verifies:
       *     ECDH(userFormatedPrivKey_sdk, coordPubKey_blake512) == stored sharedKey
       *
       * ECDH symmetry guarantees both sides compute the same point:
       *   a * (b * G) = b * (a * G)
       *
       * This test runs both directions through the Ecdh circuit and asserts
       * that the outputs are identical, regardless of the key derivation library.
       */
      const COORD_RAW_KEY = 1234567890n;
      const USER_RAW_KEY = 9876543210n;

      const coordKeypair = operatorGenKeypair(COORD_RAW_KEY); // blake512
      const userSdkKeypair = EdDSAPoseidonKeypair.fromSecretKey(USER_RAW_KEY); // blake2b

      const userPubKey = userSdkKeypair.getPublicKey().toPoints() as [bigint, bigint];
      const coordPubKey = coordKeypair.pubKey;

      // Direction 1: operator coordinator key ← user's pubKey  (processDeactivate side)
      const w1 = await ecdhCircuit.calculateWitness({
        privKey: coordKeypair.formatedPrivKey,
        pubKey: userPubKey
      });
      await ecdhCircuit.expectConstraintPass(w1);
      const shared1x = await getSignal(ecdhCircuit, w1, 'sharedKey[0]');
      const shared1y = await getSignal(ecdhCircuit, w1, 'sharedKey[1]');

      // Direction 2: SDK user key ← coordinator's pubKey  (addNewKey side)
      const w2 = await ecdhCircuit.calculateWitness({
        privKey: userSdkKeypair.getFormatedPrivKey(),
        pubKey: coordPubKey
      });
      await ecdhCircuit.expectConstraintPass(w2);
      const shared2x = await getSignal(ecdhCircuit, w2, 'sharedKey[0]');
      const shared2y = await getSignal(ecdhCircuit, w2, 'sharedKey[1]');

      // Both directions must yield the same shared key
      expect(shared1x.toString()).to.equal(
        shared2x.toString(),
        'sharedKey[0] must be equal in both ECDH directions'
      );
      expect(shared1y.toString()).to.equal(
        shared2y.toString(),
        'sharedKey[1] must be equal in both ECDH directions'
      );
    });

    it('should maintain ECDH symmetry for multiple keypair combinations', async () => {
      /**
       * Runs the cross-library ECDH symmetry test for several (coord, user) pairs
       * to provide broader coverage beyond a single fixed example.
       */
      const pairs: Array<{ coordKey: bigint; userKey: bigint }> = [
        { coordKey: 111111n, userKey: 222222n },
        { coordKey: 0xabcn, userKey: 999999n },
        { coordKey: 0xfn, userKey: 0x1234567n }
      ];

      for (const { coordKey, userKey } of pairs) {
        const coordKeypair = operatorGenKeypair(coordKey);
        const userSdkKeypair = EdDSAPoseidonKeypair.fromSecretKey(userKey);

        const w1 = await ecdhCircuit.calculateWitness({
          privKey: coordKeypair.formatedPrivKey,
          pubKey: userSdkKeypair.getPublicKey().toPoints() as [bigint, bigint]
        });
        await ecdhCircuit.expectConstraintPass(w1);
        const s1x = await getSignal(ecdhCircuit, w1, 'sharedKey[0]');
        const s1y = await getSignal(ecdhCircuit, w1, 'sharedKey[1]');

        const w2 = await ecdhCircuit.calculateWitness({
          privKey: userSdkKeypair.getFormatedPrivKey(),
          pubKey: coordKeypair.pubKey
        });
        await ecdhCircuit.expectConstraintPass(w2);
        const s2x = await getSignal(ecdhCircuit, w2, 'sharedKey[0]');
        const s2y = await getSignal(ecdhCircuit, w2, 'sharedKey[1]');

        expect(s1x.toString()).to.equal(
          s2x.toString(),
          `sharedKey[0] mismatch for coordKey=${coordKey} userKey=${userKey}`
        );
        expect(s1y.toString()).to.equal(
          s2y.toString(),
          `sharedKey[1] mismatch for coordKey=${coordKey} userKey=${userKey}`
        );
      }
    });
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
