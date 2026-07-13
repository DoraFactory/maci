import {
  VoterClient,
  OperatorClient,
  deriveCommitteeKey,
  committeePartial,
  recoverAhe,
  solveDLog,
  aggregateAhe,
  AheCiphertext
} from '@dorafactory/maci-sdk';
import { expect } from 'chai';
import { type WitnessTester } from 'circomkit';

import { getSignal, circomkitInstance, buildHybridVoterTree, buildProcessHybridMessagesInput } from './utils/utils';

/**
 * ProcessHybridMessages circuit tests.
 *
 * Circuit: packages/circuits/circom/hybrid/power/processHybridMessages.circom
 *
 * The coordinator decrypts only routing (stateIdx / nonce / sig), applies
 * plaintext last-write-wins, and homomorphically aggregates surviving ballots
 * without ever seeing optionIdx / weight -- the ciphertext vector is only
 * addressed to the committee key Kc. It also Merkle-authenticates each real
 * message's `voterPubKey` against the public `stateRoot` (anti-selective-
 * censorship: the coordinator cannot silently drop a real voter's message
 * and claim a smaller `actualCount` without changing the batch's real
 * survivors/aggregate). The committee decrypts only the per-option aggregate.
 */
describe('ProcessHybridMessages circuit (Hybrid MACI + AHE)', function test() {
  this.timeout(600000);

  const STATE_TREE_DEPTH = 2;
  const B = 5; // batch size (ProcessHybridMessages_hybrid_2-1-5)
  const M = 5; // vote options (voteOptionTreeDepth = 1)
  const UNIFIED_BALANCE = 100n;
  const pollId = 1;
  const DLOG_BOUND = 1_000_000;

  const kc = 55555555n;
  const Kc = deriveCommitteeKey(kc);

  const coord = new OperatorClient({ network: 'testnet', secretKey: 24680n });
  const coordPubKey = coord.getSigner().getPublicKey().toPoints() as [bigint, bigint];
  const voterA = new VoterClient({ network: 'testnet', secretKey: 111111n });
  const voterB = new VoterClient({ network: 'testnet', secretKey: 222222n });
  const pubA = voterA.getSigner().getPublicKey().toPoints() as [bigint, bigint];
  const pubB = voterB.getSigner().getPublicKey().toPoints() as [bigint, bigint];

  const { tree, stateRoot } = buildHybridVoterTree(
    [
      { pubKey: pubA, balance: UNIFIED_BALANCE },
      { pubKey: pubB, balance: UNIFIED_BALANCE }
    ],
    STATE_TREE_DEPTH
  );
  const leafOf = (stateIdx: number) => ({
    voiceCreditBalance: UNIFIED_BALANCE,
    voteOptionTreeRoot: 0n,
    slNonce: 0n,
    pathElements: tree.pathElementOf(stateIdx) as bigint[][]
  });

  let circuit: WitnessTester;

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('ProcessHybridMessages_hybrid_2-1-5', {
      file: 'hybrid/power/processHybridMessages',
      template: 'ProcessHybridMessages',
      params: [STATE_TREE_DEPTH, 1, B]
    });
  });

  it('decrypts routing, applies LWW, and homomorphically tallies (with a revote)', async () => {
    // Scenario (all nonces=1, forward submission order):
    //   msg0: voter A (stateIdx 0, nonce 1) -> option 0, weight 3   (superseded: processed LAST)
    //   msg1: voter A (stateIdx 0, nonce 1) -> option 1, weight 5   (survives: processed 2nd, nonce OK)
    //   msg2: voter B (stateIdx 1, nonce 1) -> option 0, weight 4   (survives: processed FIRST)
    // Circuit reverses: i=2 first (V2 nonce=1, currentNonce[1]=0 → VALID),
    //                   i=1 next  (V0 nonce=1, currentNonce[0]=0 → VALID, sets nonce[0]=1),
    //                   i=0 last  (V0 nonce=1, currentNonce[0]=1 → INVALID: 1≠2).
    // Expected tally: option0 = 4 (V2), option1 = 5 (V0 revote), rest = 0.
    const genA = voterA.genHybridMessageFactory(coordPubKey, Kc, pollId, M);
    const genB = voterB.genHybridMessageFactory(coordPubKey, Kc, pollId, M);
    const specs = [
      { pub: pubA, stateIdx: 0, nonce: 1, msg: genA(0, 1, 0, 3) },
      { pub: pubA, stateIdx: 0, nonce: 1, msg: genA(0, 1, 1, 5) },
      { pub: pubB, stateIdx: 1, nonce: 1, msg: genB(1, 1, 0, 4) }
    ];

    const input = buildProcessHybridMessagesInput({
      coordPrivKey: coord.getSigner().getFormatedPrivKey(),
      messages: specs.map((s) => s.msg),
      voterPubKeys: specs.map((s) => s.pub),
      leaves: specs.map((s) => leafOf(s.stateIdx)),
      stateRoot,
      messageNonces: specs.map((s) => ({ stateIdx: s.stateIdx, nonce: s.nonce })),
      batchSize: B
    });

    const witness = await circuit.calculateWitness(input);
    await circuit.expectConstraintPass(witness);

    // Read the aggregate ciphertext per option and threshold-decrypt (single kc).
    const decrypted: bigint[] = [];
    for (let opt = 0; opt < M; opt++) {
      const aggC1: [bigint, bigint] = [
        await getSignal(circuit, witness, `aggC1[${opt}][0]`),
        await getSignal(circuit, witness, `aggC1[${opt}][1]`)
      ];
      const aggC2: [bigint, bigint] = [
        await getSignal(circuit, witness, `aggC2[${opt}][0]`),
        await getSignal(circuit, witness, `aggC2[${opt}][1]`)
      ];
      const shared = committeePartial(aggC1, kc);
      const vG = recoverAhe({ c1: aggC1, c2: aggC2 }, shared);
      const total = solveDLog(vG, DLOG_BOUND);
      decrypted.push(total ?? -1n);
    }

    expect(decrypted).to.deep.equal([4n, 5n, 0n, 0n, 0n]);
  });

  it('matches an off-circuit reference tally computed via SDK LWW + homomorphic sum', async () => {
    const coord2 = new OperatorClient({ network: 'testnet', secretKey: 13579n });
    const coordPubKey2 = coord2.getSigner().getPublicKey().toPoints() as [bigint, bigint];
    const genA = voterA.genHybridMessageFactory(coordPubKey2, Kc, pollId, M);
    const genB = voterB.genHybridMessageFactory(coordPubKey2, Kc, pollId, M);

    // All nonces=1, forward submission order. V2 revotes (last submission
    // for stateIdx 1) wins because circuit processes in reverse (newest first).
    const specs = [
      { pub: pubB, stateIdx: 1, nonce: 1, msg: genB(1, 1, 2, 2) },  // V2 original (superseded)
      { pub: pubA, stateIdx: 0, nonce: 1, msg: genA(0, 1, 0, 7) },  // V1 vote (survives)
      { pub: pubB, stateIdx: 1, nonce: 1, msg: genB(1, 1, 1, 6) }   // V2 revote (survives, nonce was 2)
    ];

    // Off-circuit reference: last submission per stateIdx wins (highest chain
    // index = highest spec index), then homomorphically sum surviving ballots.
    const survivorByState = new Map<number, number>();
    specs.forEach((s, i) => survivorByState.set(s.stateIdx, i)); // last write per stateIdx
    const survivors = [...survivorByState.values()];
    const refDecrypted: bigint[] = [];
    for (let opt = 0; opt < M; opt++) {
      const cts: AheCiphertext[] = survivors.map((i) => specs[i].msg.ciphertexts[opt]);
      const agg = aggregateAhe(cts);
      const shared = committeePartial(agg.c1, kc);
      refDecrypted.push(solveDLog(recoverAhe(agg, shared), DLOG_BOUND) ?? -1n);
    }
    // Sanity on the reference itself: A(opt0)=7, B survivor idx2 (opt1)=6.
    expect(refDecrypted).to.deep.equal([7n, 6n, 0n, 0n, 0n]);

    const input = buildProcessHybridMessagesInput({
      coordPrivKey: coord2.getSigner().getFormatedPrivKey(),
      messages: specs.map((s) => s.msg),
      voterPubKeys: specs.map((s) => s.pub),
      leaves: specs.map((s) => leafOf(s.stateIdx)),
      stateRoot,
      messageNonces: specs.map((s) => ({ stateIdx: s.stateIdx, nonce: s.nonce })),
      batchSize: B
    });

    const witness = await circuit.calculateWitness(input);
    await circuit.expectConstraintPass(witness);

    for (let opt = 0; opt < M; opt++) {
      const aggC1: [bigint, bigint] = [
        await getSignal(circuit, witness, `aggC1[${opt}][0]`),
        await getSignal(circuit, witness, `aggC1[${opt}][1]`)
      ];
      const aggC2: [bigint, bigint] = [
        await getSignal(circuit, witness, `aggC2[${opt}][0]`),
        await getSignal(circuit, witness, `aggC2[${opt}][1]`)
      ];
      const shared = committeePartial(aggC1, kc);
      const total = solveDLog(recoverAhe({ c1: aggC1, c2: aggC2 }, shared), DLOG_BOUND);
      expect(total).to.equal(refDecrypted[opt], `option ${opt}: circuit vs reference`);
    }
  });

  it('rejects a message whose published ciphertext does not match the signed commitment', async () => {
    const coord3 = new OperatorClient({ network: 'testnet', secretKey: 2468n });
    const coordPubKey3 = coord3.getSigner().getPublicKey().toPoints() as [bigint, bigint];
    const genA = voterA.genHybridMessageFactory(coordPubKey3, Kc, pollId, M);
    const genB = voterB.genHybridMessageFactory(coordPubKey3, Kc, pollId, M);

    const specs = [
      { pub: pubA, stateIdx: 0, nonce: 1, msg: genA(0, 1, 0, 3) },
      { pub: pubB, stateIdx: 1, nonce: 1, msg: genB(1, 1, 1, 2) },
      { pub: pubB, stateIdx: 1, nonce: 1, msg: genB(1, 1, 2, 1) }
    ];

    // Tamper: swap msg0's first ciphertext coordinate so it no longer matches
    // the signed aheCommitment.
    const FIELD_P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
    const tamperedMessages = specs.map((s, i) => {
      if (i !== 0) return s.msg;
      const ciphertexts = s.msg.ciphertexts.map((ct) => ({ c1: [...ct.c1] as [bigint, bigint], c2: ct.c2 }));
      ciphertexts[0].c1[0] = (ciphertexts[0].c1[0] + 1n) % FIELD_P;
      return { ...s.msg, ciphertexts };
    });

    const input = buildProcessHybridMessagesInput({
      coordPrivKey: coord3.getSigner().getFormatedPrivKey(),
      messages: tamperedMessages,
      voterPubKeys: specs.map((s) => s.pub),
      leaves: specs.map((s) => leafOf(s.stateIdx)),
      stateRoot,
      messageNonces: specs.map((s) => ({ stateIdx: s.stateIdx, nonce: s.nonce })),
      batchSize: B
    });

    let threw = false;
    try {
      const witness = await circuit.calculateWitness(input);
      await circuit.expectConstraintPass(witness);
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
  });

  it('rejects a message whose voterPubKey is NOT the real registered key at stateIdx under stateRoot', async () => {
    const coord4 = new OperatorClient({ network: 'testnet', secretKey: 987123n });
    const coordPubKey4 = coord4.getSigner().getPublicKey().toPoints() as [bigint, bigint];
    const genA = voterA.genHybridMessageFactory(coordPubKey4, Kc, pollId, M);

    const specs = [{ pub: pubA, stateIdx: 0, nonce: 1, msg: genA(0, 1, 0, 3) }];

    const input = buildProcessHybridMessagesInput({
      coordPrivKey: coord4.getSigner().getFormatedPrivKey(),
      messages: specs.map((s) => s.msg),
      // Claim voter B's pubkey authenticates stateIdx 0 (which is really voter A's slot).
      voterPubKeys: [pubB],
      leaves: specs.map((s) => leafOf(s.stateIdx)),
      stateRoot,
      messageNonces: specs.map((s) => ({ stateIdx: s.stateIdx, nonce: s.nonce })),
      batchSize: B
    });

    let threw = false;
    try {
      const witness = await circuit.calculateWitness(input);
      await circuit.expectConstraintPass(witness);
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
  });
});
