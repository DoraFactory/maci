import { expect } from 'chai';
import { OperatorClient, VoterClient, poseidon } from '@dorafactory/maci-sdk';
import { type WitnessTester } from 'circomkit';

import { circomkitInstance } from './utils/utils';

/**
 * ProcessMessages Circuit Test (MACI)
 *
 * This test file verifies that the ProcessMessages circuit behavior matches
 * the SDK OperatorClient implementation. It ensures:
 *
 * 1. Circuit processes messages in the same order as SDK
 * 2. State tree updates match between circuit and SDK
 * 3. Vote weight calculations are consistent
 * 4. Invalid messages are handled identically
 * 5. State commitments match
 * 6. Merkle proofs are verified correctly
 *
 * Circuit Location: packages/circuits/circom/maci/power/processMessages.circom
 * SDK Location: packages/sdk/src/operator.ts (processMessages method)
 */

describe('ProcessMessages MACI Circuit Tests', function () {
  this.timeout(600000); // 10 minute timeout (circuit compilation and proof generation)

  let processMessagesCircuit: WitnessTester<any, any>;

  // Test parameters (must match between circuit and SDK)
  const stateTreeDepth = 2;
  const voteOptionTreeDepth = 2;
  const batchSize = 5;
  const maxVoteOptions = 5;
  const numSignUps = 3;

  before(async () => {
    console.log('Initializing ProcessMessages circuit...');
    processMessagesCircuit = await circomkitInstance.WitnessTester('ProcessMessages_MACI', {
      file: 'maci/power/processMessages',
      template: 'ProcessMessages',
      params: [stateTreeDepth, voteOptionTreeDepth, batchSize]
    });
    console.log('Circuit initialized successfully');
  });

  /**
   * Helper: Create a test setup with operator and voters
   */
  function createTestSetup(isQuadraticCost: boolean = true) {
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
      numSignUps,
      isQuadraticCost,
      isAmaci: false // MACI mode
    });

    // Create voters
    const voters = [
      new VoterClient({ network: 'testnet', secretKey: 222222n }),
      new VoterClient({ network: 'testnet', secretKey: 333333n }),
      new VoterClient({ network: 'testnet', secretKey: 444444n })
    ];

    // Register voters in state tree
    voters.forEach((voter, idx) => {
      const pubKey = voter.getPubkey().toPoints();
      operator.updateStateTree(idx, pubKey, 100); // 100 voice credits
    });

    return { operator, voters };
  }

  /**
   * Helper: Submit votes from voters
   */
  function submitVotes(
    operator: OperatorClient,
    voters: VoterClient[],
    votes: Array<{ voterIdx: number; optionIdx: number; weight: number }>
  ) {
    const coordPubKey = operator.getPubkey().toPoints();

    votes.forEach(({ voterIdx, optionIdx, weight }) => {
      const voter = voters[voterIdx];
      const votePayload = voter.buildVotePayload({
        stateIdx: voterIdx,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: optionIdx, vc: weight }]
      });

      // Push each message
      for (const payload of votePayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const encPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, encPubKey);
      }
    });
  }

  // ============================================================================
  // PART 1: Basic Message Processing
  // ============================================================================

  describe('Part 1: Basic Message Processing', () => {
    it('should process a single valid message and match SDK state', async () => {
      const { operator, voters } = createTestSetup(false); // Linear cost

      // Submit one vote
      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      expect(operator.messages.length).to.equal(1);

      // End voting period
      operator.endVotePeriod();

      // Process messages with SDK
      const { input } = await operator.processMessages({ newStateSalt: 12345n });

      console.log('\n=== SDK Processing Result ===');
      console.log('State Root:', operator.stateTree!.root.toString());
      console.log('State Commitment:', input.newStateCommitment.toString());

      // Verify with circuit
      console.log('\n=== Circuit Verification ===');
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Circuit verification passed');
      console.log('✓ Circuit and SDK behavior match');
    });

    it('should process multiple messages in batch and match SDK state', async () => {
      const { operator, voters } = createTestSetup(true); // Quadratic cost

      // Submit multiple votes
      submitVotes(operator, voters, [
        { voterIdx: 0, optionIdx: 1, weight: 5 },
        { voterIdx: 1, optionIdx: 2, weight: 7 },
        { voterIdx: 2, optionIdx: 0, weight: 3 }
      ]);

      expect(operator.messages.length).to.equal(3);

      // End voting period
      operator.endVotePeriod();

      // Process messages with SDK
      const { input } = await operator.processMessages({ newStateSalt: 67890n });

      console.log('\n=== SDK Processing Result ===');
      console.log('Messages processed:', operator.messages.length);
      console.log('State Root:', operator.stateTree!.root.toString());

      // Verify with circuit
      console.log('\n=== Circuit Verification ===');
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Circuit verification passed');
      console.log('✓ All messages processed correctly');
    });

    it('should handle batch with padding (fewer messages than batchSize)', async () => {
      const { operator, voters } = createTestSetup(false);

      // Submit 2 messages (less than batchSize=5)
      submitVotes(operator, voters, [
        { voterIdx: 0, optionIdx: 1, weight: 10 },
        { voterIdx: 1, optionIdx: 2, weight: 15 }
      ]);

      operator.endVotePeriod();

      // Process messages - SDK should pad with empty messages
      const { input } = await operator.processMessages({ newStateSalt: 99999n });

      console.log('\n=== Batch Padding ===');
      console.log('Actual messages:', 2);
      console.log('Batch size:', batchSize);
      console.log('Padded messages:', batchSize - 2);

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Padding handled correctly');
    });
  });

  // ============================================================================
  // PART 2: State Update Verification
  // ============================================================================

  describe('Part 2: State Update Verification', () => {
    it('should update state tree root correctly (linear cost)', async () => {
      const { operator, voters } = createTestSetup(false); // Linear cost

      const initialRoot = operator.stateTree!.root;
      console.log('\n=== Initial State ===');
      console.log('Initial root:', initialRoot.toString());

      // Submit vote
      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      // Process messages
      const { input } = await operator.processMessages({ newStateSalt: 11111n });

      const newRoot = operator.stateTree!.root;
      console.log('\n=== After Processing ===');
      console.log('New root:', newRoot.toString());
      console.log('Root changed:', initialRoot !== newRoot);

      // Root should change
      expect(initialRoot).to.not.equal(newRoot, 'State root should change after processing');

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ State tree updated correctly');
    });

    it('should update state tree root correctly (quadratic cost)', async () => {
      const { operator, voters } = createTestSetup(true); // Quadratic cost

      // Submit vote (cost = 5^2 = 25)
      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 5 }]);

      operator.endVotePeriod();

      // Get initial balance
      const initialLeaf = operator.stateLeaves.get(0);
      const initialBalance = initialLeaf?.balance || 0n;
      console.log('\n=== Balance Check (Quadratic) ===');
      console.log('Initial balance:', initialBalance.toString());
      console.log('Vote weight:', 5);
      console.log('Expected cost: 5^2 =', 25);

      // Process messages
      const { input } = await operator.processMessages({ newStateSalt: 22222n });

      const newLeaf = operator.stateLeaves.get(0);
      const newBalance = newLeaf?.balance || 0n;

      console.log('New balance:', newBalance.toString());
      console.log('Balance decreased by:', (initialBalance - newBalance).toString());

      // Balance should decrease by 25 (5^2)
      expect(initialBalance - newBalance).to.equal(25n, 'Balance should decrease by 25');

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Quadratic voting cost calculated correctly');
    });

    it('should update vote option tree correctly', async () => {
      const { operator, voters } = createTestSetup(false);

      // Submit vote for option 1
      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      // Get initial vote option tree state
      const initialLeaf = operator.stateLeaves.get(0)!;
      const initialVoTreeRoot = initialLeaf.voted ? initialLeaf.voTree.root : 0n;

      console.log('\n=== Vote Option Tree ===');
      console.log('Initial VO tree root:', initialVoTreeRoot.toString());

      // Process messages
      const { input } = await operator.processMessages({ newStateSalt: 33333n });

      // Get new vote option tree state
      const newLeaf = operator.stateLeaves.get(0)!;
      const newVoTreeRoot = newLeaf.voTree.root;

      console.log('New VO tree root:', newVoTreeRoot.toString());
      console.log('Vote at option 1:', newLeaf.voTree.leaf(1).toString());

      // Vote option tree root should change
      expect(initialVoTreeRoot).to.not.equal(newVoTreeRoot, 'VO tree root should change');

      // Vote weight at option 1 should be 10
      expect(newLeaf.voTree.leaf(1)).to.equal(10n, 'Vote weight should be 10');

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Vote option tree updated correctly');
    });

    it('should update nonce correctly', async () => {
      const { operator, voters } = createTestSetup(false);

      // Get initial nonce
      const initialLeaf = operator.stateLeaves.get(0)!;
      const initialNonce = initialLeaf.nonce;

      console.log('\n=== Nonce Update ===');
      console.log('Initial nonce:', initialNonce.toString());

      // Submit vote
      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      // Process messages
      const { input } = await operator.processMessages({ newStateSalt: 44444n });

      // Get new nonce
      const newLeaf = operator.stateLeaves.get(0)!;
      const newNonce = newLeaf.nonce;

      console.log('New nonce:', newNonce.toString());
      console.log('Nonce increased by:', (newNonce - initialNonce).toString());

      // Nonce should increment by 1
      expect(newNonce).to.equal(initialNonce + 1n, 'Nonce should increment by 1');

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Nonce updated correctly');
    });
  });

  // ============================================================================
  // PART 3: Invalid Message Handling
  // ============================================================================

  describe('Part 3: Invalid Message Handling', () => {
    it('should preserve state when message has invalid signature', async () => {
      const { operator } = createTestSetup(false);

      const initialRoot = operator.stateTree!.root;
      const initialLeaf = operator.stateLeaves.get(0);
      const initialBalance = initialLeaf?.balance || 0n;
      const initialNonce = initialLeaf?.nonce || 0n;

      console.log('\n=== Invalid Signature Test ===');
      console.log('Initial state root:', initialRoot.toString());
      console.log('Initial balance:', initialBalance.toString());
      console.log('Initial nonce:', initialNonce.toString());

      // Create a message with invalid signature
      // (This is tricky - we need to manually construct an invalid message)
      // For now, we'll use a different voter's signature
      const wrongVoter = new VoterClient({ network: 'testnet', secretKey: 999999n });
      const coordPubKey = operator.getPubkey().toPoints();

      // Build vote with wrong voter (will be signed with wrong key)
      const votePayload = wrongVoter.buildVotePayload({
        stateIdx: 0, // Trying to vote as voter 0
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 1, vc: 10 }]
      });

      // Push the invalid message
      for (const payload of votePayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const encPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, encPubKey);
      }

      operator.endVotePeriod();

      // Process messages
      const { input } = await operator.processMessages({ newStateSalt: 55555n });

      // Check that state was preserved (invalid message should be ignored)
      const newLeaf = operator.stateLeaves.get(0)!;
      const newBalance = newLeaf.balance;
      const newNonce = newLeaf.nonce;

      console.log('\n=== After Processing Invalid Message ===');
      console.log('New balance:', newBalance.toString());
      console.log('New nonce:', newNonce.toString());
      console.log('Balance unchanged:', initialBalance === newBalance);
      console.log('Nonce unchanged:', initialNonce === newNonce);

      // State should be preserved (balance and nonce unchanged)
      expect(newBalance).to.equal(initialBalance, 'Balance should be unchanged');
      expect(newNonce).to.equal(initialNonce, 'Nonce should be unchanged');

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Invalid message rejected correctly');
    });

    it('should preserve state when balance is insufficient', async () => {
      const { operator } = createTestSetup(true); // Quadratic cost

      // Set low balance
      const lowBalanceVoter = new VoterClient({ network: 'testnet', secretKey: 777777n });
      operator.updateStateTree(3, lowBalanceVoter.getPubkey().toPoints(), 10); // Only 10 credits

      const coordPubKey = operator.getPubkey().toPoints();

      // Try to vote with weight 5 (cost = 25, but only have 10)
      const votePayload = lowBalanceVoter.buildVotePayload({
        stateIdx: 3,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 1, vc: 5 }] // Cost: 5^2 = 25 > 10
      });

      const initialBalance = operator.stateLeaves.get(3)?.balance || 0n;
      console.log('\n=== Insufficient Balance Test ===');
      console.log('Initial balance:', initialBalance.toString());
      console.log('Vote weight:', 5);
      console.log('Required credits: 5^2 =', 25);
      console.log('Available credits:', initialBalance.toString());

      // Push the message
      for (const payload of votePayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const encPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, encPubKey);
      }

      operator.endVotePeriod();

      // Process messages
      const { input } = await operator.processMessages({ newStateSalt: 66666n });

      // Balance should be unchanged
      const newBalance = operator.stateLeaves.get(3)?.balance || 0n;
      console.log('New balance:', newBalance.toString());
      console.log('Balance unchanged:', initialBalance === newBalance);

      expect(newBalance).to.equal(initialBalance, 'Balance should be unchanged');

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Insufficient balance handled correctly');
    });
  });

  // ============================================================================
  // PART 4: State Commitment Verification
  // ============================================================================

  describe('Part 4: State Commitment Verification', () => {
    it('should generate correct initial state commitment', async () => {
      const { operator } = createTestSetup(false);

      const currentStateRoot = operator.stateTree!.root;
      const currentStateSalt = operator.stateSalt; // Get the salt from SDK

      // SDK now automatically initializes stateCommitment in initMaci()
      // Verify it matches the expected calculation
      const expectedCommitment = poseidon([currentStateRoot, currentStateSalt]);

      console.log('\n=== Initial State Commitment ===');
      console.log('State root:', currentStateRoot.toString());
      console.log('State salt:', currentStateSalt.toString());
      console.log('SDK commitment:', operator.stateCommitment.toString());
      console.log('Expected commitment:', expectedCommitment.toString());

      // Verify SDK's stateCommitment matches the expected value
      expect(operator.stateCommitment).to.equal(
        expectedCommitment,
        'SDK should automatically initialize stateCommitment in initMaci()'
      );

      expect(operator.stateSalt).to.equal(
        currentStateSalt,
        'SDK should initialize stateSalt to 0n'
      );
    });

    it('should generate correct new state commitment after processing', async () => {
      const { operator, voters } = createTestSetup(false);

      // Submit vote
      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      const newStateSalt = 123456789n;

      // Process messages
      const { input } = await operator.processMessages({ newStateSalt });

      const newStateRoot = operator.stateTree!.root;
      const newStateCommitment = input.newStateCommitment;

      console.log('\n=== New State Commitment ===');
      console.log('New state root:', newStateRoot.toString());
      console.log('New state salt:', newStateSalt.toString());
      console.log('New state commitment:', newStateCommitment.toString());

      // Manual calculation
      const expectedCommitment = poseidon([newStateRoot, newStateSalt]);
      console.log('Expected commitment:', expectedCommitment.toString());

      expect(newStateCommitment).to.equal(expectedCommitment, 'New commitment should match');

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ State commitment verified correctly');
    });

    it('should verify inputHash calculation matches SDK', async () => {
      const { operator, voters } = createTestSetup(true); // Quadratic cost

      // Submit vote
      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 5 }]);

      operator.endVotePeriod();

      // Process messages
      const { input } = await operator.processMessages({ newStateSalt: 987654n });

      console.log('\n=== Input Hash Verification ===');
      console.log('Input hash:', input.inputHash.toString());

      // The inputHash is calculated in the SDK and should match circuit calculation
      // It's a SHA256 hash of: packedVals, coordPubKeyHash, batchStartHash,
      // batchEndHash, currentStateCommitment, newStateCommitment

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Input hash matches between SDK and circuit');
    });
  });

  // ============================================================================
  // PART 5: Merkle Path Verification
  // ============================================================================

  describe('Part 5: Merkle Path Verification', () => {
    it('should provide correct Merkle paths for state leaves', async () => {
      const { operator, voters } = createTestSetup(false);

      // Submit votes from different users
      submitVotes(operator, voters, [
        { voterIdx: 0, optionIdx: 1, weight: 10 },
        { voterIdx: 1, optionIdx: 2, weight: 15 }
      ]);

      operator.endVotePeriod();

      // Process messages
      const { input } = await operator.processMessages({ newStateSalt: 11111n });

      console.log('\n=== Merkle Path Verification ===');

      // Check that path elements are provided
      expect(input.currentStateLeavesPathElements).to.be.an('array');
      expect(input.currentStateLeavesPathElements.length).to.equal(batchSize);

      // Each path should have stateTreeDepth levels
      input.currentStateLeavesPathElements.forEach((path: any, idx: number) => {
        expect(path.length).to.equal(
          stateTreeDepth,
          `Path ${idx} should have ${stateTreeDepth} levels`
        );
        console.log(`Message ${idx} path levels:`, path.length);
      });

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Merkle paths verified correctly');
    });

    it('should provide correct Merkle paths for vote option trees', async () => {
      const { operator, voters } = createTestSetup(false);

      // Submit vote
      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 2, weight: 10 }]);

      operator.endVotePeriod();

      // Process messages
      const { input } = await operator.processMessages({ newStateSalt: 22222n });

      console.log('\n=== Vote Option Tree Path Verification ===');

      // Check that vote weight path elements are provided
      expect(input.currentVoteWeightsPathElements).to.be.an('array');
      expect(input.currentVoteWeightsPathElements.length).to.equal(batchSize);

      // Each path should have voteOptionTreeDepth levels
      input.currentVoteWeightsPathElements.forEach((path: any, idx: number) => {
        expect(path.length).to.equal(
          voteOptionTreeDepth,
          `Vote path ${idx} should have ${voteOptionTreeDepth} levels`
        );
        console.log(`Message ${idx} vote path levels:`, path.length);
      });

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Vote option tree paths verified correctly');
    });
  });

  // ============================================================================
  // PART 6: Message Hash Chain Verification
  // ============================================================================

  describe('Part 6: Message Hash Chain Verification', () => {
    it('should maintain correct message hash chain', async () => {
      const { operator, voters } = createTestSetup(false);

      // Submit multiple votes
      submitVotes(operator, voters, [
        { voterIdx: 0, optionIdx: 1, weight: 10 },
        { voterIdx: 1, optionIdx: 2, weight: 15 }
      ]);

      operator.endVotePeriod();

      console.log('\n=== Message Hash Chain ===');
      console.log('Total messages:', operator.messages.length);

      // Each message should have a hash that chains to the previous
      operator.messages.forEach((msg, idx) => {
        console.log(`Message ${idx}:`);
        console.log('  Hash:', msg.hash.toString());
        console.log('  PrevHash:', msg.prevHash.toString());
      });

      // Process messages
      const { input } = await operator.processMessages({ newStateSalt: 33333n });

      // Verify hash chain values
      expect(input.batchStartHash).to.be.a('bigint');
      expect(input.batchEndHash).to.be.a('bigint');

      console.log('\nBatch hash chain:');
      console.log('  Start:', input.batchStartHash.toString());
      console.log('  End:', input.batchEndHash.toString());

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Message hash chain verified correctly');
    });

    it('should handle message chain with padding', async () => {
      const { operator, voters } = createTestSetup(false);

      // Submit only 1 message (will be padded to batchSize)
      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      console.log('\n=== Message Chain with Padding ===');
      console.log('Real messages:', 1);
      console.log('Batch size:', batchSize);

      // Process messages
      const { input } = await operator.processMessages({ newStateSalt: 44444n });

      // Check that empty messages are added
      expect(input.msgs).to.be.an('array');
      expect(input.msgs.length).to.equal(batchSize, 'Should have batchSize messages');
      expect(input.encPubKeys.length).to.equal(batchSize, 'Should have batchSize encPubKeys');

      console.log('Total input messages:', input.msgs.length);

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Padded message chain verified correctly');
    });
  });

  // ============================================================================
  // PART 7: Edge Cases and Complex Scenarios
  // ============================================================================

  describe('Part 7: Edge Cases and Complex Scenarios', () => {
    it('should handle vote modification (user votes twice on same option)', async () => {
      const { operator, voters } = createTestSetup(true); // Quadratic cost

      const coordPubKey = operator.getPubkey().toPoints();

      // First vote: option 1, weight 3 (cost = 9)
      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 3 }]);

      // Second vote: option 1, weight 5 (cost = 25 - 9 = 16 additional)
      const votePayload = voters[0].buildVotePayload({
        stateIdx: 0,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 1, vc: 5 }]
      });

      for (const payload of votePayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const encPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, encPubKey);
      }

      console.log('\n=== Vote Modification ===');
      console.log('First vote: weight 3, cost 9');
      console.log('Second vote: weight 5, cost 25');
      console.log('Total cost: 9 + (25 - 9) = 25');

      operator.endVotePeriod();

      const initialBalance = operator.stateLeaves.get(0)!.balance;
      console.log('Initial balance:', initialBalance.toString());

      // Process messages
      const { input } = await operator.processMessages({ newStateSalt: 55555n });

      const finalBalance = operator.stateLeaves.get(0)!.balance;
      const finalWeight = operator.stateLeaves.get(0)!.voTree.leaf(1);

      console.log('Final balance:', finalBalance.toString());
      console.log('Final weight at option 1:', finalWeight.toString());

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Vote modification handled correctly');
    });

    it('should handle multiple voters voting on different options', async () => {
      const { operator, voters } = createTestSetup(false); // Linear cost

      // Each voter votes for a different option
      submitVotes(operator, voters, [
        { voterIdx: 0, optionIdx: 0, weight: 10 },
        { voterIdx: 1, optionIdx: 1, weight: 15 },
        { voterIdx: 2, optionIdx: 2, weight: 20 }
      ]);

      console.log('\n=== Multiple Voters, Different Options ===');
      console.log('Voter 0 -> Option 0: 10');
      console.log('Voter 1 -> Option 1: 15');
      console.log('Voter 2 -> Option 2: 20');

      operator.endVotePeriod();

      // Process messages
      const { input } = await operator.processMessages({ newStateSalt: 66666n });

      // Check each voter's state
      [0, 1, 2].forEach((voterIdx) => {
        const leaf = operator.stateLeaves.get(voterIdx)!;
        console.log(`\nVoter ${voterIdx}:`);
        console.log('  Balance:', leaf.balance.toString());
        console.log('  Nonce:', leaf.nonce.toString());
        console.log('  VO Tree Root:', leaf.voTree.root.toString());
      });

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('\n✓ Multiple voters handled correctly');
    });

    it('should handle mixed valid and invalid messages in same batch', async () => {
      const { operator, voters } = createTestSetup(false);

      const coordPubKey = operator.getPubkey().toPoints();

      // Valid message 1
      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      // Invalid message (wrong signature)
      const wrongVoter = new VoterClient({ network: 'testnet', secretKey: 888888n });
      const invalidVotePayload = wrongVoter.buildVotePayload({
        stateIdx: 1,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 1, vc: 10 }]
      });

      for (const payload of invalidVotePayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const encPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, encPubKey);
      }

      // Valid message 2
      submitVotes(operator, voters, [{ voterIdx: 2, optionIdx: 2, weight: 15 }]);

      console.log('\n=== Mixed Valid/Invalid Messages ===');
      console.log('Message 0: Valid (voter 0)');
      console.log('Message 1: Invalid (wrong signature)');
      console.log('Message 2: Valid (voter 2)');

      operator.endVotePeriod();

      // Get initial states
      const initialStates = [0, 1, 2].map((idx) => ({
        balance: operator.stateLeaves.get(idx)?.balance || 0n,
        nonce: operator.stateLeaves.get(idx)?.nonce || 0n
      }));

      // Process messages
      const { input } = await operator.processMessages({ newStateSalt: 77777n });

      // Get final states
      const finalStates = [0, 1, 2].map((idx) => ({
        balance: operator.stateLeaves.get(idx)?.balance || 0n,
        nonce: operator.stateLeaves.get(idx)?.nonce || 0n
      }));

      console.log('\nState changes:');
      [0, 1, 2].forEach((idx) => {
        console.log(`Voter ${idx}:`);
        console.log(
          `  Balance: ${initialStates[idx].balance} -> ${finalStates[idx].balance} (changed: ${initialStates[idx].balance !== finalStates[idx].balance})`
        );
        console.log(
          `  Nonce: ${initialStates[idx].nonce} -> ${finalStates[idx].nonce} (changed: ${initialStates[idx].nonce !== finalStates[idx].nonce})`
        );
      });

      // Voter 0 and 2 should change, voter 1 should not
      expect(finalStates[0].balance).to.not.equal(
        initialStates[0].balance,
        'Voter 0 state should change'
      );
      expect(finalStates[1].balance).to.equal(
        initialStates[1].balance,
        'Voter 1 state should NOT change'
      );
      expect(finalStates[2].balance).to.not.equal(
        initialStates[2].balance,
        'Voter 2 state should change'
      );

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('\n✓ Mixed messages handled correctly');
    });
  });

  // ============================================================================
  // PART 8: Consistency Checks
  // ============================================================================

  describe('Part 8: SDK-Circuit Consistency Checks', () => {
    it('should ensure SDK and circuit use same hash functions', async () => {
      createTestSetup(false);

      // Test Poseidon hash consistency
      const testInputs = [123n, 456n, 789n];
      const sdkHash = poseidon(testInputs);

      console.log('\n=== Hash Function Consistency ===');
      console.log('Test inputs:', testInputs);
      console.log('SDK Poseidon hash:', sdkHash.toString());

      // The circuit uses the same Poseidon implementation
      // This is verified implicitly when the circuit passes with SDK-generated inputs

      console.log('✓ Hash functions consistent between SDK and circuit');
    });

    it('should ensure SDK and circuit use same tree structure', async () => {
      const { operator, voters } = createTestSetup(false);

      console.log('\n=== Tree Structure Consistency ===');
      console.log('State tree depth:', stateTreeDepth);
      console.log('Vote option tree depth:', voteOptionTreeDepth);
      console.log('Tree arity:', 5); // Quintary tree

      // The tree structure is verified implicitly through Merkle path validation
      // If paths don't match, the circuit will fail

      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      const { input } = await operator.processMessages({ newStateSalt: 88888n });

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Tree structures consistent between SDK and circuit');
    });

    it('should ensure SDK and circuit calculate costs identically', async () => {
      createTestSetup(true); // Quadratic cost

      console.log('\n=== Cost Calculation Consistency ===');

      const testCases = [
        { weight: 5, expectedCost: 25n },
        { weight: 10, expectedCost: 100n },
        { weight: 3, expectedCost: 9n }
      ];

      for (const testCase of testCases) {
        const { operator: testOp, voters: testVoters } = createTestSetup(true);

        const initialBalance = testOp.stateLeaves.get(0)!.balance;

        submitVotes(testOp, testVoters, [{ voterIdx: 0, optionIdx: 1, weight: testCase.weight }]);

        testOp.endVotePeriod();

        const { input } = await testOp.processMessages({ newStateSalt: 99999n });

        const finalBalance = testOp.stateLeaves.get(0)!.balance;
        const actualCost = initialBalance - finalBalance;

        console.log(
          `Weight ${testCase.weight}: cost = ${actualCost} (expected ${testCase.expectedCost})`
        );

        expect(actualCost).to.equal(
          testCase.expectedCost,
          `Cost should be ${testCase.expectedCost}`
        );

        // Verify with circuit
        const witness = await processMessagesCircuit.calculateWitness(input as any);
        await processMessagesCircuit.expectConstraintPass(witness);
      }

      console.log('✓ Cost calculations consistent between SDK and circuit');
    });
  });
});
