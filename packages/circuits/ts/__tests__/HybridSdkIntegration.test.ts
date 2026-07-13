import { VoterClient, OperatorClient, deriveCommitteeKey } from '@dorafactory/maci-sdk';
import { expect } from 'chai';
import { type WitnessTester } from 'circomkit';

import { getSignal, circomkitInstance, buildHybridVoterTree, buildProcessHybridMessagesInput } from './utils/utils';

/**
 * End-to-end SDK integration test for Hybrid MACI + AHE.
 *
 * Exercises the full off-chain flow through the SDK clients and cross-checks it
 * against the ZK circuit:
 *   VoterClient.genHybridMessageFactory  (encrypt ballot + sign routing)
 *     -> OperatorClient.processHybridBatch (decrypt routing, LWW, homomorphic sum)
 *       -> OperatorClient.decryptHybridAggregate (committee threshold decrypt)
 *   and the SAME messages fed into ProcessHybridMessages must yield the same tally.
 */
describe('Hybrid MACI + AHE SDK integration', function test() {
  this.timeout(600000);

  const STATE_TREE_DEPTH = 2;
  const B = 5; // batch size (ProcessHybridMessages_hybrid_2-1-5)
  const M = 5; // vote options (voteOptionTreeDepth = 1)
  const UNIFIED_BALANCE = 100n;
  const pollId = 1;
  const DLOG_BOUND = 1_000_000;

  const kc = 3141592653n;
  const Kc = deriveCommitteeKey(kc);

  let circuit: WitnessTester;

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('ProcessHybridMessages_hybrid_2-1-5', {
      file: 'hybrid/power/processHybridMessages',
      template: 'ProcessHybridMessages',
      params: [STATE_TREE_DEPTH, 1, B]
    });
  });

  it('tallies through VoterClient + OperatorClient and matches the circuit', async () => {
    const operator = new OperatorClient({ network: 'testnet', secretKey: 778899n });
    const voterA = new VoterClient({ network: 'testnet', secretKey: 121212n });
    const voterB = new VoterClient({ network: 'testnet', secretKey: 343434n });

    const coordPubKey = operator.getSigner().getPublicKey().toPoints() as [bigint, bigint];
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

    const factoryA = voterA.genHybridMessageFactory(coordPubKey, Kc, pollId, M);
    const factoryB = voterB.genHybridMessageFactory(coordPubKey, Kc, pollId, M);

    // A (stateIdx 0) votes opt0=2 then revotes opt2=9 (all nonce=1, reverse
    // processing LWW: latest submission index wins). B (stateIdx 1) votes opt1=4.
    const specs: { pub: [bigint, bigint]; stateIdx: number; nonce: number; msg: ReturnType<typeof factoryA> }[] = [
      { pub: pubA, stateIdx: 0, nonce: 1, msg: factoryA(0, 1, 0, 2) },
      { pub: pubA, stateIdx: 0, nonce: 1, msg: factoryA(0, 1, 2, 9) },
      { pub: pubB, stateIdx: 1, nonce: 1, msg: factoryB(1, 1, 1, 4) }
    ];

    const messages = specs.map((s) => ({
      routing: s.msg.routing,
      encPubKey: s.msg.encPubKey,
      ciphertexts: s.msg.ciphertexts
    }));
    const voterPubKeys = specs.map((s) => s.pub);

    // ---- Off-chain coordinator processing (no vote content decrypted) ----
    const { routingView, aggregate } = operator.processHybridBatch(messages, voterPubKeys, M);

    // Coordinator sees routing only; LWW keeps A's nonce-2 revision and B's vote.
    expect(routingView.every((r) => r.sigValid && r.commitmentValid)).to.equal(true);
    expect(routingView[0].survivor).to.equal(false); // superseded revision
    expect(routingView[1].survivor).to.equal(true);
    expect(routingView[2].survivor).to.equal(true);

    // ---- Committee threshold decryption of the aggregate ----
    const sdkTotals = OperatorClient.decryptHybridAggregate(aggregate, kc, DLOG_BOUND);
    expect(sdkTotals).to.deep.equal([0n, 4n, 9n, 0n, 0n]);

    // ---- Circuit must reproduce the identical aggregate (with the SAME
    // stateRoot/Merkle authentication the SDK's processHybridBatch models
    // implicitly by trusting the caller's voterPubKeys). ----
    const input = buildProcessHybridMessagesInput({
      coordPrivKey: operator.getSigner().getFormatedPrivKey(),
      messages,
      voterPubKeys,
      leaves: specs.map((s) => leafOf(s.stateIdx)),
      stateRoot,
      messageNonces: specs.map((s) => ({ stateIdx: s.stateIdx, nonce: s.nonce })),
      batchSize: B
    });

    const witness = await circuit.calculateWitness(input);
    await circuit.expectConstraintPass(witness);

    for (let opt = 0; opt < M; opt++) {
      const cAggC1x = await getSignal(circuit, witness, `aggC1[${opt}][0]`);
      const cAggC1y = await getSignal(circuit, witness, `aggC1[${opt}][1]`);
      const cAggC2x = await getSignal(circuit, witness, `aggC2[${opt}][0]`);
      const cAggC2y = await getSignal(circuit, witness, `aggC2[${opt}][1]`);
      expect([cAggC1x, cAggC1y]).to.deep.equal(aggregate[opt].c1, `aggC1 option ${opt}`);
      expect([cAggC2x, cAggC2y]).to.deep.equal(aggregate[opt].c2, `aggC2 option ${opt}`);
    }
  });
});
