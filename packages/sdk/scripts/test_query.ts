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

  // ================ test oracle signup and vote

  const rounds = await client.indexer.getRounds('first', 1);
  console.log('rounds', JSON.stringify(rounds, null, 2));

  if (isErrorResponse(rounds)) {
    throw new Error(rounds.error.message);
  }
  console.log(rounds);
  const data = rounds.data.rounds.edges.map((edge: any) => ({
    name: edge.node.roundTitle,
    contract: edge.node.contractAddress,
    circuit: edge.node.circuitName,
    status: edge.node.status,
    startTime: edge.node.votingStart,
    endTime: edge.node.votingEnd,
    link: `https://maci.dora.xyz/round/${edge.node.contractAddress}`,
  }));
  console.log('data', JSON.stringify(data, null, 2));
  // const RoundAddress =
  //   'dora1hhxfw6tw9ef9467gphkfgrq0cg0dndndk875agrkaa479x9hx03qncmw48';

  // const allowance = await client.indexer.balanceOf(RoundAddress);
  // console.log('allowance', allowance);
}

main();
