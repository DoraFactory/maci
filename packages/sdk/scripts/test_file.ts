import {
  MaciClient,
  MaciCircuitType,
  genKeypair,
  genKeypairFromSign,
} from '../src';
import { Secp256k1HdWallet } from '@cosmjs/amino';
import {
  DirectSecp256k1HdWallet,
  DirectSecp256k1Wallet,
} from '@cosmjs/proto-signing';
import dotenv from 'dotenv';

dotenv.config();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const network = 'testnet';

  const maciKeypair = await genKeypairFromSign({
    signer: wallet,
    network,
  });
  const client = new MaciClient({
    network,
    signer: wallet,
    maciKeypair,
  });

  const maciKeypair2 = client.getMaciKeypair();
  console.log('maciKeypair', maciKeypair2);

  const maciPubkey = client.getMaciPubkey();
  console.log('maciPubkey', maciPubkey);

  const maciPubkey2 = client.packMaciPubkey(maciKeypair.pubKey);
  console.log('pack maciPubkey', maciPubkey2);

  const maciPubkey3 = client.unpackMaciPubkey(maciPubkey);
  console.log('unpack maciPubkey', maciPubkey3);
}

main();
