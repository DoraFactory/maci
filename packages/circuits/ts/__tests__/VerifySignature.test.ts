import { VoterClient, poseidon } from '@dorafactory/maci-sdk';
import { expect } from 'chai';
import { type WitnessTester } from 'circomkit';

import { circomkitInstance, getSignal } from './utils/utils';

/**
 * VerifySignature Circuit Tests
 *
 * Circuit Location: packages/circuits/circom/utils/verifySignature.circom
 *
 * ============================================================================
 * CIRCUIT FUNCTIONALITY
 * ============================================================================
 *
 * The VerifySignature circuit verifies EdDSA (Edwards-curve Digital Signature
 * Algorithm) signatures using the BabyJubJub curve and Poseidon hash.
 *
 * This is a critical security component that ensures:
 * - Only authorized users can submit valid commands
 * - Messages cannot be tampered with
 * - Signatures are cryptographically verifiable in zero-knowledge
 *
 * ============================================================================
 * SIGNATURE SCHEME: EdDSA on BabyJubJub
 * ============================================================================
 *
 * EdDSA Signature Components:
 *   - R8: A point on the curve (R8x, R8y) - the random component
 *   - S: A scalar value - the signature proof
 *   - Message: The data being signed (hashed from preimage)
 *   - Public Key: The signer's public key (Ax, Ay)
 *
 * Verification Equation:
 *   S * G = R8 + H(R8, A, M) * A
 *
 *   Where:
 *   - G is the base point of the curve
 *   - H() is the Poseidon hash function
 *   - A is the public key
 *   - M is the message
 *
 * ============================================================================
 * HOW THE CIRCUIT WORKS
 * ============================================================================
 *
 * Step 1: Hash the preimage to get the message
 *   message = Poseidon(preimage[0], preimage[1], preimage[2])
 *
 * Step 2: Validate S is within subgroup order
 *   Ensures S < SUBGROUP_ORDER (security requirement)
 *
 * Step 3: Compute the left side: S * G
 *   left = scalar_multiply(S, base_point)
 *
 * Step 4: Compute the right side: R8 + H(R8, A, M) * A
 *   h = Poseidon(R8x, R8y, Ax, Ay, M)
 *   right = point_add(R8, scalar_multiply(h, A))
 *
 * Step 5: Compare left and right
 *   valid = (left.x == right.x && left.y == right.y) ? 1 : 0
 *
 * ============================================================================
 * INPUTS & OUTPUTS
 * ============================================================================
 *
 * Inputs:
 *   - pubKey[2]: Signer's public key (Ax, Ay)
 *   - R8[2]: Signature's R8 point (R8x, R8y)
 *   - S: Signature's S scalar
 *   - preimage[3]: Data to be signed (will be hashed)
 *
 * Output:
 *   - valid: 1 if signature is valid, 0 otherwise
 *
 * ============================================================================
 * SECURITY PROPERTIES
 * ============================================================================
 *
 * 1. Unforgeability: Cannot create valid signature without private key
 * 2. Non-malleability: Cannot modify signature or message without detection
 * 3. Deterministic: Same input always produces same verification result
 * 4. Zero-knowledge: Verification doesn't reveal the private key
 *
 * ============================================================================
 */
describe('VerifySignature circuit', function test() {
  this.timeout(90000);

  let circuit: WitnessTester<['pubKey', 'R8', 'S', 'preimage'], ['valid']>;

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('verifySignature', {
      file: 'utils/verifySignature',
      template: 'VerifySignature'
    });
  });

  it('should verify a valid signature correctly', async () => {
    /**
     * Test Case: Valid signature verification (happy path)
     *
     * This test demonstrates the complete signature flow:
     * 1. Generate a keypair (private key → public key)
     * 2. Create a message preimage (3 field elements)
     * 3. Hash the preimage to get the message
     * 4. Sign the message with the private key
     * 5. Verify the signature in the circuit
     *
     * Expected: valid = 1 (signature is valid)
     *
     * This is the fundamental test that proves the circuit can correctly
     * verify legitimate signatures from authorized users.
     */
    const voterClient = new VoterClient({
      network: 'testnet',
      secretKey: 1n
    });
    const keypair = voterClient.getSigner();

    // Create a command preimage (3 elements as required by VerifySignature)
    const preimage = [
      BigInt(123456), // Example: packed command data
      BigInt(789012), // Example: newPubKeyX
      BigInt(345678) // Example: newPubKeyY
    ];

    // Calculate the message hash (the circuit will do this internally)
    const messageHash = poseidon(preimage);

    // Sign the message hash using EdDSA
    const signature = keypair.sign(messageHash);

    // Prepare circuit inputs
    const circuitInputs = {
      pubKey: keypair.getPublicKey().toPoints() as [bigint, bigint],
      R8: signature.R8 as [bigint, bigint],
      S: signature.S,
      preimage: preimage
    };

    // Calculate witness and verify constraints
    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    // Check that the signature is valid
    const valid = await getSignal(circuit, witness, 'valid');
    expect(valid).to.equal(1n, 'Valid signature should return 1');
  });

  it('should reject an invalid signature (wrong message)', async () => {
    /**
     * Test Case: Message tampering detection
     *
     * Attack scenario:
     * - Attacker intercepts a valid signature for message A
     * - Attacker tries to use that signature to verify message B
     *
     * Process:
     * 1. Sign message A → signature S_A
     * 2. Try to verify message B with signature S_A
     *
     * Expected: valid = 0 (signature verification fails)
     *
     * This proves that signatures are bound to specific messages and
     * cannot be reused for different messages (non-malleability).
     */
    const voterClient = new VoterClient({
      network: 'testnet',
      secretKey: 2n
    });
    const keypair = voterClient.getSigner();

    // Create original preimage and sign it
    const originalPreimage = [BigInt(123456), BigInt(789012), BigInt(345678)];
    const messageHash = poseidon(originalPreimage);
    const signature = keypair.sign(messageHash);

    // Try to verify with a different preimage (message tampering)
    const differentPreimage = [
      BigInt(999999), // Different data - tampering attempt
      BigInt(789012),
      BigInt(345678)
    ];

    const circuitInputs = {
      pubKey: keypair.getPublicKey().toPoints() as [bigint, bigint],
      R8: signature.R8 as [bigint, bigint],
      S: signature.S,
      preimage: differentPreimage // Wrong preimage
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const valid = await getSignal(circuit, witness, 'valid');
    expect(valid).to.equal(0n, 'Invalid signature should return 0');
  });

  it('should reject an invalid signature (wrong public key)', async () => {
    /**
     * Test Case: Public key mismatch detection (impersonation attack)
     *
     * Attack scenario:
     * - User A signs a message with their private key
     * - Attacker tries to claim the signature was made by User B
     *
     * Process:
     * 1. User A: privKey_A → sign(message) → signature_A
     * 2. Attacker: tries to verify signature_A with pubKey_B
     *
     * Expected: valid = 0 (verification fails)
     *
     * This proves that signatures are cryptographically bound to the
     * signer's public key, preventing impersonation attacks. The circuit
     * correctly identifies that the signature was NOT created by the
     * owner of pubKey_B.
     */
    const voterClient1 = new VoterClient({
      network: 'testnet',
      secretKey: 3n
    });
    const voterClient2 = new VoterClient({
      network: 'testnet',
      secretKey: 4n
    });
    const keypair1 = voterClient1.getSigner();
    const keypair2 = voterClient2.getSigner();

    const preimage = [BigInt(123456), BigInt(789012), BigInt(345678)];

    // Sign with keypair1
    const messageHash = poseidon(preimage);
    const signature = keypair1.sign(messageHash);

    // Try to verify with keypair2's public key (impersonation attempt)
    const circuitInputs = {
      pubKey: keypair2.getPublicKey().toPoints() as [bigint, bigint], // Wrong public key
      R8: signature.R8 as [bigint, bigint],
      S: signature.S,
      preimage: preimage
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const valid = await getSignal(circuit, witness, 'valid');
    expect(valid).to.equal(0n, 'Signature with wrong public key should return 0');
  });

  it('should reject an invalid signature (wrong R8)', async () => {
    /**
     * Test Case: Signature component tampering (R8 modification)
     *
     * Attack scenario:
     * - Attacker modifies the R8 component of a valid signature
     * - Attempts to use the modified signature for verification
     *
     * R8 is the random nonce point (R8x, R8y) in the EdDSA signature.
     * Even a small change to R8 will cause verification to fail because:
     *   S * G ≠ R8_modified + H(R8_modified, A, M) * A
     *
     * Expected: valid = 0 (tampered signature is rejected)
     *
     * This demonstrates the integrity protection of signatures - any
     * modification to signature components renders them invalid.
     */
    const voterClient = new VoterClient({
      network: 'testnet',
      secretKey: 5n
    });
    const keypair = voterClient.getSigner();

    const preimage = [BigInt(123456), BigInt(789012), BigInt(345678)];
    const messageHash = poseidon(preimage);
    const signature = keypair.sign(messageHash);

    // Modify R8x by adding 1 (signature tampering)
    const wrongR8: [bigint, bigint] = [
      signature.R8[0] + 1n, // Wrong R8x
      signature.R8[1]
    ];

    const circuitInputs = {
      pubKey: keypair.getPublicKey().toPoints() as [bigint, bigint],
      R8: wrongR8,
      S: signature.S,
      preimage: preimage
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const valid = await getSignal(circuit, witness, 'valid');
    expect(valid).to.equal(0n, 'Signature with wrong R8 should return 0');
  });

  it('should reject an invalid signature (wrong S)', async () => {
    /**
     * Test Case: Signature scalar tampering (S modification)
     *
     * Attack scenario:
     * - Attacker modifies the S scalar of a valid signature
     * - Attempts verification with the tampered S value
     *
     * S is the scalar proof component in EdDSA signature.
     * Modifying S breaks the equation: S * G = R8 + H(R8, A, M) * A
     *
     * With wrong S:
     *   S_wrong * G ≠ R8 + H(R8, A, M) * A
     *
     * Expected: valid = 0 (tampered S is detected)
     *
     * This test, combined with the R8 test, proves that ALL signature
     * components must be correct and unmodified for verification to succeed.
     */
    const voterClient = new VoterClient({
      network: 'testnet',
      secretKey: 6n
    });
    const keypair = voterClient.getSigner();

    const preimage = [BigInt(123456), BigInt(789012), BigInt(345678)];
    const messageHash = poseidon(preimage);
    const signature = keypair.sign(messageHash);

    // Modify S by adding 1 (scalar tampering)
    const wrongS = signature.S + 1n;

    const circuitInputs = {
      pubKey: keypair.getPublicKey().toPoints() as [bigint, bigint],
      R8: signature.R8 as [bigint, bigint],
      S: wrongS, // Wrong S
      preimage: preimage
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const valid = await getSignal(circuit, witness, 'valid');
    expect(valid).to.equal(0n, 'Signature with wrong S should return 0');
  });

  it('should verify multiple different valid signatures', async () => {
    /**
     * Test Case: Multiple valid signatures (consistency test)
     *
     * This test verifies that the circuit can handle:
     * - Different keypairs (different users)
     * - Different messages (random data)
     * - Multiple independent signature operations
     *
     * All valid signatures should be verified correctly, proving:
     * 1. Circuit works consistently across different inputs
     * 2. No interference between different verification operations
     * 3. The verification logic is deterministic and reliable
     *
     * This is important for production use where many users will
     * submit signatures for different messages.
     */
    for (let i = 0; i < 3; i++) {
      const voterClient = new VoterClient({
        network: 'testnet',
        secretKey: BigInt(7 + i)
      });
      const keypair = voterClient.getSigner();

      // Generate random preimage for each iteration
      const preimage = [
        BigInt(Math.floor(Math.random() * 1000000)),
        BigInt(Math.floor(Math.random() * 1000000)),
        BigInt(Math.floor(Math.random() * 1000000))
      ];

      const messageHash = poseidon(preimage);
      const signature = keypair.sign(messageHash);

      const circuitInputs = {
        pubKey: keypair.getPublicKey().toPoints() as [bigint, bigint],
        R8: signature.R8 as [bigint, bigint],
        S: signature.S,
        preimage: preimage
      };

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      const valid = await getSignal(circuit, witness, 'valid');
      expect(valid).to.equal(1n, `Valid signature ${i} should return 1`);
    }
  });

  it('should verify signature with edge case values', async () => {
    /**
     * Test Case: Edge case - zero values
     *
     * Tests that the circuit correctly handles the minimum possible input:
     * preimage = [0, 0, 0]
     *
     * Even though all preimage values are zero, this is still a valid
     * message that can be signed and verified. This test ensures:
     * - No division by zero or similar edge case errors
     * - Hash function works correctly with zero inputs
     * - Signature verification handles minimum values
     *
     * This is important because zero values might occur in legitimate
     * scenarios (e.g., initial states, default values).
     */
    const voterClient = new VoterClient({
      network: 'testnet',
      secretKey: 10n
    });
    const keypair = voterClient.getSigner();

    // Test with zero values (edge case)
    const preimage = [BigInt(0), BigInt(0), BigInt(0)];

    const messageHash = poseidon(preimage);
    const signature = keypair.sign(messageHash);

    const circuitInputs = {
      pubKey: keypair.getPublicKey().toPoints() as [bigint, bigint],
      R8: signature.R8 as [bigint, bigint],
      S: signature.S,
      preimage: preimage
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const valid = await getSignal(circuit, witness, 'valid');
    expect(valid).to.equal(1n, 'Valid signature with zero preimage should return 1');
  });

  it('should verify signature with large values', async () => {
    /**
     * Test Case: Edge case - maximum field values
     *
     * Tests that the circuit correctly handles the maximum possible inputs:
     * preimage = [FIELD_SIZE-1, FIELD_SIZE-2, FIELD_SIZE-3]
     *
     * The SNARK field size is the maximum value that can be represented
     * in the finite field used by the circuit. This test ensures:
     * - No overflow or wrapping errors at field boundaries
     * - Hash and signature operations work at maximum values
     * - Circuit constraints are satisfied for large inputs
     *
     * Field size for BN254: ~2^254
     *
     * Testing both minimum (zero) and maximum (field-1) values ensures
     * the circuit works correctly across the entire valid input range.
     */
    const voterClient = new VoterClient({
      network: 'testnet',
      secretKey: 11n
    });
    const keypair = voterClient.getSigner();

    // Test with maximum field values (edge case)
    const SNARK_FIELD_SIZE =
      21888242871839275222246405745257275088548364400416034343698204186575808495617n;
    const preimage = [SNARK_FIELD_SIZE - 1n, SNARK_FIELD_SIZE - 2n, SNARK_FIELD_SIZE - 3n];

    const messageHash = poseidon(preimage);
    const signature = keypair.sign(messageHash);

    const circuitInputs = {
      pubKey: keypair.getPublicKey().toPoints() as [bigint, bigint],
      R8: signature.R8 as [bigint, bigint],
      S: signature.S,
      preimage: preimage
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const valid = await getSignal(circuit, witness, 'valid');
    expect(valid).to.equal(1n, 'Valid signature with large values should return 1');
  });
});
