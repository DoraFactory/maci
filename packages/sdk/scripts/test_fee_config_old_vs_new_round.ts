/**
 * Compare protocol fees on an old (pre-update) round vs a newly created round,
 * then optionally run the claim → pre-add → vote flow on both.
 *
 * After Registry + Api-SaaS UpdateFeeConfig:
 *   - Old rounds keep signup/message fees frozen at create time (v2.0: 0.03 / 0.06)
 *   - New rounds pick up current Registry fees (v2.2: 0.048 / 0.121)
 *
 * Usage:
 *   ADMIN_SECRET=... AMACI_CLAIM_KEY=... \
 *     OLD_ROUND_ADDRESS=dora1... OLD_ROUND_TICKET=... \
 *     pnpm tsx scripts/test_fee_config_old_vs_new_round.ts
 *
 * Env:
 *   NETWORK              testnet | mainnet (default: testnet)
 *   ADMIN_SECRET         required to create tenant / API key / new round
 *   AMACI_CLAIM_KEY      required for voter flow
 *   OLD_ROUND_ADDRESS    existing round created before the fee update
 *   OLD_ROUND_TICKET     ticket for that old round (needed to vote)
 *   SKIP_NEW_ROUND=1     only inspect / vote the old round
 *   SKIP_VOTER_FLOW=1    only query and compare fees, do not claim/vote
 */
import { MaciClient } from '../src/maci';
import { VoterClient } from '../src/voter';
import { MaciCircuitType } from '../src/types';
import { getDefaultParams } from '../src/libs/const';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const PEAKA = 1_000_000_000_000_000_000n;

/** Fees frozen on rounds created under v2.0 (current on-chain until UpdateFeeConfig). */
const LEGACY_ROUND_FEES = {
  signup: 30_000_000_000_000_000n, // 0.03 DORA
  message: 60_000_000_000_000_000n // 0.06 DORA
};

/** Target after v2.2 UpdateFeeConfig. */
const TARGET_REGISTRY_FEES = {
  base: 46n * PEAKA,
  signup: 48_000_000_000_000_000n, // 0.048 DORA
  message: 121_000_000_000_000_000n // 0.121 DORA
};

function peakaToDora(amount: string | bigint): string {
  const value = typeof amount === 'bigint' ? amount : BigInt(amount);
  const whole = value / PEAKA;
  const frac = value % PEAKA;
  if (frac === 0n) return `${whole}`;
  return `${whole}.${frac.toString().padStart(18, '0').replace(/0+$/, '')}`;
}

function samePeaka(a: string | bigint, b: string | bigint): boolean {
  return BigInt(a) === BigInt(b);
}

function generateRandomString(length: number) {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

async function waitForIndexer<T>(
  fn: () => Promise<T>,
  options: { timeout?: number; interval?: number; label?: string } = {}
): Promise<T> {
  const timeout = options.timeout ?? 30_000;
  const interval = options.interval ?? 2_000;
  const label = options.label ?? 'indexer query';
  const deadline = Date.now() + timeout;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (Date.now() + interval > deadline) {
        throw new Error(`Timeout waiting for ${label}: ${(error as Error).message}`);
      }
      console.log(`  [waitForIndexer] ${label} not ready yet, retrying in ${interval}ms...`);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
}

async function querySaasBalance(restEndpoint: string, saasAddress: string): Promise<bigint> {
  const url = `${restEndpoint}/cosmos/bank/v1beta1/balances/${saasAddress}/by_denom?denom=peaka`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to query SaaS balance: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { balance?: { amount?: string } };
  return BigInt(json.balance?.amount ?? '0');
}

type RoundFees = { signup_fee: string; message_fee: string; deactivate_fee: string };

async function queryRoundFees(maciClient: MaciClient, contractAddress: string): Promise<RoundFees> {
  const client = await maciClient.contract.amaciQueryClient({ contractAddress });
  return client.getFeeConfig();
}

function printFeeRow(label: string, signup: string | bigint, message: string | bigint) {
  console.log(
    `  ${label.padEnd(28)} signup=${peakaToDora(signup)}  message=${peakaToDora(message)} DORA`
  );
}

/** pre-add (signup) + one vote (message). SaaS treasury pays these via viaSaas. */
function expectedVoterProtocolFees(fees: RoundFees): bigint {
  return BigInt(fees.signup_fee) + BigInt(fees.message_fee);
}

function compareSaasSpend(delta: bigint, expected: bigint, label: string): string {
  console.log(`  Expected protocol fees (signup+message): ${peakaToDora(expected)} DORA`);
  console.log(`  SaaS peaka delta:                        ${peakaToDora(delta)} DORA`);
  if (delta === expected) {
    console.log(`  PASS: SaaS spend matches this round's frozen ${label} fees`);
    return `${label} spend: PASS (exact)`;
  }
  if (delta > expected) {
    const extra = delta - expected;
    // Shared SaaS treasury can move for unrelated txs; extra gas is also possible.
    if (extra <= PEAKA / 100n) {
      console.log(`  PASS: SaaS spend ≈ expected (extra ${peakaToDora(extra)} DORA, likely gas/other)`);
      return `${label} spend: PASS (near)`;
    }
    console.log(
      `  WARN: SaaS spend is higher than this round's fees (shared treasury or extra txs?)`
    );
    return `${label} spend: WARN (delta > expected)`;
  }
  console.log('  WARN: SaaS spend is lower than this round\'s signup+message — unexpected');
  return `${label} spend: WARN (delta < expected)`;
}

async function runVoterFlow(params: {
  network: 'mainnet' | 'testnet';
  saasApiEndpoint?: string;
  rpcEndpoints?: string[];
  restEndpoints?: string[];
  maciClient: MaciClient;
  contractAddress: string;
  ticket: string;
  amaciClaimKey: string;
  circuitPower: string;
  stateTreeDepth: number;
}): Promise<{ ok: boolean; txPreAdd?: string; txVote?: string; error?: string }> {
  const {
    network,
    saasApiEndpoint,
    rpcEndpoints,
    restEndpoints,
    maciClient,
    contractAddress,
    ticket,
    amaciClaimKey,
    circuitPower,
    stateTreeDepth
  } = params;

  const claimVoterClient = new VoterClient({
    network,
    rpcEndpoints,
    restEndpoints,
    saasApiEndpoint
  });
  const claimedKey = await claimVoterClient.saasClaimKey({ contractAddress, amaciClaimKey });
  console.log('  Claimed leafIndex:', claimedKey.leafIndex);

  const roundInfo = await waitForIndexer(() => maciClient.getRoundInfo({ contractAddress }), {
    label: 'round info',
    timeout: 30_000,
    interval: 2_000
  });
  const roundCoordPubkey: [bigint, bigint] = [
    BigInt(roundInfo.coordinatorPubkeyX),
    BigInt(roundInfo.coordinatorPubkeyY)
  ];

  const voterClient = new VoterClient({
    network,
    rpcEndpoints,
    restEndpoints,
    secretKey: claimedKey.secretKey,
    saasApiEndpoint
  });
  const preDeactivateCoordPubkey = voterClient.unpackMaciPubkey(claimedKey.coordinatorPubkey);
  const pollId = claimedKey.pollId !== null ? Number(claimedKey.pollId) : undefined;

  const { account, result } = await voterClient.saasPreCreateNewAccount({
    contractAddress,
    stateTreeDepth,
    coordinatorPubkey: preDeactivateCoordPubkey,
    deactivateIdx: claimedKey.leafIndex,
    preComputedProof: {
      root: claimedKey.root,
      pathElements: claimedKey.pathElements,
      deactivateLeaf: claimedKey.deactivateLeaf
    },
    pollId,
    wasmFile: path.join(process.cwd(), `add-new-key_v3/${circuitPower}/addKey.wasm`),
    zkeyFile: path.join(process.cwd(), `add-new-key_v3/${circuitPower}/addKey.zkey`),
    ticket
  });

  if (result.status === 'failed') {
    return { ok: false, error: result.error ?? 'pre-add failed' };
  }

  const txConfirmed = await voterClient.waitForTransaction(result.txHash);
  console.log('  Pre-add confirmed at height:', txConfirmed.height);

  await waitForIndexer(
    async () => {
      const idx = await account.getStateIdx({ contractAddress });
      if (idx === -1) throw new Error('state index not yet available');
      return idx;
    },
    { label: 'state index', timeout: 30_000, interval: 1_000 }
  );

  const voteResult = await account.saasVote({
    contractAddress,
    operatorPubkey: roundCoordPubkey,
    selectedOptions: [
      { idx: 0, vc: 1 },
      { idx: 2, vc: 1 },
      { idx: 3, vc: 1 }
    ],
    ticket,
    pollId
  });

  if (voteResult.status === 'failed') {
    return {
      ok: false,
      txPreAdd: result.txHash,
      error: voteResult.error ?? 'vote failed'
    };
  }

  return { ok: true, txPreAdd: result.txHash, txVote: voteResult.txHash };
}

async function main() {
  const network = (process.env.NETWORK === 'mainnet' ? 'mainnet' : 'testnet') as
    | 'mainnet'
    | 'testnet';
  const skipNewRound = process.env.SKIP_NEW_ROUND === '1';
  const skipVoterFlow = process.env.SKIP_VOTER_FLOW === '1';
  const oldRoundAddress = process.env.OLD_ROUND_ADDRESS;
  const oldRoundTicket = process.env.OLD_ROUND_TICKET;
  const adminSecret = process.env.ADMIN_SECRET;
  const amaciClaimKey = process.env.AMACI_CLAIM_KEY;

  const operator =
    network === 'mainnet'
      ? 'dora16nkezrnvw9fzqqqmmqtrdkw3pqes6qthhse2k4'
      : 'dora149n5yhzgk5gex0eqmnnpnsxh6ys4exg5xyqjzm';

  const maxVoter = 25;
  const circuitPower = '9-4-3-125';
  const stateTreeDepth = 9;
  const API_BASE_URL = undefined;
  const rpcEndpoints = undefined;
  const restEndpoints = undefined;

  const params = getDefaultParams(network);
  const rest = params.restEndpoints[0];

  console.log('='.repeat(80));
  console.log('Fee config: old round vs new round');
  console.log('='.repeat(80));
  console.log(`Network:          ${network}`);
  console.log(`Registry:         ${params.registryAddress}`);
  console.log(`Api-SaaS:         ${params.apiSaasAddress}`);
  console.log(`Old round:        ${oldRoundAddress ?? '(not set)'}`);
  console.log('');

  const adminMaciClient = new MaciClient({
    network,
    rpcEndpoints,
    restEndpoints,
    saasApiEndpoint: API_BASE_URL
  });

  const registryQuery = await adminMaciClient.contract.registryQueryClient();
  const registryFees = await registryQuery.getFeeConfig();

  console.log('Registry (global, used by NEW rounds at create time)');
  printFeeRow('target v2.2', TARGET_REGISTRY_FEES.signup, TARGET_REGISTRY_FEES.message);
  printFeeRow('on-chain now', registryFees.signup_fee, registryFees.message_fee);
  console.log(`  base_fee now                 ${peakaToDora(registryFees.base_fee)} DORA  (target ${peakaToDora(TARGET_REGISTRY_FEES.base)})`);
  const registryAtTarget =
    samePeaka(registryFees.base_fee, TARGET_REGISTRY_FEES.base) &&
    samePeaka(registryFees.signup_fee, TARGET_REGISTRY_FEES.signup) &&
    samePeaka(registryFees.message_fee, TARGET_REGISTRY_FEES.message);
  console.log(`  Registry matches v2.2: ${registryAtTarget ? 'YES' : 'NO (UpdateFeeConfig not applied yet)'}`);
  console.log('');

  const results: string[] = [];

  if (oldRoundAddress) {
    console.log(`Old round ${oldRoundAddress}`);
    const oldFees = await queryRoundFees(adminMaciClient, oldRoundAddress);
    printFeeRow('expected (v2.0 frozen)', LEGACY_ROUND_FEES.signup, LEGACY_ROUND_FEES.message);
    printFeeRow('on-chain round', oldFees.signup_fee, oldFees.message_fee);
    console.log(
      `  deactivate_fee              ${peakaToDora(oldFees.deactivate_fee)} DORA  (should stay 10)`
    );
    console.log(
      `  voter protocol cost         ${peakaToDora(expectedVoterProtocolFees(oldFees))} DORA  (signup+message)`
    );
    const oldFrozen =
      samePeaka(oldFees.signup_fee, LEGACY_ROUND_FEES.signup) &&
      samePeaka(oldFees.message_fee, LEGACY_ROUND_FEES.message);
    const oldUsesNew =
      samePeaka(oldFees.signup_fee, registryFees.signup_fee) &&
      samePeaka(oldFees.message_fee, registryFees.message_fee);
    if (oldFrozen) {
      console.log('  PASS: old round still uses frozen v2.0 fees (0.03 / 0.06)');
      results.push('old-round fees: PASS (frozen v2.0)');
    } else if (oldUsesNew) {
      console.log('  FAIL: old round already matches Registry — fees were not frozen');
      results.push('old-round fees: FAIL (not frozen)');
    } else {
      console.log('  WARN: old round fees match neither v2.0 nor current Registry');
      results.push('old-round fees: WARN (unexpected values)');
    }

    if (!skipVoterFlow) {
      if (!amaciClaimKey || !oldRoundTicket) {
        console.log('  SKIP voter flow (need AMACI_CLAIM_KEY and OLD_ROUND_TICKET)');
        results.push('old-round voter: SKIP');
      } else {
        const before = await querySaasBalance(rest, params.apiSaasAddress);
        console.log(`  SaaS balance before: ${peakaToDora(before)} DORA`);
        const flow = await runVoterFlow({
          network,
          saasApiEndpoint: API_BASE_URL,
          rpcEndpoints,
          restEndpoints,
          maciClient: adminMaciClient,
          contractAddress: oldRoundAddress,
          ticket: oldRoundTicket,
          amaciClaimKey,
          circuitPower,
          stateTreeDepth
        });
        const after = await querySaasBalance(rest, params.apiSaasAddress);
        const delta = before - after;
        console.log(`  SaaS balance after:  ${peakaToDora(after)} DORA  (delta ${peakaToDora(delta)})`);
        if (flow.ok) {
          console.log('  PASS: voter flow succeeded on old round');
          results.push('old-round voter: PASS');
          results.push(compareSaasSpend(delta, expectedVoterProtocolFees(oldFees), 'old-round'));
        } else {
          console.log('  FAIL: voter flow failed on old round:', flow.error);
          results.push(`old-round voter: FAIL (${flow.error})`);
        }
      }
    }
    console.log('');
  } else {
    console.log('Old round skipped (set OLD_ROUND_ADDRESS to inspect a pre-update round)\n');
    results.push('old-round: SKIP (no OLD_ROUND_ADDRESS)');
  }

  if (skipNewRound) {
    console.log('New round skipped (SKIP_NEW_ROUND=1)');
    results.push('new-round: SKIP');
  } else {
    if (!adminSecret) {
      throw new Error('ADMIN_SECRET is required to create a new round');
    }

    console.log('Creating a new round to capture current Registry fees...');
    const tenantData = await adminMaciClient
      .getSaasApiClient()
      .createTenant({ name: `Fee Test ${generateRandomString(10)}` }, adminSecret);
    const apiKeyData = await adminMaciClient.getSaasApiClient().createApiKey(
      {
        tenantId: tenantData.id,
        label: 'Fee config test',
        plan: 'pro'
      },
      adminSecret
    );
    const maciClient = new MaciClient({
      network,
      rpcEndpoints,
      restEndpoints,
      saasApiEndpoint: API_BASE_URL,
      saasApiKey: apiKeyData.apiKey
    });

    const startVoting = new Date();
    const endVoting = new Date(startVoting.getTime() + 11 * 60 * 1000);
    const createRoundData = await maciClient.saasCreateAmaciRound({
      title: 'Fee Config New Round Test',
      description: 'Created after protocol fee update',
      link: 'https://test.com',
      startVoting: startVoting.toISOString(),
      endVoting: endVoting.toISOString(),
      operator,
      maxVoter,
      voteOptionMap: ['Option A', 'Option B', 'Option C', 'Option D', 'Option E'],
      circuitType: MaciCircuitType.IP1V,
      voiceCreditAmount: 100
    });

    if (createRoundData.status === 'failed' || !createRoundData.contractAddress) {
      throw new Error(`New round creation failed: ${createRoundData.error ?? 'unknown error'}`);
    }

    const newAddress = createRoundData.contractAddress;
    const newTicket = createRoundData.ticket;
    console.log('  New round:', newAddress);
    console.log('  TX:', createRoundData.txHash);

    const newFees = await waitForIndexer(() => queryRoundFees(maciClient, newAddress), {
      label: 'new round fee config',
      timeout: 30_000,
      interval: 2_000
    });
    printFeeRow('Registry (expected)', registryFees.signup_fee, registryFees.message_fee);
    printFeeRow('new round on-chain', newFees.signup_fee, newFees.message_fee);
    console.log(
      `  deactivate_fee              ${peakaToDora(newFees.deactivate_fee)} DORA  (should stay 10)`
    );
    console.log(
      `  voter protocol cost         ${peakaToDora(expectedVoterProtocolFees(newFees))} DORA  (signup+message)`
    );
    const newMatchesRegistry =
      samePeaka(newFees.signup_fee, registryFees.signup_fee) &&
      samePeaka(newFees.message_fee, registryFees.message_fee);
    if (newMatchesRegistry) {
      console.log('  PASS: new round copied current Registry signup/message fees');
      results.push('new-round fees: PASS (matches Registry)');
    } else {
      console.log('  FAIL: new round fees do not match Registry');
      results.push('new-round fees: FAIL (mismatch Registry)');
    }

    if (!skipVoterFlow) {
      if (!amaciClaimKey || !newTicket) {
        console.log('  SKIP voter flow (need AMACI_CLAIM_KEY and round ticket)');
        results.push('new-round voter: SKIP');
      } else {
        const before = await querySaasBalance(rest, params.apiSaasAddress);
        console.log(`  SaaS balance before: ${peakaToDora(before)} DORA`);
        const flow = await runVoterFlow({
          network,
          saasApiEndpoint: API_BASE_URL,
          rpcEndpoints,
          restEndpoints,
          maciClient,
          contractAddress: newAddress,
          ticket: newTicket,
          amaciClaimKey,
          circuitPower,
          stateTreeDepth
        });
        const after = await querySaasBalance(rest, params.apiSaasAddress);
        const delta = before - after;
        console.log(`  SaaS balance after:  ${peakaToDora(after)} DORA  (delta ${peakaToDora(delta)})`);
        if (flow.ok) {
          console.log('  PASS: voter flow succeeded on new round');
          results.push('new-round voter: PASS');
          results.push(compareSaasSpend(delta, expectedVoterProtocolFees(newFees), 'new-round'));
        } else {
          console.log('  FAIL: voter flow failed on new round:', flow.error);
          results.push(`new-round voter: FAIL (${flow.error})`);
        }
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('Summary');
  console.log('='.repeat(80));
  for (const line of results) {
    console.log(`  • ${line}`);
  }
}

main().catch((error) => {
  console.error('\nTest failed:', error);
  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  }
  process.exit(1);
});
