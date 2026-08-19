/**
 * Create an AMACI round at the CURRENT on-chain fees (before UpdateFeeConfig).
 * Use this now, then update fees, then run test_fee_config_old_vs_new_round.ts
 * with the printed OLD_ROUND_ADDRESS / OLD_ROUND_TICKET.
 *
 * Voting starts immediately and ends in 3 hours (override with DURATION_HOURS).
 *
 *   NETWORK=testnet pnpm tsx scripts/create_legacy_fee_round.ts
 *
 * Requires ADMIN_SECRET in .env. Writes packages/sdk/legacy-round.env
 */
import { MaciClient } from '../src/maci';
import { MaciCircuitType } from '../src/types';
import { getDefaultParams } from '../src/libs/const';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const PEAKA = 1_000_000_000_000_000_000n;

function peakaToDora(amount: string | bigint): string {
  const value = typeof amount === 'bigint' ? amount : BigInt(amount);
  const whole = value / PEAKA;
  const frac = value % PEAKA;
  if (frac === 0n) return `${whole}`;
  return `${whole}.${frac.toString().padStart(18, '0').replace(/0+$/, '')}`;
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
  const timeout = options.timeout ?? 45_000;
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

async function main() {
  const network = (process.env.NETWORK === 'mainnet' ? 'mainnet' : 'testnet') as
    | 'mainnet'
    | 'testnet';
  const durationHours = Number(process.env.DURATION_HOURS ?? '3');
  if (!Number.isFinite(durationHours) || durationHours <= 0) {
    throw new Error('DURATION_HOURS must be a positive number');
  }

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    throw new Error('ADMIN_SECRET is required');
  }

  const operator =
    network === 'mainnet'
      ? 'dora16nkezrnvw9fzqqqmmqtrdkw3pqes6qthhse2k4'
      : 'dora149n5yhzgk5gex0eqmnnpnsxh6ys4exg5xyqjzm';

  const maxVoter = 25;
  const params = getDefaultParams(network);

  console.log('='.repeat(80));
  console.log('Create legacy (pre-fee-update) AMACI round');
  console.log('='.repeat(80));
  console.log(`Network:   ${network}`);
  console.log(`Registry:  ${params.registryAddress}`);
  console.log(`Api-SaaS:  ${params.apiSaasAddress}`);
  console.log(`Duration:  ${durationHours}h from now`);
  console.log('');

  const adminMaciClient = new MaciClient({ network });
  const registryQuery = await adminMaciClient.contract.registryQueryClient();
  const registryFees = await registryQuery.getFeeConfig();

  console.log('Registry fees that will be frozen onto this round:');
  console.log(`  base_fee:    ${peakaToDora(registryFees.base_fee)} DORA`);
  console.log(`  signup_fee:  ${peakaToDora(registryFees.signup_fee)} DORA`);
  console.log(`  message_fee: ${peakaToDora(registryFees.message_fee)} DORA`);
  console.log('');

  const tenantData = await adminMaciClient.getSaasApiClient().createTenant(
    { name: `Legacy Fee Round ${generateRandomString(10)}` },
    adminSecret
  );
  const apiKeyData = await adminMaciClient.getSaasApiClient().createApiKey(
    {
      tenantId: tenantData.id,
      label: 'Legacy fee round',
      plan: 'pro'
    },
    adminSecret
  );

  const maciClient = new MaciClient({
    network,
    saasApiKey: apiKeyData.apiKey
  });

  const startVoting = new Date();
  const endVoting = new Date(startVoting.getTime() + durationHours * 60 * 60 * 1000);

  const createRoundData = await maciClient.saasCreateAmaciRound({
    title: 'Legacy Fee Config Round',
    description: 'Created before UpdateFeeConfig; fees should stay frozen after the upgrade',
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
    throw new Error(`Round creation failed: ${createRoundData.error ?? 'unknown error'}`);
  }

  const contractAddress = createRoundData.contractAddress;
  const ticket = createRoundData.ticket;
  if (!ticket) {
    throw new Error('Ticket not returned');
  }

  console.log('Round created');
  console.log(`  TX:      ${createRoundData.txHash}`);
  console.log(`  Start:   ${startVoting.toISOString()}`);
  console.log(`  End:     ${endVoting.toISOString()}`);
  console.log(`  Address: ${contractAddress}`);
  console.log('');

  const roundFees = await waitForIndexer(
    async () => {
      const client = await maciClient.contract.amaciQueryClient({ contractAddress });
      return client.getFeeConfig();
    },
    { label: 'round fee config' }
  );

  const frozen =
    BigInt(roundFees.signup_fee) === BigInt(registryFees.signup_fee) &&
    BigInt(roundFees.message_fee) === BigInt(registryFees.message_fee);
  console.log('Round frozen fees:');
  console.log(`  signup_fee:  ${peakaToDora(roundFees.signup_fee)} DORA`);
  console.log(`  message_fee: ${peakaToDora(roundFees.message_fee)} DORA`);
  console.log(
    frozen
      ? '  OK: matches current Registry (this is the baseline for the old-round test)'
      : '  WARN: round fees do not match Registry'
  );

  const outPath = path.join(process.cwd(), 'legacy-round.env');
  const envBody = [
    `NETWORK=${network}`,
    `OLD_ROUND_ADDRESS=${contractAddress}`,
    `OLD_ROUND_TICKET=${ticket}`,
    ''
  ].join('\n');
  fs.writeFileSync(outPath, envBody);

  console.log('');
  console.log('='.repeat(80));
  console.log('Copy these into the next command (also written to legacy-round.env):');
  console.log('='.repeat(80));
  console.log(`OLD_ROUND_ADDRESS=${contractAddress}`);
  console.log(`OLD_ROUND_TICKET=${ticket}`);
  console.log('');
  console.log('After UpdateFeeConfig:');
  console.log(
    `  set -a && source legacy-round.env && set +a && pnpm tsx scripts/test_fee_config_old_vs_new_round.ts`
  );
}

main().catch((error) => {
  console.error('\nFailed to create legacy round:', error);
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exit(1);
});
