import { expect } from 'chai';
import { OperatorClient, VoterClient, genKeypair, encryptOdevity } from '@dorafactory/maci-sdk';

/**
 * AMACI ProcessMessages Integration Tests
 *
 * Complete lifecycle integration tests covering:
 * 1. Standard voting flow without deactivation
 * 2. Full Deactivate → AddNewKey → Vote cycle
 * 3. Multiple deactivate/reactivate cycles
 *
 * These tests validate the end-to-end behavior of AMACI's deactivation mechanism,
 * including ActiveStateTree management and d1/d2 state inheritance through AddNewKey.
 */
describe('AMACI ProcessMessages Integration Tests', function () {
  this.timeout(900000); // 15 minute timeout for complex integration tests

  const stateTreeDepth = 2;
  const voteOptionTreeDepth = 2;
  const batchSize = 5;
  const maxVoteOptions = 5;

  before(async () => {
    console.log('Integration tests ready...');
  });

  describe('Lifecycle Test 1: Standard Voting Flow (No Deactivation)', () => {
    it('should process standard voting flow without deactivation', async () => {
      console.log('\n=== Test 1.1: Standard Flow ===');

      // Setup operator and voters
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
        isQuadraticCost: true,
        isAmaci: true
      });

      // Create 3 voters
      const voters = [
        new VoterClient({ network: 'testnet', secretKey: 222222n }),
        new VoterClient({ network: 'testnet', secretKey: 333333n }),
        new VoterClient({ network: 'testnet', secretKey: 444444n })
      ];

      // SignUp all voters
      console.log('Step 1: SignUp voters');
      voters.forEach((voter, idx) => {
        const pubKey = voter.getPubkey().toPoints();
        operator.updateStateTree(idx, pubKey, 100); // d1,d2 default [0,0,0,0]
      });

      // Verify initial state
      console.log('Step 2: Verify initial states');
      voters.forEach((_, idx) => {
        const activeState = operator.activeStateTree!.leaf(idx);
        expect(activeState).to.equal(0n, `Voter ${idx} should be active`);
      });

      // Submit votes
      console.log('Step 3: Submit votes');
      const coordPubKey = operator.getPubkey().toPoints();

      voters.forEach((voter, idx) => {
        const votePayload = voter.buildVotePayload({
          stateIdx: idx,
          operatorPubkey: coordPubKey,
          selectedOptions: [{ idx: 0, vc: 10 }]
        });

        votePayload.forEach((p) => {
          const message = p.msg.map((m) => BigInt(m));
          const encPubKey = p.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
          operator.pushMessage(message, encPubKey);
        });
      });

      // Process messages
      console.log('Step 4: Process messages');
      operator.endVotePeriod();
      const result = await operator.processMessages();

      expect(result.input).to.exist;
      console.log('✅ Standard voting flow completed successfully');

      // Verify all users still active after voting
      voters.forEach((_, idx) => {
        const activeState = operator.activeStateTree!.leaf(idx);
        expect(activeState).to.equal(0n, `Voter ${idx} should still be active after voting`);
      });
    });
  });

  describe('Lifecycle Test 2: Deactivate Flow', () => {
    it('should process deactivate and update activeStateTree', async () => {
      console.log('\n=== Test 1.2: Deactivate Flow ===');

      // Setup
      const operator = new OperatorClient({
        network: 'testnet',
        secretKey: 555555n
      });

      operator.initRound({
        stateTreeDepth,
        intStateTreeDepth: 1,
        voteOptionTreeDepth,
        batchSize,
        maxVoteOptions,
        isQuadraticCost: true,
        isAmaci: true
      });

      const voterA = new VoterClient({ network: 'testnet', secretKey: 666666n });
      const voterB = new VoterClient({ network: 'testnet', secretKey: 777777n });

      const coordPubKey = operator.getPubkey().toPoints();

      // Step 1: SignUp
      console.log('Step 1: User A and B SignUp');
      operator.updateStateTree(0, voterA.getPubkey().toPoints(), 100);
      operator.updateStateTree(1, voterB.getPubkey().toPoints(), 100);

      const initialActiveStateA = operator.activeStateTree!.leaf(0);
      const initialActiveStateB = operator.activeStateTree!.leaf(1);

      expect(initialActiveStateA).to.equal(0n, 'User A should be active after signup');
      expect(initialActiveStateB).to.equal(0n, 'User B should be active after signup');

      // Step 2: User A deactivate (BEFORE any vote!)
      console.log('Step 2: User A deactivate');
      const deactivatePayload = await voterA.buildDeactivatePayload({
        stateIdx: 0,
        operatorPubkey: coordPubKey
      });

      const deactivateMessage = deactivatePayload.msg.map((m) => BigInt(m));
      const deactivateEncPubKey = deactivatePayload.encPubkeys.map((k) => BigInt(k)) as [
        bigint,
        bigint
      ];
      operator.pushDeactivateMessage(deactivateMessage, deactivateEncPubKey);

      // Step 3: User B votes (User A does not vote)
      console.log('Step 3: User B votes');
      const votePayload = voterB.buildVotePayload({
        stateIdx: 1,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 0, vc: 10 }]
      });

      votePayload.forEach((p) => {
        const message = p.msg.map((m) => BigInt(m));
        const encPubKey = p.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, encPubKey);
      });

      // Step 4: End vote period
      console.log('Step 4: End vote period');
      operator.endVotePeriod();

      // Step 5: Process deactivate messages FIRST
      console.log('Step 5: Process deactivate messages');
      const deactivateResult = await operator.processDeactivateMessages({
        inputSize: 1,
        subStateTreeLength: 5 ** stateTreeDepth
      });

      expect(deactivateResult.input).to.exist;

      // Step 6: Verify User A is now inactive
      console.log('Step 6: Verify User A inactive');
      const activeStateAfterDeactivate = operator.activeStateTree!.leaf(0);
      expect(activeStateAfterDeactivate).to.not.equal(0n, 'User A should be inactive');
      console.log(`   ✅ ActiveStateTree[0] = ${activeStateAfterDeactivate} (inactive)`);

      // Step 7: Verify DeactivateTree has data
      console.log('Step 7: Verify DeactivateTree data');
      const deactivateTreeLeaf = operator.deactivateTree!.leaf(0);
      expect(deactivateTreeLeaf).to.not.equal(0n, 'DeactivateTree should have data');
      console.log(`   ✅ DeactivateTree[0] = ${deactivateTreeLeaf}`);

      // Step 8: Process vote messages
      console.log('Step 8: Process vote messages');
      await operator.processMessages();
      console.log('✅ User B vote processed');

      // Final verification
      console.log('Final state verification:');
      console.log(
        `  - User A (idx=0): activeStateTree = ${operator.activeStateTree!.leaf(0)} (inactive)`
      );
      console.log(
        `  - User B (idx=1): activeStateTree = ${operator.activeStateTree!.leaf(1)} (active)`
      );

      expect(operator.activeStateTree!.leaf(0)).to.not.equal(0n, 'User A should remain inactive');
      expect(operator.activeStateTree!.leaf(1)).to.equal(0n, 'User B should remain active');
    });
  });

  describe('Lifecycle Test 2.5: AddNewKey - Old vs New Voter Validation', () => {
    it('should reject old voter vote and accept new voter vote after AddNewKey', async () => {
      console.log('\n=== Test 2.5: Old Voter Rejected, New Voter Accepted ===');

      const operator = new OperatorClient({
        network: 'testnet',
        secretKey: 123123123n
      });

      operator.initRound({
        stateTreeDepth,
        intStateTreeDepth: 1,
        voteOptionTreeDepth,
        batchSize,
        maxVoteOptions,

        isQuadraticCost: true,
        isAmaci: true
      });

      const oldVoter = new VoterClient({ network: 'testnet', secretKey: 111222n });
      const coordPubKey = operator.getPubkey().toPoints();

      // Step 1: SignUp old voter and simulate new voter (AddNewKey)
      console.log('Step 1: SignUp old and new voters');
      const OLD_IDX = 0;
      const NEW_IDX = 3;

      // Old voter signup
      operator.updateStateTree(OLD_IDX, oldVoter.getPubkey().toPoints(), 100);

      // Simulate AddNewKey: Create new account with inherited deactivate data (even = active)
      const newKeypair = genKeypair();
      const newVoter = new VoterClient({ network: 'testnet', secretKey: newKeypair.privKey });
      const deactivateData = encryptOdevity(false, operator.getPubkey().toPoints(), 999888n);

      operator.updateStateTree(NEW_IDX, newVoter.getPubkey().toPoints(), 200, [
        deactivateData.c1.x,
        deactivateData.c1.y,
        deactivateData.c2.x,
        deactivateData.c2.y
      ]);

      console.log(`   ✅ Old voter at idx=${OLD_IDX}`);
      console.log(`   ✅ New voter at idx=${NEW_IDX}`);

      // Step 2: Deactivate old voter (simulating previous cycle's deactivation)
      console.log('Step 2: Deactivate old voter');
      const deactivatePayload = await oldVoter.buildDeactivatePayload({
        stateIdx: OLD_IDX,
        operatorPubkey: coordPubKey
      });

      const dMsg = deactivatePayload.msg.map((m) => BigInt(m));
      const dEncPubKey = deactivatePayload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
      operator.pushDeactivateMessage(dMsg, dEncPubKey);

      // Step 3: Both voters try to vote
      console.log('Step 3: Old voter attempts to vote (should be rejected)');
      const oldVotePayload = oldVoter.buildVotePayload({
        stateIdx: OLD_IDX,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 0, vc: 10 }]
      });

      oldVotePayload.forEach((p) => {
        const message = p.msg.map((m) => BigInt(m));
        const encPubKey = p.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, encPubKey);
      });
      console.log(`   📨 Old voter pushed ${oldVotePayload.length} message(s)`);

      console.log('Step 4: New voter votes (should succeed)');
      const newVotePayload = newVoter.buildVotePayload({
        stateIdx: NEW_IDX,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 1, vc: 5 }] // vc=5, cost=25 in quadratic mode
      });

      newVotePayload.forEach((p) => {
        const message = p.msg.map((m) => BigInt(m));
        const encPubKey = p.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, encPubKey);
      });
      console.log(`   📨 New voter pushed ${newVotePayload.length} message(s)`);

      // Step 5: End voting period and process deactivate messages FIRST
      console.log('Step 5: End vote period and process deactivate');
      operator.endVotePeriod();

      await operator.processDeactivateMessages({
        inputSize: 1,
        subStateTreeLength: 5 ** stateTreeDepth
      });

      // Verify old account is now inactive
      const oldActiveState = operator.activeStateTree!.leaf(OLD_IDX);
      expect(oldActiveState).to.not.equal(0n, 'Old account should be inactive');
      console.log(
        `   ✅ Old account marked inactive: activeStateTree[${OLD_IDX}] = ${oldActiveState}`
      );

      // Verify new account is still active
      const newActiveState = operator.activeStateTree!.leaf(NEW_IDX);
      expect(newActiveState).to.equal(0n, 'New account should be active');
      console.log(
        `   ✅ New account remains active: activeStateTree[${NEW_IDX}] = ${newActiveState}`
      );

      // Step 6: Process vote messages
      console.log('Step 6: Process vote messages');
      const result = await operator.processMessages();

      expect(result.input).to.exist;
      console.log('   ✅ Messages processed');

      // Step 7: Verify processing results
      console.log('Step 7: Verify vote processing results');

      // Get state leaves after processing
      const oldStateLeaf = operator.stateLeaves.get(OLD_IDX)!;
      const newStateLeaf = operator.stateLeaves.get(NEW_IDX)!;

      // Old account should have unchanged balance (vote rejected due to inactive)
      expect(oldStateLeaf.balance).to.equal(100n, 'Old account balance unchanged (vote rejected)');
      console.log(
        `   ✅ Old account: balance=${oldStateLeaf.balance}, voted=${oldStateLeaf.voted}`
      );

      // New account should have reduced balance (vote accepted and processed)
      // Initial balance: 200, cost: 5^2 = 25, expected: 175
      expect(newStateLeaf.balance < 200n).to.be.true;
      expect(newStateLeaf.balance).to.equal(175n, 'New account balance should be 175 (200-25)');
      console.log(
        `   ✅ New account: balance=${newStateLeaf.balance} (reduced from 200 to 175), voted=${newStateLeaf.voted}`
      );

      // Old account should not have voted flag set
      expect(oldStateLeaf.voted).to.be.false;

      // New account should have voted flag set
      expect(newStateLeaf.voted).to.be.true;

      // Verify activeStateTree states remain correct
      expect(operator.activeStateTree!.leaf(OLD_IDX)).to.not.equal(
        0n,
        'Old account still inactive'
      );
      expect(operator.activeStateTree!.leaf(NEW_IDX)).to.equal(0n, 'New account still active');

      // Final summary
      console.log('✅ Test completed successfully:');
      console.log(`  - Old voter (idx=${OLD_IDX}): Vote REJECTED (inactive)`);
      console.log(`    • balance: ${oldStateLeaf.balance} (unchanged)`);
      console.log(`    • voted: ${oldStateLeaf.voted}`);
      console.log(`    • activeState: ${operator.activeStateTree!.leaf(OLD_IDX)} (inactive)`);
      console.log(`  - New voter (idx=${NEW_IDX}): Vote ACCEPTED (active)`);
      console.log(`    • balance: ${newStateLeaf.balance} (reduced by vote cost)`);
      console.log(`    • voted: ${newStateLeaf.voted}`);
      console.log(`    • activeState: ${operator.activeStateTree!.leaf(NEW_IDX)} (active)`);
    });
  });

  describe.skip('Lifecycle Test 3: Multiple Deactivate/Reactivate Cycles', () => {
    it('should handle multiple deactivate/reactivate cycles', async () => {
      console.log('\n=== Test 1.3: Multiple Cycles ===');

      const operator = new OperatorClient({
        network: 'testnet',
        secretKey: 888888n
      });

      operator.initRound({
        stateTreeDepth,
        intStateTreeDepth: 1,
        voteOptionTreeDepth,
        batchSize,
        maxVoteOptions,
        // More slots for multiple cycles
        isQuadraticCost: true,
        isAmaci: true
      });

      const coordPubKey = operator.getPubkey().toPoints();

      // Track account indices
      const accountHistory = [];

      // Cycle 1: SignUp → Deactivate → AddNewKey
      console.log('Cycle 1: Initial signup');
      const voter1 = new VoterClient({ network: 'testnet', secretKey: 999999n });
      operator.updateStateTree(0, voter1.getPubkey().toPoints(), 100);
      accountHistory.push({ idx: 0, status: 'active', cycle: 1 });

      // Vote
      let votePayload = voter1.buildVotePayload({
        stateIdx: 0,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 0, vc: 10 }]
      });
      votePayload.forEach((p) => {
        const message = p.msg.map((m) => BigInt(m));
        const encPubKey = p.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, encPubKey);
      });

      // Deactivate (push before endVotePeriod!)
      console.log('Cycle 1: Deactivate');
      const deactivatePayload = await voter1.buildDeactivatePayload({
        stateIdx: 0,
        operatorPubkey: coordPubKey
      });
      const deactivateMessage = deactivatePayload.msg.map((m) => BigInt(m));
      const deactivateEncPubKey = deactivatePayload.encPubkeys.map((k) => BigInt(k)) as [
        bigint,
        bigint
      ];
      operator.pushDeactivateMessage(deactivateMessage, deactivateEncPubKey);

      // End voting period and process all messages
      operator.endVotePeriod();
      await operator.processMessages();
      await operator.processDeactivateMessages({
        inputSize: 1,
        subStateTreeLength: 5 ** stateTreeDepth
      });

      accountHistory.push({ idx: 0, status: 'inactive', cycle: 1 });
      expect(operator.activeStateTree!.leaf(0)).to.not.equal(0n);

      console.log('✅ Cycle 1 completed: User deactivated');

      // Verification of multiple state changes
      console.log('\nFinal state verification:');
      console.log(
        `  - Account 0: activeStateTree = ${operator.activeStateTree!.leaf(0)} (inactive)`
      );
      console.log(
        `  - DeactivateTree[0]: ${operator.deactivateTree!.leaf(0)} (has rerandomized data)`
      );

      // Verify account history
      expect(accountHistory).to.have.lengthOf(2);
      expect(accountHistory[0]).to.deep.include({ idx: 0, status: 'active', cycle: 1 });
      expect(accountHistory[1]).to.deep.include({ idx: 0, status: 'inactive', cycle: 1 });

      console.log('✅ Multiple cycle simulation completed (limited by operator state management)');
    });
  });

  describe('Lifecycle Test 4: Concurrent Users with Different Paths', () => {
    it('should handle multiple users with different lifecycle paths', async () => {
      console.log('\n=== Test 1.4: Concurrent Users ===');

      const operator = new OperatorClient({
        network: 'testnet',
        secretKey: 101010n
      });

      operator.initRound({
        stateTreeDepth,
        intStateTreeDepth: 1,
        voteOptionTreeDepth,
        batchSize,
        maxVoteOptions,

        isQuadraticCost: true,
        isAmaci: true
      });

      const coordPubKey = operator.getPubkey().toPoints();

      // User A: Standard voting (no deactivate)
      const voterA = new VoterClient({ network: 'testnet', secretKey: 111n });
      operator.updateStateTree(0, voterA.getPubkey().toPoints(), 100);

      // User B: Vote → Deactivate
      const voterB = new VoterClient({ network: 'testnet', secretKey: 222n });
      operator.updateStateTree(1, voterB.getPubkey().toPoints(), 100);

      // User C: Standard voting
      const voterC = new VoterClient({ network: 'testnet', secretKey: 333n });
      operator.updateStateTree(2, voterC.getPubkey().toPoints(), 100);

      console.log('All users vote');
      [voterA, voterB, voterC].forEach((voter, idx) => {
        const payload = voter.buildVotePayload({
          stateIdx: idx,
          operatorPubkey: coordPubKey,
          selectedOptions: [{ idx: idx, vc: 10 + idx * 5 }]
        });
        payload.forEach((p) => {
          const message = p.msg.map((m) => BigInt(m));
          const encPubKey = p.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
          operator.pushMessage(message, encPubKey);
        });
      });

      // User B deactivates (before endVotePeriod!)
      console.log('User B deactivates');
      const deactivatePayloadB = await voterB.buildDeactivatePayload({
        stateIdx: 1,
        operatorPubkey: coordPubKey
      });
      const messageB = deactivatePayloadB.msg.map((m) => BigInt(m));
      const encPubKeyB = deactivatePayloadB.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
      operator.pushDeactivateMessage(messageB, encPubKeyB);

      // Process all messages
      operator.endVotePeriod();
      await operator.processMessages();
      console.log('✅ All votes processed');

      await operator.processDeactivateMessages({
        inputSize: 1,
        subStateTreeLength: 5 ** stateTreeDepth
      });

      // Verify states
      expect(operator.activeStateTree!.leaf(0)).to.equal(0n, 'User A active');
      expect(operator.activeStateTree!.leaf(1)).to.not.equal(0n, 'User B inactive');
      expect(operator.activeStateTree!.leaf(2)).to.equal(0n, 'User C active');

      console.log('✅ Concurrent users handled correctly');
    });
  });
});
