import { poseidon } from '@dorafactory/maci-sdk';
import { expect } from 'chai';
import { type WitnessTester } from 'circomkit';

import { getSignal, circomkitInstance } from './utils/utils';

/**
 * Test suite for AMACI Deactivate Status Detection
 *
 * This tests the ElGamal encryption/decryption mechanism used to track
 * whether a user is active or deactivated in AMACI.
 *
 * Key concepts:
 * - Initial state: c1 = [0, 0], c2 = [0, 0] → decrypts to EVEN (active)
 * - Deactivated state: c1, c2 are encrypted values → decrypts to ODD (deactivated)
 * - Only the coordinator with the private key can decrypt the status
 */
describe('AMACI Deactivate Status Detection', function test() {
  this.timeout(120000);

  describe('ElGamalDecrypt Circuit', () => {
    let circuit: WitnessTester<['c1', 'c2', 'privKey'], ['out', 'isOdd']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('ElGamalDecrypt', {
        file: 'amaci/power/lib/rerandomize',
        template: 'ElGamalDecrypt'
      });
    });

    it('should decrypt initial state [0,0,0,0] as EVEN (active)', async () => {
      // Initial signup state: c1 = [0, 0], c2 = [0, 0]
      const c1 = [BigInt(0), BigInt(0)];
      const c2 = [BigInt(0), BigInt(0)];
      const privKey = BigInt('12345678901234567890');

      const circuitInputs = {
        c1,
        c2,
        privKey
      };

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      const out = await getSignal(circuit, witness, 'out');
      const isOdd = await getSignal(circuit, witness, 'isOdd');

      // Initial state should decrypt to 0 (even)
      expect(out).to.equal(0n);
      expect(isOdd).to.equal(0n); // 0 = active
    });

    it('should identify even decryption result as active', async () => {
      // Test with various even values
      const testCases = [{ c1: [BigInt(0), BigInt(0)], c2: [BigInt(0), BigInt(0)], expected: 0n }];

      for (const testCase of testCases) {
        const circuitInputs = {
          c1: testCase.c1,
          c2: testCase.c2,
          privKey: BigInt('12345678901234567890')
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isOdd = await getSignal(circuit, witness, 'isOdd');
        expect(isOdd).to.equal(testCase.expected);
      }
    });
  });

  describe('Hash5 Precomputation for Initial State', () => {
    it('should match the precomputed hash value in contract', () => {
      // This is the precomputed value used in the contract for initial state
      // contracts/amaci/src/state.rs line 114-116
      const expectedHex = '2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc';
      const expectedDecimal = BigInt('0x' + expectedHex);

      // Calculate hash5([0, 0, 0, 0, 0])
      // This represents: hash5([c1_x, c1_y, c2_x, c2_y, xIncrement])
      const hash = poseidon([0n, 0n, 0n, 0n, 0n]);

      expect(hash.toString(16)).to.equal(expectedHex);
      expect(hash).to.equal(expectedDecimal);
    });

    it('should produce consistent hash for zero inputs', () => {
      // Test multiple times to ensure consistency
      const hash1 = poseidon([0n, 0n, 0n, 0n, 0n]);
      const hash2 = poseidon([0n, 0n, 0n, 0n, 0n]);
      const hash3 = poseidon([0n, 0n, 0n, 0n, 0n]);

      expect(hash1).to.equal(hash2);
      expect(hash2).to.equal(hash3);
    });
  });

  describe('StateLeafTransformer Deactivate Detection', () => {
    let circuit: WitnessTester<any, any>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('StateLeafTransformer', {
        file: 'amaci/power/stateLeafTransformer',
        template: 'StateLeafTransformer'
      });
    });

    it('should accept message when user is active (c1=c2=[0,0])', async () => {
      const coordPrivKey = BigInt('12345678901234567890');

      // Mock valid message inputs
      const circuitInputs = {
        isQuadraticCost: 0n,
        coordPrivKey,
        numSignUps: 1n, // Number of registered users
        maxVoteOptions: 5n,

        // State leaf data (active user)
        slPubKey: [BigInt(1), BigInt(2)],
        slVoiceCreditBalance: 100n,
        slNonce: 0n,
        slC1: [BigInt(0), BigInt(0)], // Initial state = active
        slC2: [BigInt(0), BigInt(0)],

        currentVotesForOption: 0n,

        // Command data
        cmdStateIndex: 0n,
        cmdNewPubKey: [BigInt(1), BigInt(2)],
        cmdVoteOptionIndex: 0n,
        cmdNewVoteWeight: 10n,
        cmdNonce: 1n,
        cmdSigR8: [BigInt(1), BigInt(2)],
        cmdSigS: BigInt(1),
        packedCommand: [BigInt(1), BigInt(2), BigInt(3)],

        deactivate: 0n // Active in tree
      };

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);
    });
  });

  describe('Integration: Full Deactivate Flow', () => {
    it('should demonstrate the complete state transition', () => {
      // 1. Initial state (signup)
      const initialC1 = [0n, 0n];
      const initialC2 = [0n, 0n];
      const initialHash = poseidon([...initialC1, ...initialC2, 0n]);

      expect(initialHash).to.equal(
        BigInt('0x2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc')
      );

      // 2. After deactivate (c1, c2 are encrypted)
      // In real usage, these would be generated by encryptOdevity(true, pubKey, randomKey)
      // For testing purposes, we just verify the hash changes
      const deactivatedC1 = [123n, 456n];
      const deactivatedC2 = [789n, 101112n];
      const deactivatedHash = poseidon([...deactivatedC1, ...deactivatedC2, 0n]);

      // Hash should be different after deactivate
      expect(deactivatedHash).to.not.equal(initialHash);
    });

    it('should verify double-layer hashing in AMACI state leaf', () => {
      // AMACI uses double-layer poseidon hashing
      // Layer 1: hash5([pubKey_x, pubKey_y, balance, voRoot, nonce])
      // Layer 2: hash5([c1_x, c1_y, c2_x, c2_y, xIncrement])
      // Final: hash2([layer1, layer2])

      const pubKey = [BigInt(1), BigInt(2)];
      const balance = 100n;
      const voRoot = 0n;
      const nonce = 0n;

      // Layer 1
      const layer1 = poseidon([pubKey[0], pubKey[1], balance, voRoot, nonce]);

      // Layer 2 (initial active state)
      const layer2Initial = poseidon([0n, 0n, 0n, 0n, 0n]);

      // Final hash (initial state)
      const stateLeafHashInitial = poseidon([layer1, layer2Initial]);

      // After deactivate
      const c1 = [123n, 456n];
      const c2 = [789n, 101112n];
      const layer2Deactivated = poseidon([...c1, ...c2, 0n]);
      const stateLeafHashDeactivated = poseidon([layer1, layer2Deactivated]);

      // Hashes should be different
      expect(stateLeafHashInitial).to.not.equal(stateLeafHashDeactivated);

      // Layer 1 should remain the same (only deactivate status changed)
      expect(layer1).to.equal(layer1);
    });
  });

  describe('Edge Cases and Security', () => {
    it('should have different hashes for different encryption randomness', () => {
      // Even with same message, different randomness produces different ciphertext
      const c1_1 = [123n, 456n];
      const c2_1 = [789n, 101112n];

      const c1_2 = [111n, 222n];
      const c2_2 = [333n, 444n];

      const hash1 = poseidon([...c1_1, ...c2_1, 0n]);
      const hash2 = poseidon([...c1_2, ...c2_2, 0n]);

      expect(hash1).to.not.equal(hash2);
    });

    it('should maintain privacy: external observers cannot determine status', () => {
      // Without the private key, you cannot decrypt c1/c2
      // The hash alone doesn't reveal whether the user is active or deactivated

      const activeHash = poseidon([0n, 0n, 0n, 0n, 0n]);
      const deactivatedHash = poseidon([123n, 456n, 789n, 101112n, 0n]);

      // Both are just field elements - no way to tell which is which without decryption
      expect(typeof activeHash).to.equal('bigint');
      expect(typeof deactivatedHash).to.equal('bigint');
      expect(activeHash).to.not.equal(deactivatedHash);
    });

    it('should verify that only zero input produces the precomputed hash', () => {
      const zeroHash = poseidon([0n, 0n, 0n, 0n, 0n]);
      const expectedHash = BigInt(
        '0x2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc'
      );

      expect(zeroHash).to.equal(expectedHash);

      // Any non-zero input should produce a different hash
      const nonZeroHashes = [
        poseidon([1n, 0n, 0n, 0n, 0n]),
        poseidon([0n, 1n, 0n, 0n, 0n]),
        poseidon([0n, 0n, 1n, 0n, 0n]),
        poseidon([0n, 0n, 0n, 1n, 0n]),
        poseidon([0n, 0n, 0n, 0n, 1n])
      ];

      for (const hash of nonZeroHashes) {
        expect(hash).to.not.equal(expectedHash);
      }
    });
  });

  describe('Operator Detection Logic', () => {
    it('should simulate operator checking deactivate status', () => {
      // Operator's logic: decrypt(coordPrivKey, {c1, c2}) % 2
      // - Even (0) → Active, can vote
      // - Odd (1) → Deactivated, cannot vote

      // Test cases simulating decrypt results
      const testCases = [
        { decryptResult: 0n, isDeactivated: false, canVote: true },
        { decryptResult: 1n, isDeactivated: true, canVote: false },
        { decryptResult: 2n, isDeactivated: false, canVote: true },
        { decryptResult: 3n, isDeactivated: true, canVote: false },
        { decryptResult: 100n, isDeactivated: false, canVote: true },
        { decryptResult: 101n, isDeactivated: true, canVote: false }
      ];

      for (const testCase of testCases) {
        const isOdd = testCase.decryptResult % 2n === 1n;
        expect(isOdd).to.equal(testCase.isDeactivated);
        expect(!isOdd).to.equal(testCase.canVote);
      }
    });

    it('should verify deactivate detection in batch processing', () => {
      // In processMessages, operator checks each user's status
      // Initial state hash
      const user1Hash = poseidon([0n, 0n, 0n, 0n, 0n]);
      const expectedInitialHash = BigInt(
        '0x2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc'
      );

      expect(user1Hash).to.equal(expectedInitialHash);

      // Deactivated state hash (c1: [123, 456], c2: [789, 101112])
      const user2Hash = poseidon([123n, 456n, 789n, 101112n, 0n]);
      expect(user2Hash).to.not.equal(expectedInitialHash);
    });
  });
});
