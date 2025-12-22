import { expect } from 'chai';
import { OperatorClient, VoterClient } from '@dorafactory/maci-sdk';
import { type WitnessTester } from 'circomkit';
import { poseidon } from '@dorafactory/maci-sdk';

import { circomkitInstance } from './utils/utils';

/**
 * TallyVotes Circuit Test Suite
 *
 * This test suite comprehensively tests the TallyVotes circuit which is responsible
 * for tallying votes in the MACI voting system.
 *
 * Test Coverage:
 * 1. Basic tally functionality
 * 2. Multiple batch processing
 * 3. First batch vs subsequent batches
 * 4. Empty votes handling
 * 5. State tree verification
 * 6. Commitment verification
 * 7. Integration with SDK
 * 8. Edge cases and error handling
 */
describe('TallyVotes Circuit Tests', function () {
  this.timeout(300000); // 5 minutes timeout for circuit compilation and proof generation

  describe('MACI TallyVotes Circuit', function () {
    let tallyVotesCircuit: WitnessTester<any, any>;
    let operator: OperatorClient;
    let voter1: VoterClient;
    let voter2: VoterClient;

    const stateTreeDepth = 2;
    const intStateTreeDepth = 1;
    const voteOptionTreeDepth = 1;
    const maxVoteOptions = 5;
    const batchSize = 5;

    before(async function () {
      console.log('Initializing TallyVotes circuit for MACI...');

      tallyVotesCircuit = await circomkitInstance.WitnessTester('TallyVotes_maci_2-1-1', {
        file: 'maci/power/tallyVotes',
        template: 'TallyVotes',
        params: [stateTreeDepth, intStateTreeDepth, voteOptionTreeDepth]
      });

      console.log('TallyVotes circuit initialized successfully');
    });

    beforeEach(function () {
      // Initialize fresh operator and voters for each test
      operator = new OperatorClient({
        network: 'testnet',
        secretKey: 111111n
      });

      voter1 = new VoterClient({
        network: 'testnet',
        secretKey: 222222n
      });

      voter2 = new VoterClient({
        network: 'testnet',
        secretKey: 333333n
      });
    });

    it('should verify basic tally computation with single batch', async function () {
      console.log('\n=== Test: Basic Single Batch Tally ===\n');

      // Initialize MACI
      operator.initRound({
        stateTreeDepth,
        intStateTreeDepth,
        voteOptionTreeDepth,
        batchSize,
        maxVoteOptions,

        isQuadraticCost: true,
        isAmaci: false
      });

      // Register users
      const user1PubKey = voter1.getPubkey().toPoints();
      const user2PubKey = voter2.getPubkey().toPoints();

      operator.updateStateTree(0, user1PubKey, 100);
      operator.updateStateTree(1, user2PubKey, 100);

      // Submit votes
      const coordPubKey = operator.getPubkey().toPoints();

      // User 1: vote for option 1 with weight 5
      const vote1Payload = voter1.buildVotePayload({
        stateIdx: 0,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 1, vc: 5 }]
      });

      for (const payload of vote1Payload) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, messageEncPubKey);
      }

      // User 2: vote for option 2 with weight 7
      const vote2Payload = voter2.buildVotePayload({
        stateIdx: 1,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 2, vc: 7 }]
      });

      for (const payload of vote2Payload) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, messageEncPubKey);
      }

      // Process messages
      operator.endVotePeriod();
      while (operator.states === 1) {
        await operator.processMessages();
      }

      // Process tally
      const { input: tallyInput } = await operator.processTally();

      console.log('Tally Input:');
      console.log('- State Root:', tallyInput.stateRoot.toString());
      console.log('- Current Tally Commitment:', tallyInput.currentTallyCommitment.toString());
      console.log('- New Tally Commitment:', tallyInput.newTallyCommitment.toString());

      // Verify with circuit
      const witness = await tallyVotesCircuit.calculateWitness(tallyInput as any);
      await tallyVotesCircuit.expectConstraintPass(witness);

      // Verify results
      const results = operator.getTallyResults();
      console.log('\nTally Results:');
      results.forEach((result, idx) => {
        console.log(`  Option ${idx}: ${result.toString()}`);
      });

      expect(operator.states).to.equal(3); // ENDED state
      expect(results.length).to.equal(maxVoteOptions);
    });

    it('should handle multiple batches correctly', async function () {
      console.log('\n=== Test: Multiple Batch Tally ===\n');

      // Use larger state tree to force multiple batches
      const largerStateTreeDepth = 3;
      const largerIntStateTreeDepth = 1;

      operator.initRound({
        stateTreeDepth: largerStateTreeDepth,
        intStateTreeDepth: largerIntStateTreeDepth,
        voteOptionTreeDepth,
        batchSize,
        maxVoteOptions,
        // More than one batch
        isQuadraticCost: true,
        isAmaci: false
      });

      // Register multiple users
      for (let i = 0; i < 10; i++) {
        const tempVoter = new VoterClient({
          network: 'testnet',
          secretKey: BigInt(1000 + i)
        });
        const pubKey = tempVoter.getPubkey().toPoints();
        operator.updateStateTree(i, pubKey, 100);
      }

      // Submit votes from some users
      const coordPubKey = operator.getPubkey().toPoints();

      for (let i = 0; i < 5; i++) {
        const tempVoter = new VoterClient({
          network: 'testnet',
          secretKey: BigInt(1000 + i)
        });

        const votePayload = tempVoter.buildVotePayload({
          stateIdx: i,
          operatorPubkey: coordPubKey,
          selectedOptions: [{ idx: i % maxVoteOptions, vc: 3 }]
        });

        for (const payload of votePayload) {
          const message = payload.msg.map((m) => BigInt(m));
          const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
          operator.pushMessage(message, messageEncPubKey);
        }
      }

      // Process messages
      operator.endVotePeriod();
      while (operator.states === 1) {
        await operator.processMessages();
      }

      // Process tally batches and verify each with circuit
      let batchCount = 0;
      const largerTallyCircuit = await circomkitInstance.WitnessTester('TallyVotes_maci_3-1-1', {
        file: 'maci/power/tallyVotes',
        template: 'TallyVotes',
        params: [largerStateTreeDepth, largerIntStateTreeDepth, voteOptionTreeDepth]
      });

      while (operator.states === 2) {
        console.log(`\nProcessing tally batch ${batchCount}...`);
        const { input: tallyInput } = await operator.processTally();

        console.log('- Current Tally Commitment:', tallyInput.currentTallyCommitment.toString());
        console.log('- New Tally Commitment:', tallyInput.newTallyCommitment.toString());

        // Verify with circuit
        const witness = await largerTallyCircuit.calculateWitness(tallyInput as any);
        await largerTallyCircuit.expectConstraintPass(witness);

        batchCount++;

        if (batchCount > 5) {
          throw new Error('Too many batches - potential infinite loop');
        }
      }

      console.log(`\nCompleted ${batchCount} tally batches`);
      expect(batchCount).to.be.greaterThan(1); // Should have multiple batches
      expect(operator.states).to.equal(3); // ENDED state
    });

    it('should handle first batch with zero currentTallyCommitment', async function () {
      console.log('\n=== Test: First Batch Zero Commitment ===\n');

      operator.initRound({
        stateTreeDepth,
        intStateTreeDepth,
        voteOptionTreeDepth,
        batchSize,
        maxVoteOptions,

        isQuadraticCost: false,
        isAmaci: false
      });

      // Register users
      const user1PubKey = voter1.getPubkey().toPoints();
      operator.updateStateTree(0, user1PubKey, 100);

      // Submit one vote
      const coordPubKey = operator.getPubkey().toPoints();
      const votePayload = voter1.buildVotePayload({
        stateIdx: 0,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 0, vc: 10 }]
      });

      for (const payload of votePayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, messageEncPubKey);
      }

      // Process messages
      operator.endVotePeriod();
      while (operator.states === 1) {
        await operator.processMessages();
      }

      // Process first tally batch
      const { input: tallyInput } = await operator.processTally();

      console.log('First Batch Tally Input:');
      console.log(
        '- Current Tally Commitment (should be 0):',
        tallyInput.currentTallyCommitment.toString()
      );
      console.log('- New Tally Commitment:', tallyInput.newTallyCommitment.toString());

      // Verify currentTallyCommitment is 0 for first batch
      expect(tallyInput.currentTallyCommitment).to.equal(0n);

      // Verify with circuit
      const witness = await tallyVotesCircuit.calculateWitness(tallyInput as any);
      await tallyVotesCircuit.expectConstraintPass(witness);
    });

    it('should handle empty votes correctly', async function () {
      console.log('\n=== Test: Empty Votes ===\n');

      operator.initRound({
        stateTreeDepth,
        intStateTreeDepth,
        voteOptionTreeDepth,
        batchSize,
        maxVoteOptions,

        isQuadraticCost: true,
        isAmaci: false
      });

      // Register users but don't submit any votes
      const user1PubKey = voter1.getPubkey().toPoints();
      const user2PubKey = voter2.getPubkey().toPoints();

      operator.updateStateTree(0, user1PubKey, 100);
      operator.updateStateTree(1, user2PubKey, 100);

      // End vote period without any votes
      operator.endVotePeriod();

      // For empty votes, we need to manually initialize tallying state
      // since processMessages requires at least one message
      operator.states = 2; // TALLYING state
      // Initialize tally results manually (normally done by processMessages)
      const { Tree } = await import('@dorafactory/maci-sdk');
      (operator as any).tallyResults = new Tree(5, voteOptionTreeDepth, 0n);
      (operator as any).tallySalt = 0n;
      (operator as any).tallyCommitment = 0n;

      // Process tally
      const { input: tallyInput } = await operator.processTally();

      console.log('Empty Vote Tally Input:');
      console.log('- State Root:', tallyInput.stateRoot.toString());
      console.log('- New Tally Commitment:', tallyInput.newTallyCommitment.toString());

      // Verify with circuit
      const witness = await tallyVotesCircuit.calculateWitness(tallyInput as any);
      await tallyVotesCircuit.expectConstraintPass(witness);

      // Verify all results are 0
      const results = operator.getTallyResults();
      console.log('\nResults (should all be 0):');
      results.forEach((result, idx) => {
        console.log(`  Option ${idx}: ${result.toString()}`);
        expect(result).to.equal(0n);
      });
    });

    it('should verify state tree root and commitment correctly', async function () {
      console.log('\n=== Test: State Tree Verification ===\n');

      operator.initRound({
        stateTreeDepth,
        intStateTreeDepth,
        voteOptionTreeDepth,
        batchSize,
        maxVoteOptions,

        isQuadraticCost: true,
        isAmaci: false
      });

      // Register users
      const user1PubKey = voter1.getPubkey().toPoints();
      operator.updateStateTree(0, user1PubKey, 100);

      const coordPubKey = operator.getPubkey().toPoints();
      const votePayload = voter1.buildVotePayload({
        stateIdx: 0,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 1, vc: 8 }]
      });

      for (const payload of votePayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, messageEncPubKey);
      }

      operator.endVotePeriod();
      while (operator.states === 1) {
        await operator.processMessages();
      }

      const { input: tallyInput } = await operator.processTally();

      // Verify stateCommitment = hash(stateRoot, stateSalt)
      const expectedStateCommitment = poseidon([tallyInput.stateRoot, tallyInput.stateSalt]);

      console.log('State Verification:');
      console.log('- State Root:', tallyInput.stateRoot.toString());
      console.log('- State Salt:', tallyInput.stateSalt.toString());
      console.log('- Expected Commitment:', expectedStateCommitment.toString());
      console.log('- Actual Commitment:', tallyInput.stateCommitment.toString());

      expect(tallyInput.stateCommitment).to.equal(expectedStateCommitment);

      // Verify with circuit
      const witness = await tallyVotesCircuit.calculateWitness(tallyInput as any);
      await tallyVotesCircuit.expectConstraintPass(witness);
    });

    it('should accumulate votes across batches correctly', async function () {
      console.log('\n=== Test: Vote Accumulation Across Batches ===\n');

      const largerStateTreeDepth = 3;
      const largerIntStateTreeDepth = 1;

      operator.initRound({
        stateTreeDepth: largerStateTreeDepth,
        intStateTreeDepth: largerIntStateTreeDepth,
        voteOptionTreeDepth,
        batchSize,
        maxVoteOptions,

        isQuadraticCost: true,
        isAmaci: false
      });

      // Register 8 users
      const voters: VoterClient[] = [];
      for (let i = 0; i < 8; i++) {
        const tempVoter = new VoterClient({
          network: 'testnet',
          secretKey: BigInt(5000 + i)
        });
        voters.push(tempVoter);
        const pubKey = tempVoter.getPubkey().toPoints();
        operator.updateStateTree(i, pubKey, 100);
      }

      const coordPubKey = operator.getPubkey().toPoints();

      // All users vote for option 1 with weight 2
      for (let i = 0; i < 8; i++) {
        const votePayload = voters[i].buildVotePayload({
          stateIdx: i,
          operatorPubkey: coordPubKey,
          selectedOptions: [{ idx: 1, vc: 2 }]
        });

        for (const payload of votePayload) {
          const message = payload.msg.map((m) => BigInt(m));
          const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
          operator.pushMessage(message, messageEncPubKey);
        }
      }

      // Process messages
      operator.endVotePeriod();
      while (operator.states === 1) {
        await operator.processMessages();
      }

      // Process all tally batches
      const largerTallyCircuit = await circomkitInstance.WitnessTester('TallyVotes_maci_3-1-1', {
        file: 'maci/power/tallyVotes',
        template: 'TallyVotes',
        params: [largerStateTreeDepth, largerIntStateTreeDepth, voteOptionTreeDepth]
      });

      let batchCount = 0;
      while (operator.states === 2) {
        const { input: tallyInput } = await operator.processTally();

        console.log(`\nBatch ${batchCount}:`);
        console.log('- New Tally Commitment:', tallyInput.newTallyCommitment.toString());

        const witness = await largerTallyCircuit.calculateWitness(tallyInput as any);
        await largerTallyCircuit.expectConstraintPass(witness);

        batchCount++;
      }

      const results = operator.getTallyResults();
      console.log('\nFinal Accumulated Results:');
      results.forEach((result, idx) => {
        console.log(`  Option ${idx}: ${result.toString()}`);
      });

      // All 8 users voted for option 1 with weight 2
      // Formula: v * (v + MAX_VOTES) where v = 2, MAX_VOTES = 10^24
      const MAX_VOTES = 10n ** 24n;
      const expectedOption1 = 8n * (2n * (2n + MAX_VOTES));

      console.log('\nExpected option 1 result:', expectedOption1.toString());
      console.log('Actual option 1 result:', results[1].toString());

      expect(results[1]).to.equal(expectedOption1);
    });

    it('should handle quadratic voting formula correctly', async function () {
      console.log('\n=== Test: Quadratic Voting Formula ===\n');

      operator.initRound({
        stateTreeDepth,
        intStateTreeDepth,
        voteOptionTreeDepth,
        batchSize,
        maxVoteOptions,

        isQuadraticCost: true,
        isAmaci: false
      });

      const user1PubKey = voter1.getPubkey().toPoints();
      operator.updateStateTree(0, user1PubKey, 100);

      const coordPubKey = operator.getPubkey().toPoints();

      // User votes with weight 10
      const voteWeight = 10;
      const votePayload = voter1.buildVotePayload({
        stateIdx: 0,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 2, vc: voteWeight }]
      });

      for (const payload of votePayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, messageEncPubKey);
      }

      operator.endVotePeriod();
      while (operator.states === 1) {
        await operator.processMessages();
      }

      const { input: tallyInput } = await operator.processTally();

      const witness = await tallyVotesCircuit.calculateWitness(tallyInput as any);
      await tallyVotesCircuit.expectConstraintPass(witness);

      const results = operator.getTallyResults();

      // Verify formula: v * (v + MAX_VOTES)
      const MAX_VOTES = 10n ** 24n;
      const v = BigInt(voteWeight);
      const expectedResult = v * (v + MAX_VOTES);

      console.log('Quadratic Voting Formula Verification:');
      console.log(`- Vote weight: ${voteWeight}`);
      console.log(`- Formula: v * (v + MAX_VOTES)`);
      console.log(`- Expected: ${expectedResult.toString()}`);
      console.log(`- Actual: ${results[2].toString()}`);

      expect(results[2]).to.equal(expectedResult);
    });
  });

  describe('AMACI TallyVotes Circuit', function () {
    let tallyVotesCircuit: WitnessTester<any, any>;
    let operator: OperatorClient;
    let voter1: VoterClient;

    const stateTreeDepth = 2;
    const intStateTreeDepth = 1;
    const voteOptionTreeDepth = 1;
    const maxVoteOptions = 5;
    const batchSize = 5;

    before(async function () {
      console.log('Initializing TallyVotes circuit for AMACI...');

      tallyVotesCircuit = await circomkitInstance.WitnessTester('TallyVotes_amaci_2-1-1', {
        file: 'amaci/power/tallyVotes',
        template: 'TallyVotes',
        params: [stateTreeDepth, intStateTreeDepth, voteOptionTreeDepth]
      });

      console.log('TallyVotes circuit for AMACI initialized successfully');
    });

    beforeEach(function () {
      operator = new OperatorClient({
        network: 'testnet',
        secretKey: 111111n
      });

      voter1 = new VoterClient({
        network: 'testnet',
        secretKey: 222222n
      });
    });

    it('should verify AMACI tally with anonymous keys', async function () {
      console.log('\n=== Test: AMACI Tally with Anonymous Keys ===\n');

      operator.initRound({
        stateTreeDepth,
        intStateTreeDepth,
        voteOptionTreeDepth,
        batchSize,
        maxVoteOptions,

        isQuadraticCost: true,
        isAmaci: true // AMACI mode
      });

      // Register user with anonymous keys (c = [d1[0], d1[1], d2[0], d2[1]])
      const user1PubKey = voter1.getPubkey().toPoints();
      const c: [bigint, bigint, bigint, bigint] = [123n, 456n, 789n, 101112n];

      operator.updateStateTree(0, user1PubKey, 100, c);

      const coordPubKey = operator.getPubkey().toPoints();
      const votePayload = voter1.buildVotePayload({
        stateIdx: 0,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 1, vc: 5 }]
      });

      for (const payload of votePayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, messageEncPubKey);
      }

      operator.endVotePeriod();
      while (operator.states === 1) {
        await operator.processMessages();
      }

      const { input: tallyInput } = await operator.processTally();

      console.log('AMACI Tally Input:');
      console.log('- State Root:', tallyInput.stateRoot.toString());
      console.log('- New Tally Commitment:', tallyInput.newTallyCommitment.toString());

      // Verify with AMACI circuit
      const witness = await tallyVotesCircuit.calculateWitness(tallyInput as any);
      await tallyVotesCircuit.expectConstraintPass(witness);

      const results = operator.getTallyResults();
      console.log('\nAMACI Results:');
      results.forEach((result, idx) => {
        console.log(`  Option ${idx}: ${result.toString()}`);
      });

      expect(operator.states).to.equal(3);
    });
  });

  describe('Edge Cases and Error Handling', function () {
    let operator: OperatorClient;

    beforeEach(function () {
      operator = new OperatorClient({
        network: 'testnet',
        secretKey: 999999n
      });
    });

    it('should throw error when tallying before processing period ends', async function () {
      console.log('\n=== Test: Invalid Tally Timing ===\n');

      operator.initRound({
        stateTreeDepth: 2,
        intStateTreeDepth: 1,
        voteOptionTreeDepth: 1,
        batchSize: 5,
        maxVoteOptions: 5,

        isQuadraticCost: true,
        isAmaci: false
      });

      // Try to tally before ending vote period
      try {
        await operator.processTally();
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        console.log('Expected error:', error.message);
        expect(error.message).to.include('Period error');
      }
    });

    it('should verify packed values encoding', async function () {
      console.log('\n=== Test: Packed Values Encoding ===\n');

      operator.initRound({
        stateTreeDepth: 2,
        intStateTreeDepth: 1,
        voteOptionTreeDepth: 1,
        batchSize: 5,
        maxVoteOptions: 5,

        isQuadraticCost: true,
        isAmaci: false
      });

      const voter = new VoterClient({
        network: 'testnet',
        secretKey: 777777n
      });

      const pubKey = voter.getPubkey().toPoints();
      operator.updateStateTree(0, pubKey, 100);

      const coordPubKey = operator.getPubkey().toPoints();
      const votePayload = voter.buildVotePayload({
        stateIdx: 0,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 0, vc: 3 }]
      });

      for (const payload of votePayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, messageEncPubKey);
      }

      operator.endVotePeriod();
      while (operator.states === 1) {
        await operator.processMessages();
      }

      const { input: tallyInput } = await operator.processTally();

      // Verify packedVals = batchNum + (numSignUps << 32)
      const batchNum = 0n; // First batch
      const numSignUps = 1n; // Only 1 user registered (auto-tracked)
      const expectedPackedVals = batchNum + (numSignUps << 32n);

      console.log('Packed Values Verification:');
      console.log('- Batch Number:', batchNum.toString());
      console.log('- Num SignUps:', numSignUps.toString());
      console.log('- Expected Packed:', expectedPackedVals.toString());
      console.log('- Actual Packed:', tallyInput.packedVals.toString());

      expect(tallyInput.packedVals).to.equal(expectedPackedVals);
    });

    it('should handle maximum vote options correctly', async function () {
      console.log('\n=== Test: Maximum Vote Options ===\n');

      const maxVoteOptions = 5; // 5^1 = 5 options

      operator.initRound({
        stateTreeDepth: 2,
        intStateTreeDepth: 1,
        voteOptionTreeDepth: 1,
        batchSize: 5,
        maxVoteOptions,

        isQuadraticCost: true,
        isAmaci: false
      });

      const voter = new VoterClient({
        network: 'testnet',
        secretKey: 888888n
      });

      const pubKey = voter.getPubkey().toPoints();
      operator.updateStateTree(0, pubKey, 100);

      const coordPubKey = operator.getPubkey().toPoints();

      // Vote for all available options
      const votePayload = voter.buildVotePayload({
        stateIdx: 0,
        operatorPubkey: coordPubKey,
        selectedOptions: [
          { idx: 0, vc: 1 },
          { idx: 1, vc: 2 },
          { idx: 2, vc: 3 },
          { idx: 3, vc: 4 },
          { idx: 4, vc: 5 }
        ]
      });

      for (const payload of votePayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, messageEncPubKey);
      }

      operator.endVotePeriod();
      while (operator.states === 1) {
        await operator.processMessages();
      }

      const tallyCircuit = await circomkitInstance.WitnessTester('TallyVotes_test', {
        file: 'maci/power/tallyVotes',
        template: 'TallyVotes',
        params: [2, 1, 1]
      });

      const { input: tallyInput } = await operator.processTally();

      const witness = await tallyCircuit.calculateWitness(tallyInput as any);
      await tallyCircuit.expectConstraintPass(witness);

      const results = operator.getTallyResults();
      console.log('\nAll Options Voted:');
      results.forEach((result, idx) => {
        console.log(`  Option ${idx}: ${result.toString()}`);
        expect(result > 0n).to.be.true;
      });
    });
  });

  describe('Integration with Full Voting Flow', function () {
    it('should complete full MACI flow with tally verification', async function () {
      console.log('\n=== Test: Full MACI Flow Integration ===\n');

      const operator = new OperatorClient({
        network: 'testnet',
        secretKey: 111111n
      });

      const voters: VoterClient[] = [];
      for (let i = 0; i < 3; i++) {
        voters.push(
          new VoterClient({
            network: 'testnet',
            secretKey: BigInt(200000 + i)
          })
        );
      }

      const stateTreeDepth = 2;
      const intStateTreeDepth = 1;
      const voteOptionTreeDepth = 1;

      operator.initRound({
        stateTreeDepth,
        intStateTreeDepth,
        voteOptionTreeDepth,
        batchSize: 5,
        maxVoteOptions: 5,

        isQuadraticCost: true,
        isAmaci: false
      });

      // Register all voters
      for (let i = 0; i < 3; i++) {
        const pubKey = voters[i].getPubkey().toPoints();
        operator.updateStateTree(i, pubKey, 100);
      }

      const coordPubKey = operator.getPubkey().toPoints();

      // Each voter votes for different options
      const voteOptions = [[{ idx: 0, vc: 5 }], [{ idx: 1, vc: 7 }], [{ idx: 2, vc: 9 }]];

      for (let i = 0; i < 3; i++) {
        const votePayload = voters[i].buildVotePayload({
          stateIdx: i,
          operatorPubkey: coordPubKey,
          selectedOptions: voteOptions[i]
        });

        for (const payload of votePayload) {
          const message = payload.msg.map((m) => BigInt(m));
          const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
          operator.pushMessage(message, messageEncPubKey);
        }
      }

      console.log('Total messages:', operator.messages.length);

      // Process messages
      operator.endVotePeriod();
      let msgBatchCount = 0;
      while (operator.states === 1) {
        await operator.processMessages();
        msgBatchCount++;
      }

      console.log(`Processed ${msgBatchCount} message batches`);

      // Process tally
      const tallyCircuit = await circomkitInstance.WitnessTester('TallyVotes_integration', {
        file: 'maci/power/tallyVotes',
        template: 'TallyVotes',
        params: [stateTreeDepth, intStateTreeDepth, voteOptionTreeDepth]
      });

      let tallyBatchCount = 0;
      while (operator.states === 2) {
        const { input: tallyInput } = await operator.processTally();

        console.log(`\nTally Batch ${tallyBatchCount}:`);
        console.log('- New Tally Commitment:', tallyInput.newTallyCommitment.toString());

        // Verify each batch with circuit
        const witness = await tallyCircuit.calculateWitness(tallyInput as any);
        await tallyCircuit.expectConstraintPass(witness);

        tallyBatchCount++;
      }

      console.log(`Processed ${tallyBatchCount} tally batches`);

      // Verify final results
      const results = operator.getTallyResults();
      console.log('\nFinal Results:');
      results.forEach((result, idx) => {
        console.log(`  Option ${idx}: ${result.toString()}`);
      });

      expect(operator.states).to.equal(3); // ENDED
      expect(results.length).to.equal(5);

      // Verify expected votes
      const MAX_VOTES = 10n ** 24n;
      expect(results[0]).to.equal(5n * (5n + MAX_VOTES));
      expect(results[1]).to.equal(7n * (7n + MAX_VOTES));
      expect(results[2]).to.equal(9n * (9n + MAX_VOTES));

      console.log('\n=== Full Flow Test Completed Successfully ===\n');
    });
  });
});
