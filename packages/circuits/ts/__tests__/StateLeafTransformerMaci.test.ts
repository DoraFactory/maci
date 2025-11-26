import { expect } from 'chai';
import { VoterClient, poseidon, packElement } from '@dorafactory/maci-sdk';
import { type WitnessTester } from 'circomkit';

import { getSignal, circomkitInstance } from './utils/utils';

/**
 * StateLeafTransformer Circuit Tests for MACI
 *
 * Circuit Location: packages/circuits/circom/maci/power/stateLeafTransformer.circom
 *
 * This test file provides comprehensive coverage for StateLeafTransformer:
 * - Valid command scenarios (linear/quadratic cost)
 * - Invalid command scenarios (various validation failures)
 * - State update logic (Mux1 selection)
 * - Edge cases (first vote, vote modification, vote withdrawal)
 * - Key rotation scenarios
 *
 * ============================================================================
 * CIRCUIT FUNCTIONALITY
 * ============================================================================
 *
 * The StateLeafTransformer circuit applies a command to a state leaf and ballot.
 * It performs the following operations:
 *
 * 1. Command Validation: Uses MessageValidator to validate the command
 * 2. State Transformation: Updates state leaf if command is valid, otherwise keeps original
 * 3. Balance Calculation: Computes new voice credit balance
 * 4. Atomic Updates: Ensures all-or-nothing state updates via Mux1 components
 *
 * ============================================================================
 * STATE UPDATE LOGIC
 * ============================================================================
 *
 * The circuit uses Mux1 components to conditionally update state:
 *
 * - If isValid = 1: newSlPubKey = cmdNewPubKey, newSlNonce = cmdNonce
 * - If isValid = 0: newSlPubKey = slPubKey, newSlNonce = slNonce
 *
 * This ensures atomic updates - either all fields update or all stay the same.
 *
 * ============================================================================
 */

describe('StateLeafTransformer MACI Circuit Tests', function test() {
  this.timeout(300000);

  let circuit: WitnessTester<
    [
      'isQuadraticCost',
      'numSignUps',
      'maxVoteOptions',
      'slPubKey',
      'slVoiceCreditBalance',
      'slNonce',
      'currentVotesForOption',
      'cmdStateIndex',
      'cmdNewPubKey',
      'cmdVoteOptionIndex',
      'cmdNewVoteWeight',
      'cmdNonce',
      'cmdSigR8',
      'cmdSigS',
      'packedCommand'
    ],
    ['newSlPubKey', 'newSlNonce', 'isValid', 'newBalance']
  >;

  let voter: VoterClient;
  let keypair: any;

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('StateLeafTransformer', {
      file: 'maci/power/stateLeafTransformer',
      template: 'StateLeafTransformer'
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
    newPubKey: [bigint, bigint] = [0n, 0n],
    signerKeypair?: any
  ) {
    const salt = 0n;
    const packaged = packElement({ nonce, stateIdx, voIdx, newVotes, salt });
    const cmd = [packaged, newPubKey[0], newPubKey[1]];
    const msgHash = poseidon(cmd);
    const signer = signerKeypair || keypair;
    const signature = signer.sign(msgHash);

    return {
      cmd,
      sigR8: signature.R8 as [bigint, bigint],
      sigS: signature.S,
      pubKey: signer.getPublicKey().toPoints() as [bigint, bigint]
    };
  }

  // ============================================================================
  // PART 1: Valid Command Tests
  // ============================================================================

  describe('Part 1: Valid Command Tests', () => {
    describe('First Vote Scenarios', () => {
      it('should update state leaf for valid first vote (linear cost)', async () => {
        const isQuadraticCost = 0n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state leaf - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 100n;
        const slNonce = 0n;
        const currentVotesForOption = 0n;

        // Command
        const cmdStateIndex = 0n;
        const cmdNewPubKey: [bigint, bigint] = [111222333n, 444555666n];
        const cmdVoteOptionIndex = 1n;
        const cmdNewVoteWeight = 10n;
        const cmdNonce = 1n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: sigR8,
          cmdSigS: sigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        // Check validation result
        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Command should be valid');

        // Check state updates (should use new values since isValid = 1)
        const newSlPubKey0 = await getSignal(circuit, witness, 'newSlPubKey[0]');
        const newSlPubKey1 = await getSignal(circuit, witness, 'newSlPubKey[1]');
        expect(newSlPubKey0).to.equal(cmdNewPubKey[0], 'Should use new public key x');
        expect(newSlPubKey1).to.equal(cmdNewPubKey[1], 'Should use new public key y');

        const newSlNonce = await getSignal(circuit, witness, 'newSlNonce');
        expect(newSlNonce).to.equal(cmdNonce, 'Should use new nonce');

        // Check balance (linear: 100 + 0 - 10 = 90)
        const newBalance = await getSignal(circuit, witness, 'newBalance');
        expect(newBalance).to.equal(90n, 'New balance should be 90');
      });

      it('should update state leaf for valid first vote (quadratic cost)', async () => {
        const isQuadraticCost = 1n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state leaf - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 100n;
        const slNonce = 0n;
        const currentVotesForOption = 0n;

        const cmdStateIndex = 0n;
        const cmdNewPubKey: [bigint, bigint] = [111222333n, 444555666n];
        const cmdVoteOptionIndex = 1n;
        const cmdNewVoteWeight = 5n; // Cost = 5² = 25
        const cmdNonce = 1n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: sigR8,
          cmdSigS: sigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Command should be valid');

        const newSlPubKey0 = await getSignal(circuit, witness, 'newSlPubKey[0]');
        const newSlPubKey1 = await getSignal(circuit, witness, 'newSlPubKey[1]');
        expect(newSlPubKey0).to.equal(cmdNewPubKey[0], 'Should use new public key');
        expect(newSlPubKey1).to.equal(cmdNewPubKey[1], 'Should use new public key');

        const newSlNonce = await getSignal(circuit, witness, 'newSlNonce');
        expect(newSlNonce).to.equal(cmdNonce, 'Should use new nonce');

        // Check balance (quadratic: 100 + 0 - 25 = 75)
        const newBalance = await getSignal(circuit, witness, 'newBalance');
        expect(newBalance).to.equal(75n, 'New balance should be 75');
      });
    });

    describe('Vote Modification Scenarios', () => {
      it('should update state leaf when modifying vote (linear cost)', async () => {
        const isQuadraticCost = 0n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state (already voted before) - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 90n; // After first vote
        const slNonce = 1n; // Already voted once
        const currentVotesForOption = 10n; // Previous vote weight

        // Command (modify vote)
        const cmdStateIndex = 0n;
        const cmdNewPubKey: [bigint, bigint] = [222333444n, 555666777n];
        const cmdVoteOptionIndex = 1n;
        const cmdNewVoteWeight = 8n; // New vote weight
        const cmdNonce = 2n; // slNonce + 1

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: sigR8,
          cmdSigS: sigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Command should be valid');

        // Should use new values
        const newSlPubKey0 = await getSignal(circuit, witness, 'newSlPubKey[0]');
        expect(newSlPubKey0).to.equal(cmdNewPubKey[0], 'Should use new public key');

        const newSlNonce = await getSignal(circuit, witness, 'newSlNonce');
        expect(newSlNonce).to.equal(cmdNonce, 'Should use new nonce');

        // Balance: 90 + 10 (refund) - 8 (new cost) = 92
        const newBalance = await getSignal(circuit, witness, 'newBalance');
        expect(newBalance).to.equal(92n, 'New balance should be 92');
      });

      it('should update state leaf when modifying vote (quadratic cost)', async () => {
        const isQuadraticCost = 1n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state leaf - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 75n; // After first vote (5² = 25)
        const slNonce = 1n;
        const currentVotesForOption = 5n; // Previous vote weight

        const cmdStateIndex = 0n;
        const cmdNewPubKey: [bigint, bigint] = [222333444n, 555666777n];
        const cmdVoteOptionIndex = 1n;
        const cmdNewVoteWeight = 3n; // New vote weight (cost = 3² = 9)
        const cmdNonce = 2n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: sigR8,
          cmdSigS: sigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Command should be valid');

        // Balance: 75 + 25 (refund 5²) - 9 (new cost 3²) = 91
        const newBalance = await getSignal(circuit, witness, 'newBalance');
        expect(newBalance).to.equal(91n, 'New balance should be 91');
      });
    });

    describe('Vote Withdrawal Scenarios', () => {
      it('should update state when withdrawing vote (setting voteWeight to 0)', async () => {
        const isQuadraticCost = 1n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state leaf - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 75n; // After voting 5² = 25
        const slNonce = 1n;
        const currentVotesForOption = 5n; // Previous vote

        const cmdStateIndex = 0n;
        const cmdNewPubKey: [bigint, bigint] = [111222333n, 444555666n];
        const cmdVoteOptionIndex = 1n;
        const cmdNewVoteWeight = 0n; // Withdraw vote
        const cmdNonce = 2n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: sigR8,
          cmdSigS: sigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Command should be valid');

        // Balance: 75 + 25 (refund 5²) - 0 (no new cost) = 100
        const newBalance = await getSignal(circuit, witness, 'newBalance');
        expect(newBalance).to.equal(100n, 'Balance should be refunded to 100');
      });
    });
  });

  // ============================================================================
  // PART 2: Invalid Command Tests - State Preservation
  // ============================================================================

  describe('Part 2: Invalid Command Tests - State Preservation', () => {
    describe('Invalid State Index', () => {
      it('should preserve state when stateIndex is invalid', async () => {
        const isQuadraticCost = 0n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state leaf - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 100n;
        const slNonce = 0n;
        const currentVotesForOption = 0n;

        const cmdStateIndex = 15n; // Invalid: > numSignUps
        const cmdNewPubKey: [bigint, bigint] = [999888777n, 666555444n];
        const cmdVoteOptionIndex = 1n;
        const cmdNewVoteWeight = 10n;
        const cmdNonce = 1n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: sigR8,
          cmdSigS: sigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(0n, 'Command should be invalid');

        // Should preserve original state
        const newSlPubKey0 = await getSignal(circuit, witness, 'newSlPubKey[0]');
        const newSlPubKey1 = await getSignal(circuit, witness, 'newSlPubKey[1]');
        expect(newSlPubKey0).to.equal(slPubKey[0], 'Should preserve original public key x');
        expect(newSlPubKey1).to.equal(slPubKey[1], 'Should preserve original public key y');

        const newSlNonce = await getSignal(circuit, witness, 'newSlNonce');
        expect(newSlNonce).to.equal(slNonce, 'Should preserve original nonce');
      });
    });

    describe('Invalid Vote Option Index', () => {
      it('should preserve state when voteOptionIndex is invalid', async () => {
        const isQuadraticCost = 0n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state leaf - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 100n;
        const slNonce = 0n;
        const currentVotesForOption = 0n;

        const cmdStateIndex = 0n;
        const cmdNewPubKey: [bigint, bigint] = [999888777n, 666555444n];
        const cmdVoteOptionIndex = 10n; // Invalid: >= maxVoteOptions
        const cmdNewVoteWeight = 10n;
        const cmdNonce = 1n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: sigR8,
          cmdSigS: sigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(0n, 'Command should be invalid');

        // Should preserve original state
        const newSlPubKey0 = await getSignal(circuit, witness, 'newSlPubKey[0]');
        expect(newSlPubKey0).to.equal(slPubKey[0], 'Should preserve original public key');
      });
    });

    describe('Invalid Nonce', () => {
      it('should preserve state when nonce is incorrect', async () => {
        const isQuadraticCost = 0n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state leaf - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 100n;
        const slNonce = 5n; // Current nonce
        const currentVotesForOption = 0n;

        const cmdStateIndex = 0n;
        const cmdNewPubKey: [bigint, bigint] = [999888777n, 666555444n];
        const cmdVoteOptionIndex = 1n;
        const cmdNewVoteWeight = 10n;
        const cmdNonce = 7n; // Invalid: should be 6 (5 + 1)

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: sigR8,
          cmdSigS: sigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(0n, 'Command should be invalid (nonce mismatch)');

        // Should preserve original state
        const newSlPubKey0 = await getSignal(circuit, witness, 'newSlPubKey[0]');
        const newSlNonce = await getSignal(circuit, witness, 'newSlNonce');
        expect(newSlPubKey0).to.equal(slPubKey[0], 'Should preserve original public key');
        expect(newSlNonce).to.equal(slNonce, 'Should preserve original nonce');
      });

      it('should preserve state when nonce is reused (replay attack)', async () => {
        const isQuadraticCost = 0n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state leaf - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 100n;
        const slNonce = 5n; // Current nonce
        const currentVotesForOption = 0n;

        const cmdStateIndex = 0n;
        const cmdNewPubKey: [bigint, bigint] = [999888777n, 666555444n];
        const cmdVoteOptionIndex = 1n;
        const cmdNewVoteWeight = 10n;
        const cmdNonce = 5n; // Invalid: same as slNonce (should be 6)

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: sigR8,
          cmdSigS: sigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(0n, 'Command should be invalid (replay attack)');

        // Should preserve original state
        const newSlNonce = await getSignal(circuit, witness, 'newSlNonce');
        expect(newSlNonce).to.equal(slNonce, 'Should preserve original nonce');
      });
    });

    describe('Invalid Signature', () => {
      it('should preserve state when signature is invalid', async () => {
        const isQuadraticCost = 0n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state leaf - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 100n;
        const slNonce = 0n;
        const currentVotesForOption = 0n;

        const cmdStateIndex = 0n;
        const cmdNewPubKey: [bigint, bigint] = [999888777n, 666555444n];
        const cmdVoteOptionIndex = 1n;
        const cmdNewVoteWeight = 10n;
        const cmdNonce = 1n;

        // Create valid command but use wrong signature
        const { cmd } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        // Use invalid signature (wrong R8 or S)
        const invalidSigR8: [bigint, bigint] = [999999999n, 888888888n];
        const invalidSigS = 777777777n;

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: invalidSigR8,
          cmdSigS: invalidSigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(0n, 'Command should be invalid (invalid signature)');

        // Should preserve original state
        const newSlPubKey0 = await getSignal(circuit, witness, 'newSlPubKey[0]');
        expect(newSlPubKey0).to.equal(slPubKey[0], 'Should preserve original public key');
      });
    });

    describe('Insufficient Balance', () => {
      it('should preserve state when balance is insufficient (linear cost)', async () => {
        const isQuadraticCost = 0n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state leaf - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 5n; // Insufficient
        const slNonce = 0n;
        const currentVotesForOption = 0n;

        const cmdStateIndex = 0n;
        const cmdNewPubKey: [bigint, bigint] = [999888777n, 666555444n];
        const cmdVoteOptionIndex = 1n;
        const cmdNewVoteWeight = 10n; // Requires 10, but only have 5
        const cmdNonce = 1n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: sigR8,
          cmdSigS: sigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(0n, 'Command should be invalid (insufficient balance)');

        // Should preserve original state
        const newSlPubKey0 = await getSignal(circuit, witness, 'newSlPubKey[0]');
        expect(newSlPubKey0).to.equal(slPubKey[0], 'Should preserve original public key');
      });

      it('should preserve state when balance is insufficient (quadratic cost)', async () => {
        const isQuadraticCost = 1n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state leaf - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 10n; // Insufficient for 5² = 25
        const slNonce = 0n;
        const currentVotesForOption = 0n;

        const cmdStateIndex = 0n;
        const cmdNewPubKey: [bigint, bigint] = [999888777n, 666555444n];
        const cmdVoteOptionIndex = 1n;
        const cmdNewVoteWeight = 5n; // Requires 5² = 25, but only have 10
        const cmdNonce = 1n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: sigR8,
          cmdSigS: sigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(0n, 'Command should be invalid (insufficient balance)');

        // Should preserve original state
        const newSlPubKey0 = await getSignal(circuit, witness, 'newSlPubKey[0]');
        expect(newSlPubKey0).to.equal(slPubKey[0], 'Should preserve original public key');
      });
    });
  });

  // ============================================================================
  // PART 3: Edge Cases and Boundary Conditions
  // ============================================================================

  describe('Part 3: Edge Cases and Boundary Conditions', () => {
    describe('Boundary Values', () => {
      it('should handle stateIndex equal to numSignUps (boundary)', async () => {
        const isQuadraticCost = 0n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state leaf - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 100n;
        const slNonce = 0n;
        const currentVotesForOption = 0n;

        const cmdStateIndex = 10n; // Equal to numSignUps (valid boundary)
        const cmdNewPubKey: [bigint, bigint] = [111222333n, 444555666n];
        const cmdVoteOptionIndex = 1n;
        const cmdNewVoteWeight = 10n;
        const cmdNonce = 1n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: sigR8,
          cmdSigS: sigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Command should be valid (boundary case)');
      });

      it('should handle voteOptionIndex equal to maxVoteOptions - 1 (boundary)', async () => {
        const isQuadraticCost = 0n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state leaf - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 100n;
        const slNonce = 0n;
        const currentVotesForOption = 0n;

        const cmdStateIndex = 0n;
        const cmdNewPubKey: [bigint, bigint] = [111222333n, 444555666n];
        const cmdVoteOptionIndex = 4n; // maxVoteOptions - 1 (valid boundary)
        const cmdNewVoteWeight = 10n;
        const cmdNonce = 1n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: sigR8,
          cmdSigS: sigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Command should be valid (boundary case)');
      });

      it('should handle exactly sufficient balance', async () => {
        const isQuadraticCost = 0n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state leaf - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 10n; // Exactly sufficient
        const slNonce = 0n;
        const currentVotesForOption = 0n;

        const cmdStateIndex = 0n;
        const cmdNewPubKey: [bigint, bigint] = [111222333n, 444555666n];
        const cmdVoteOptionIndex = 1n;
        const cmdNewVoteWeight = 10n; // Exactly matches balance
        const cmdNonce = 1n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: sigR8,
          cmdSigS: sigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Command should be valid (exactly sufficient balance)');

        // Balance: 10 + 0 - 10 = 0
        const newBalance = await getSignal(circuit, witness, 'newBalance');
        expect(newBalance).to.equal(0n, 'New balance should be 0');
      });
    });

    describe('Zero Values', () => {
      it('should handle zero vote weight', async () => {
        const isQuadraticCost = 0n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state leaf - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 100n;
        const slNonce = 0n;
        const currentVotesForOption = 0n;

        const cmdStateIndex = 0n;
        const cmdNewPubKey: [bigint, bigint] = [111222333n, 444555666n];
        const cmdVoteOptionIndex = 1n;
        const cmdNewVoteWeight = 0n; // Zero vote weight
        const cmdNonce = 1n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: sigR8,
          cmdSigS: sigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Command should be valid (zero vote weight)');

        // Balance should remain the same (no cost)
        const newBalance = await getSignal(circuit, witness, 'newBalance');
        expect(newBalance).to.equal(100n, 'Balance should remain 100');
      });

      it('should handle zero balance with zero vote weight', async () => {
        const isQuadraticCost = 0n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state leaf - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 0n; // Zero balance
        const slNonce = 0n;
        const currentVotesForOption = 0n;

        const cmdStateIndex = 0n;
        const cmdNewPubKey: [bigint, bigint] = [111222333n, 444555666n];
        const cmdVoteOptionIndex = 1n;
        const cmdNewVoteWeight = 0n; // Zero vote weight
        const cmdNonce = 1n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: sigR8,
          cmdSigS: sigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Command should be valid (zero balance, zero vote)');

        const newBalance = await getSignal(circuit, witness, 'newBalance');
        expect(newBalance).to.equal(0n, 'Balance should remain 0');
      });
    });

    describe('Large Values', () => {
      it('should handle large vote weights with quadratic cost', async () => {
        const isQuadraticCost = 1n;
        const numSignUps = 10n;
        const maxVoteOptions = 5n;

        // Current state leaf - use the actual keypair public key
        const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
        const slVoiceCreditBalance = 10000n; // Large balance
        const slNonce = 0n;
        const currentVotesForOption = 0n;

        const cmdStateIndex = 0n;
        const cmdNewPubKey: [bigint, bigint] = [111222333n, 444555666n];
        const cmdVoteOptionIndex = 1n;
        const cmdNewVoteWeight = 50n; // Large vote weight (cost = 50² = 2500)
        const cmdNonce = 1n;

        const { cmd, sigR8, sigS, pubKey } = createValidCommand(
          Number(cmdStateIndex),
          Number(cmdVoteOptionIndex),
          cmdNewVoteWeight,
          Number(cmdNonce),
          cmdNewPubKey
        );

        const circuitInputs = {
          isQuadraticCost,
          numSignUps,
          maxVoteOptions,
          slPubKey,
          slVoiceCreditBalance,
          slNonce,
          currentVotesForOption,
          cmdStateIndex,
          cmdNewPubKey,
          cmdVoteOptionIndex,
          cmdNewVoteWeight,
          cmdNonce,
          cmdSigR8: sigR8,
          cmdSigS: sigS,
          packedCommand: cmd
        };

        const witness = await circuit.calculateWitness(circuitInputs);
        await circuit.expectConstraintPass(witness);

        const isValid = await getSignal(circuit, witness, 'isValid');
        expect(isValid).to.equal(1n, 'Command should be valid');

        // Balance: 10000 + 0 - 2500 = 7500
        const newBalance = await getSignal(circuit, witness, 'newBalance');
        expect(newBalance).to.equal(7500n, 'New balance should be 7500');
      });
    });
  });

  // ============================================================================
  // PART 4: Atomic Update Verification
  // ============================================================================

  describe('Part 4: Atomic Update Verification', () => {
    it('should update all state fields atomically when command is valid', async () => {
      const isQuadraticCost = 0n;
      const numSignUps = 10n;
      const maxVoteOptions = 5n;

      // Current state leaf - use the actual keypair public key
      const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
      const slVoiceCreditBalance = 100n;
      const slNonce = 5n;

      const cmdNewPubKey: [bigint, bigint] = [999999999n, 888888888n];
      const cmdNonce = 6n;

      const { cmd, sigR8, sigS, pubKey } = createValidCommand(
        0,
        1,
        10n,
        Number(cmdNonce),
        cmdNewPubKey
      );

      const circuitInputs = {
        isQuadraticCost,
        numSignUps,
        maxVoteOptions,
        slPubKey,
        slVoiceCreditBalance,
        slNonce,
        currentVotesForOption: 0n,
        cmdStateIndex: 0n,
        cmdNewPubKey,
        cmdVoteOptionIndex: 1n,
        cmdNewVoteWeight: 10n,
        cmdNonce,
        cmdSigR8: sigR8,
        cmdSigS: sigS,
        packedCommand: cmd
      };

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      const isValid = await getSignal(circuit, witness, 'isValid');
      expect(isValid).to.equal(1n, 'Command should be valid');

      // Verify all fields updated atomically
      const newSlPubKey0 = await getSignal(circuit, witness, 'newSlPubKey[0]');
      const newSlPubKey1 = await getSignal(circuit, witness, 'newSlPubKey[1]');
      const newSlNonce = await getSignal(circuit, witness, 'newSlNonce');

      expect(newSlPubKey0).to.equal(cmdNewPubKey[0], 'Public key x should be updated');
      expect(newSlPubKey1).to.equal(cmdNewPubKey[1], 'Public key y should be updated');
      expect(newSlNonce).to.equal(cmdNonce, 'Nonce should be updated');
    });

    it('should preserve all state fields atomically when command is invalid', async () => {
      const isQuadraticCost = 0n;
      const numSignUps = 10n;
      const maxVoteOptions = 5n;

      // Current state leaf - use the actual keypair public key
      const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
      const slVoiceCreditBalance = 100n;
      const slNonce = 5n;

      const cmdNewPubKey: [bigint, bigint] = [999999999n, 888888888n];
      const cmdNonce = 7n; // Invalid: should be 6

      const { cmd, sigR8, sigS, pubKey } = createValidCommand(
        0,
        1,
        10n,
        Number(cmdNonce),
        cmdNewPubKey
      );

      const circuitInputs = {
        isQuadraticCost,
        numSignUps,
        maxVoteOptions,
        slPubKey,
        slVoiceCreditBalance,
        slNonce,
        currentVotesForOption: 0n,
        cmdStateIndex: 0n,
        cmdNewPubKey,
        cmdVoteOptionIndex: 1n,
        cmdNewVoteWeight: 10n,
        cmdNonce,
        cmdSigR8: sigR8,
        cmdSigS: sigS,
        packedCommand: cmd
      };

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      const isValid = await getSignal(circuit, witness, 'isValid');
      expect(isValid).to.equal(0n, 'Command should be invalid');

      // Verify all fields preserved atomically
      const newSlPubKey0 = await getSignal(circuit, witness, 'newSlPubKey[0]');
      const newSlPubKey1 = await getSignal(circuit, witness, 'newSlPubKey[1]');
      const newSlNonce = await getSignal(circuit, witness, 'newSlNonce');

      expect(newSlPubKey0).to.equal(slPubKey[0], 'Public key x should be preserved');
      expect(newSlPubKey1).to.equal(slPubKey[1], 'Public key y should be preserved');
      expect(newSlNonce).to.equal(slNonce, 'Nonce should be preserved');
    });
  });
});
