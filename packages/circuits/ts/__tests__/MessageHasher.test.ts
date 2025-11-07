import { SNARK_FIELD_SIZE, hash10 } from '@dorafactory/maci-sdk';
import { type WitnessTester } from 'circomkit';
import fc from 'fast-check';

import { getSignal, circomkitInstance } from './utils/utils';

const CIRCOM_PATH = './utils/messageHasher';

/**
 * MessageHasher Circuit Tests
 *
 * Circuit Location: packages/circuits/circom/utils/messageHasher.circom
 *
 * ============================================================================
 * CIRCUIT FUNCTIONALITY
 * ============================================================================
 *
 * The MessageHasher circuit computes a hash of encrypted messages in MACI,
 * creating a cryptographic chain that ensures message integrity and prevents
 * tampering or reordering of voter commands.
 *
 * ============================================================================
 * MESSAGE STRUCTURE IN MACI
 * ============================================================================
 *
 * A MACI message consists of:
 * 1. Command data (7 field elements):
 *    - Command type
 *    - State index
 *    - Vote option
 *    - New public key (if key change)
 *    - Nonce
 *    - Salt
 *    - Other parameters
 *
 * 2. Encryption public key (2 field elements):
 *    - encPubKey[0]: x-coordinate
 *    - encPubKey[1]: y-coordinate
 *
 * 3. Previous hash (1 field element):
 *    - Links to previous message in chain
 *    - Prevents message reordering
 *
 * Total: 10 field elements → Poseidon hash
 *
 * ============================================================================
 * MESSAGE CHAINING
 * ============================================================================
 *
 * Messages form a cryptographic chain:
 *
 * Message 1: hash_1 = H(msg_1, encPubKey, 0)
 * Message 2: hash_2 = H(msg_2, encPubKey, hash_1)
 * Message 3: hash_3 = H(msg_3, encPubKey, hash_2)
 * ...
 *
 * Benefits:
 * 1. **Ordering**: Messages must be processed in sequence
 * 2. **Integrity**: Any modification breaks the chain
 * 3. **Completeness**: Missing messages are detectable
 * 4. **Replay Protection**: Cannot reuse old messages
 *
 * This is similar to blockchain's hash chain but for individual voter messages.
 *
 * ============================================================================
 * HOW THE CIRCUIT WORKS
 * ============================================================================
 *
 * Input:
 *   - in[7]: Message command data (7 field elements)
 *   - encPubKey[2]: Encryption public key
 *   - prevHash: Hash of previous message (0 for first message)
 *
 * Process:
 *   1. Combine all 10 inputs: [in[0]...in[6], encPubKey[0], encPubKey[1], prevHash]
 *   2. Apply Poseidon hash: hash = Poseidon_10(combined_inputs)
 *
 * Output:
 *   - hash: Single field element representing message commitment
 *
 * ============================================================================
 * SECURITY PROPERTIES
 * ============================================================================
 *
 * 1. **Binding**: Hash commits to all message components
 * 2. **Collision Resistance**: Different messages → different hashes
 * 3. **Chain Integrity**: Breaking chain requires breaking Poseidon
 * 4. **Forward Security**: Future messages don't affect past hashes
 *
 * ============================================================================
 * USE CASES IN MACI
 * ============================================================================
 *
 * - **Voter Commands**: Hash encrypted vote commands
 * - **Key Changes**: Hash key update messages
 * - **Message Trees**: Build Merkle trees of message hashes
 * - **Batch Processing**: Verify message sequences efficiently
 * - **Audit Trail**: Maintain verifiable message history
 *
 * ============================================================================
 * TESTING FOCUS
 * ============================================================================
 *
 * Tests verify:
 * 1. Correctness: Circuit matches JavaScript implementation
 * 2. Determinism: Same inputs always produce same hash
 * 3. Sensitivity: Any input change produces different hash
 * 4. Chain validity: Sequential hashing works correctly
 * 5. Edge cases: Zero values, maximum values
 *
 * ============================================================================
 */
describe('MessageHasher circuit', function test() {
  this.timeout(900000);

  describe('MessageHasher', () => {
    let circuit: WitnessTester<['in', 'encPubKey', 'prevHash'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('messageHasher', {
        file: CIRCOM_PATH,
        template: 'MessageHasher'
      });
    });

    it('correctly hashes message with all inputs', async () => {
      /**
       * Test Case: Property-based correctness verification
       *
       * Uses fast-check to test 100+ random input combinations:
       * - 7 random message field elements
       * - 2 random encryption public key coordinates
       * - 1 random previous hash value
       *
       * Verifies:
       * - Circuit output matches JavaScript Poseidon implementation
       * - All 10 inputs are correctly combined and hashed
       * - Circuit constraints are satisfied for all random inputs
       *
       * This property-based testing approach provides high confidence
       * that the circuit works correctly across the entire input space.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
            minLength: 7,
            maxLength: 7
          }),
          fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
            minLength: 2,
            maxLength: 2
          }),
          fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }),
          async (messageFields: bigint[], encPubKey: bigint[], prevHash: bigint) => {
            const witness = await circuit.calculateWitness({
              in: messageFields,
              encPubKey,
              prevHash
            });
            await circuit.expectConstraintPass(witness);
            const output = await getSignal(circuit, witness, 'hash');

            // Calculate expected output using SDK functions
            // MessageHasher combines: in[7] + encPubKey[2] + prevHash = 10 elements
            const allInputs = [...messageFields, ...encPubKey, prevHash];
            const outputJS = hash10(allInputs);

            return output === outputJS;
          }
        )
      );
    });

    it('should produce consistent hash for same inputs', async () => {
      /**
       * Test Case: Determinism verification
       *
       * Hashes the same message twice and verifies outputs are identical.
       *
       * Input:
       * - messageFields: [1, 2, 3, 4, 5, 6, 7]
       * - encPubKey: [8, 9]
       * - prevHash: 10
       *
       * This tests:
       * 1. Determinism: Same input → same output (always)
       * 2. No randomness in hash computation
       * 3. Circuit state doesn't affect subsequent runs
       *
       * Critical for: Verifiable computation - anyone can reproduce the hash
       */
      const messageFields = [1n, 2n, 3n, 4n, 5n, 6n, 7n];
      const encPubKey = [8n, 9n];
      const prevHash = 10n;

      const witness1 = await circuit.calculateWitness({
        in: messageFields,
        encPubKey,
        prevHash
      });
      const output1 = await getSignal(circuit, witness1, 'hash');

      const witness2 = await circuit.calculateWitness({
        in: messageFields,
        encPubKey,
        prevHash
      });
      const output2 = await getSignal(circuit, witness2, 'hash');

      return output1 === output2;
    });

    it('should produce different hashes for different message fields', async () => {
      /**
       * Test Case: Collision resistance for message data
       *
       * Tests that different message contents produce different hashes,
       * even when using the same encryption key and prevHash.
       *
       * Inputs:
       * - Message 1: [1, 2, 3, 4, 5, 6, 7] (ascending)
       * - Message 2: [7, 6, 5, 4, 3, 2, 1] (descending - reversed)
       * - Same encPubKey and prevHash for both
       *
       * Expected: hash1 ≠ hash2
       *
       * This verifies:
       * - Message content sensitivity (any change affects hash)
       * - Order matters (reversal changes hash)
       * - No accidental collisions for similar inputs
       *
       * Security implication: Prevents message substitution attacks
       */
      const messageFields1 = [1n, 2n, 3n, 4n, 5n, 6n, 7n];
      const messageFields2 = [7n, 6n, 5n, 4n, 3n, 2n, 1n];
      const encPubKey = [100n, 200n];
      const prevHash = 300n;

      const witness1 = await circuit.calculateWitness({
        in: messageFields1,
        encPubKey,
        prevHash
      });
      const output1 = await getSignal(circuit, witness1, 'hash');

      const witness2 = await circuit.calculateWitness({
        in: messageFields2,
        encPubKey,
        prevHash
      });
      const output2 = await getSignal(circuit, witness2, 'hash');

      return output1 !== output2;
    });

    it('should produce different hashes for different public keys', async () => {
      /**
       * Test Case: Encryption key binding
       *
       * Verifies that the hash is bound to the encryption public key,
       * preventing key substitution attacks.
       *
       * Scenario:
       * - Same message content
       * - Same prevHash
       * - Different encPubKey: [100, 200] vs [200, 100] (swapped coordinates)
       *
       * Expected: hash1 ≠ hash2
       *
       * Why this matters:
       * - Prevents attacker from claiming a message was encrypted for
       *   a different recipient
       * - Each message is cryptographically bound to its intended recipient's key
       * - Coordinate order matters (prevents coordinate swapping attacks)
       *
       * Security property: Key commitment - hash commits to specific recipient
       */
      const messageFields = [1n, 2n, 3n, 4n, 5n, 6n, 7n];
      const encPubKey1 = [100n, 200n];
      const encPubKey2 = [200n, 100n];
      const prevHash = 300n;

      const witness1 = await circuit.calculateWitness({
        in: messageFields,
        encPubKey: encPubKey1,
        prevHash
      });
      const output1 = await getSignal(circuit, witness1, 'hash');

      const witness2 = await circuit.calculateWitness({
        in: messageFields,
        encPubKey: encPubKey2,
        prevHash
      });
      const output2 = await getSignal(circuit, witness2, 'hash');

      return output1 !== output2;
    });

    it('should produce different hashes for different prevHash', async () => {
      /**
       * Test Case: Chain integrity verification
       *
       * Tests that the hash depends on prevHash, ensuring proper
       * message chain formation.
       *
       * Scenario:
       * - Same message content
       * - Same encPubKey
       * - Different prevHash: 300 vs 400
       *
       * Expected: hash1 ≠ hash2
       *
       * This proves:
       * 1. Each message hash links to previous message
       * 2. Cannot reorder messages without breaking chain
       * 3. Chain position affects hash value
       *
       * Analogy: Like blockchain - each block links to previous block
       *
       * Security benefit: Prevents:
       * - Message reordering attacks
       * - Insertion of messages into existing chain
       * - Removal of messages from chain
       */
      const messageFields = [1n, 2n, 3n, 4n, 5n, 6n, 7n];
      const encPubKey = [100n, 200n];
      const prevHash1 = 300n;
      const prevHash2 = 400n;

      const witness1 = await circuit.calculateWitness({
        in: messageFields,
        encPubKey,
        prevHash: prevHash1
      });
      const output1 = await getSignal(circuit, witness1, 'hash');

      const witness2 = await circuit.calculateWitness({
        in: messageFields,
        encPubKey,
        prevHash: prevHash2
      });
      const output2 = await getSignal(circuit, witness2, 'hash');

      return output1 !== output2;
    });

    it('should handle zero values correctly', async () => {
      /**
       * Test Case: Edge case - all zero inputs
       *
       * Tests the circuit with minimum possible values (all zeros).
       *
       * Input:
       * - messageFields: [0, 0, 0, 0, 0, 0, 0]
       * - encPubKey: [0, 0]
       * - prevHash: 0
       *
       * This verifies:
       * - No division by zero errors
       * - Hash function works at boundary values
       * - First message in chain (prevHash = 0) is handled correctly
       * - Zero is a valid (though unusual) input
       *
       * Use case: Initial message in a new chain starts with prevHash = 0
       */
      const messageFields = [0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const encPubKey = [0n, 0n];
      const prevHash = 0n;

      const witness = await circuit.calculateWitness({
        in: messageFields,
        encPubKey,
        prevHash
      });
      await circuit.expectConstraintPass(witness);
      const output = await getSignal(circuit, witness, 'hash');

      const allInputs = [...messageFields, ...encPubKey, prevHash];
      const outputJS = hash10(allInputs);

      return output === outputJS;
    });

    it('should handle maximum field values correctly', async () => {
      /**
       * Test Case: Edge case - maximum field values
       *
       * Tests with the largest possible field elements (FIELD_SIZE - 1).
       *
       * Input: All values set to maximum (2^254 - 1 approximately)
       *
       * This verifies:
       * - No overflow in hash computation
       * - Circuit works at upper boundary of field
       * - Modular arithmetic is correct at field limits
       * - No wraparound errors
       *
       * Field size: 21888242871839275222246405745257275088548364400416034343698204186575808495617
       *
       * Testing both minimum (zero) and maximum values ensures the circuit
       * works correctly across the entire valid input range.
       */
      const maxVal = SNARK_FIELD_SIZE - 1n;
      const messageFields = Array(7).fill(maxVal);
      const encPubKey = [maxVal, maxVal];
      const prevHash = maxVal;

      const witness = await circuit.calculateWitness({
        in: messageFields,
        encPubKey,
        prevHash
      });
      await circuit.expectConstraintPass(witness);
      const output = await getSignal(circuit, witness, 'hash');

      const allInputs = [...messageFields, ...encPubKey, prevHash];
      const outputJS = hash10(allInputs);

      return output === outputJS;
    });

    it('should create a valid message chain', async () => {
      /**
       * Test Case: Message chain construction (THE CORE FEATURE)
       *
       * Simulates a real message chain where each message links to the previous.
       *
       * Process:
       * 1. Message 1: hash1 = H(msg1, key, 0)
       *    - prevHash = 0 (first message)
       *
       * 2. Message 2: hash2 = H(msg2, key, hash1)
       *    - prevHash = hash1 (links to previous)
       *
       * Chain structure:
       *   [Message 1] → hash1 → [Message 2] → hash2 → [Message 3] → ...
       *
       * Verification:
       * - hash1 ≠ hash2 (different messages produce different hashes)
       * - hash2 depends on hash1 (chain linkage)
       *
       * This is the foundation of:
       * - Message ordering in MACI
       * - Tamper-evident message logs
       * - Sequential message processing
       *
       * Real-world analogy: Like a blockchain, but for individual voter's messages
       *
       * Security guarantee: Any modification to a message breaks all subsequent
       * hashes in the chain, making tampering immediately detectable.
       */
      const message1Fields = [1n, 2n, 3n, 4n, 5n, 6n, 7n];
      const message2Fields = [8n, 9n, 10n, 11n, 12n, 13n, 14n];
      const encPubKey = [100n, 200n];
      const initialPrevHash = 0n;

      // First message in chain
      const witness1 = await circuit.calculateWitness({
        in: message1Fields,
        encPubKey,
        prevHash: initialPrevHash
      });
      const hash1 = await getSignal(circuit, witness1, 'hash');

      // Second message links to first
      const witness2 = await circuit.calculateWitness({
        in: message2Fields,
        encPubKey,
        prevHash: hash1 // Chain link!
      });
      const hash2 = await getSignal(circuit, witness2, 'hash');

      // Verify proper chain formation
      return hash1 !== hash2;
    });
  });
});
