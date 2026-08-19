import { expect } from 'chai';
import { OperatorClient, VoterClient } from '@dorafactory/maci-sdk';
import { type WitnessTester } from 'circomkit';

import { circomkitInstance } from './utils/utils';

/**
 * ProcessMessages Circuit Test (AMACI): max votes per option cap
 *
 * Verifies the per-option vote weight cap (`maxVotesPerOption`) added to the
 * AMACI process circuit:
 * - packedVals carries the cap in bits 96-127
 * - cap = 0 is a sentinel meaning "no limit" (legacy behavior)
 * - a message with newVotes > cap is invalidated (state unchanged), exactly
 *   mirroring the SDK OperatorClient logic
 *
 * Circuit Location: packages/circuits/circom/amaci/power/processMessages.circom
 * SDK Location: packages/sdk/src/operator.ts (checkCommandNow + packedVals)
 */

describe('ProcessMessages AMACI MaxVotesPerOption Tests', function () {
  this.timeout(600000); // 10 minute timeout

  let processMessagesCircuit: WitnessTester<any, any>;

  // Test parameters (must match between circuit and SDK)
  const stateTreeDepth = 2;
  const voteOptionTreeDepth = 2;
  const batchSize = 5;
  const maxVoteOptions = 5;
  const initialBalance = 100;

  before(async () => {
    processMessagesCircuit = await circomkitInstance.WitnessTester('ProcessMessages_AMACI', {
      file: 'amaci/power/processMessages',
      template: 'ProcessMessages',
      params: [stateTreeDepth, voteOptionTreeDepth, batchSize]
    });
  });

  function createTestSetup({
    isQuadraticCost = false,
    maxVotesPerOption = 0n
  }: {
    isQuadraticCost?: boolean;
    maxVotesPerOption?: bigint;
  } = {}) {
    const operator = new OperatorClient({
      network: 'testnet',
      secretKey: 111111n
    });

    operator.initRound({
      stateTreeDepth,
      intStateTreeDepth: 1,
      voteOptionTreeDepth,
      batchSize,
      maxVoteOptions,
      maxVotesPerOption,
      pollId: 1,
      isQuadraticCost,
      isAmaci: true
    });

    const voters = [
      new VoterClient({ network: 'testnet', secretKey: 222222n }),
      new VoterClient({ network: 'testnet', secretKey: 333333n }),
      new VoterClient({ network: 'testnet', secretKey: 444444n })
    ];

    voters.forEach((voter, idx) => {
      const pubKey = voter.getPubkey().toPoints();
      operator.updateStateTree(idx, pubKey, initialBalance);
    });

    return { operator, voters };
  }

  function submitVotes(
    operator: OperatorClient,
    voters: VoterClient[],
    votes: Array<{ voterIdx: number; options: Array<{ idx: number; vc: number }> }>
  ) {
    const coordPubKey = operator.getPubkey().toPoints();

    votes.forEach(({ voterIdx, options }) => {
      const voter = voters[voterIdx];
      const votePayload = voter.buildVotePayload({
        stateIdx: voterIdx,
        operatorPubkey: coordPubKey,
        selectedOptions: options,
        pollId: 1
      });

      for (const payload of votePayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const encPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, encPubKey);
      }
    });
  }

  async function processAndVerify(operator: OperatorClient, newStateSalt: bigint) {
    operator.endVotePeriod();
    const { input } = await operator.processMessages({ newStateSalt });
    const witness = await processMessagesCircuit.calculateWitness(input as any);
    await processMessagesCircuit.expectConstraintPass(witness);
    return input;
  }

  describe('packedVals encoding', () => {
    it('should place the cap in bits 96-127 of packedVals', async () => {
      const cap = 10n;
      const { operator, voters } = createTestSetup({ maxVotesPerOption: cap });

      submitVotes(operator, voters, [{ voterIdx: 0, options: [{ idx: 1, vc: 5 }] }]);

      const input = await processAndVerify(operator, 1001n);

      const packedVals = BigInt(input.packedVals);
      expect(packedVals & 0xffffffffn).to.equal(BigInt(maxVoteOptions), 'bits 0-31');
      expect((packedVals >> 32n) & 0xffffffffn).to.equal(3n, 'bits 32-63 = numSignUps');
      expect((packedVals >> 64n) & 0xffffffffn).to.equal(0n, 'bits 64-95 = isQuadraticCost');
      expect((packedVals >> 96n) & 0xffffffffn).to.equal(cap, 'bits 96-127 = maxVotesPerOption');
    });
  });

  describe('sentinel 0 = no limit (legacy behavior)', () => {
    it('should accept any vote weight within balance when cap is 0', async () => {
      const { operator, voters } = createTestSetup({ maxVotesPerOption: 0n });

      // Spend the whole budget on one option — legal without a cap
      submitVotes(operator, voters, [
        { voterIdx: 0, options: [{ idx: 1, vc: initialBalance }] }
      ]);

      await processAndVerify(operator, 2001n);

      const leaf = operator.stateLeaves.get(0)!;
      expect(leaf.voTree.leaf(1)).to.equal(BigInt(initialBalance), 'vote applied');
      expect(leaf.balance).to.equal(0n, 'full budget spent');
    });
  });

  describe('1P1V with cap', () => {
    it('should accept a vote exactly at the cap', async () => {
      const cap = 10n;
      const { operator, voters } = createTestSetup({ maxVotesPerOption: cap });

      submitVotes(operator, voters, [{ voterIdx: 0, options: [{ idx: 2, vc: 10 }] }]);

      await processAndVerify(operator, 3001n);

      const leaf = operator.stateLeaves.get(0)!;
      expect(leaf.voTree.leaf(2)).to.equal(10n, 'at-cap vote applied');
      expect(leaf.balance).to.equal(BigInt(initialBalance) - 10n, 'balance deducted');
    });

    it('should invalidate a vote exceeding the cap by 1 (state unchanged)', async () => {
      const cap = 10n;
      const { operator, voters } = createTestSetup({ maxVotesPerOption: cap });

      submitVotes(operator, voters, [{ voterIdx: 0, options: [{ idx: 2, vc: 11 }] }]);

      await processAndVerify(operator, 3002n);

      const leaf = operator.stateLeaves.get(0)!;
      expect(leaf.voTree.leaf(2)).to.equal(0n, 'over-cap vote NOT applied');
      expect(leaf.balance).to.equal(BigInt(initialBalance), 'balance unchanged');
    });

    it('should handle mixed valid/invalid votes from multiple voters in one batch', async () => {
      const cap = 10n;
      const { operator, voters } = createTestSetup({ maxVotesPerOption: cap });

      submitVotes(operator, voters, [
        { voterIdx: 0, options: [{ idx: 0, vc: 10 }] }, // at cap: valid
        { voterIdx: 1, options: [{ idx: 0, vc: 30 }] }, // over cap: invalid
        { voterIdx: 2, options: [{ idx: 3, vc: 1 }] } // under cap: valid
      ]);

      await processAndVerify(operator, 3003n);

      expect(operator.stateLeaves.get(0)!.voTree.leaf(0)).to.equal(10n);
      expect(operator.stateLeaves.get(1)!.voTree.leaf(0)).to.equal(0n);
      expect(operator.stateLeaves.get(1)!.balance).to.equal(BigInt(initialBalance));
      expect(operator.stateLeaves.get(2)!.voTree.leaf(3)).to.equal(1n);
    });
  });

  describe('QV with cap', () => {
    it('should cap the vote weight (not the quadratic cost)', async () => {
      const cap = 5n;
      const { operator, voters } = createTestSetup({
        isQuadraticCost: true,
        maxVotesPerOption: cap
      });

      // 5 votes cost 25 credits in QV — at cap, valid
      submitVotes(operator, voters, [{ voterIdx: 0, options: [{ idx: 1, vc: 5 }] }]);

      await processAndVerify(operator, 4001n);

      const leaf = operator.stateLeaves.get(0)!;
      expect(leaf.voTree.leaf(1)).to.equal(5n, 'at-cap QV vote applied');
      expect(leaf.balance).to.equal(BigInt(initialBalance) - 25n, 'quadratic cost deducted');
    });

    it('should invalidate an over-cap QV vote even when balance is sufficient', async () => {
      const cap = 5n;
      const { operator, voters } = createTestSetup({
        isQuadraticCost: true,
        maxVotesPerOption: cap
      });

      // 6 votes cost 36 credits — affordable with balance 100, but over the cap
      submitVotes(operator, voters, [{ voterIdx: 0, options: [{ idx: 1, vc: 6 }] }]);

      await processAndVerify(operator, 4002n);

      const leaf = operator.stateLeaves.get(0)!;
      expect(leaf.voTree.leaf(1)).to.equal(0n, 'over-cap QV vote NOT applied');
      expect(leaf.balance).to.equal(BigInt(initialBalance), 'balance unchanged');
    });
  });

  describe('multiple options per ballot', () => {
    it('should validate each message independently against the cap', async () => {
      const cap = 10n;
      const { operator, voters } = createTestSetup({ maxVotesPerOption: cap });

      // One ballot spreading votes: options 0/1 within cap, option 2 over cap
      submitVotes(operator, voters, [
        {
          voterIdx: 0,
          options: [
            { idx: 0, vc: 10 },
            { idx: 1, vc: 7 },
            { idx: 2, vc: 12 }
          ]
        }
      ]);

      await processAndVerify(operator, 5001n);

      const leaf = operator.stateLeaves.get(0)!;
      expect(leaf.voTree.leaf(0)).to.equal(10n);
      expect(leaf.voTree.leaf(1)).to.equal(7n);
      expect(leaf.voTree.leaf(2)).to.equal(0n, 'over-cap message invalidated');
    });
  });
});
