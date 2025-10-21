import { MaciClient, MaciCircuitType, genKeypair } from '../src';
import { Secp256k1HdWallet } from '@cosmjs/amino';
import { DirectSecp256k1HdWallet, DirectSecp256k1Wallet } from '@cosmjs/proto-signing';
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
  const wallet = await DirectSecp256k1Wallet.fromKey(Buffer.from(key, 'hex'), 'dora');

  const client = new MaciClient({
    // network: 'mainnet',
    network: 'testnet',
    signer: wallet
  });

  const newRound = await client.createOracleMaciRound({
    operatorPubkey:
      // '71181283991507933356370686287836778892264767267594565723150933280429059165190',
      '6821363586466624930174394695023126212730779300840339744873622125361194404156',
    // '0d622736d5630a9e39a2998599bebf703a794978b64d30148cf7a15870f014fe2d79c78ccd5fffa53897b817075bdeef74a2ea9f244983d2f0829e19f44c59b5',
    // '1c3b06925c6239136b827dfd20b7b83218514418ba904d1dffcccc00a391f5d01d5f2dd3f387f1fee338b299167ddffed5a464be352a8a7fe2121340395d4c06',
    startVoting: new Date(new Date().getTime()),
    endVoting: new Date(new Date().getTime() + 5 * 60 * 1000),
    title: 'new oracle maci round',
    voteOptionMap: ['option1: A', 'option2: B', 'option3: C'],
    circuitType: MaciCircuitType.IP1V,
    whitelistEcosystem: 'doravota',
    whitelistSnapshotHeight: '0',
    whitelistVotingPowerArgs: {
      mode: 'slope',
      slope: '1000000',
      threshold: '1000000'
    }
  });
  console.log('newRound:', newRound);

  // const roundInfo = await client.contract.queryRoundInfo({
  //   signer: wallet,
  //   contractAddress: newRound.contractAddress,
  // });
  // console.log('roundInfo:', roundInfo);
  const address = await client.getAddress();
  const RoundAddress = newRound.contractAddress;
  const oracleMaciClient = await client.oracleMaciClient({
    contractAddress: RoundAddress
  });

  await oracleMaciClient.bond(undefined, undefined, [
    {
      denom: 'peaka',
      amount: '10000000000000000000'
    }
  ]);

  const roundInfo = await client.getRoundInfo({
    contractAddress: RoundAddress
  });
  console.log('roundInfo', roundInfo);

  const status = client.parseRoundStatus(
    Number(roundInfo.votingStart),
    Number(roundInfo.votingEnd),
    roundInfo.status,
    new Date()
  );
  console.log('status', status);
  const oracleClient = await client.oracleMaciClient({
    contractAddress: RoundAddress
  });
  const oracleConfig = await oracleClient.queryOracleWhitelistConfig();
  console.log('oracleConfig', oracleConfig);

  const roundBalance = await client.queryRoundBalance({
    contractAddress: RoundAddress
  });
  console.log(`roundBalance: ${Number(roundBalance) / 10 ** 18} DORA`);

  const totalBond = roundInfo.totalBond;
  console.log(`totalBond: ${Number(totalBond) / 10 ** 18} DORA`);

  // generate maci account
  const maciKeypair = await client.genKeypairFromSign();
  console.log('maciKeypair', maciKeypair);

  // get certificate
  const certificate = await client.requestOracleCertificate({
    ecosystem: 'doravota',
    address,
    contractAddress: RoundAddress
  });
  console.log('certificate', certificate);

  let gasStationEnable = roundInfo.gasStationEnable;
  console.log('gasStationEnable', gasStationEnable);
  let hasFeegrant = await client.hasFeegrant({
    address,
    contractAddress: RoundAddress
  });
  console.log('hasFeegrant', hasFeegrant);

  while (!hasFeegrant) {
    await delay(1000);
    hasFeegrant = await client.hasFeegrant({
      address,
      contractAddress: RoundAddress
    });
    console.log('checking hasFeegrant:', hasFeegrant);
  }

  await delay(6000);

  // oracle maci sign up
  const signupResponse = await client.signup({
    address,
    contractAddress: RoundAddress,
    maciKeypair,
    oracleCertificate: {
      amount: certificate.amount,
      signature: certificate.signature
    },
    gasStation: true
  });

  console.log('signup tx:', signupResponse.transactionHash);

  await delay(6000);

  // get user state idx
  const stateIdx = await client.getStateIdxByPubKey({
    contractAddress: RoundAddress,
    pubKey: maciKeypair.pubKey
  });
  console.log('stateIdx', stateIdx);
  const balance = await client.queryWhitelistBalanceOf({
    address,
    contractAddress: RoundAddress,
    certificate: certificate
  });
  console.log('balance', balance);

  const voiceBalance = await oracleClient.getVoiceCreditBalance({
    index: stateIdx.toString()
  });
  console.log('voiceBalance', voiceBalance);
  // vote
  const voteResponse = await client.vote({
    address,
    contractAddress: RoundAddress,
    selectedOptions: [
      { idx: 0, vc: 1 },
      { idx: 1, vc: 1 }
    ],
    operatorCoordPubKey: [
      BigInt(roundInfo.coordinatorPubkeyX),
      BigInt(roundInfo.coordinatorPubkeyY)
    ],
    maciKeypair,
    gasStation: true
  });

  console.log('vote tx:', voteResponse.transactionHash);
}

main();
