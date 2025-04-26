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

  const newRound = await client.createAMaciRound({
    maxVoter: 2,
    maxOption: 5,
    operator: 'dora18mph6ekhf70pxqxpq0lfj3z7j3k4mqn8m2cna5',
    whitelist: {
      users: [
        {
          addr: address,
        },
      ],
    },
    voiceCreditAmount: '10',
    startVoting: new Date(new Date().getTime() + 1 * 60 * 1000),
    endVoting: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
    title: 'new amaci round',
    circuitType: MaciCircuitType.IP1V,
  });
  console.log('newRound:', newRound);

  const amaciClient = await client.amaciClient({
    contractAddress: newRound.contractAddress,
  });
  const setOptionResponse = await amaciClient.setVoteOptionsMap({
    voteOptionMap: [
      'IoT Healthcare Platform',
      'Autonomous Vehicle Systems',
      'Carbon Capture Technology',
      'Edge Computing Network',
      'Biotech Data Analytics',
    ],
  });
  console.log('setOptionResponse:', setOptionResponse);

  // const RoundAddress = newRound.contractAddress;
  // const RoundAddress =
  // 'dora12ltq6khdurdju9nach5dt34xzmv9cmnayzyp296pf7w4l3xsspcqczrvrs';

  // await delay(10000);
  // const roundInfo = await client.getRoundInfo({
  //   contractAddress: RoundAddress,
  // });
  // console.log('roundInfo', roundInfo);

  // const status = client.parseRoundStatus(
  //   Number(roundInfo.votingStart),
  //   Number(roundInfo.votingEnd),
  //   roundInfo.status,
  //   new Date()
  // );
  // console.log('status', status);
  // const roundBalance = await client.queryRoundBalance({
  //   contractAddress: RoundAddress,
  // });
  // console.log(`roundBalance: ${Number(roundBalance) / 10 ** 18} DORA`);

  // const totalBond = roundInfo.totalBond;
  // console.log(`totalBond: ${Number(totalBond) / 10 ** 18} DORA`);

  // // generate maci account
  // const maciKeypair = await client.genKeypairFromSign();
  // console.log('maciKeypair', maciKeypair);

  // await delay(6000);

  // // oracle maci sign up
  // const signupResponse = await client.signup({
  //   address,
  //   contractAddress: RoundAddress,
  //   maciKeypair,
  // });

  // console.log('signup tx:', signupResponse.transactionHash);

  // await delay(6000);

  // // get user state idx
  // const stateIdx = await client.getStateIdxByPubKey({
  //   contractAddress: RoundAddress,
  //   pubKey: maciKeypair.pubKey,
  // });
  // console.log('stateIdx', stateIdx);
  // const balance = await client.queryWhitelistBalanceOf({
  //   address,
  //   contractAddress: RoundAddress,
  // });
  // console.log('balance', balance);

  // console.log({
  //   address,
  //   stateIdx,
  //   contractAddress: RoundAddress,
  //   selectedOptions: [
  //     { idx: 0, vc: 1 },
  //     { idx: 1, vc: 1 },
  //   ],
  //   operatorCoordPubKey: [
  //     BigInt(roundInfo.coordinatorPubkeyX),
  //     BigInt(roundInfo.coordinatorPubkeyY),
  //   ],
  //   maciKeypair,
  // });

  // // vote
  // const voteResponse = await client.vote({
  //   address,
  //   stateIdx,
  //   contractAddress: RoundAddress,
  //   selectedOptions: [
  //     { idx: 0, vc: 1 },
  //     { idx: 1, vc: 1 },
  //   ],
  //   operatorCoordPubKey: [
  //     BigInt(roundInfo.coordinatorPubkeyX),
  //     BigInt(roundInfo.coordinatorPubkeyY),
  //   ],
  //   maciKeypair,
  // });

  // console.log('vote tx:', voteResponse.transactionHash);
}

main();
