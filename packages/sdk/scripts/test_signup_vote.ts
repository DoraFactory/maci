import { MaciClient } from '../src';
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing';
import dotenv from 'dotenv';
import { isErrorResponse } from '../src/libs/maci/maci';

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
  const client = new MaciClient({
    network,
    signer: wallet,
  });

  const address = await client.getAddress();

  // ================ test oracle signup and vote

  const RoundAddress =
    'dora1au0hfu4wdnlkm2wk2sy6r0mfp3895mj7n98gpqcv90ffpvu5fd3qx77ned';

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
  const maciKeypair = await client.genKeypairFromSign();
  console.log('maciKeypair', maciKeypair);

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
    maciKeypair,
    oracleCertificate: {
      amount: certificate.amount,
      signature: certificate.signature,
    },
    gasStation: false,
  });

  console.log('signup tx:', signupResponse.transactionHash);

  await delay(6000);

  // get user state idx
  const stateIdx = await client.maci.getStateIdxByPubKey({
    contractAddress: RoundAddress,
    pubKey: maciKeypair.pubKey,
  });
  console.log('stateIdx', stateIdx);

  // vote
  const voteResponse = await client.maci.vote({
    signer: wallet,
    address,
    contractAddress: RoundAddress,
    selectedOptions: [
      { idx: 0, vc: 1 },
      { idx: 1, vc: 1 },
    ],
    operatorCoordPubKey: [
      BigInt(roundInfo.coordinatorPubkeyX),
      BigInt(roundInfo.coordinatorPubkeyY),
    ],
    maciKeypair,
    gasStation: false,
  });

  console.log('vote tx:', voteResponse.transactionHash);
}

main();
