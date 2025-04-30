import { MaciClient, MaciCircuitType, genKeypair } from '../src';
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

  const client = new MaciClient({
    network: 'testnet',
    signer: wallet,
  });

  const address = await client.getAddress();
  const stateIdx = await client.getStateIdxByPubKey({
    contractAddress:
      'dora17syaf8snzjevs9slqq3g2sr54rjlk3lv9qf7q5fa62dzcx9dflnsweatnz',
    pubKey: [
      BigInt(
        '3145941557002345731910556996047860345226352642142963908379412496662890137864'
      ),
      BigInt(
        '8056647195974061539154607629470709256305656724964618034783478936483314631170'
      ),
    ],
  });

  console.log('address', address);
  console.log('stateIdx', stateIdx);
}

main();
