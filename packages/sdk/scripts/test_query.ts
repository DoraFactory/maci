import { MaciClient, genAddKeyInput } from '../src';
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing';
import dotenv from 'dotenv';
import { isErrorResponse } from '../src/libs/maci/maci';

dotenv.config();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const network = 'testnet';

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
    network,
    signer: wallet,
  });

  const address = await client.getAddress();
  console.log('address', address);

  // generate maci account
  const maciKeypair = await client.genKeypairFromSign();
  console.log('maciKeypair', maciKeypair);
  // get user state idx
  const stateIdx = await client.getStateIdxByPubKey({
    contractAddress:
      'dora1fnx24jsexcpekus05la3msnv3cac79r40ur6xyka7exxjz3mu9xsvf6n6e',
    pubKey: maciKeypair.pubKey,
  });
  console.log('stateIdx', stateIdx);
  // ================ test oracle signup and vote
  // const RoundAddress =
  //   'dora1hhxfw6tw9ef9467gphkfgrq0cg0dndndk875agrkaa479x9hx03qncmw48';

  // const allowance = await client.indexer.balanceOf(RoundAddress);
  // console.log('allowance', allowance);
}

main();
