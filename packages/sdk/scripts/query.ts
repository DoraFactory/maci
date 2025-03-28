import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1Wallet, OfflineSigner } from '@cosmjs/proto-signing';
import dotenv from 'dotenv';
import { SigningStargateClientOptions, GasPrice } from '@cosmjs/stargate';

dotenv.config();

const defaultSigningClientOptions: SigningStargateClientOptions = {
  broadcastPollIntervalMs: 8_000,
  broadcastTimeoutMs: 16_000,
  gasPrice: GasPrice.fromString('100000000000peaka'),
};

async function createContractClientByWallet(
  rpcEndpoint: string,
  wallet: OfflineSigner
) {
  const client = await SigningCosmWasmClient.connectWithSigner(
    rpcEndpoint,
    wallet,
    {
      ...defaultSigningClientOptions,
    }
  );
  return client;
}

async function main() {
  console.log('======= start test contract logic =======');
  let key = process.env.ADMIN_PRIVATE_KEY;
  if (!key) {
    throw new Error('Admin private key not found in environment variables');
  }
  if (key.startsWith('0x')) {
    key = key.slice(2);
  }
  const wallet = await DirectSecp256k1Wallet.fromKey(
    Buffer.from(key, 'hex'),
    'dora'
  );

  const client = await createContractClientByWallet(
    'https://vota-rpc.dorafactory.org',
    wallet
  );

  const [{ address }] = await wallet.getAccounts();

  const data = await client.queryContractSmart(
    'dora14hj2tavq8fpesdwxxcu44rty3hh90vhujrvcp4lsrrghu944740q633553',
    {
      get_pub_key: {
        address,
      },
    }
  );

  console.log('data:', data);
}

main();
