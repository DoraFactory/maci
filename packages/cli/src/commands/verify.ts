import type { CommandModule, Argv, ArgumentsCamelCase } from 'yargs';
import {
  getMsgChainLength,
  getNumSignUps,
  getStateCommitment,
  getTallyCommitment,
  getRoundPeriod,
  getOnChainVkeys,
  getRecheckChainConfig,
} from '../core/chain.js';
import {
  getRoundInfo,
  getProofs,
  getMessageCount,
  getMessages,
  type ProofEntry,
} from '../core/indexer.js';
import {
  createStep,
  printRoundSummary,
  printVerificationReport,
  printError,
  type CheckResult,
} from '../core/report.js';
import {
  resolveEndpoints,
  NETWORK_CHOICES,
  type NetworkName,
} from '../core/network.js';
import { runLayer2, type RecheckResult } from '../core/recheck.js';

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

// ─── Layer 1: pure commitment audit (no I/O) ────────────────────────────────

/** Convert nanosecond Unix timestamp string to a readable UTC date string */
function fmtNanoTs(ns: string): string {
  try {
    const ms = Number(BigInt(ns) / 1_000_000n);
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  } catch {
    return ns;
  }
}

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

// ─── Layer 2 report helpers ───────────────────────────────────────────────────

function recheckResultsToChecks(results: RecheckResult[]): CheckResult[] {
  return results.map((r) => ({
    label: `[L2] ${r.batchLabel}`,
    passed: r.passed,
    detail: r.detail,
  }));
}

// ─── Main handler ─────────────────────────────────────────────────────────────

async function handleRound(
  args: ArgumentsCamelCase<{
    contract: string;
    network: NetworkName;
    rpc?: string;
    indexer?: string;
    recheck: boolean;
  }>
) {
  const { contract, network, recheck } = args;
  const { rpc, indexer } = resolveEndpoints(network, {
    rpc: args.rpc,
    indexer: args.indexer,
  });

  // Print header before fetching starts
  const shortAddr = `${contract.slice(0, 16)}…${contract.slice(-6)}`;
  console.log('');
  console.log(`Verifying ${shortAddr}  [${network}]${recheck ? '  --recheck (Layer 2)' : ''}`);
  console.log('');

  const totalSteps = recheck ? 9 : 5;
  const step = createStep(totalSteps);

  try {
    // Step 1: round info from indexer
    step.start('Fetching round info from indexer');
    const round = await getRoundInfo(indexer, contract);
    if (!round) {
      step.fail('not found');
      printError(
        `Round not found in indexer for contract ${contract}.\n` +
          `  Network: ${network}\n` +
          `  Indexer: ${indexer}\n` +
          `  Tip: Did you mean --network testnet?`
      );
      process.exit(1);
    }
    if (round.maciType !== 'aMACI') {
      step.fail(`not aMACI (got "${round.maciType}")`);
      printError(`This CLI only supports aMACI rounds. Contract ${contract} is a "${round.maciType}" round.`);
      process.exit(1);
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

    // Print round summary before the checks
    printRoundSummary({
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
    });

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
      let fetched = 0;
      const messages = await getMessages(indexer, contract, (n, total) => {
        fetched = n;
        step.update?.(`${fetched}/${total} messages`);
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
          step.update?.(`[${proofsDone}/${msgProofs.length + tallyProofs.length}] ${label}`);
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

    printVerificationReport({
      contractAddress: contract,
      circuitPower: round.circuitPower,
      maciType: round.maciType,
      status: period,
      checks: allChecks,
      overallPassed,
    });

    process.exit(overallPassed ? 0 : 1);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// ─── CommandModule ───────────────────────────────────────────────────────────

export const roundCommand: CommandModule = {
  command: 'round <contract>',
  describe: 'Verify all proofs and commitments for an aMACI round',
  builder: (yargs: Argv) =>
    yargs
      .positional('contract', {
        type: 'string',
        description: 'Contract address of the aMACI round to verify',
        demandOption: true,
      })
      .option('network', {
        alias: 'n',
        type: 'string',
        choices: NETWORK_CHOICES,
        description: 'Target network (mainnet or testnet)',
        default: 'mainnet' as NetworkName,
      })
      .option('rpc', {
        type: 'string',
        description:
          'CosmWasm RPC endpoint (overrides network default)',
      })
      .option('indexer', {
        type: 'string',
        description:
          'world-maci-indexer GraphQL endpoint (overrides network default)',
      })
      .option('recheck', {
        type: 'boolean',
        description:
          'Layer 2: re-verify ZK proofs locally using snarkjs (experimental)',
        default: false,
      }),
  handler: (args) =>
    handleRound(
      args as ArgumentsCamelCase<{
        contract: string;
        network: NetworkName;
        rpc?: string;
        indexer?: string;
        recheck: boolean;
      }>
    ),
};
