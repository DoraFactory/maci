/**
 * Pre-Add-New-Key and Pre-Deactivate API Complete Test (using MaciClient and VoterClient)
 *
 * This script demonstrates the complete AMACI Pre-Deactivate workflow:
 * 1. Create Tenant and API Key
 * 2. Create AMACI Round (automatic Pre-Deactivate mode)
 * 3. Query Pre-Deactivate data
 * 4. Test Pre-Add-New-Key
 * 5. Test voting
 */
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing';

import { MaciClient } from '../src/maci';
import { VoterClient } from '../src/voter';
import { MaciCircuitType } from '../src/types';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config();

function generateRandomString(length: number) {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

async function main() {
  try {
    const network = 'mainnet';
    const contractAddress = 'dora1azpxzrff9teuhzkhs3avmxeu6cuphjy5gu6q9y342pxdju8ttlmqfnszjw';
    const account = new VoterClient({
      network: network,
      secretKey: 5992588505835988964618144646661874447520602296432627740629652492462835776651n
    });
    let stateIdx = await account.getStateIdx({
      contractAddress
    });
    console.log('stateIdx', stateIdx);
    while (stateIdx === -1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      stateIdx = await account.getStateIdx({
        contractAddress
      });
      console.log('stateIdx', stateIdx);
    }
    // Use saasVote: builds payload + submits vote
    const payload = account.buildVotePayload({
      stateIdx,
      operatorPubkey: 1543204810362218394850028913632376147290317641442164443830849121941234286792n,
      selectedOptions: [
        { idx: 0, vc: 1 },
        { idx: 1, vc: 1 },
        { idx: 3, vc: 1 }
      ]
    });

    let key = process.env.ADMIN_PRIVATE_KEY_2;
    if (!key) {
      throw new Error('Admin private key not found in environment variables');
    }
    if (key.startsWith('0x')) {
      key = key.slice(2);
    }
    const wallet = await DirectSecp256k1Wallet.fromKey(Buffer.from(key, 'hex'), 'dora');

    const client = new MaciClient({
      network,
      signer: wallet
      // rpcEndpoint: 'https://vota-archive-rpc.dorafactory.org:443'
    });

    const voteResult = await client.rawVote({
      contractAddress,
      payload: payload.map((p) => ({
        msg: p.msg.map((m) => BigInt(m)),
        encPubkeys: [BigInt(p.encPubkeys[0]), BigInt(p.encPubkeys[1])]
      }))
    });
    console.log('voteResult', voteResult);
  } catch (error) {
    console.log('⚠ Failed:', error);
    if (error instanceof Error) {
      console.log('  Error message:', error.message);
    }
  }

  // ==================== Completed ====================
  console.log('\n' + '='.repeat(80));
}

main().catch((error) => {
  console.error('\n❌ Test failed:', error);
  if (error instanceof Error) {
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
  }
  process.exit(1);
});
