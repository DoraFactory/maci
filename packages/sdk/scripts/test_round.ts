import { MaciClient, MaciCircuitType, compressPublicKey } from '../src';
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
  const address = (await wallet.getAccounts())[0].address;
  const RoundAddress = newRound.contractAddress;
  const oracleMaciClient = await client.oracleMaciClient({
    signer: wallet,
    contractAddress: RoundAddress,
  });

  await oracleMaciClient.bond(undefined, undefined, [
    {
      denom: 'peaka',
      amount: '10000000000000000000',
    },
  ]);

  const roundInfo = await client.maci.getRoundInfo({
    contractAddress: RoundAddress,
  });
  console.log('roundInfo', roundInfo);

  const status = client.maci.parseRoundStatus(
    Number(roundInfo.votingStart),
    Number(roundInfo.votingEnd),
    roundInfo.status,
    new Date()
  );
  console.log('status', status);
  const oracleClient = await client.contract.oracleMaciClient({
    signer: wallet,
    contractAddress: RoundAddress,
  });
  const oracleConfig = await oracleClient.queryOracleWhitelistConfig();
  console.log('oracleConfig', oracleConfig);

  const roundBalance = await client.maci.queryRoundBalance({
    contractAddress: RoundAddress,
  });
  console.log(`roundBalance: ${Number(roundBalance) / 10 ** 18} DORA`);

  const totalBond = roundInfo.totalBond;
  console.log(`totalBond: ${Number(totalBond) / 10 ** 18} DORA`);

  // generate maci account
  // generate maci account
  const maciAccount = await client.circom.genKeypairFromSign(wallet, address);
  console.log('maciAccount First', maciAccount);

  // get certificate
  const certificate = await client.maci.requestOracleCertificate({
    signer: wallet,
    ecosystem: 'doravota',
    address,
    contractAddress: RoundAddress,
  });
  console.log('certificate', certificate);

  let gasStationEnable = roundInfo.gasStationEnable;
  console.log('gasStationEnable', gasStationEnable);
  let hasFeegrant = await client.maci.hasFeegrant({
    address,
    contractAddress: RoundAddress,
  });
  console.log('hasFeegrant', hasFeegrant);

  while (!hasFeegrant) {
    await delay(1000);
    hasFeegrant = await client.maci.hasFeegrant({
      address,
      contractAddress: RoundAddress,
    });
    console.log('checking hasFeegrant:', hasFeegrant);
  }

  await delay(6000);

  // oracle maci sign up
  const signupResponse = await client.maci.signup({
    signer: wallet,
    address,
    contractAddress: RoundAddress,
    maciAccount,
    oracleCertificate: {
      amount: certificate.amount,
      signature: certificate.signature,
    },
    gasStation: true,
  });

  console.log('signup tx:', signupResponse.transactionHash);

  await delay(6000);

  // get user state idx
  const stateIdx = await client.maci.getStateIdxByPubKey({
    contractAddress: RoundAddress,
    pubKey: maciAccount.pubKey,
  });
  console.log('stateIdx', stateIdx);

  // vote
  const voteResponse = await client.maci.vote({
    signer: wallet,
    address,
    stateIdx,
    contractAddress: RoundAddress,
    selectedOptions: [
      { idx: 0, vc: 1 },
      { idx: 1, vc: 1 },
    ],
    operatorCoordPubKey: [
      BigInt(roundInfo.coordinatorPubkeyX),
      BigInt(roundInfo.coordinatorPubkeyY),
    ],
    maciAccount,
    gasStation: true,
  });

  console.log('vote tx:', voteResponse.transactionHash);
}

main();
