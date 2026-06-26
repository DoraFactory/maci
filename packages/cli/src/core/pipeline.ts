/**
 * Presentation-agnostic orchestration for round verification and registry checks.
 *
 * This module performs all the I/O and computation but never touches the
 * terminal (no chalk, no process.exit). Progress and results are surfaced
 * through a typed event stream, so the same pipeline can drive:
 *   - the terminal renderer in commands/verify.ts (createStep/print*)
 *   - the local web UI server in ui/server.ts (SSE)
 */

import {
  getMsgChainLength,
  getNumSignUps,
  getStateCommitment,
  getTallyCommitment,
  getRoundPeriod,
  getOnChainVkeys,
  getRecheckChainConfig,
  type Groth16VkeyOnChain,
} from './chain.js';
import {
  getRoundInfo,
  getProofs,
  getMessageCount,
  getMessages,
  type ProofEntry,
} from './indexer.js';
import type {
  CheckResult,
  RoundSummary,
  VerificationReport,
} from './report.js';
import { resolveEndpoints, type NetworkName } from './network.js';
import { runLayer2, type RecheckResult } from './recheck.js';
import {
  AMACI_CIRCUITS,
  type AmaciCircuitEntry,
  type AmaciVkeySet,
} from './circuits.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse batchSize from circuit power string (e.g. "9-4-3-125" → 125) */
function parseBatchSize(circuitPower: string): number {
  const parts = circuitPower.split('-');
  const n = parseInt(parts[3] ?? '0', 10);
  return isNaN(n) ? 0 : n;
}

/** Group proofs by actionType */
function groupByAction(proofs: ProofEntry[]): Record<string, ProofEntry[]> {
  return proofs.reduce<Record<string, ProofEntry[]>>((acc, p) => {
    const key = p.actionType;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});
}

/** Find the last proof commitment of a given actionType (proofs ordered by timestamp asc) */
function lastCommitmentOf(proofs: ProofEntry[], actionType: string): string | null {
  const filtered = proofs.filter((p) => p.actionType === actionType);
  if (filtered.length === 0) return null;
  return filtered[filtered.length - 1].commitment;
}

/** Convert nanosecond Unix timestamp string to a readable UTC date string */
function fmtNanoTs(ns: string): string {
  try {
    const ms = Number(BigInt(ns) / 1_000_000n);
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  } catch {
    return ns;
  }
}

// ─── Layer 1: pure commitment audit (no I/O) ────────────────────────────────

type Layer1Data = {
  round: NonNullable<Awaited<ReturnType<typeof getRoundInfo>>>;
  proofs: ProofEntry[];
  onChainMsgChainLength: string;
  onChainSignUps: string;
  indexedMsgCount: number;
  onChainStateCommitment: string;
  onChainTallyCommitment: string;
};

function computeLayer1Checks(data: Layer1Data): { checks: CheckResult[]; overallPassed: boolean } {
  const { round, proofs, onChainMsgChainLength, onChainSignUps, indexedMsgCount, onChainStateCommitment, onChainTallyCommitment } = data;
  const checks: CheckResult[] = [];
  const byAction = groupByAction(proofs);

  // 1. Each proof type: all must have verifyResult === "true"
  const proofTypes = [
    { key: 'message', label: 'processMessage proofs' },
    { key: 'tally', label: 'tally proof' },
    { key: 'deactivate', label: 'deactivate proofs' },
  ];
  for (const { key, label } of proofTypes) {
    const group = byAction[key] ?? [];
    if (group.length === 0) continue;
    const allVerified = group.every((p) => p.verifyResult === 'true');
    const failedCount = group.filter((p) => p.verifyResult !== 'true').length;
    checks.push({
      label: `${label} (${group.length})`,
      passed: allVerified,
      detail: allVerified
        ? `all ${group.length} accepted on-chain`
        : `${failedCount} of ${group.length} NOT accepted on-chain`,
    });
  }

  // 2. Sign-up count: on-chain vs indexed
  checks.push({
    label: 'Sign-up count (on-chain vs indexed)',
    passed: BigInt(onChainSignUps) === BigInt(round.signUpsCount),
    detail: `on-chain: ${onChainSignUps}, indexed: ${round.signUpsCount}`,
  });

  // 3. Message coverage: batchSize × msgProofCount ≥ msgChainLength
  const batchSize = parseBatchSize(round.circuitPower);
  const msgProofCount = (byAction['message'] ?? []).length;
  const chainLength = BigInt(onChainMsgChainLength);
  const indexedLength = BigInt(indexedMsgCount);

  checks.push({
    label: 'MSG_CHAIN_LENGTH (on-chain vs indexed)',
    passed: chainLength === indexedLength,
    detail: `on-chain: ${chainLength}, indexed: ${indexedLength}`,
  });

  const coverage = BigInt(msgProofCount * batchSize);
  const coverageOk = coverage >= chainLength;
  checks.push({
    label: `Batch coverage (${msgProofCount}×${batchSize})`,
    passed: coverageOk,
    detail: `${coverage} ${coverageOk ? '≥' : '<'} ${chainLength} messages`,
  });

  // 3. State commitment: last message proof commitment == QueryCurrentStateCommitment
  const lastMsgCommitment = lastCommitmentOf(proofs, 'message');
  if (lastMsgCommitment !== null) {
    const stateMatch = BigInt(onChainStateCommitment) === BigInt(lastMsgCommitment);
    checks.push({
      label: 'State commitment (on-chain vs message proof)',
      passed: stateMatch,
      detail: stateMatch
        ? `0x${BigInt(onChainStateCommitment).toString(16).slice(0, 16)}...`
        : `on-chain:  ${onChainStateCommitment}\n    indexed:   ${lastMsgCommitment}`,
    });
  } else {
    checks.push({ label: 'State commitment', passed: false, detail: 'No message proof found in indexer' });
  }

  // 4. Tally commitment: last tally proof commitment == current_tally_commitment (raw)
  const lastTallyCommit = lastCommitmentOf(proofs, 'tally');
  if (lastTallyCommit !== null) {
    const tallyMatch = BigInt(onChainTallyCommitment) === BigInt(lastTallyCommit);
    checks.push({
      label: 'Tally commitment (on-chain vs tally proof)',
      passed: tallyMatch,
      detail: tallyMatch
        ? `0x${BigInt(onChainTallyCommitment).toString(16).slice(0, 16)}...`
        : `on-chain:  ${onChainTallyCommitment}\n    indexed:   ${lastTallyCommit}`,
    });
  } else {
    checks.push({ label: 'Tally commitment', passed: false, detail: 'No tally proof found in indexer' });
  }

  const overallPassed = checks.every((c) => c.passed);
  return { checks, overallPassed };
}

function recheckResultsToChecks(results: RecheckResult[]): CheckResult[] {
  return results.map((r) => ({
    label: `[L2] ${r.batchLabel}`,
    passed: r.passed,
    detail: r.detail,
  }));
}

// ─── Round verification pipeline ─────────────────────────────────────────────

export type RoundVerifyOptions = {
  contract: string;
  network: NetworkName;
  rpc?: string;
  indexer?: string;
  recheck: boolean;
};

export type PipelineEvent =
  | { type: 'step:start'; step: number; total: number; label: string }
  | { type: 'step:update'; step: number; detail: string }
  | { type: 'step:done'; step: number; detail?: string }
  | { type: 'step:fail'; step: number; detail?: string }
  | { type: 'summary'; summary: RoundSummary }
  | { type: 'report'; report: VerificationReport };

export type RoundRunResult =
  | {
      status: 'completed';
      overallPassed: boolean;
      summary: RoundSummary;
      report: VerificationReport;
    }
  | { status: 'error'; message: string };

export async function runRoundVerification(
  opts: RoundVerifyOptions,
  onEvent: (event: PipelineEvent) => void
): Promise<RoundRunResult> {
  const { contract, network, recheck } = opts;
  const { rpc, indexer } = resolveEndpoints(network, {
    rpc: opts.rpc,
    indexer: opts.indexer,
  });

  const total = recheck ? 9 : 5;
  let current = 0;
  const step = {
    start(label: string) {
      current += 1;
      onEvent({ type: 'step:start', step: current, total, label });
    },
    update(detail: string) {
      onEvent({ type: 'step:update', step: current, detail });
    },
    done(detail?: string) {
      onEvent({ type: 'step:done', step: current, detail });
    },
    fail(detail?: string) {
      onEvent({ type: 'step:fail', step: current, detail });
    },
  };

  try {
    // Step 1: round info from indexer
    step.start('Fetching round info from indexer');
    const round = await getRoundInfo(indexer, contract);
    if (!round) {
      step.fail('not found');
      return {
        status: 'error',
        message:
          `Round not found in indexer for contract ${contract}.\n` +
          `  Network: ${network}\n` +
          `  Indexer: ${indexer}\n` +
          `  Tip: Did you mean --network testnet?`,
      };
    }
    if (round.maciType !== 'aMACI') {
      step.fail(`not aMACI (got "${round.maciType}")`);
      return {
        status: 'error',
        message: `This CLI only supports aMACI rounds. Contract ${contract} is a "${round.maciType}" round.`,
      };
    }
    step.done(`${round.circuitName} · ${round.circuitPower} · ${round.status}`);

    // Step 2: proof records from indexer
    step.start('Fetching proof records from indexer');
    const proofs = await getProofs(indexer, contract);
    const byAction = groupByAction(proofs);
    const msgProofCount = (byAction['message'] ?? []).length;
    const tallyCount = (byAction['tally'] ?? []).length;
    const deactivateCount = (byAction['deactivate'] ?? []).length;
    step.done(
      `${proofs.length} records  (message×${msgProofCount}  tally×${tallyCount}  deactivate×${deactivateCount})`
    );

    // Step 3: on-chain counts (msg chain length + sign-ups) + indexed message count, all parallel
    step.start('Querying on-chain counts  (RPC + indexer, parallel)');
    const [onChainMsgChainLength, onChainSignUps, indexedMsgCount] = await Promise.all([
      getMsgChainLength(rpc, contract),
      getNumSignUps(rpc, contract),
      getMessageCount(indexer, contract),
    ]);
    step.done(
      `sign-ups: ${onChainSignUps}  messages: ${onChainMsgChainLength} (on-chain) / ${indexedMsgCount} (indexed)`
    );

    // Step 4: state commitment from RPC
    step.start('Querying state commitment  (RPC)');
    const onChainStateCommitment = await getStateCommitment(rpc, contract);
    step.done(`0x${BigInt(onChainStateCommitment).toString(16).slice(0, 16)}…`);

    // Step 5: tally commitment + round period (parallel)
    step.start('Querying tally commitment  (RPC)');
    const [onChainTallyCommitment, period] = await Promise.all([
      getTallyCommitment(rpc, contract),
      getRoundPeriod(rpc, contract).catch(() => round.status),
    ]);
    step.done(`0x${BigInt(onChainTallyCommitment).toString(16).slice(0, 16)}…`);

    // Emit round summary before the checks
    const summary: RoundSummary = {
      contractAddress: contract,
      network,
      circuitPower: round.circuitPower,
      circuitName: round.circuitName,
      status: period,
      operatorAddress: round.operatorAddress,
      votingStart: fmtNanoTs(round.votingStart),
      votingEnd: fmtNanoTs(round.votingEnd),
      signUpsOnChain: onChainSignUps,
      signUpsIndexed: String(round.signUpsCount),
      messagesOnChain: onChainMsgChainLength,
      messagesIndexed: String(indexedMsgCount),
    };
    onEvent({ type: 'summary', summary });

    // Pure computation — no more network calls for Layer 1
    const { checks: l1Checks, overallPassed: l1Passed } = computeLayer1Checks({
      round,
      proofs,
      onChainMsgChainLength,
      onChainSignUps,
      indexedMsgCount,
      onChainStateCommitment,
      onChainTallyCommitment,
    });

    // ── Layer 2 (--recheck) ──────────────────────────────────────────────────
    let l2Checks: CheckResult[] = [];
    let l2Passed = true;

    if (recheck) {
      const msgProofs = byAction['message'] ?? [];
      const tallyProofs = byAction['tally'] ?? [];

      // Step 6: download all messages
      step.start(`Downloading ${indexedMsgCount} messages from indexer`);
      const messages = await getMessages(indexer, contract, (n, totalMsgs) => {
        step.update(`${n}/${totalMsgs} messages`);
      });
      step.done(`${messages.length} messages downloaded`);

      // Step 7: fetch on-chain vkeys
      step.start('Fetching on-chain vkeys  (RPC)');
      const vkeys = await getOnChainVkeys(rpc, contract);
      step.done('process vkey + tally vkey loaded');

      // Step 8: fetch chain recheck config
      step.start('Fetching chain config for re-verification  (RPC)');
      const chainCfg = await getRecheckChainConfig(rpc, contract);
      step.done(
        `coordHash=0x${chainCfg.coordinatorHash.toString(16).slice(0, 8)}…  circuitType=${chainCfg.circuitType}`
      );

      // Step 9: run snarkjs verifications
      step.start(
        `Running snarkjs.groth16.verify  (${msgProofs.length} msg + ${tallyProofs.length} tally proofs)`
      );
      let proofsDone = 0;
      const recheckResults = await runLayer2(
        messages,
        msgProofs,
        tallyProofs,
        chainCfg,
        vkeys,
        round.circuitPower,
        (label) => {
          proofsDone++;
          step.update(`[${proofsDone}/${msgProofs.length + tallyProofs.length}] ${label}`);
        }
      );

      const failedL2 = recheckResults.filter((r) => !r.passed).length;
      if (failedL2 === 0) {
        step.done(`all ${recheckResults.length} proofs verified locally ✓`);
      } else {
        step.fail(`${failedL2}/${recheckResults.length} proofs FAILED local re-verification`);
      }

      l2Checks = recheckResultsToChecks(recheckResults);
      l2Passed = recheckResults.every((r) => r.passed);
    }

    const allChecks = [...l1Checks, ...l2Checks];
    const overallPassed = l1Passed && l2Passed;

    const report: VerificationReport = {
      contractAddress: contract,
      circuitPower: round.circuitPower,
      maciType: round.maciType,
      status: period,
      checks: allChecks,
      overallPassed,
    };
    onEvent({ type: 'report', report });

    return { status: 'completed', overallPassed, summary, report };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Registry vkey check ─────────────────────────────────────────────────────

function vkeysMatch(onChain: Groth16VkeyOnChain, registered: AmaciVkeySet): boolean {
  const fields = [
    'vk_alpha1',
    'vk_beta_2',
    'vk_gamma_2',
    'vk_delta_2',
    'vk_ic0',
    'vk_ic1',
  ] as const;
  return fields.every((f) => onChain[f] === registered[f]);
}

export type VkeyMatchResult = {
  power: string;
  entry: AmaciCircuitEntry;
  processMatch: boolean;
  tallyMatch: boolean;
  deactivateMatch: boolean | null;
  addNewKeyMatch: boolean | null;
};

/**
 * Scan all known aMACI circuits to find one whose vkeys match the on-chain values.
 */
export function findMatchingCircuit(
  processVkey: Groth16VkeyOnChain,
  tallyVkey: Groth16VkeyOnChain,
  deactivateVkey: Groth16VkeyOnChain | undefined,
  addNewKeyVkey: Groth16VkeyOnChain | undefined
): VkeyMatchResult | null {
  for (const [power, entry] of Object.entries(AMACI_CIRCUITS)) {
    const pm = vkeysMatch(processVkey, entry.vkeys.process);
    const tm = vkeysMatch(tallyVkey, entry.vkeys.tally);
    if (pm || tm) {
      const dm = deactivateVkey !== undefined
        ? vkeysMatch(deactivateVkey, entry.vkeys.deactivate)
        : null;
      const am = addNewKeyVkey !== undefined
        ? vkeysMatch(addNewKeyVkey, entry.vkeys.addNewKey)
        : null;
      return { power, entry, processMatch: pm, tallyMatch: tm, deactivateMatch: dm, addNewKeyMatch: am };
    }
  }
  return null;
}

export type RegistryCheckResult = {
  /** Whether a matching circuit was found in the registry */
  found: boolean;
  power: string;
  source: string;
  production: boolean;
  processMatch: boolean | null;
  tallyMatch: boolean | null;
  deactivateMatch: boolean | null;
  addNewKeyMatch: boolean | null;
  /** true when both process and tally vkeys match (exit code 0 condition) */
  passed: boolean;
};

/**
 * Fetch on-chain vkeys for a contract and compare against the built-in registry.
 */
export async function runRegistryCheck(
  contract: string,
  network: NetworkName,
  rpcOverride?: string
): Promise<RegistryCheckResult> {
  const { rpc } = resolveEndpoints(network, { rpc: rpcOverride });
  const vkeys = await getOnChainVkeys(rpc, contract);
  const match = findMatchingCircuit(
    vkeys.processVkey,
    vkeys.tallyVkey,
    vkeys.deactivateVkey,
    vkeys.addNewKeyVkey
  );

  if (!match) {
    return {
      found: false,
      power: 'UNKNOWN',
      source: 'not found in registry',
      production: false,
      processMatch: null,
      tallyMatch: null,
      deactivateMatch: null,
      addNewKeyMatch: null,
      passed: false,
    };
  }

  return {
    found: true,
    power: match.power,
    source: match.entry.source,
    production: match.entry.production,
    processMatch: match.processMatch,
    tallyMatch: match.tallyMatch,
    deactivateMatch: match.deactivateMatch,
    addNewKeyMatch: match.addNewKeyMatch,
    passed: match.processMatch && match.tallyMatch,
  };
}
