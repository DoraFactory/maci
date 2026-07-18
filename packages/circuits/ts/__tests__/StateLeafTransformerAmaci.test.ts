import { expect } from 'chai';
import { VoterClient, OperatorClient, poseidon, packElement, encryptOdevity } from '@dorafactory/maci-sdk';
import { type WitnessTester } from 'circomkit';

import { getSignal, circomkitInstance } from './utils/utils';

/**
 * StateLeafTransformer Circuit Tests for AMACI
 *
 * Circuit Location: packages/circuits/circom/amaci/power/stateLeafTransformer.circom
 *
 * The AMACI StateLeafTransformer extends the MACI version with:
 * - ElGamal-based active/deactivate status check (slC1/slC2/coordPrivKey/deactivate)
 * - Per-option vote weight cap (maxVotesPerOption, 0 = unlimited)
 * - PollId matching (cmdPollId/expectedPollId), delegated to MessageValidator
 *
 * Overall validity requires all three of:
 *   1 - decryptIsActive.isOdd   (state leaf is active, i.e. NOT deactivated)
 *   activate.out                (the `deactivate` input signal itself is 0)
 *   messageValidator.isValid    (command passes all 8 MessageValidator checks)
 * to sum to 3.
 */
describe('StateLeafTransformer AMACI Circuit Tests', function test() {
  this.timeout(300000);

  let circuit: WitnessTester<
    [
      'isQuadraticCost',
      'coordPrivKey',
      'numSignUps',
      'maxVoteOptions',
      'maxVotesPerOption',
      'cmdPollId',
      'expectedPollId',
      'slPubKey',
      'slVoiceCreditBalance',
      'slNonce',
      'slC1',
      'slC2',
      'currentVotesForOption',
      'cmdStateIndex',
      'cmdNewPubKey',
      'cmdVoteOptionIndex',
      'cmdNewVoteWeight',
      'cmdNonce',
      'cmdSigR8',
      'cmdSigS',
      'packedCommand',
      'deactivate'
    ],
    ['newSlPubKey', 'newSlNonce', 'isValid', 'newBalance']
  >;

  let voter: VoterClient;
  let keypair: any;
  let coordinator: OperatorClient;

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('StateLeafTransformer_AMACI', {
      file: 'amaci/power/stateLeafTransformer',
      template: 'StateLeafTransformer'
    });

    voter = new VoterClient({
      network: 'testnet',
      secretKey: 123456n
    });
    keypair = voter.getSigner();

    coordinator = new OperatorClient({
      network: 'testnet',
      secretKey: 111111n
    });
  });

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
      pollId: BigInt(pollId)
    };
  }

  // The simplest "active" ciphertext: c1 = c2 = [0, 0] decrypts to x = 0
  // (even), i.e. isOdd = 0, regardless of coordPrivKey.
  const ACTIVE_C1: [bigint, bigint] = [0n, 0n];
  const ACTIVE_C2: [bigint, bigint] = [0n, 0n];
  // Independent of `coordinator` (which is only created inside `before`),
  // so this can be evaluated eagerly at describe-body collection time.
  const coordPrivKey = new OperatorClient({ network: 'testnet', secretKey: 111111n })
    .getSigner()
    .getFormatedPrivKey();

  function baseInputs(overrides: {
    isQuadraticCost?: bigint;
    numSignUps?: bigint;
    maxVoteOptions?: bigint;
    maxVotesPerOption?: bigint;
    expectedPollId?: bigint;
    cmdPollId?: number;
    slVoiceCreditBalance?: bigint;
    slNonce?: bigint;
    slC1?: [bigint, bigint];
    slC2?: [bigint, bigint];
    currentVotesForOption?: bigint;
    cmdStateIndex?: bigint;
    cmdNewPubKey?: [bigint, bigint];
    cmdVoteOptionIndex?: bigint;
    cmdNewVoteWeight?: bigint;
    cmdNonce?: bigint;
    deactivate?: bigint;
    wrongSig?: boolean;
  } = {}) {
    const isQuadraticCost = overrides.isQuadraticCost ?? 0n;
    const numSignUps = overrides.numSignUps ?? 10n;
    const maxVoteOptions = overrides.maxVoteOptions ?? 5n;
    const maxVotesPerOption = overrides.maxVotesPerOption ?? 0n;
    const expectedPollId = overrides.expectedPollId ?? 1n;
    const slPubKey = keypair.getPublicKey().toPoints() as [bigint, bigint];
    const slVoiceCreditBalance = overrides.slVoiceCreditBalance ?? 100n;
    const slNonce = overrides.slNonce ?? 0n;
    const slC1 = overrides.slC1 ?? ACTIVE_C1;
    const slC2 = overrides.slC2 ?? ACTIVE_C2;
    const currentVotesForOption = overrides.currentVotesForOption ?? 0n;
    const cmdStateIndex = overrides.cmdStateIndex ?? 0n;
    const cmdNewPubKey = overrides.cmdNewPubKey ?? ([111222333n, 444555666n] as [bigint, bigint]);
    const cmdVoteOptionIndex = overrides.cmdVoteOptionIndex ?? 1n;
    const cmdNewVoteWeight = overrides.cmdNewVoteWeight ?? 10n;
    const cmdNonce = overrides.cmdNonce ?? slNonce + 1n;
    const deactivate = overrides.deactivate ?? 0n;

    const { cmd, sigR8, sigS, pollId } = createValidCommand(
      Number(cmdStateIndex),
      Number(cmdVoteOptionIndex),
      cmdNewVoteWeight,
      Number(cmdNonce),
      cmdNewPubKey,
      overrides.cmdPollId ?? 1
    );

    let finalSigR8 = sigR8;
    let finalSigS = sigS;
    if (overrides.wrongSig) {
      const wrongSignature = keypair.sign(poseidon([cmd[0] + 1n, cmd[1], cmd[2]]));
      finalSigR8 = wrongSignature.R8 as [bigint, bigint];
      finalSigS = wrongSignature.S;
    }

    return {
      isQuadraticCost,
      coordPrivKey,
      numSignUps,
      maxVoteOptions,
      maxVotesPerOption,
      cmdPollId: pollId,
      expectedPollId,
      slPubKey,
      slVoiceCreditBalance,
      slNonce,
      slC1,
      slC2,
      currentVotesForOption,
      cmdStateIndex,
      cmdNewPubKey,
      cmdVoteOptionIndex,
      cmdNewVoteWeight,
      cmdNonce,
      cmdSigR8: finalSigR8,
      cmdSigS: finalSigS,
      packedCommand: cmd,
      deactivate
    };
  }

  describe('Baseline Validation (active user, maxVotesPerOption = 0)', () => {
    it('should update state leaf for a valid first vote (linear cost)', async () => {
      const circuitInputs = baseInputs({ cmdNewVoteWeight: 10n });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(1n);
      expect(await getSignal(circuit, witness, 'newSlNonce')).to.equal(1n);
      expect(await getSignal(circuit, witness, 'newBalance')).to.equal(90n);
    });

    it('should update state leaf for a valid vote (quadratic cost)', async () => {
      const circuitInputs = baseInputs({ isQuadraticCost: 1n, cmdNewVoteWeight: 5n });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(1n);
      expect(await getSignal(circuit, witness, 'newBalance')).to.equal(75n); // 100 - 5^2
    });

    it('should preserve state when the command signature is invalid', async () => {
      const circuitInputs = baseInputs({ wrongSig: true });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(0n);
      expect(await getSignal(circuit, witness, 'newSlNonce')).to.equal(circuitInputs.slNonce);
    });

    it('should preserve state when nonce is incorrect', async () => {
      const circuitInputs = baseInputs({ slNonce: 5n, cmdNonce: 7n }); // should be 6

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(0n);
      expect(await getSignal(circuit, witness, 'newSlNonce')).to.equal(5n);
    });
  });

  describe('Deactivation Status Interaction (ElGamal)', () => {
    it('should reject the command when the state leaf ciphertext decrypts as deactivated', async () => {
      const coordPubKey = coordinator.getPubkey().toPoints() as [bigint, bigint];
      const deactivated = encryptOdevity(true, coordPubKey, 987654321n);

      const circuitInputs = baseInputs({
        slC1: [deactivated.c1.x, deactivated.c1.y],
        slC2: [deactivated.c2.x, deactivated.c2.y]
      });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(
        0n,
        'A deactivated user cannot vote, even with an otherwise valid+in-cap command'
      );
      expect(await getSignal(circuit, witness, 'newSlNonce')).to.equal(circuitInputs.slNonce);
    });

    it('should accept the command when the state leaf ciphertext decrypts as active', async () => {
      const coordPubKey = coordinator.getPubkey().toPoints() as [bigint, bigint];
      const active = encryptOdevity(false, coordPubKey, 123456789n);

      const circuitInputs = baseInputs({
        slC1: [active.c1.x, active.c1.y],
        slC2: [active.c2.x, active.c2.y]
      });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(1n);
    });

    it('should reject the command when the `deactivate` input flag itself is set', async () => {
      const circuitInputs = baseInputs({ deactivate: 1n });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(0n);
    });
  });

  describe('Per-Option Vote Cap Enforcement (maxVotesPerOption)', () => {
    it('should accept any vote weight within balance when cap is 0 (unlimited)', async () => {
      const circuitInputs = baseInputs({ maxVotesPerOption: 0n, cmdNewVoteWeight: 90n });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(1n);
    });

    it('should update state leaf for a vote exactly at the cap', async () => {
      const circuitInputs = baseInputs({ maxVotesPerOption: 10n, cmdNewVoteWeight: 10n });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(1n);
      expect(await getSignal(circuit, witness, 'newSlNonce')).to.equal(circuitInputs.cmdNonce);
    });

    it('should preserve state (reject) for a vote exceeding the cap by 1', async () => {
      const circuitInputs = baseInputs({ maxVotesPerOption: 10n, cmdNewVoteWeight: 11n });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(0n);
      expect(await getSignal(circuit, witness, 'newSlNonce')).to.equal(circuitInputs.slNonce);

      const newSlPubKey0 = await getSignal(circuit, witness, 'newSlPubKey[0]');
      expect(newSlPubKey0).to.equal(circuitInputs.slPubKey[0], 'Should preserve original public key');
    });

    it('should reject an over-cap vote under quadratic cost even when balance is sufficient', async () => {
      const circuitInputs = baseInputs({
        isQuadraticCost: 1n,
        maxVotesPerOption: 5n,
        cmdNewVoteWeight: 6n, // costs 36, affordable, but over the cap of 5
        slVoiceCreditBalance: 100n
      });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(0n);
    });

    it('should combine cap enforcement with active deactivation status correctly', async () => {
      // Over-cap AND deactivated: still simply invalid, no double-counting weirdness.
      const coordPubKey = coordinator.getPubkey().toPoints() as [bigint, bigint];
      const deactivated = encryptOdevity(true, coordPubKey, 555555555n);

      const circuitInputs = baseInputs({
        maxVotesPerOption: 10n,
        cmdNewVoteWeight: 20n,
        slC1: [deactivated.c1.x, deactivated.c1.y],
        slC2: [deactivated.c2.x, deactivated.c2.y]
      });

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      expect(await getSignal(circuit, witness, 'isValid')).to.equal(0n);
    });
  });
});
