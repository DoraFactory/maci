import { expect } from 'chai';
import { VoterClient, poseidon, packElement } from '@dorafactory/maci-sdk';
import { type WitnessTester } from 'circomkit';

import { getSignal, circomkitInstance } from './utils/utils';

/**
 * MessageValidator Circuit Tests for AMACI
 *
 * Circuit Location: packages/circuits/circom/amaci/power/messageValidator.circom
 *
 * The AMACI MessageValidator extends the MACI version with two extra checks:
 * - PollId matching (cmdPollId === expectedPollId), to prevent cross-poll replay
 * - Per-option vote weight cap (maxVotesPerOption), where 0 is a sentinel for
 *   "no limit" (legacy behavior)
 *
 * All 8 validations must pass (sum = 8) for isValid to be 1:
 * 1. Signature validation
 * 2. Sufficient voice credits
 * 3. Vote weight bound (< sqrt(field size))
 * 4. Nonce validation
 * 5. State leaf index validation
 * 6. Vote option index validation
 * 7. PollId validation
 * 8. Per-option vote weight cap validation
 */
describe('MessageValidator AMACI Circuit Tests', function test() {
  this.timeout(300000);

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
      'voteWeight',
      'maxVotesPerOption',
      'cmdPollId',
      'expectedPollId'
    ],
    ['isValid', 'newBalance']
  >;

  let voter: VoterClient;
  let keypair: any;

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('MessageValidator_AMACI', {
      file: 'amaci/power/messageValidator',
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
    newPubKey: [bigint, bigint] = [0n, 0n],
    pollId: number = 1
  ) {
    const packaged = packElement({ nonce, stateIdx, voIdx, newVotes, pollId });
    const cmd = [packaged, newPubKey[0], newPubKey[1]];
    const msgHash = poseidon(cmd);
    const signature = keypair.sign(msgHash);

    return {
      cmd,
      sigR8: signature.R8 as [bigint, bigint],
      sigS: signature.S,
      pubKey: keypair.getPublicKey().toPoints() as [bigint, bigint],
      pollId: BigInt(pollId)
    };
  }

  /**
   * Base valid inputs shared by most cases; individual tests override
   * only the fields relevant to what they are testing.
   */
  function baseInputs(overrides: {
    stateTreeIndex?: bigint;
    numSignUps?: bigint;
    voteOptionIndex?: bigint;
    maxVoteOptions?: bigint;
    originalNonce?: bigint;
    nonce?: bigint;
    voteWeight?: bigint;
    currentVoiceCreditBalance?: bigint;
    currentVotesForOption?: bigint;
    isQuadraticCost?: bigint;
    maxVotesPerOption?: bigint;
    expectedPollId?: bigint;
    cmdPollId?: number;
    wrongSig?: boolean;
  } = {}) {
    const stateTreeIndex = overrides.stateTreeIndex ?? 0n;
    const numSignUps = overrides.numSignUps ?? 10n;
    const voteOptionIndex = overrides.voteOptionIndex ?? 0n;
    const maxVoteOptions = overrides.maxVoteOptions ?? 5n;
    const originalNonce = overrides.originalNonce ?? 0n;
    const nonce = overrides.nonce ?? 1n;
    const voteWeight = overrides.voteWeight ?? 5n;
    const currentVoiceCreditBalance = overrides.currentVoiceCreditBalance ?? 100n;
    const currentVotesForOption = overrides.currentVotesForOption ?? 0n;
    const isQuadraticCost = overrides.isQuadraticCost ?? 0n;
    const maxVotesPerOption = overrides.maxVotesPerOption ?? 0n;
    const expectedPollId = overrides.expectedPollId ?? 1n;

    const { cmd, sigR8, sigS, pubKey, pollId } = createValidCommand(
      Number(stateTreeIndex),
      Number(voteOptionIndex),
      voteWeight,
      Number(nonce),
      [0n, 0n],
      overrides.cmdPollId ?? 1
    );

    let finalSigR8 = sigR8;
    let finalSigS = sigS;
    if (overrides.wrongSig) {
      const wrongKeypair = new VoterClient({ network: 'testnet', secretKey: 999999n }).getSigner();
      const wrongSignature = wrongKeypair.sign(poseidon(cmd));
      finalSigR8 = wrongSignature.R8 as [bigint, bigint];
      finalSigS = wrongSignature.S;
    }

    return {
      stateTreeIndex,
      numSignUps,
      voteOptionIndex,
      maxVoteOptions,
      originalNonce,
      nonce,
      cmd,
      pubKey,
      sigR8: finalSigR8,
      sigS: finalSigS,
      isQuadraticCost,
      currentVoiceCreditBalance,
      currentVotesForOption,
      voteWeight,
      maxVotesPerOption,
      cmdPollId: pollId,
      expectedPollId
    };
  }

  describe('Baseline Validation (maxVotesPerOption = 0, unlimited)', () => {
    it('should validate a completely valid message with linear cost', async () => {
      const circuitInputs = baseInputs({ voteWeight: 5n, currentVotesForOption: 3n });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(1n);
      expect(await getSignal(circuit, witness, 'newBalance')).to.equal(98n);
    });

    it('should validate a completely valid message with quadratic cost', async () => {
      const circuitInputs = baseInputs({
        voteWeight: 3n,
        currentVotesForOption: 2n,
        isQuadraticCost: 1n
      });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(1n);
      expect(await getSignal(circuit, witness, 'newBalance')).to.equal(95n);
    });

    it('should reject message with invalid stateTreeIndex (too large)', async () => {
      const circuitInputs = baseInputs({ stateTreeIndex: 11n, numSignUps: 10n });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(0n);
    });

    it('should reject message with invalid voteOptionIndex (too large)', async () => {
      const circuitInputs = baseInputs({ voteOptionIndex: 5n, maxVoteOptions: 5n });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(0n);
    });

    it('should reject message with incorrect nonce', async () => {
      const circuitInputs = baseInputs({ originalNonce: 0n, nonce: 3n });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(0n);
    });

    it('should reject message with invalid signature', async () => {
      const circuitInputs = baseInputs({ wrongSig: true });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(0n);
    });

    it('should reject message with insufficient balance', async () => {
      const circuitInputs = baseInputs({ voteWeight: 50n, currentVoiceCreditBalance: 10n });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(0n);
    });
  });

  describe('PollId Validation (AMACI-specific)', () => {
    it('should reject message when cmdPollId does not match expectedPollId', async () => {
      const circuitInputs = baseInputs({ cmdPollId: 2, expectedPollId: 1n });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(
        0n,
        'Message should be invalid (pollId mismatch)'
      );
    });

    it('should accept message when cmdPollId matches expectedPollId', async () => {
      const circuitInputs = baseInputs({ cmdPollId: 7, expectedPollId: 7n });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(1n);
    });
  });

  describe('Per-Option Vote Cap Validation (maxVotesPerOption)', () => {
    it('should accept any vote weight within balance when cap is 0 (sentinel: unlimited)', async () => {
      const circuitInputs = baseInputs({ voteWeight: 90n, maxVotesPerOption: 0n });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(1n);
    });

    it('should accept a vote exactly at the cap', async () => {
      const circuitInputs = baseInputs({ voteWeight: 10n, maxVotesPerOption: 10n });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(1n);
    });

    it('should reject a vote exceeding the cap by 1', async () => {
      const circuitInputs = baseInputs({ voteWeight: 11n, maxVotesPerOption: 10n });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(0n);
    });

    it('should reject an over-cap vote under quadratic cost even when balance is sufficient', async () => {
      // 6 votes cost 36 credits, affordable with balance 100, but over a cap of 5
      const circuitInputs = baseInputs({
        voteWeight: 6n,
        maxVotesPerOption: 5n,
        isQuadraticCost: 1n,
        currentVoiceCreditBalance: 100n
      });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(0n);
    });

    it('should accept a vote at the cap under quadratic cost', async () => {
      const circuitInputs = baseInputs({
        voteWeight: 5n,
        maxVotesPerOption: 5n,
        isQuadraticCost: 1n,
        currentVoiceCreditBalance: 100n
      });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(1n);
      expect(await getSignal(circuit, witness, 'newBalance')).to.equal(75n);
    });

    it('should accept a vote of 0 regardless of a nonzero cap', async () => {
      const circuitInputs = baseInputs({ voteWeight: 0n, maxVotesPerOption: 1n });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(1n);
    });

    it('should accept a vote at the maximum 32-bit cap value', async () => {
      const circuitInputs = baseInputs({
        voteWeight: 1000n,
        maxVotesPerOption: 0xffffffffn,
        currentVoiceCreditBalance: 10000n
      });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(1n);
    });

    it('should reject when both the cap and another validation (nonce) fail simultaneously', async () => {
      const circuitInputs = baseInputs({
        voteWeight: 11n,
        maxVotesPerOption: 10n,
        originalNonce: 0n,
        nonce: 3n // wrong nonce, in addition to the over-cap vote
      });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(
        0n,
        'Message should be invalid regardless of how many checks fail'
      );
    });
  });
});
