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

  const newRound = await client.createOracleMaciRound({
    signer: wallet,
    operatorPubkey:
      '0d622736d5630a9e39a2998599bebf703a794978b64d30148cf7a15870f014fe2d79c78ccd5fffa53897b817075bdeef74a2ea9f244983d2f0829e19f44c59b5',
    startVoting: new Date(new Date().getTime()),
    endVoting: new Date(new Date().getTime() + 15 * 60 * 1000),
    title: 'new oracle maci round',
    voteOptionMap: ['option1: A', 'option2: B', 'option3: C'],
    circuitType: MaciCircuitType.IP1V,
    whitelistEcosystem: 'doravota',
    whitelistSnapshotHeight: '0',
    whitelistVotingPowerArgs: {
      mode: 'slope',
      slope: '1000000',
      threshold: '1000000',
    },
  });
  console.log('newRound:', newRound);

  // const roundInfo = await client.contract.queryRoundInfo({
  //   signer: wallet,
  //   contractAddress: newRound.contractAddress,
  // });
  // console.log('roundInfo:', roundInfo);
  const oracleMaciClient = await client.oracleMaciClient({
    signer: wallet,
    contractAddress: newRound.contractAddress,
  });

  await oracleMaciClient.bond(undefined, undefined, [
    {
      denom: 'peaka',
      amount: '20000000000000000000',
    },
  ]);
}

main();
