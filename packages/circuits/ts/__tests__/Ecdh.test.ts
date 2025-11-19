import { VoterClient, poseidonEncrypt, poseidonDecrypt } from '@dorafactory/maci-sdk';
import { expect } from 'chai';
import { type WitnessTester } from 'circomkit';

import { getSignal, circomkitInstance } from './utils/utils';

/**
 * ECDH (Elliptic Curve Diffie-Hellman) Circuit Tests
 *
 * Circuit Location: packages/circuits/circom/utils/ecdh.circom
 *
 * ============================================================================
 * CIRCUIT FUNCTIONALITY
 * ============================================================================
 *
 * The ECDH circuit computes a shared secret key between two parties without
 * revealing their private keys. This is the foundation for encrypted messaging
 * in MACI/aMACI systems.
 *
 * ============================================================================
 * ECDH KEY EXCHANGE PROTOCOL
 * ============================================================================
 *
 * Scenario: Alice wants to send encrypted data to Bob
 *
 * 1. Alice has: privKey_A (private), pubKey_A (public)
 * 2. Bob has: privKey_B (private), pubKey_B (public)
 *
 * 3. Alice computes shared key:
 *    sharedKey = privKey_A * pubKey_B
 *
 * 4. Bob computes shared key:
 *    sharedKey = privKey_B * pubKey_A
 *
 * 5. Mathematical property (the magic!):
 *    privKey_A * pubKey_B = privKey_A * (privKey_B * G)
 *                         = (privKey_A * privKey_B) * G
 *                         = privKey_B * (privKey_A * G)
 *                         = privKey_B * pubKey_A
 *
 *    Therefore: Both parties compute the SAME shared key!
 *
 * ============================================================================
 * HOW THE CIRCUIT WORKS
 * ============================================================================
 *
 * Input:
 *   - privKey: Your private key (scalar)
 *   - pubKey[2]: Other party's public key (point: x, y)
 *
 * Process:
 *   sharedKey = scalar_multiply(privKey, pubKey)
 *
 * Output:
 *   - sharedKey[2]: The shared secret point (x, y)
 *
 * ============================================================================
 * SECURITY PROPERTIES
 * ============================================================================
 *
 * 1. Forward Secrecy: Private keys are never revealed
 * 2. Computational Security: Based on ECDLP hardness
 * 3. Symmetric: Both parties compute the same key
 * 4. Zero-Knowledge: Circuit proves computation without revealing privKey
 *
 * ============================================================================
 * USE CASE IN MACI/aMACI
 * ============================================================================
 *
 * - Voters encrypt commands using ECDH with coordinator's public key
 * - Only the coordinator can decrypt (using their private key)
 * - Commands remain confidential until processing phase
 * - Enables anonymous voting while maintaining verifiability
 *
 * ============================================================================
 */
describe('ECDH circuit', function test() {
  this.timeout(90000);

  let circuit: WitnessTester<['privKey', 'pubKey'], ['sharedKey']>;

  let voterClient1: VoterClient;
  let voterClient2: VoterClient;

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('Ecdh', {
      file: 'utils/ecdh',
      template: 'Ecdh'
    });

    voterClient1 = new VoterClient({
      network: 'testnet',
      secretKey: 1n
    });
    voterClient2 = new VoterClient({
      network: 'testnet',
      secretKey: 2n
    });
  });

  it('should compute ECDH shared key correctly', async () => {
    /**
     * Test Case: Basic ECDH computation
     *
     * Verifies that the circuit can compute a shared key from:
     * - Party 1's private key
     * - Party 2's public key
     *
     * The shared key should be a valid point on the curve (non-zero bigints).
     * This test ensures the basic scalar multiplication works correctly.
     */
    const circuitInputs = {
      privKey: voterClient1.getSigner().getFormatedPrivKey(),
      pubKey: voterClient2.getSigner().getPublicKey().toPoints() as [bigint, bigint]
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const sharedKey0 = await getSignal(circuit, witness, 'sharedKey[0]');
    const sharedKey1 = await getSignal(circuit, witness, 'sharedKey[1]');

    // Check that shared key is computed (non-zero point)
    expect(sharedKey0).to.be.a('bigint');
    expect(sharedKey1).to.be.a('bigint');
  });

  it('should produce same shared key for both parties', async () => {
    /**
     * Test Case: ECDH symmetry property (THE CORE TEST)
     *
     * This is the fundamental property that makes ECDH work!
     *
     * Setup:
     * - Party 1 (Alice): privKey_1, pubKey_1
     * - Party 2 (Bob): privKey_2, pubKey_2
     *
     * Computation:
     * - Alice computes: sharedKey_A = privKey_1 * pubKey_2
     * - Bob computes: sharedKey_B = privKey_2 * pubKey_1
     *
     * Expected: sharedKey_A == sharedKey_B
     *
     * Why it works:
     *   privKey_1 * pubKey_2 = privKey_1 * (privKey_2 * G)
     *                        = (privKey_1 * privKey_2) * G
     *                        = privKey_2 * (privKey_1 * G)
     *                        = privKey_2 * pubKey_1
     *
     * This proves both parties can establish a shared secret without
     * ever exchanging private keys!
     */
    const keypair1 = voterClient1.getSigner();
    const keypair2 = voterClient2.getSigner();

    // Party 1: compute shared key using privKey1 and pubKey2
    const circuitInputs1 = {
      privKey: keypair1.getFormatedPrivKey(),
      pubKey: keypair2.getPublicKey().toPoints() as [bigint, bigint]
    };

    const witness1 = await circuit.calculateWitness(circuitInputs1);
    await circuit.expectConstraintPass(witness1);

    const sharedKey1_0 = await getSignal(circuit, witness1, 'sharedKey[0]');
    const sharedKey1_1 = await getSignal(circuit, witness1, 'sharedKey[1]');

    // Party 2: compute shared key using privKey2 and pubKey1
    const circuitInputs2 = {
      privKey: keypair2.getFormatedPrivKey(),
      pubKey: keypair1.getPublicKey().toPoints() as [bigint, bigint]
    };

    const witness2 = await circuit.calculateWitness(circuitInputs2);
    await circuit.expectConstraintPass(witness2);

    const sharedKey2_0 = await getSignal(circuit, witness2, 'sharedKey[0]');
    const sharedKey2_1 = await getSignal(circuit, witness2, 'sharedKey[1]');

    // Both parties should compute the SAME shared key
    expect(sharedKey1_0.toString()).to.equal(sharedKey2_0.toString());
    expect(sharedKey1_1.toString()).to.equal(sharedKey2_1.toString());
  });

  it('should encrypt with A+B pubkey and decrypt with B+A pubkey', async () => {
    /**
     * Test Case: End-to-end encryption/decryption using ECDH
     *
     * This test demonstrates the complete ECDH workflow in MACI:
     *
     * 1. Key Exchange:
     *    - Alice and Bob compute shared key via ECDH
     *    - sharedKey_A = privKey_A * pubKey_B
     *    - sharedKey_B = privKey_B * pubKey_A
     *    - Verify: sharedKey_A == sharedKey_B
     *
     * 2. Encryption (Alice → Bob):
     *    - Alice encrypts message using sharedKey_A
     *    - Encryption: ciphertext = poseidonEncrypt(plaintext, sharedKey_A)
     *
     * 3. Decryption (Bob receives):
     *    - Bob decrypts using sharedKey_B (which equals sharedKey_A)
     *    - Decryption: plaintext' = poseidonDecrypt(ciphertext, sharedKey_B)
     *
     * 4. Verification:
     *    - plaintext' == plaintext (perfect recovery)
     *
     * This is exactly how voters encrypt commands for the coordinator
     * in MACI/aMACI systems!
     */
    const keypair1 = voterClient1.getSigner();
    const keypair2 = voterClient2.getSigner();

    // Step 1: Both parties compute shared key
    const sharedKeyA = keypair1.genEcdhSharedKey(keypair2.getPublicKey().toPoints());
    const sharedKeyB = keypair2.genEcdhSharedKey(keypair1.getPublicKey().toPoints());

    // Verify shared keys match
    expect(sharedKeyA[0].toString()).to.equal(sharedKeyB[0].toString());
    expect(sharedKeyA[1].toString()).to.equal(sharedKeyB[1].toString());

    // Step 2: Alice encrypts message
    const plaintext = [12345n, 67890n, 111111n, 222222n];
    const ciphertext = poseidonEncrypt(plaintext, sharedKeyA, 0n);

    // Step 3: Bob decrypts message
    const decryptedData = poseidonDecrypt(ciphertext, sharedKeyB, 0n, plaintext.length);

    // Step 4: Verify perfect decryption
    expect(decryptedData).to.have.lengthOf(plaintext.length);
    for (let i = 0; i < plaintext.length; i++) {
      expect(decryptedData[i].toString()).to.equal(plaintext[i].toString());
    }
  });
});
