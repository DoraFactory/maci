import { MaciClient, MaciCircuitType } from '../src';
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing';
import { RegistrationModeConfig, VoiceCreditMode } from '../src/libs/contract/types';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('======= start test contract logic =======');
  let key = process.env.VOTER_PRIVATE_KEY;
  if (!key) {
    throw new Error('Admin private key not found in environment variables');
  }
  if (key.startsWith('0x')) {
    key = key.slice(2);
  }
  const wallet = await DirectSecp256k1Wallet.fromKey(Buffer.from(key, 'hex'), 'dora');

  const client = new MaciClient({
    network: 'testnet',
    signer: wallet
  });

  const address = await client.getAddress();
  console.log('address:', address);

  const voteOptionMap = [
    'IoT Healthcare Platform',
    'Autonomous Vehicle Systems',
    'Carbon Capture Technology',
    'Edge Computing Network',
    'Biotech Data Analytics'
  ];

  const registrationMode: RegistrationModeConfig = {
    sign_up_with_static_whitelist: {
      whitelist: {
        users: [{ addr: address }]
      }
    }
  };

  const voiceCreditMode: VoiceCreditMode = {
    unified: {
      amount: '10'
    }
  };

  const newRound = await client.createAMaciRound({
    maxVoter: 2,
    voteOptionMap,
    operator: 'dora18mph6ekhf70pxqxpq0lfj3z7j3k4mqn8m2cna5',
    registrationMode,
    voiceCreditMode,
    deactivateEnabled: false,
    startVoting: new Date(new Date().getTime() + 1 * 60 * 1000),
    endVoting: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
    title: 'new amaci round',
    circuitType: MaciCircuitType.IP1V
  });
  console.log('newRound txHash:', newRound.transactionHash);
  console.log('contractAddress:', newRound.contractAddress);

  // Query the poll ID assigned to this round by the registry
  const amaciQueryClient = await client.amaciClient({
    contractAddress: newRound.contractAddress
  });
  const pollId = await amaciQueryClient.getPollId();
  console.log('pollId:', pollId);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
