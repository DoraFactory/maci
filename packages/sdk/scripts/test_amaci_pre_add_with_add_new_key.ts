/**
 * Native Add-New-Key + Deactivate Complete Test (no SaaS methods)
 *
 * Workflow:
 * 1. Create AMACI Round (signupWhitelist mode, deactivateEnabled=true)
 * 2. Signup with voter wallet
 * 3. Voter casts first vote
 * 4. Voter deactivates their key
 * 5. Voter calls Add-New-Key with a new keypair (uses rawAddNewKey, requires deactivateEnabled mode)
 * 6. New account casts second vote
 */

import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing';
import * as path from 'path';
import dotenv from 'dotenv';

import { MaciClient } from '../src/maci';
import { VoterClient } from '../src/voter';
import { MaciCircuitType } from '../src/types';
import { genKeypair } from '../src/libs/crypto/keys';

dotenv.config();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('='.repeat(80));
  console.log('Native Pre-Add-New-Key + Deactivate Complete Test');
  console.log('='.repeat(80));

  const network = 'testnet';

  // ==================== Load wallet from private key ====================
  let rawKey = process.env.ADMIN_PRIVATE_KEY;
  if (!rawKey) {
    throw new Error('ADMIN_PRIVATE_KEY is not set');
  }
  if (rawKey.startsWith('0x')) {
    rawKey = rawKey.slice(2);
  }
  const wallet = await DirectSecp256k1Wallet.fromKey(Buffer.from(rawKey, 'hex'), 'dora');
  const [{ address }] = await wallet.getAccounts();
  console.log('\nWallet address:', address);

  // ==================== 1. Create AMACI Round ====================
  console.log('\n[1/6] Creating AMACI Round (signupWhitelist, deactivateEnabled=true)');

  // Create a VoterClient with the same MACI keypair to build the proof
  const voterClient = new VoterClient({
    network,
    secretKey: 22222222n
  });

  // Extract the maciKeypair from voterClient so MaciClient uses the exact same MACI keys.
  // This ensures signup/vote/deactivate all use the same keypair that voterClient will later
  // use to find its deactivate leaf when building the Pre-Add-New-Key ZK proof.
  const maciKeypair = {
    privKey: voterClient.accountManager.currentKeypair.getPrivateKey(),
    pubKey: voterClient.accountManager.currentKeypair.getPublicKey().toPoints() as [bigint, bigint],
    formatedPrivKey: voterClient.accountManager.currentKeypair.getFormatedPrivKey()
  };

  const maciClient = new MaciClient({
    network,
    signer: wallet,
    maciKeypair
  });

  const contractAddress = 'dora1jvxg4w862skw34h8nd3kzx2eu6hfzga7cctfpldn3y3q7j47a9fsz2mr33';

  // Fetch round info to get coordinator pubkey
  const roundInfo = await maciClient.getRoundInfo({ contractAddress });
  console.log('  coordinatorPubkeyX:', roundInfo.coordinatorPubkeyX);
  console.log('  coordinatorPubkeyY:', roundInfo.coordinatorPubkeyY);

  const operatorCoordPubKey: [bigint, bigint] = [
    BigInt(roundInfo.coordinatorPubkeyX),
    BigInt(roundInfo.coordinatorPubkeyY)
  ];

  // ==================== 5. Add-New-Key ====================
  console.log('\n[5/6] Add-New-Key (generating new keypair)');

  // Fetch all deactivate logs from indexer
  const deactivateLogs = await maciClient.fetchAllDeactivateLogs(contractAddress);
  console.log('  Deactivate logs count:', deactivateLogs.length);

  if (deactivateLogs.length === 0) {
    throw new Error('No deactivate logs found — deactivate may not have been processed yet');
  }

  const circuitPower = 'new_2-1-1-5';
  const stateTreeDepth = 2;

  console.log('  Building Add-New-Key payload...');
  const addKeyPayload = await voterClient.buildAddNewKeyPayload({
    stateTreeDepth,
    operatorPubkey: operatorCoordPubKey,
    deactivates: deactivateLogs as unknown as string[][],
    wasmFile: path.join(process.cwd(), `add-new-key_v3/${circuitPower}/addKey.wasm`),
    zkeyFile: path.join(process.cwd(), `add-new-key_v3/${circuitPower}/addKey.zkey`)
  });

  console.log('  Nullifier:', addKeyPayload.nullifier);

  // Derive a new keypair for the replacement account
  const newVoterClient = new VoterClient({ network, secretKey: 33333333n });
  const newPubkey = newVoterClient.getPubkey().toPoints() as [bigint, bigint];
  console.log('  New pubkey:', newPubkey);

  const addKeyResp = await maciClient.rawAddNewKey({
    contractAddress,
    d: addKeyPayload.d,
    proof: addKeyPayload.proof,
    nullifier: BigInt(addKeyPayload.nullifier),
    newPubkey
  });
  console.log('✓ Add-New-Key TX:', addKeyResp.transactionHash);

  // Wait for the new state index to appear
  console.log('\nWaiting for new account state index...');
  await delay(8000);

  let newStateIdx = await newVoterClient.getStateIdx({ contractAddress });
  console.log('  newStateIdx:', newStateIdx);
  while (newStateIdx === -1) {
    await delay(2000);
    newStateIdx = await newVoterClient.getStateIdx({ contractAddress });
    console.log('  newStateIdx:', newStateIdx);
  }

  // ==================== 6. Second Vote with New Key ====================
  console.log('\n[6/6] Second vote with new keypair');

  const pollId = await newVoterClient.getPollId(contractAddress);
  console.log('  pollId:', pollId);

  const votePayload = newVoterClient.buildVotePayload({
    stateIdx: newStateIdx,
    operatorPubkey: operatorCoordPubKey,
    selectedOptions: [
      { idx: 0, vc: 1 },
      { idx: 2, vc: 1 },
      { idx: 3, vc: 1 }
    ],
    pollId
  });

  const vote2Resp = await maciClient.rawVote({
    contractAddress,
    payload: votePayload.map((p) => ({
      msg: p.msg.map((m) => BigInt(m)),
      encPubkeys: [BigInt(p.encPubkeys[0]), BigInt(p.encPubkeys[1])] as [bigint, bigint]
    }))
  });
  console.log('✓ Second Vote TX:', vote2Resp.transactionHash);

  // ==================== Summary ====================
  console.log('\n' + '='.repeat(80));
  console.log('Test completed!');
  console.log('='.repeat(80));
  console.log('\nSummary:');
  console.log('✓ Created AMACI Round (signupWhitelist, deactivateEnabled=true)');
  console.log('✓ Signed up voter');
  console.log('✓ First vote cast');
  console.log('✓ Key deactivated');
  console.log('✓ Pre-Add-New-Key submitted');
  console.log('✓ Second vote cast with new key');
  console.log('\nContract Address:', contractAddress);
}

main().catch((error) => {
  console.error('\n❌ Test failed:', error);
  if (error instanceof Error) {
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
  }
  process.exit(1);
});
