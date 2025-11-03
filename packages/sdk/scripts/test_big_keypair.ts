import dotenv from 'dotenv';
import { VoterClient } from '../src';

dotenv.config();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('======= start test contract logic =======');
  const L = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;

  const privateKey1 = 1n;
  const voterClient = new VoterClient({
    network: 'testnet',
    secretKey: privateKey1
  });

  console.log('secretKey1', voterClient.getSigner().getSecretKey());
  const privateKey2 = L + 1n;
  const voterClient2 = new VoterClient({
    network: 'testnet',
    secretKey: privateKey2
  });

  console.log('secretKey2', voterClient2.getSigner().getSecretKey());
  const pubKey1 = voterClient.getPubkey();
  const pubKey2 = voterClient2.getPubkey();
  console.log('pubKey1', pubKey1.toPackedData());
  console.log('pubKey2', pubKey2.toPackedData());

  const circuitPubKey1 = voterClient.getSigner().getPublicKey().asCircuitInputs();
  const circuitPubKey2 = voterClient2.getSigner().getPublicKey().asCircuitInputs();
  console.log('circuitPubKey1', circuitPubKey1);
  console.log('circuitPubKey2', circuitPubKey2);
}

main();
