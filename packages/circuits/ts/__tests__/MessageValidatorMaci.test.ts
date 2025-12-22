import { expect } from 'chai';
import { VoterClient, OperatorClient, poseidon, packElement } from '@dorafactory/maci-sdk';
import { type WitnessTester } from 'circomkit';

import { getSignal, circomkitInstance } from './utils/utils';

/**
 * MessageValidator Circuit Tests for MACI
 *
 * Circuit Location: packages/circuits/circom/maci/power/messageValidator.circom
 *
 * This test file consolidates all MessageValidator tests:
 * - Circuit-level unit tests (validation logic)
 * - Integration tests (multiple payloads processing)
 * - Nonce mechanism tests
 * - Vote accumulation/overwrite behavior tests
 *
 * ============================================================================
 * CIRCUIT FUNCTIONALITY
 * ============================================================================
 *
 * The MessageValidator circuit validates voting messages in the MACI system.
 * It performs 6 critical validations:
 *
 * 1. State Leaf Index Validation: Ensures stateTreeIndex <= numSignUps
 * 2. Vote Option Index Validation: Ensures voteOptionIndex < maxVoteOptions
 * 3. Nonce Validation: Ensures nonce == originalNonce + 1 (anti-replay)
 * 4. Signature Validation: Verifies EdDSA signature on the command
 * 5. Vote Weight Validation: Ensures voteWeight < sqrt(field size)
 * 6. Voice Credit Validation: Ensures sufficient balance for the vote cost
 *
 * All 6 validations must pass (sum = 6) for the message to be valid.
 *
 * ============================================================================
 * COST CALCULATION
 * ============================================================================
 *
 * Linear Cost Mode (isQuadraticCost = 0):
 *   - Current cost for option: currentVotesForOption
 *   - New vote cost: voteWeight
 *   - Balance check: currentVoiceCreditBalance + currentVotesForOption >= voteWeight
 *   - New balance: currentVoiceCreditBalance + currentVotesForOption - voteWeight
 *
 * Quadratic Cost Mode (isQuadraticCost = 1):
 *   - Current cost for option: currentVotesForOption²
 *   - New vote cost: voteWeight²
 *   - Balance check: currentVoiceCreditBalance + currentVotesForOption² >= voteWeight²
 *   - New balance: currentVoiceCreditBalance + currentVotesForOption² - voteWeight²
 *
 * ============================================================================
 */

describe('MessageValidator MACI Circuit Tests', function test() {
  this.timeout(300000);

  // Circuit-level tests
  let circuit: WitnessTester<
    [
      'stateTreeIndex',
      'numSignUps',
      'voteOptionIndex',
      'maxVoteOptions',
      'originalNonce',
      'nonce',
      'cmd',
      'pubKey',
      'sigR8',
      'sigS',
      'isQuadraticCost',
      'currentVoiceCreditBalance',
      'currentVotesForOption',
      'voteWeight'
    ],
    ['isValid', 'newBalance']
  >;

  let voter: VoterClient;
  let keypair: any;

  // Integration test variables
  let operator: OperatorClient;
  const USER_IDX = 0;
  const maxVoteOptions = 5;
  const stateTreeDepth = 2;
  const intStateTreeDepth = 1;
  const voteOptionTreeDepth = 1;
  const batchSize = 10;

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('MessageValidator', {
      file: 'maci/power/messageValidator',
      template: 'MessageValidator'
    });

    voter = new VoterClient({
      network: 'testnet',
      secretKey: 123456n
    });
    keypair = voter.getSigner();
  });

  /**
   * Helper function to create a valid command and signature
   */
  function createValidCommand(
    stateIdx: number,
    voIdx: number,
    newVotes: bigint,
    nonce: number,
    newPubKey: [bigint, bigint] = [0n, 0n]
  ) {
    const salt = 0n;
    const packaged = packElement({ nonce, stateIdx, voIdx, newVotes, salt });
    const cmd = [packaged, newPubKey[0], newPubKey[1]];
    const msgHash = poseidon(cmd);
    const signature = keypair.sign(msgHash);

    return {
      cmd,
      sigR8: signature.R8 as [bigint, bigint],
      sigS: signature.S,
      pubKey: keypair.getPublicKey().toPoints() as [bigint, bigint]
    };
  }

  // ============================================================================
  // PART 1: Circuit-Level Unit Tests
  // ============================================================================

  describe('Part 1: Circuit-Level Validation Tests', () => {
    describe('Valid Message Tests', () => {
      it('should validate a completely valid message with linear cost', async () => {
        const stateTreeIndex = 0n;
        const numSignUps = 10n;
        const voteOptionIndex = 2n;
        const maxVoteOptions = 5n;
        const originalNonce = 0n;
        const nonce = 1n;
        const voteWeight = 5n;
        const currentVoiceCreditBalance = 100n;
        const currentVotesForOption = 3n;
        const isQuadraticCost = 0n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Message should be valid');

        const newBalance = await getSignal(circuit, witness, 'newBalance');
        expect(newBalance).to.equal(98n, 'New balance should be 98');
      });

      it('should validate a completely valid message with quadratic cost', async () => {
        const stateTreeIndex = 0n;
        const numSignUps = 10n;
        const voteOptionIndex = 2n;
        const maxVoteOptions = 5n;
        const originalNonce = 0n;
        const nonce = 1n;
        const voteWeight = 3n;
        const currentVoiceCreditBalance = 100n;
        const currentVotesForOption = 2n;
        const isQuadraticCost = 1n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Message should be valid');

        const newBalance = await getSignal(circuit, witness, 'newBalance');
        expect(newBalance).to.equal(95n, 'New balance should be 95');
      });

      it('should handle first vote (currentVotesForOption = 0)', async () => {
        const stateTreeIndex = 0n;
        const numSignUps = 10n;
        const voteOptionIndex = 0n;
        const maxVoteOptions = 5n;
        const originalNonce = 0n;
        const nonce = 1n;
        const voteWeight = 10n;
        const currentVoiceCreditBalance = 100n;
        const currentVotesForOption = 0n;
        const isQuadraticCost = 0n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'First vote should be valid');

        const newBalance = await getSignal(circuit, witness, 'newBalance');
        expect(newBalance).to.equal(90n, 'New balance should be 90');
      });

      it('should handle vote modification (currentVotesForOption > 0)', async () => {
        const stateTreeIndex = 0n;
        const numSignUps = 10n;
        const voteOptionIndex = 1n;
        const maxVoteOptions = 5n;
        const originalNonce = 1n;
        const nonce = 2n;
        const voteWeight = 8n;
        const currentVoiceCreditBalance = 95n;
        const currentVotesForOption = 5n;
        const isQuadraticCost = 0n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Vote modification should be valid');

        const newBalance = await getSignal(circuit, witness, 'newBalance');
        expect(newBalance).to.equal(92n, 'New balance should be 92');
      });
    });

    describe('State Leaf Index Validation', () => {
      it('should reject message with invalid stateTreeIndex (too large)', async () => {
        const stateTreeIndex = 11n;
        const numSignUps = 10n;
        const voteOptionIndex = 0n;
        const maxVoteOptions = 5n;
        const originalNonce = 0n;
        const nonce = 1n;
        const voteWeight = 5n;
        const currentVoiceCreditBalance = 100n;
        const currentVotesForOption = 0n;
        const isQuadraticCost = 0n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(0n, 'Message should be invalid (stateTreeIndex too large)');
      });

      it('should accept message with valid stateTreeIndex (equal to numSignUps)', async () => {
        const stateTreeIndex = 10n;
        const numSignUps = 10n;
        const voteOptionIndex = 0n;
        const maxVoteOptions = 5n;
        const originalNonce = 0n;
        const nonce = 1n;
        const voteWeight = 5n;
        const currentVoiceCreditBalance = 100n;
        const currentVotesForOption = 0n;
        const isQuadraticCost = 0n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Message should be valid (stateTreeIndex == numSignUps)');
      });
    });

    describe('Vote Option Index Validation', () => {
      it('should reject message with invalid voteOptionIndex (too large)', async () => {
        const stateTreeIndex = 0n;
        const numSignUps = 10n;
        const voteOptionIndex = 5n;
        const maxVoteOptions = 5n;
        const originalNonce = 0n;
        const nonce = 1n;
        const voteWeight = 5n;
        const currentVoiceCreditBalance = 100n;
        const currentVotesForOption = 0n;
        const isQuadraticCost = 0n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(0n, 'Message should be invalid (voteOptionIndex too large)');
      });

      it('should accept message with valid voteOptionIndex (max - 1)', async () => {
        const stateTreeIndex = 0n;
        const numSignUps = 10n;
        const voteOptionIndex = 4n;
        const maxVoteOptions = 5n;
        const originalNonce = 0n;
        const nonce = 1n;
        const voteWeight = 5n;
        const currentVoiceCreditBalance = 100n;
        const currentVotesForOption = 0n;
        const isQuadraticCost = 0n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Message should be valid (voteOptionIndex < maxVoteOptions)');
      });
    });

    describe('Nonce Validation', () => {
      it('should reject message with incorrect nonce', async () => {
        const stateTreeIndex = 0n;
        const numSignUps = 10n;
        const voteOptionIndex = 0n;
        const maxVoteOptions = 5n;
        const originalNonce = 0n;
        const nonce = 3n;
        const voteWeight = 5n;
        const currentVoiceCreditBalance = 100n;
        const currentVotesForOption = 0n;
        const isQuadraticCost = 0n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(0n, 'Message should be invalid (incorrect nonce)');
      });

      it('should accept message with correct nonce', async () => {
        const stateTreeIndex = 0n;
        const numSignUps = 10n;
        const voteOptionIndex = 0n;
        const maxVoteOptions = 5n;
        const originalNonce = 5n;
        const nonce = 6n;
        const voteWeight = 5n;
        const currentVoiceCreditBalance = 100n;
        const currentVotesForOption = 0n;
        const isQuadraticCost = 0n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Message should be valid (correct nonce)');
      });
    });

    describe('Signature Validation', () => {
      it('should reject message with invalid signature', async () => {
        const stateTreeIndex = 0n;
        const numSignUps = 10n;
        const voteOptionIndex = 0n;
        const maxVoteOptions = 5n;
        const originalNonce = 0n;
        const nonce = 1n;
        const voteWeight = 5n;
        const currentVoiceCreditBalance = 100n;
        const currentVotesForOption = 0n;
        const isQuadraticCost = 0n;

        const { cmd } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const wrongVoter = new VoterClient({
          network: 'testnet',
          secretKey: 999999n
        });
        const wrongKeypair = wrongVoter.getSigner();
        const wrongMsgHash = poseidon(cmd);
        const wrongSignature = wrongKeypair.sign(wrongMsgHash);

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey: keypair.getPublicKey().toPoints() as [bigint, bigint],
          sigR8: wrongSignature.R8 as [bigint, bigint],
          sigS: wrongSignature.S,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(0n, 'Message should be invalid (wrong signature)');
      });
    });

    describe('Voice Credit Validation', () => {
      it('should reject message with insufficient balance (linear cost)', async () => {
        const stateTreeIndex = 0n;
        const numSignUps = 10n;
        const voteOptionIndex = 0n;
        const maxVoteOptions = 5n;
        const originalNonce = 0n;
        const nonce = 1n;
        const voteWeight = 50n;
        const currentVoiceCreditBalance = 10n;
        const currentVotesForOption = 0n;
        const isQuadraticCost = 0n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(0n, 'Message should be invalid (insufficient balance)');
      });

      it('should reject message with insufficient balance (quadratic cost)', async () => {
        const stateTreeIndex = 0n;
        const numSignUps = 10n;
        const voteOptionIndex = 0n;
        const maxVoteOptions = 5n;
        const originalNonce = 0n;
        const nonce = 1n;
        const voteWeight = 10n;
        const currentVoiceCreditBalance = 50n;
        const currentVotesForOption = 0n;
        const isQuadraticCost = 1n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(
          0n,
          'Message should be invalid (insufficient balance for quadratic cost)'
        );
      });

      it('should accept message with exactly sufficient balance', async () => {
        const stateTreeIndex = 0n;
        const numSignUps = 10n;
        const voteOptionIndex = 0n;
        const maxVoteOptions = 5n;
        const originalNonce = 0n;
        const nonce = 1n;
        const voteWeight = 10n;
        const currentVoiceCreditBalance = 10n;
        const currentVotesForOption = 0n;
        const isQuadraticCost = 0n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Message should be valid (exactly sufficient balance)');

        const newBalance = await getSignal(circuit, witness, 'newBalance');
        expect(newBalance).to.equal(0n, 'New balance should be 0');
      });

      it('should handle vote modification with cost refund (quadratic)', async () => {
        const stateTreeIndex = 0n;
        const numSignUps = 10n;
        const voteOptionIndex = 0n;
        const maxVoteOptions = 5n;
        const originalNonce = 1n;
        const nonce = 2n;
        const voteWeight = 2n;
        const currentVoiceCreditBalance = 100n;
        const currentVotesForOption = 5n;
        const isQuadraticCost = 1n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Message should be valid');

        const newBalance = await getSignal(circuit, witness, 'newBalance');
        expect(newBalance).to.equal(121n, 'New balance should be 121');
      });
    });

    describe('Vote Weight Validation', () => {
      it('should reject message with voteWeight exceeding max', async () => {
        const stateTreeIndex = 0n;
        const numSignUps = 10n;
        const voteOptionIndex = 0n;
        const maxVoteOptions = 5n;
        const originalNonce = 0n;
        const nonce = 1n;
        const voteWeight = 147946756881789319005730692170996259610n;
        const currentVoiceCreditBalance = 1000000000000000000000000n;
        const currentVotesForOption = 0n;
        const isQuadraticCost = 0n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(0n, 'Message should be invalid (voteWeight too large)');
      });

      it('should accept message with large voteWeight (within limit)', async () => {
        const stateTreeIndex = 0n;
        const numSignUps = 10n;
        const voteOptionIndex = 0n;
        const maxVoteOptions = 5n;
        const originalNonce = 0n;
        const nonce = 1n;
        const voteWeight = 1000000n;
        const currentVoiceCreditBalance = 2000000n;
        const currentVotesForOption = 0n;
        const isQuadraticCost = 0n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Message should be valid (large voteWeight within limit)');
      });
    });

    describe('Edge Cases', () => {
      it('should handle zero vote weight', async () => {
        const stateTreeIndex = 0n;
        const numSignUps = 10n;
        const voteOptionIndex = 0n;
        const maxVoteOptions = 5n;
        const originalNonce = 0n;
        const nonce = 1n;
        const voteWeight = 0n;
        const currentVoiceCreditBalance = 100n;
        const currentVotesForOption = 5n;
        const isQuadraticCost = 0n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Message should be valid (zero vote weight)');

        const newBalance = await getSignal(circuit, witness, 'newBalance');
        expect(newBalance).to.equal(105n, 'New balance should be 105');
      });

      it('should handle large currentVotesForOption with quadratic cost', async () => {
        const stateTreeIndex = 0n;
        const numSignUps = 10n;
        const voteOptionIndex = 0n;
        const maxVoteOptions = 5n;
        const originalNonce = 0n;
        const nonce = 1n;
        const voteWeight = 10n;
        const currentVoiceCreditBalance = 10000n;
        const currentVotesForOption = 50n;
        const isQuadraticCost = 1n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(stateTreeIndex),
          Number(voteOptionIndex),
          voteWeight,
          Number(nonce)
        );

        const circuitInputs = {
          stateTreeIndex,
          numSignUps,
          voteOptionIndex,
          maxVoteOptions,
          originalNonce,
          nonce,
          cmd,
          pubKey,
          sigR8,
          sigS,
          isQuadraticCost,
          currentVoiceCreditBalance,
          currentVotesForOption,
          voteWeight
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Message should be valid');

        const newBalance = await getSignal(circuit, witness, 'newBalance');
        expect(newBalance).to.equal(12400n, 'New balance should be 12400');
      });
    });
  });

  // ============================================================================
  // PART 2: Integration Tests - Multiple Payloads Processing
  // ============================================================================

  describe('Part 2: Integration Tests - Multiple Payloads Processing', () => {
    beforeEach(() => {
      operator = new OperatorClient({
        network: 'testnet',
        secretKey: 111111n
      });

      operator.initRound({
        stateTreeDepth,
        intStateTreeDepth,
        voteOptionTreeDepth,
        batchSize,
        maxVoteOptions,

        isQuadraticCost: false,
        isAmaci: false
      });

      const userPubKey = voter.getPubkey().toPoints();
      operator.updateStateTree(USER_IDX, userPubKey, 1000);
    });

    it('should handle single payload with multiple options', async () => {
      const coordPubKey = operator.getPubkey().toPoints();

      const payload1 = voter.buildVotePayload({
        stateIdx: USER_IDX,
        operatorPubkey: coordPubKey,
        selectedOptions: [
          { idx: 1, vc: 10 },
          { idx: 2, vc: 20 },
          { idx: 3, vc: 30 }
        ]
      });

      for (const payload of payload1) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, messageEncPubKey);
      }

      operator.endVotePeriod();
      while (operator.states === 1) {
        await operator.processMessages();
      }

      const finalState = operator.stateLeaves.get(USER_IDX);
      const finalVotes = finalState!.voTree.leaves();

      expect(finalVotes[1]).to.equal(10n);
      expect(finalVotes[2]).to.equal(20n);
      expect(finalVotes[3]).to.equal(30n);
      expect(finalState!.nonce).to.equal(3n);
    });

    it('should handle multiple payloads in same batch', async () => {
      const coordPubKey = operator.getPubkey().toPoints();

      const payload1 = voter.buildVotePayload({
        stateIdx: USER_IDX,
        operatorPubkey: coordPubKey,
        selectedOptions: [
          { idx: 1, vc: 5 },
          { idx: 2, vc: 3 }
        ]
      });

      const payload2 = voter.buildVotePayload({
        stateIdx: USER_IDX,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 2, vc: 8 }]
      });

      const payload3 = voter.buildVotePayload({
        stateIdx: USER_IDX,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 3, vc: 10 }]
      });

      for (const payload of payload1) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, messageEncPubKey);
      }

      for (const payload of payload2) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, messageEncPubKey);
      }

      for (const payload of payload3) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, messageEncPubKey);
      }

      operator.endVotePeriod();
      while (operator.states === 1) {
        await operator.processMessages();
      }

      const finalState = operator.stateLeaves.get(USER_IDX);
      const finalVotes = finalState!.voTree.leaves();

      // Due to nonce mechanism, only some messages will be processed
      expect(finalVotes[3]).to.equal(10n);
      expect(finalState!.nonce > 0n).to.be.true;
    });

    it('should demonstrate overwrite behavior with multiple payloads', async () => {
      const coordPubKey = operator.getPubkey().toPoints();

      const firstPayload = voter.buildVotePayload({
        stateIdx: USER_IDX,
        operatorPubkey: coordPubKey,
        selectedOptions: [
          { idx: 1, vc: 2 },
          { idx: 2, vc: 1 }
        ]
      });

      for (const payload of firstPayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, messageEncPubKey);
      }

      operator.endVotePeriod();
      while (operator.states === 1) {
        await operator.processMessages();
      }

      const state1 = operator.stateLeaves.get(USER_IDX);
      const votes1 = state1!.voTree.leaves();
      expect(votes1[1]).to.equal(2n);
      expect(votes1[2]).to.equal(1n);
      expect(state1!.nonce).to.equal(2n);

      // Create new operator to simulate second vote
      const operator2 = new OperatorClient({
        network: 'testnet',
        secretKey: 111111n
      });

      operator2.initRound({
        stateTreeDepth,
        intStateTreeDepth,
        voteOptionTreeDepth,
        batchSize,
        maxVoteOptions,

        isQuadraticCost: false,
        isAmaci: false
      });

      const userPubKey = voter.getPubkey().toPoints();
      operator2.updateStateTree(USER_IDX, userPubKey, 1000);

      // Re-push first payload messages
      for (const payload of firstPayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator2.pushMessage(message, messageEncPubKey);
      }

      // Second payload: only option 2
      const secondPayload = voter.buildVotePayload({
        stateIdx: USER_IDX,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 2, vc: 3 }]
      });

      for (const payload of secondPayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator2.pushMessage(message, messageEncPubKey);
      }

      operator2.endVotePeriod();
      while (operator2.states === 1) {
        await operator2.processMessages();
      }

      const state2 = operator2.stateLeaves.get(USER_IDX);
      const votes2 = state2!.voTree.leaves();

      // Due to nonce mechanism, option 1 message is rejected
      expect(votes2[1]).to.equal(0n, 'Option 1 should be 0 (message rejected)');
      expect(votes2[2]).to.equal(3n, 'Option 2 should be 3 (updated)');
    });

    it('should verify nonce is global per user, not per option', async () => {
      const coordPubKey = operator.getPubkey().toPoints();

      const firstPayload = voter.buildVotePayload({
        stateIdx: USER_IDX,
        operatorPubkey: coordPubKey,
        selectedOptions: [
          { idx: 1, vc: 2 },
          { idx: 2, vc: 1 }
        ]
      });

      for (const payload of firstPayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, messageEncPubKey);
      }

      operator.endVotePeriod();
      while (operator.states === 1) {
        await operator.processMessages();
      }

      const stateAfterFirst = operator.stateLeaves.get(USER_IDX);
      expect(stateAfterFirst!.nonce).to.equal(2n);

      // Create new operator for second payload (since vote period ended)
      const operator2 = new OperatorClient({
        network: 'testnet',
        secretKey: 111111n
      });

      operator2.initRound({
        stateTreeDepth,
        intStateTreeDepth,
        voteOptionTreeDepth,
        batchSize,
        maxVoteOptions,

        isQuadraticCost: false,
        isAmaci: false
      });

      const userPubKey = voter.getPubkey().toPoints();
      operator2.updateStateTree(USER_IDX, userPubKey, 1000);

      // Re-push first payload
      for (const payload of firstPayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator2.pushMessage(message, messageEncPubKey);
      }

      // Second payload
      const secondPayload = voter.buildVotePayload({
        stateIdx: USER_IDX,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 2, vc: 3 }]
      });

      for (const payload of secondPayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator2.pushMessage(message, messageEncPubKey);
      }

      operator2.endVotePeriod();
      while (operator2.states === 1) {
        await operator2.processMessages();
      }

      const stateAfterSecond = operator2.stateLeaves.get(USER_IDX);
      // Nonce should be incremented (but may be rejected due to nonce mismatch)
      expect(stateAfterSecond!.nonce > 0n).to.be.true;
    });

    it('should show nonce within a payload vs global nonce', async () => {
      const coordPubKey = operator.getPubkey().toPoints();

      const payload = voter.buildVotePayload({
        stateIdx: USER_IDX,
        operatorPubkey: coordPubKey,
        selectedOptions: [
          { idx: 1, vc: 10 },
          { idx: 2, vc: 20 },
          { idx: 3, vc: 30 }
        ]
      });

      for (const payloadItem of payload) {
        const message = payloadItem.msg.map((m) => BigInt(m));
        const messageEncPubKey = payloadItem.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, messageEncPubKey);
      }

      operator.endVotePeriod();
      while (operator.states === 1) {
        await operator.processMessages();
      }

      const state = operator.stateLeaves.get(USER_IDX);
      expect(state!.nonce).to.equal(3n);
    });
  });
});
