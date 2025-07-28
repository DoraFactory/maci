import { MaciClient, MaciCircuitType, MaciCertSystemType } from '../src';
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
    network: 'testnet',
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

  const newRound = await client.createMaciRound({
    signer: wallet,
    startVoting: new Date(new Date().getTime()),
    endVoting: new Date(new Date().getTime() + 1 * 60 * 1000),
    title: 'new oracle maci round',
    description: 'test',
    link: 'test',
    circuitType: MaciCircuitType.IP1V,
    maxVoter: 2,
    maxOption: 3,
    whitelist: {
      users: [
        {
          addr: 'dora1mnjacv0ckjrfewrphpz0ltlnkrzcthw0238k2x',
          balance: '100',
        },
      ],
    },
    operatorPubkey:
      '6821363586466624930174394695023126212730779300840339744873622125361194404156',
    certSystemType: MaciCertSystemType.GROTH16,
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
