/**
 * Update on-chain protocol fees on Registry + Api-SaaS.
 *
 * Default is dry-run (query only). Pass --apply to broadcast.
 *
 *   pnpm tsx scripts/update_fee_config.ts --network testnet
 *   OPERATOR_PRIVATE_KEY=... ADMIN_PRIVATE_KEY=... \
 *     pnpm tsx scripts/update_fee_config.ts --network testnet --apply
 *
 * Registry: OPERATOR_PRIVATE_KEY must be Registry operator or admin.
 * Api-SaaS: ADMIN_PRIVATE_KEY must be the Api-SaaS admin (different address).
 */
import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing';
import dotenv from 'dotenv';
import {
  createApiSaasClientBy,
  createRegistryClientBy,
  createRegistryQueryClientBy
} from '../src/libs/contract/config';
import { ApiSaasQueryClient } from '../src/libs/contract/ts/ApiSaas.client';
import { getDefaultParams } from '../src/libs/const';

dotenv.config();

const PEAKA_PER_DORA = 1_000_000_000_000_000_000n;

/** Target protocol fees (v2.2). deactivate_fee is copied from chain. */
const TARGET = {
  baseFee: 46n * PEAKA_PER_DORA,
  signupFee: 48_000_000_000_000_000n, // 0.048 DORA
  messageFee: 121_000_000_000_000_000n // 0.121 DORA
};

type NetworkName = 'mainnet' | 'testnet';

function parseArgs(): { network: NetworkName; apply: boolean } {
  const args = process.argv.slice(2);
  const networkIdx = args.indexOf('--network');
  const raw = networkIdx >= 0 ? args[networkIdx + 1] : 'testnet';
  if (raw !== 'testnet' && raw !== 'mainnet') {
    throw new Error(`Invalid --network ${raw}. Use testnet or mainnet.`);
  }
  return { network: raw, apply: args.includes('--apply') };
}

function peakaToDora(amount: string | bigint): string {
  const value = typeof amount === 'bigint' ? amount : BigInt(amount);
  const whole = value / PEAKA_PER_DORA;
  const frac = value % PEAKA_PER_DORA;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

function walletFromEnv(name: string) {
  let key = process.env[name];
  if (!key) return null;
  if (key.startsWith('0x')) key = key.slice(2);
  return DirectSecp256k1Wallet.fromKey(Buffer.from(key, 'hex'), 'dora');
}

async function addressFromEnv(name: string): Promise<string | null> {
  const wallet = await walletFromEnv(name);
  if (!wallet) return null;
  const [{ address }] = await wallet.getAccounts();
  return address;
}

async function main() {
  const { network, apply } = parseArgs();
  const params = getDefaultParams(network);
  const rpc = params.rpcEndpoints[0];

  console.log(`Network:     ${network} (${params.chainId})`);
  console.log(`RPC:         ${rpc}`);
  console.log(`Registry:    ${params.registryAddress}`);
  console.log(`Api-SaaS:    ${params.apiSaasAddress}`);
  console.log(`Mode:        ${apply ? 'APPLY (will broadcast)' : 'dry-run (query only)'}`);
  console.log('');

  const query = await createRegistryQueryClientBy({
    rpcEndpoint: rpc,
    contractAddress: params.registryAddress
  });
  const current = await query.getFeeConfig();

  const targetBase = TARGET.baseFee.toString();
  const targetSignup = TARGET.signupFee.toString();
  const targetMessage = TARGET.messageFee.toString();
  const deactivate = current.deactivate_fee;

  console.log('Registry fee config');
  console.log(
    `  base_fee:       ${peakaToDora(current.base_fee)} → ${peakaToDora(targetBase)} DORA`
  );
  console.log(
    `  signup_fee:     ${peakaToDora(current.signup_fee)} → ${peakaToDora(targetSignup)} DORA`
  );
  console.log(
    `  message_fee:    ${peakaToDora(current.message_fee)} → ${peakaToDora(targetMessage)} DORA`
  );
  console.log(`  deactivate_fee: ${peakaToDora(deactivate)} DORA (unchanged)`);
  console.log('');

  const registryOperator = await query.operator();
  const registryAdmin = (await query.admin()).admin;
  const cosmWasm = await CosmWasmClient.connect(rpc);
  const saasQuery = new ApiSaasQueryClient(cosmWasm, params.apiSaasAddress);
  const saasAdmin = (await saasQuery.config()).admin;
  const saasBalance = await saasQuery.balance();

  console.log('Who can sign');
  console.log(`  Registry operator: ${registryOperator}`);
  console.log(`  Registry admin:    ${registryAdmin}`);
  console.log(`  Api-SaaS admin:    ${saasAdmin}`);
  console.log(`  Api-SaaS balance:  ${peakaToDora(saasBalance)} DORA`);
  console.log('');
  if (registryOperator !== saasAdmin && registryAdmin !== saasAdmin) {
    console.log(
      'NOTE: Registry signer and Api-SaaS admin are different addresses.'
    );
    console.log(
      '      --apply needs BOTH OPERATOR_PRIVATE_KEY and ADMIN_PRIVATE_KEY.'
    );
    console.log('');
  }

  const operatorAddr = await addressFromEnv('OPERATOR_PRIVATE_KEY');
  const adminAddr = await addressFromEnv('ADMIN_PRIVATE_KEY');
  const registryOk =
    operatorAddr !== null &&
    (operatorAddr === registryOperator || operatorAddr === registryAdmin);
  const saasOk = adminAddr !== null && adminAddr === saasAdmin;

  console.log('Env key check');
  console.log(
    `  OPERATOR_PRIVATE_KEY → ${operatorAddr ?? '(not set)'}  ${
      registryOk ? 'OK (Registry operator/admin)' : 'FAIL'
    }`
  );
  console.log(
    `  ADMIN_PRIVATE_KEY    → ${adminAddr ?? '(not set)'}  ${
      saasOk ? 'OK (Api-SaaS admin)' : 'FAIL'
    }`
  );
  console.log('');

  const alreadyUpdated =
    current.base_fee === targetBase &&
    current.signup_fee === targetSignup &&
    current.message_fee === targetMessage;

  if (alreadyUpdated) {
    console.log('Registry already at target fees.');
  }

  if (!apply) {
    if (!registryOk || !saasOk) {
      console.log('Dry-run: env keys do not match the required on-chain accounts.');
      console.log('Fix OPERATOR_PRIVATE_KEY / ADMIN_PRIVATE_KEY before --apply.');
    }
    console.log('Dry-run only. Re-run with --apply to broadcast UpdateFeeConfig.');
    return;
  }

  if (!operatorAddr) {
    throw new Error('OPERATOR_PRIVATE_KEY is required for --apply');
  }
  if (!adminAddr) {
    throw new Error(
      'ADMIN_PRIVATE_KEY is required for --apply (Api-SaaS admin is not the Registry operator)'
    );
  }
  if (!registryOk) {
    throw new Error(
      `OPERATOR_PRIVATE_KEY address ${operatorAddr} is neither Registry operator (${registryOperator}) nor admin (${registryAdmin})`
    );
  }
  if (!saasOk) {
    throw new Error(
      `ADMIN_PRIVATE_KEY address ${adminAddr} is not Api-SaaS admin (${saasAdmin})`
    );
  }

  const operatorWallet = await walletFromEnv('OPERATOR_PRIVATE_KEY');
  const adminWallet = await walletFromEnv('ADMIN_PRIVATE_KEY');
  if (!operatorWallet || !adminWallet) {
    throw new Error('Failed to load wallets from env');
  }

  if (!alreadyUpdated) {
    const registry = await createRegistryClientBy({
      rpcEndpoint: rpc,
      wallet: operatorWallet,
      contractAddress: params.registryAddress
    });
    const registryTx = await registry.updateFeeConfig({
      config: {
        base_fee: targetBase,
        signup_fee: targetSignup,
        message_fee: targetMessage,
        deactivate_fee: deactivate
      }
    });
    console.log(`Registry UpdateFeeConfig tx: ${registryTx.transactionHash}`);

    const after = await query.getFeeConfig();
    if (
      after.base_fee !== targetBase ||
      after.signup_fee !== targetSignup ||
      after.message_fee !== targetMessage
    ) {
      throw new Error(
        `Registry fee mismatch after update: ${JSON.stringify(after)}`
      );
    }
    console.log('Registry fees verified.');
  }

  const saas = await createApiSaasClientBy({
    rpcEndpoint: rpc,
    wallet: adminWallet,
    contractAddress: params.apiSaasAddress
  });
  const saasTx = await saas.updateFeeConfig({
    config: { base_fee: targetBase }
  });
  console.log(`Api-SaaS UpdateFeeConfig tx: ${saasTx.transactionHash}`);
  console.log('Api-SaaS has no get_fee_config query; confirmed via tx success.');
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
