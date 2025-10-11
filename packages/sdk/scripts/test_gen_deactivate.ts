import { VoterClient } from '../src';
import dotenv from 'dotenv';

dotenv.config();

import * as path from 'path';
import * as fs from 'fs';

async function main() {
  const secretKey = process.env.ADMIN_PRIVATE_KEY;
  if (!secretKey) {
    throw new Error('ADMIN_PRIVATE_KEY not found in environment variables');
  }

  const coordinator = new VoterClient({
    secretKey
  });
  console.log('coordinator', coordinator.getPubkey().toPackedData());
  const { deactivates, root, leaves, tree } = coordinator.getSigner().genDeactivateRoot(
    [
      62071628452838807843875387950635179100467701723619568550128325247586768602836n, // voter pubkey
      8488296638481981615643178142445511165715108699929572315723118360556015787681n,
      59183419265525843263552876017551249941309839147094892945935225919011194818766n
    ],
    2
  );

  console.log(root);

  const voterClient = new VoterClient({
    mnemonic: process.env.VOTER_MNEMONIC
  });

  const circuitPower = '2-1-1-5';

  const wasmPath = path.join(process.cwd(), `add-new-key_v3/${circuitPower}/addKey.wasm`);
  const zkeyPath = path.join(process.cwd(), `add-new-key_v3/${circuitPower}/addKey.zkey`);

  const wasmUint8Array = new Uint8Array(fs.readFileSync(wasmPath));
  const zkeyUint8Array = new Uint8Array(fs.readFileSync(zkeyPath));

  console.log('WASM Length:', wasmUint8Array.length);
  console.log('ZKEY Length:', zkeyUint8Array.length);

  const genProof = await voterClient.buildPreAddNewKeyPayload({
    stateTreeDepth: 2,
    operatorPubkey: 15985671812509037697999452079047723323214510694838922960102081803756551067669n,
    deactivates,
    wasmFile: wasmUint8Array,
    zkeyFile: zkeyUint8Array
  });

  console.log(genProof);
}

main();
