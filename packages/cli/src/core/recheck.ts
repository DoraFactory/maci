/**
 * Layer 2: local ZK re-verification using snarkjs.
 *
 * This module re-executes groth16.verify() locally for each indexed proof,
 * reconstructing the exact publicSignals (input_hash) that the contract used.
 *
 * Flow:
 *   1. Fetch all messages → rebuild MSG_HASHES chain (for processMessage proofs)
 *   2. Query chain config (coordHash, deactivateCommitment, pollId, stateRoot, …)
 *   3. For each processMessage proof: reconstruct 8-element inputs → compute input_hash
 *   4. For each tally proof: reconstruct 4-element inputs → compute input_hash
 *   5. Call snarkjs.groth16.verify(vkey, [inputHash], proof) for each
 *
 * Circuit → verifying key mapping:
 *   processMessage proofs → on-chain groth16_process_vkeys
 *   tally proofs          → on-chain groth16_tally_vkeys
 *   (deactivate proofs are skipped — require DMSG_HASHES which the indexer
 *    does not currently expose per-batch)
 */

import type { ProofEntry } from './indexer.js';
import type { IndexedMessage } from './indexer.js';
import type { RecheckChainConfig } from './chain.js';
import type { OnChainVkeys } from './chain.js';
import { buildMsgHashChain, computeProcessBatches } from './msgHash.js';
import { computeInputHash } from './inputHash.js';
import { chainVkeyToSnarkjs } from './vkey.js';
import { parseIndexerProof, hexProofToSnarkjs } from './proof.js';
import { poseidon2 } from './poseidon.js';

export type RecheckResult = {
  proofType: 'message' | 'tally' | 'skipped';
  proofIndex: number;
  batchLabel: string;
  passed: boolean;
  detail: string;
};

type SnarkjsModule = {
  groth16: {
    verify(
      vkey: unknown,
      publicSignals: string[],
      proof: unknown
    ): Promise<boolean>;
  };
};

let _snarkjs: SnarkjsModule | null = null;

async function loadSnarkjs(): Promise<SnarkjsModule> {
  if (_snarkjs) return _snarkjs;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = await import('snarkjs') as any;
  _snarkjs = (mod.default ?? mod) as SnarkjsModule;
  if (!_snarkjs?.groth16?.verify) {
    throw new Error('Failed to load snarkjs.groth16.verify');
  }
  return _snarkjs;
}

/** Parse circuit power string e.g. "9-4-3-125" → batchSize=125, intDepth=4 */
function parseCircuitPower(power: string): { batchSize: number; intStateTreeDepth: number } {
  const parts = power.split('-').map(Number);
  if (parts.length < 4 || parts.some(isNaN)) {
    throw new Error(`Cannot parse circuit power: ${power}`);
  }
  return { batchSize: parts[3], intStateTreeDepth: parts[1] };
}

/** Tally batch size = 5^intStateTreeDepth */
function tallyBatchSize(intStateTreeDepth: number): bigint {
  return 5n ** BigInt(intStateTreeDepth);
}

/**
 * Run Layer 2 ZK re-verification for all processMessage and tally proofs.
 *
 * @param messages     - All indexed messages ordered by msgChainLength ASC
 * @param msgProofs    - processMessage ProofEntry list, ordered by timestamp ASC
 * @param tallyProofs  - tally ProofEntry list, ordered by timestamp ASC
 * @param chainCfg     - on-chain config (coordHash, deactivateCommitment, etc.)
 * @param vkeys        - on-chain vkeys (process + tally)
 * @param circuitPower - circuit power string, e.g. "9-4-3-125"
 * @param onProgress   - optional step callback
 */
export async function runLayer2(
  messages: IndexedMessage[],
  msgProofs: ProofEntry[],
  tallyProofs: ProofEntry[],
  chainCfg: RecheckChainConfig,
  vkeys: OnChainVkeys,
  circuitPower: string,
  onProgress?: (step: string) => void
): Promise<RecheckResult[]> {
  const snarkjs = await loadSnarkjs();
  const { batchSize, intStateTreeDepth } = parseCircuitPower(circuitPower);
  const results: RecheckResult[] = [];

  // Convert vkeys once
  const processVkey = chainVkeyToSnarkjs(vkeys.processVkey);
  const tallyVkey = chainVkeyToSnarkjs(vkeys.tallyVkey);

  // ── Step A: Rebuild MSG_HASHES chain ──────────────────────────────────────
  onProgress?.('Rebuilding MSG_HASHES chain');
  const msgHashChain = buildMsgHashChain(messages);
  // msgHashChain[i] = MSG_HASHES[i]

  const totalMessages = messages.length;

  // ── Step B: Initial state commitment ──────────────────────────────────────
  // initial_state_commitment = hash2([stateRoot, 0])
  // set by start_process_period, before any processMessage call
  const initialStateCommitment = poseidon2(chainCfg.stateTreeRoot, 0n);

  // ── Step C: Compute processMessage batch layout ────────────────────────────
  // The contract processes from END → START, so:
  //   msgProofs[0] (first submitted) = last batch   (highest batchStart)
  //   msgProofs[N-1] (last submitted) = first batch (batchStart = 0)
  const batches = computeProcessBatches(totalMessages, batchSize);
  // batches[k] corresponds to msgProofs[k]

  // ── Step D: Verify processMessage proofs ──────────────────────────────────
  let prevStateCommitment = initialStateCommitment;

  for (let k = 0; k < msgProofs.length; k++) {
    const proof = msgProofs[k];
    const batch = batches[k];

    if (!batch) {
      results.push({
        proofType: 'message',
        proofIndex: k,
        batchLabel: `batch[${k}]`,
        passed: false,
        detail: `No batch layout computed for proof index ${k}`,
      });
      continue;
    }

    const label = `msg[${k}] batch ${batch.batchStart}→${batch.batchEnd}`;
    onProgress?.(`Verifying processMessage proof ${k + 1}/${msgProofs.length} (${label})`);

    try {
      const batchStartHash = msgHashChain[batch.batchStart];
      const batchEndHash = msgHashChain[batch.batchEnd];
      const newStateCommitment = BigInt(proof.commitment);

      if (batchStartHash === undefined || batchEndHash === undefined) {
        throw new Error(
          `MSG_HASHES index out of range: batchStart=${batch.batchStart}, batchEnd=${batch.batchEnd}, chain length=${msgHashChain.length}`
        );
      }

      // packedVals: circuit_type == 0 (1p1v) or 1 (qv)
      let packedVals: bigint;
      if (chainCfg.circuitType === 0n) {
        packedVals = (chainCfg.numSignUps << 32n) + chainCfg.maxVoteOptions;
      } else {
        packedVals =
          (chainCfg.numSignUps << 32n) +
          (chainCfg.circuitType << 64n) +
          chainCfg.maxVoteOptions;
      }

      const inputs: bigint[] = [
        packedVals,                        // [0] packedVals
        chainCfg.coordinatorHash,          // [1] coordPubKeyHash
        batchStartHash,                    // [2] batchStartHash = MSG_HASHES[batchStart]
        batchEndHash,                      // [3] batchEndHash   = MSG_HASHES[batchEnd]
        prevStateCommitment,               // [4] currentStateCommitment (before this batch)
        newStateCommitment,                // [5] newStateCommitment
        chainCfg.deactivateCommitment,     // [6] currentDeactivateCommitment
        chainCfg.pollId,                   // [7] pollId
      ];

      const inputHash = computeInputHash(inputs);
      const proofHex = parseIndexerProof(proof.proof);
      if (!proofHex) {
        throw new Error(`Cannot parse indexed proof JSON: ${proof.proof?.slice(0, 80)}`);
      }
      const snarkjsProof = hexProofToSnarkjs(proofHex);

      const passed = await snarkjs.groth16.verify(
        processVkey,
        [inputHash.toString()],
        snarkjsProof
      );

      results.push({
        proofType: 'message',
        proofIndex: k,
        batchLabel: label,
        passed,
        detail: passed
          ? `inputHash=0x${inputHash.toString(16).slice(0, 16)}…`
          : `ZK verification FAILED  inputHash=0x${inputHash.toString(16)}`,
      });

      // Next batch's prevStateCommitment = this batch's newStateCommitment
      prevStateCommitment = newStateCommitment;
    } catch (err) {
      results.push({
        proofType: 'message',
        proofIndex: k,
        batchLabel: label,
        passed: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Step E: Verify tally proofs ───────────────────────────────────────────
  // Tally inputs (4 slots):
  //   [0] packedVals = (numSignUps << 32) + batch_num
  //   [1] stateCommitment = final state commitment (constant during tally)
  //   [2] currentTallyCommitment (before this batch, 0 for first)
  //   [3] newTallyCommitment = this proof's commitment
  //
  // State commitment used in tally = CURRENT_STATE_COMMITMENT after all processMessages
  // = the commitment of the LAST processMessage proof
  const finalStateCommitment =
    msgProofs.length > 0
      ? BigInt(msgProofs[msgProofs.length - 1].commitment)
      : initialStateCommitment;

  const tallyBS = tallyBatchSize(intStateTreeDepth);
  let currentTallyCommitment = 0n;

  for (let k = 0; k < tallyProofs.length; k++) {
    const proof = tallyProofs[k];
    const batchNum = BigInt(k);
    const label = `tally[${k}] batch_num=${batchNum}`;
    onProgress?.(`Verifying tally proof ${k + 1}/${tallyProofs.length} (${label})`);

    try {
      const newTallyCommitment = BigInt(proof.commitment);

      const packedVals = (chainCfg.numSignUps << 32n) + batchNum;
      const inputs: bigint[] = [
        packedVals,               // [0] (numSignUps << 32) + batchNum
        finalStateCommitment,     // [1] stateCommitment (constant)
        currentTallyCommitment,   // [2] currentTallyCommitment (before this batch)
        newTallyCommitment,       // [3] newTallyCommitment
      ];

      const inputHash = computeInputHash(inputs);
      const proofHex = parseIndexerProof(proof.proof);
      if (!proofHex) {
        throw new Error(`Cannot parse indexed proof JSON: ${proof.proof?.slice(0, 80)}`);
      }
      const snarkjsProof = hexProofToSnarkjs(proofHex);

      const passed = await snarkjs.groth16.verify(
        tallyVkey,
        [inputHash.toString()],
        snarkjsProof
      );

      results.push({
        proofType: 'tally',
        proofIndex: k,
        batchLabel: label,
        passed,
        detail: passed
          ? `inputHash=0x${inputHash.toString(16).slice(0, 16)}…`
          : `ZK verification FAILED  inputHash=0x${inputHash.toString(16)}`,
      });

      // Next tally's prevTallyCommitment = this batch's newTallyCommitment
      currentTallyCommitment = newTallyCommitment;

      // tally batch size sanity check (informational)
      void tallyBS;
    } catch (err) {
      results.push({
        proofType: 'tally',
        proofIndex: k,
        batchLabel: label,
        passed: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
