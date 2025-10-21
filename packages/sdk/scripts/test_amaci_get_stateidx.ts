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

import { MaciClient } from '../src/maci';
import { VoterClient } from '../src/voter';
import { MaciCircuitType } from '../src/types';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const network = 'testnet';
  const API_BASE_URL = 'http://localhost:8080';

  const voterClient = new VoterClient({
    network: network,
    saasApiEndpoint: API_BASE_URL
  });

  const accountIdx = await voterClient.getStateIdx({
    contractAddress: 'dora18fud47reafxkdk7sej9yrvzfak46es5897pck9tw6vjjskujgfnq4kft33',
    pubkey: 5183650788028357684919012540846714968686272474653268261009150307155673954119n
  });
  console.log('=============== accountIdx', accountIdx);
}

main();
