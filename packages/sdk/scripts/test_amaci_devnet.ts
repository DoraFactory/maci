import { MaciClient, MaciCircuitType } from '../src';
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
  const client = new MaciClient({
    network: 'devnet',
  });

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

  const newRound = await client.createAMaciRound({
    signer: wallet,
    startVoting: new Date(new Date().getTime()),
    endVoting: new Date(new Date().getTime() + 15 * 60 * 1000),
    title: 'new oracle maci round',
    description: 'test',
    link: 'test',
    circuitType: MaciCircuitType.IP1V,
    maxVoter: 2,
    maxOption: 25,
    operator: 'dora1k383vky62t85496xwp6qnalw5u2qj4tvsneluc',
    whitelist: {
      users: [
        {
          addr: 'dora1mnjacv0ckjrfewrphpz0ltlnkrzcthw0238k2x',
        },
      ],
    },
    voiceCreditAmount: '100',
  });
  console.log('newRound:', newRound);

  // await delay(10000);
  // const isClaimable = await client.maci.queryRoundClaimable({
  //   contractAddress:
  //     'dora1kvvjekdt4xz8at036jxcdv45k5q3278sul7453a65wlqruft9nfq04gta4',
  // });
  // console.log('isClaimable:', isClaimable);
}

main();
