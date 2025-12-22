import { expect } from 'chai';
import { OperatorClient, VoterClient } from '@dorafactory/maci-sdk';
import { type WitnessTester } from 'circomkit';

import { circomkitInstance } from './utils/utils';

/**
 * MACI (Standard MACI) Integration Test
 *
 * This test demonstrates the complete flow of a standard voting system:
 * 1. Coordinator initializes MACI
 * 2. Users sign up and get registered in the state tree
 * 3. Users submit encrypted votes
 * 4. Coordinator processes votes and tallies results
 *
 * Note: Unlike AMACI, standard MACI does not support:
 * - Anonymous key changes (no deactivate/add key)
 * - Anonymous state leaves (no d1/d2 fields)
 */

describe('MACI Integration Test', function () {
  this.timeout(300000); // 300 second timeout for the entire test suite (circuits take time)

  let operator: OperatorClient;
  let voter1: VoterClient;
  let voter2: VoterClient;

  // Circuit instances
  let processMessagesCircuit: WitnessTester<any, any>;
  let tallyVotesCircuit: WitnessTester<any, any>;

  const USER_1 = 0; // state leaf idx
  const USER_2 = 1; // state leaf idx

  const maxVoteOptions = 5;
  const stateTreeDepth = 2;
  const intStateTreeDepth = 1;
  const voteOptionTreeDepth = 1;
  const batchSize = 5;

  before(async () => {
    // Initialize circuits
    console.log('Initializing MACI circuits...');

    processMessagesCircuit = await circomkitInstance.WitnessTester('ProcessMessages_MACI', {
      file: 'maci/power/processMessages',
      template: 'ProcessMessages',
      params: [stateTreeDepth, voteOptionTreeDepth, batchSize]
    });

    tallyVotesCircuit = await circomkitInstance.WitnessTester('TallyVotes_MACI', {
      file: 'maci/power/tallyVotes',
      template: 'TallyVotes',
      params: [stateTreeDepth, intStateTreeDepth, voteOptionTreeDepth]
    });

    console.log('MACI circuits initialized successfully');

    // Initialize operator/coordinator
    operator = new OperatorClient({
      network: 'testnet',
      secretKey: 111111n // coordinator private key
    });

    // Initialize voter 1
    voter1 = new VoterClient({
      network: 'testnet',
      secretKey: 222222n // user 1 private key
    });

    // Initialize voter 2
    voter2 = new VoterClient({
      network: 'testnet',
      secretKey: 555555n // user 2 private key
    });
  });

  it('should complete the full MACI flow', async () => {
    console.log('\n=== Step 1: Initialize MACI ===\n');

    // Initialize MACI with coordinator using the same parameters as circuits
    operator.initRound({
      stateTreeDepth,
      intStateTreeDepth,
      voteOptionTreeDepth,
      batchSize,
      maxVoteOptions,

      isQuadraticCost: true, // QV mode
      isAmaci: false // Standard MACI (no anonymous keys)
    });

    expect(operator.stateTree).to.not.be.undefined;

    console.log('\n=== Step 2: User Sign Up ===\n');

    // Register user 1 and user 2
    const user1PubKey = voter1.getPubkey().toPoints();
    const user2PubKey = voter2.getPubkey().toPoints();

    // In standard MACI, we don't pass d1/d2 (anonymous keys)
    operator.updateStateTree(USER_1, user1PubKey, 100);
    operator.updateStateTree(USER_2, user2PubKey, 100);

    expect(operator.stateLeaves.size).to.equal(2);

    console.log('\n=== Step 3: Submit Votes ===\n');

    const coordPubKey = operator.getPubkey().toPoints();

    // User 1 votes: option 1, weight 8
    const vote1Payload = voter1.buildVotePayload({
      stateIdx: USER_1,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: 1, vc: 8 }]
    });

    // Publish all messages in vote1Payload
    for (const payload of vote1Payload) {
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
      operator.pushMessage(message, messageEncPubKey);
    }

    // User 2 votes: option 2, weight 12
    const vote2Payload = voter2.buildVotePayload({
      stateIdx: USER_2,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: 2, vc: 12 }]
    });

    // Publish all messages in vote2Payload
    for (const payload of vote2Payload) {
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
      operator.pushMessage(message, messageEncPubKey);
    }

    const expectedMessages = vote1Payload.length + vote2Payload.length;
    expect(operator.messages.length).to.equal(expectedMessages);
    console.log('Total votes submitted:', operator.messages.length);

    console.log('\n=== Step 4: End Vote Period ===\n');

    operator.endVotePeriod();
    expect(operator.states).to.equal(1); // PROCESSING state

    console.log('\n=== Step 5: Process Messages ===\n');

    // Process messages in batches and verify with circuit
    let i = 0;
    while (operator.states === 1) {
      const { input: msgInput } = await operator.processMessages();

      console.log(`Processed batch ${i}:`);
      console.log('- New state commitment:', msgInput.newStateCommitment.toString());

      // Verify with circuit
      console.log(`Verifying message batch ${i} with circuit...`);
      const msgWitness = await processMessagesCircuit.calculateWitness(msgInput as any);
      await processMessagesCircuit.expectConstraintPass(msgWitness);
      console.log(`Circuit verification passed for batch ${i}`);

      i++;

      // Safety check to prevent infinite loop
      if (i > 10) {
        throw new Error('Too many processing iterations');
      }
    }

    expect(operator.states).to.equal(2); // TALLYING state
    console.log('Message processing completed');

    console.log('\n=== Step 6: Tally Votes ===\n');

    // Tally votes and verify with circuit
    i = 0;
    while (operator.states === 2) {
      const { input: tallyInput } = await operator.processTally();

      console.log(`Processed tally batch ${i}:`);
      console.log('- New tally commitment:', tallyInput.newTallyCommitment.toString());

      // Verify with circuit
      console.log(`Verifying tally batch ${i} with circuit...`);
      const tallyWitness = await tallyVotesCircuit.calculateWitness(tallyInput as any);
      await tallyVotesCircuit.expectConstraintPass(tallyWitness);
      console.log(`Circuit verification passed for tally batch ${i}`);

      i++;

      // Safety check to prevent infinite loop
      if (i > 10) {
        throw new Error('Too many tally iterations');
      }
    }

    expect(operator.states).to.equal(3); // ENDED state
    console.log('Tallying completed');

    console.log('\n=== Step 7: Get Results ===\n');

    const results = operator.getTallyResults();
    console.log('Final results (first 5 options):');
    results.forEach((result, idx) => {
      console.log(`  Option ${idx}: ${result.toString()}`);
    });

    expect(results.length).to.equal(maxVoteOptions);

    // Verify expected results
    // User 1: option 1, weight 8 (quadratic cost: 8^2 = 64)
    // User 2: option 2, weight 12 (quadratic cost: 12^2 = 144)
    // Tally results use formula: v * (v + MAX_VOTES) where MAX_VOTES = 10^24
    console.log('\nExpected results based on QV formula:');
    console.log('  Option 0: 0 (no votes)');
    console.log('  Option 1: 8 * (8 + 10^24) ≈ 8 * 10^24');
    console.log('  Option 2: 12 * (12 + 10^24) ≈ 12 * 10^24');

    console.log('\n=== Step 8: Get Logs ===\n');

    const logs = operator.getLogs();
    console.log('Total log entries:', logs.length);
    console.log('Log types:', [...new Set(logs.map((log) => log.type))]);

    expect(logs.length).to.be.greaterThan(0);

    // Verify log structure
    logs.forEach((log) => {
      expect(log).to.have.property('type');
      expect(log).to.have.property('data');
      expect(typeof log.type).to.equal('string');
    });

    console.log('\n=== Test Completed Successfully ===\n');
  });

  it('should throw error when voting after period ends', () => {
    const newOperator = new OperatorClient({
      network: 'testnet',
      secretKey: 999999n
    });

    newOperator.initRound({
      stateTreeDepth,
      intStateTreeDepth,
      voteOptionTreeDepth,
      batchSize,
      maxVoteOptions,

      isQuadraticCost: false,
      isAmaci: false // Standard MACI
    });

    // End the vote period
    newOperator.endVotePeriod();

    // Try to push a message after voting period ended
    expect(() => {
      newOperator.pushMessage([0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n], [0n, 0n]);
    }).to.throw('Vote period ended');
  });

  it('should handle state tree operations correctly', () => {
    const testOperator = new OperatorClient({
      network: 'testnet',
      secretKey: 888888n
    });

    testOperator.initRound({
      stateTreeDepth,
      intStateTreeDepth,
      voteOptionTreeDepth,
      batchSize,
      maxVoteOptions,

      isQuadraticCost: false,
      isAmaci: false // Standard MACI
    });

    const testPubKey: [bigint, bigint] = [12345n, 67890n];
    testOperator.updateStateTree(0, testPubKey, 200);

    const stateLeaf = testOperator.stateLeaves.get(0);
    expect(stateLeaf).to.not.be.undefined;
    expect(stateLeaf?.balance).to.equal(200n);
    expect(stateLeaf?.pubKey).to.deep.equal(testPubKey);
  });

  it('should handle state transitions correctly', () => {
    const testOperator = new OperatorClient({
      network: 'testnet',
      secretKey: 777777n
    });

    testOperator.initRound({
      stateTreeDepth,
      intStateTreeDepth,
      voteOptionTreeDepth,
      batchSize,
      maxVoteOptions,

      isQuadraticCost: false,
      isAmaci: false // Standard MACI
    });

    expect(testOperator.states).to.equal(0); // FILLING

    testOperator.endVotePeriod();
    expect(testOperator.states).to.equal(1); // PROCESSING

    // Should throw error when trying to end vote period again
    expect(() => {
      testOperator.endVotePeriod();
    }).to.throw('Vote period already ended');
  });

  it('should verify state leaf hash format (MACI vs AMACI)', () => {
    const maciOperator = new OperatorClient({
      network: 'testnet',
      secretKey: 111222n
    });

    const amaciOperator = new OperatorClient({
      network: 'testnet',
      secretKey: 333444n
    });

    // Initialize MACI
    maciOperator.initRound({
      stateTreeDepth: 2,
      intStateTreeDepth: 1,
      voteOptionTreeDepth: 1,
      batchSize: 5,
      maxVoteOptions: 5,

      isQuadraticCost: false,
      isAmaci: false
    });

    // Initialize AMACI
    amaciOperator.initRound({
      stateTreeDepth: 2,
      intStateTreeDepth: 1,
      voteOptionTreeDepth: 1,
      batchSize: 5,
      maxVoteOptions: 5,

      isQuadraticCost: false,
      isAmaci: true
    });

    const testPubKey: [bigint, bigint] = [12345n, 67890n];

    // Add same state to both
    maciOperator.updateStateTree(0, testPubKey, 100);
    amaciOperator.updateStateTree(0, testPubKey, 100);

    // MACI and AMACI should have different state tree roots
    // because they use different hashing (single vs double layer)
    expect(maciOperator.stateTree?.root).to.not.equal(amaciOperator.stateTree?.root);

    console.log('\nState tree root comparison:');
    console.log('  MACI root:', maciOperator.stateTree?.root.toString());
    console.log('  AMACI root:', amaciOperator.stateTree?.root.toString());
  });
});
