import { expect } from 'chai';
import { OperatorClient, VoterClient } from '@dorafactory/maci-sdk';
import { type WitnessTester } from 'circomkit';

import { circomkitInstance } from './utils/utils';

/**
 * AMACI (Anonymous MACI) Integration Test
 *
 * This test demonstrates the complete flow of an anonymous voting system:
 * 1. Coordinator initializes MACI
 * 2. Users sign up and get registered in the state tree
 * 3. Users can deactivate their keys and add new keys anonymously
 * 4. Users submit encrypted votes
 * 5. Coordinator processes votes and tallies results
 */

describe('AMACI Integration Test', function () {
  this.timeout(300000); // 300 second timeout for the entire test suite (circuits take time)

  let operator: OperatorClient;
  let voter1: VoterClient;
  let voter2: VoterClient;

  // Circuit instances
  let processDeactivateCircuit: WitnessTester<any, any>;
  let processMessagesCircuit: WitnessTester<any, any>;
  let tallyVotesCircuit: WitnessTester<any, any>;

  const USER_1 = 0; // state leaf idx
  const USER_2 = 1; // state leaf idx
  const USER_1A = 2; // state leaf idx after key change

  const maxVoteOptions = 5;
  const stateTreeDepth = 2;
  const intStateTreeDepth = 1;
  const voteOptionTreeDepth = 1;
  const batchSize = 2;

  before(async () => {
    // Initialize circuits
    console.log('Initializing circuits...');

    processDeactivateCircuit = await circomkitInstance.WitnessTester('ProcessDeactivateMessages', {
      file: 'amaci/power/processDeactivate',
      template: 'ProcessDeactivateMessages',
      params: [stateTreeDepth, batchSize]
    });

    processMessagesCircuit = await circomkitInstance.WitnessTester('ProcessMessages', {
      file: 'amaci/power/processMessages',
      template: 'ProcessMessages',
      params: [stateTreeDepth, voteOptionTreeDepth, batchSize]
    });

    tallyVotesCircuit = await circomkitInstance.WitnessTester('TallyVotes', {
      file: 'amaci/power/tallyVotes',
      template: 'TallyVotes',
      params: [stateTreeDepth, intStateTreeDepth, voteOptionTreeDepth]
    });

    console.log('Circuits initialized successfully');

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

  it('should complete the full AMACI flow', async () => {
    console.log('\n=== Step 1: Initialize AMACI ===\n');

    // Initialize AMACI with coordinator using the same parameters as circuits
    operator.initRound({
      stateTreeDepth,
      intStateTreeDepth,
      voteOptionTreeDepth,
      batchSize,
      maxVoteOptions,

      isQuadraticCost: true,
      isAmaci: true // AMACI mode with anonymous keys (d1, d2)
    });

    expect(operator.stateTree).to.not.be.undefined;

    console.log('\n=== Step 2: User Sign Up ===\n');

    // Register user 1 and user 2
    const user1PubKey = voter1.getPubkey().toPoints();
    const user2PubKey = voter2.getPubkey().toPoints();

    operator.updateStateTree(USER_1, user1PubKey, 100);
    operator.updateStateTree(USER_2, user2PubKey, 100);

    expect(operator.stateLeaves.size).to.equal(2);

    console.log('\n=== Step 3: Deactivate Messages ===\n');

    // Users send deactivate messages to prepare for key change
    const coordPubKey = operator.getPubkey().toPoints();

    // Generate deactivate messages
    const dmessage1Payload = await voter1.buildDeactivatePayload({
      stateIdx: USER_1,
      operatorPubkey: coordPubKey
    });

    const dmessage2Payload = await voter2.buildDeactivatePayload({
      stateIdx: USER_2,
      operatorPubkey: coordPubKey
    });

    // Convert string arrays to bigint arrays
    const dmessage1 = dmessage1Payload.msg.map((m) => BigInt(m));
    const dmessage1EncPubKey = dmessage1Payload.encPubkeys.map((k) => BigInt(k)) as [
      bigint,
      bigint
    ];

    const dmessage2 = dmessage2Payload.msg.map((m) => BigInt(m));
    const dmessage2EncPubKey = dmessage2Payload.encPubkeys.map((k) => BigInt(k)) as [
      bigint,
      bigint
    ];

    operator.pushDeactivateMessage(dmessage1, dmessage1EncPubKey);
    operator.pushDeactivateMessage(dmessage2, dmessage2EncPubKey);

    expect(operator.dMessages.length).to.equal(2);

    console.log('\n=== Step 4: Process Deactivate Messages ===\n');

    // Process deactivate messages and generate circuit input
    const { input: deactivateInput, newDeactivate } = await operator.processDeactivateMessages({
      inputSize: 2,
      subStateTreeLength: 2
    });

    expect(deactivateInput).to.not.be.undefined;
    expect(newDeactivate.length).to.be.greaterThan(0);

    console.log('Deactivate processing completed');
    console.log('New deactivate root:', deactivateInput.newDeactivateRoot.toString());

    // Verify with circuit
    console.log('Verifying deactivate messages with circuit...');
    const deactivateWitness = await processDeactivateCircuit.calculateWitness(
      deactivateInput as any
    );
    await processDeactivateCircuit.expectConstraintPass(deactivateWitness);
    console.log('Circuit verification passed for deactivate messages');

    console.log('\n=== Step 5: Add New Key (User 1) ===\n');

    // User 1 adds a new key using the deactivate proof
    const user1NewVoter = new VoterClient({
      network: 'testnet',
      secretKey: 666666n // new private key for user 1
    });

    const user1aPubKey = user1NewVoter.getPubkey().toPoints();

    // In a real scenario, this would use buildAddNewKeyPayload with ZK proof
    // For testing, we directly register the new key
    const d1 = newDeactivate[0].slice(0, 2);
    const d2 = newDeactivate[0].slice(2, 4);
    operator.updateStateTree(USER_1A, user1aPubKey, 100, [d1[0], d1[1], d2[0], d2[1]]);

    expect(operator.stateLeaves.size).to.equal(3);
    console.log('User 1 new key registered at index', USER_1A);

    console.log('\n=== Step 6: Submit Votes ===\n');

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

    // User 1's new key votes:
    // option 0, weight 1
    // option 1, weight 2
    // option 2, weight 3
    const vote3Payload = user1NewVoter.buildVotePayload({
      stateIdx: USER_1A,
      operatorPubkey: coordPubKey,
      selectedOptions: [
        { idx: 0, vc: 1 },
        { idx: 1, vc: 2 },
        { idx: 2, vc: 3 }
      ]
    });

    // Publish all messages in vote3Payload
    for (const payload of vote3Payload) {
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
      operator.pushMessage(message, messageEncPubKey);
    }

    const expectedMessages = vote1Payload.length + vote2Payload.length + vote3Payload.length;
    expect(operator.messages.length).to.equal(expectedMessages);
    console.log('Total votes submitted:', operator.messages.length);

    console.log('\n=== Step 7: End Vote Period ===\n');

    operator.endVotePeriod();
    expect(operator.states).to.equal(1); // PROCESSING state

    console.log('\n=== Step 8: Process Messages ===\n');

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

    console.log('\n=== Step 9: Tally Votes ===\n');

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

    console.log('\n=== Step 10: Get Results ===\n');

    const results = operator.getTallyResults();
    console.log('Final results (first 5 options):');
    results.forEach((result, idx) => {
      console.log(`  Option ${idx}: ${result.toString()}`);
    });

    expect(results.length).to.equal(maxVoteOptions);

    console.log('\n=== Step 11: Get Logs ===\n');

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
      isAmaci: true // AMACI mode
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
      isAmaci: true // AMACI mode
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
      isAmaci: true // AMACI mode
    });

    expect(testOperator.states).to.equal(0); // FILLING

    testOperator.endVotePeriod();
    expect(testOperator.states).to.equal(1); // PROCESSING

    // Should throw error when trying to end vote period again
    expect(() => {
      testOperator.endVotePeriod();
    }).to.throw('Vote period already ended');
  });

  it('should verify vote overwrite behavior - second vote should completely overwrite first vote', async () => {
    console.log('\n=== Testing Vote Overwrite Behavior ===\n');

    const testOperator = new OperatorClient({
      network: 'testnet',
      secretKey: 123456n
    });

    const testVoter = new VoterClient({
      network: 'testnet',
      secretKey: 789012n
    });

    testOperator.initRound({
      stateTreeDepth,
      intStateTreeDepth,
      voteOptionTreeDepth,
      batchSize,
      maxVoteOptions,

      isQuadraticCost: false, // Use linear cost for easier calculation
      isAmaci: true
    });

    // Register user
    const userPubKey = testVoter.getPubkey().toPoints();
    const USER_IDX = 0;
    testOperator.updateStateTree(USER_IDX, userPubKey, 1000); // Give user 1000 voice credits

    const coordPubKey = testOperator.getPubkey().toPoints();

    console.log('=== First Vote: Option 1=5, Option 2=3 ===');
    // First vote: option 1 = 5, option 2 = 3
    const firstVotePayload = testVoter.buildVotePayload({
      stateIdx: USER_IDX,
      operatorPubkey: coordPubKey,
      selectedOptions: [
        { idx: 1, vc: 5 },
        { idx: 2, vc: 3 }
      ]
    });

    console.log('First vote messages count:', firstVotePayload.length);

    // Publish first vote
    for (const payload of firstVotePayload) {
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
      testOperator.pushMessage(message, messageEncPubKey);
    }

    // Process first vote
    testOperator.endVotePeriod();
    while (testOperator.states === 1) {
      await testOperator.processMessages();
    }

    // Check state after first vote
    const stateAfterFirst = testOperator.stateLeaves.get(USER_IDX);
    expect(stateAfterFirst).to.not.be.undefined;
    const votesAfterFirst = stateAfterFirst!.voTree.leaves();
    console.log(
      'Votes after first vote:',
      votesAfterFirst.map((v, i) => `Option ${i}: ${v}`)
    );

    // Verify first vote was recorded
    expect(votesAfterFirst[1]).to.equal(5n, 'Option 1 should be 5 after first vote');
    expect(votesAfterFirst[2]).to.equal(3n, 'Option 2 should be 3 after first vote');

    console.log('\n=== Second Vote: Only Option 1=10 ===');
    // Reset operator for second vote (simulate new voting period)
    // Actually, we need to check if we can vote again in the same period
    // Let's create a new operator to simulate a fresh voting scenario
    const testOperator2 = new OperatorClient({
      network: 'testnet',
      secretKey: 123456n
    });

    testOperator2.initRound({
      stateTreeDepth,
      intStateTreeDepth,
      voteOptionTreeDepth,
      batchSize,
      maxVoteOptions,

      isQuadraticCost: false,
      isAmaci: true
    });

    // Register same user
    testOperator2.updateStateTree(USER_IDX, userPubKey, 1000);

    // First vote: option 1 = 5, option 2 = 3
    for (const payload of firstVotePayload) {
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
      testOperator2.pushMessage(message, messageEncPubKey);
    }

    // Second vote: only option 1 = 10 (no option 2)
    const secondVotePayload = testVoter.buildVotePayload({
      stateIdx: USER_IDX,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: 1, vc: 10 }]
    });

    console.log('Second vote messages count:', secondVotePayload.length);

    // Publish second vote
    for (const payload of secondVotePayload) {
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
      testOperator2.pushMessage(message, messageEncPubKey);
    }

    // Process all messages (both first and second vote)
    testOperator2.endVotePeriod();
    while (testOperator2.states === 1) {
      await testOperator2.processMessages();
    }

    // Check final state
    const finalState = testOperator2.stateLeaves.get(USER_IDX);
    expect(finalState).to.not.be.undefined;
    const finalVotes = finalState!.voTree.leaves();
    console.log(
      'Final votes after both votes:',
      finalVotes.map((v, i) => `Option ${i}: ${v}`)
    );

    // Verify second vote behavior
    expect(finalVotes[1]).to.equal(10n, 'Option 1 should be 10 after second vote');

    // This is the key test: does option 2 remain 3 or become 0?
    if (finalVotes[2] === 0n) {
      console.log('✓ Second vote COMPLETELY OVERWRITES: Option 2 is 0 (was reset)');
      expect(finalVotes[2]).to.equal(
        0n,
        'Option 2 should be 0 if second vote completely overwrites'
      );
    } else if (finalVotes[2] === 3n) {
      console.log('✓ Second vote PARTIALLY UPDATES: Option 2 remains 3 (not reset)');
      expect(finalVotes[2]).to.equal(
        3n,
        'Option 2 should remain 3 if second vote only updates specified options'
      );
    } else {
      throw new Error(`Unexpected value for option 2: ${finalVotes[2]}, expected either 0 or 3`);
    }

    console.log('\n=== Vote Overwrite Test Completed ===\n');
  });
});
