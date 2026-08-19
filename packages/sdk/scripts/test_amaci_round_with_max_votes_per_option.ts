/**
 * AMACI Round with maxVotesPerOption Complete Test (using MaciClient and VoterClient)
 *
 * This script demonstrates the AMACI per-option vote weight cap workflow:
 * 1. Create Tenant and API Key
 * 2. Create AMACI Round with `maxVotesPerOption` set at creation time (voting starts a
 *    few minutes in the future, leaving a Pending window — see NOTE below)
 * 3. Query the on-chain `max_votes_per_option` to confirm it matches the round config
 * 4. While still Pending (before voting starts), lower the cap via
 *    saasSetMaxVotesPerOption() and confirm the on-chain value updates
 * 5. Wait for voting to start
 * 6. Claim two pre-generated MACI key pairs via saasClaimKey() (one per voter) and
 *    complete Pre-Add-New-Key for both
 * 7. Vote tests against the *final* (post-update) cap:
 *    a) A vote that exceeds the cap is rejected client-side (VoterClient.saasVote's
 *       `maxVotesPerOption` param throws before any tx is submitted)
 *    b) A vote within the cap succeeds normally
 * 8. Confirm saasSetMaxVotesPerOption() now fails once voting has started
 *
 * NOTE on the Pending/Voting period split: the `amaci` contract only allows
 * `set_max_votes_per_option` (like `set_round_info`, `set_vote_option_map`,
 * `set_whitelist`) while the round is still Pending, i.e. `block.time < start_time`
 * (see `execute_set_max_votes_per_option` in `contracts/amaci/src/contract.rs`).
 * Conversely, sign-up / pre-add-new-key / vote all require the round to already be in
 * its Voting period (`check_voting_time`: `start_time <= block.time <= end_time`).
 * These two windows never overlap, so the cap can only be changed *before* anyone can
 * claim a key or vote — it can NOT be raised/lowered mid-round. Calling
 * saasSetMaxVotesPerOption() after voting has started returns a contract `PeriodError`
 * (surfaced as `PeriodError: execute wasm contract failed ... unknown request`). This
 * script therefore updates the cap in step 4 (Pending) and deliberately demonstrates the
 * rejection again in step 8 (after voting has started) as an explicit, expected check.
 *
 * NOTE on circuit scale: the add-new-key (`add-new-key_v3/...`) circuit files that are
 * actually shipped in the online/deployed environment only exist at the `9-4-3-125`
 * scale. `2-1-1-5` is only used inside the `amaci` contract's own Rust multitest suite
 * (`contracts/amaci/src/multitest/tests.rs`) — it is not a real deployed circuit, so SDK
 * scripts must use `9-4-3-125` (see `test_amaci_pre_add_with_client_claim.ts`).
 *
 * NOTE on maxVotesPerOption + trusted setup: per docs/AMACI-MaxVotesPerOption.md, the
 * *ProcessMessages/tally* circuit at production scale (`9-4-3-125`) has not completed a
 * new trusted-setup ceremony for the `maxVotesPerOption` constraint yet. That only
 * affects the operator's off-chain proof generation during message processing/tallying,
 * which this script never triggers (it only creates the round, signs up, and submits
 * vote messages) — so it's safe to exercise the client-side / contract-level behavior
 * here. Do NOT use a non-zero `maxVotesPerOption` for a round that will actually be
 * tallied in production until that ceremony is completed.
 */

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an indexer (GraphQL / REST) query until it succeeds or the timeout is reached.
 * Useful when a transaction is confirmed on-chain but the indexer hasn't synced yet.
 */
async function waitForIndexer<T>(
  fn: () => Promise<T>,
  options: { timeout?: number; interval?: number; label?: string } = {}
): Promise<T> {
  const timeout = options.timeout ?? 30_000;
  const interval = options.interval ?? 2_000;
  const label = options.label ?? 'indexer query';
  const deadline = Date.now() + timeout;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (Date.now() + interval > deadline) {
        throw new Error(`Timeout waiting for ${label}: ${(error as Error).message}`);
      }
      console.log(`  [waitForIndexer] ${label} not ready yet, retrying in ${interval}ms...`);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
}

async function main() {
  const network = 'mainnet';
  const operator = 'dora16nkezrnvw9fzqqqmmqtrdkw3pqes6qthhse2k4';

  // const network = 'testnet';
  // const operator = 'dora149n5yhzgk5gex0eqmnnpnsxh6ys4exg5xyqjzm';

  console.log('='.repeat(80));
  console.log('AMACI Round with maxVotesPerOption Complete Test (MaciClient & VoterClient)');
  console.log('='.repeat(80));

  // API base configuration
  // const API_BASE_URL = 'http://localhost:8080';
  const API_BASE_URL = undefined;
  const INDEXER_BASE_URL = undefined;
  // const INDEXER_BASE_URL = 'https://maci-testnet-graphql.dorafactory.org';

  // Only `9-4-3-125` addKey circuit files are actually deployed in the online
  // environment — see NOTE at the top of this file. Do not switch to `2-1-1-5`.
  const maxVoter = 25;
  const circuitPower = '9-4-3-125';
  const stateTreeDepth = 9;

  // Per-option vote weight cap configured at round creation. 0 would mean "no limit".
  const initialMaxVotesPerOption = 5;
  // Cap applied while the round is still Pending (before voting starts) — this is the
  // value actually enforced once voting begins. See NOTE at the top of this file for
  // why the cap can only be changed before `startVoting`.
  const finalMaxVotesPerOption = 2;

  // Voting starts a few minutes from now so there's a Pending window long enough to
  // create the round and call saasSetMaxVotesPerOption() before voting begins.
  const VOTING_START_DELAY_MS = 3 * 60 * 1000; // 3 minutes

  // Multi-endpoint config — first endpoint is tried first; subsequent entries act as fallbacks
  const rpcEndpoints = undefined;
  const restEndpoints = undefined;

  // Create temporary MaciClient (for admin operations, no API key required)
  const adminMaciClient = new MaciClient({
    network,
    rpcEndpoints,
    restEndpoints,
    saasApiEndpoint: API_BASE_URL,
    apiEndpoint: INDEXER_BASE_URL
  });

  // ==================== 1. Create Tenant and API Key ====================
  const tenantName = `Test Tenant ${generateRandomString(10)}`;
  console.log(`\n[1/8] Creating Tenant: ${tenantName}`);

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    throw new Error('ADMIN_SECRET environment variable is not set');
  }

  const amaciClaimKey = process.env.AMACI_CLAIM_KEY;
  if (!amaciClaimKey) {
    throw new Error('AMACI_CLAIM_KEY environment variable is not set');
  }

  const tenantData = await adminMaciClient
    .getSaasApiClient()
    .createTenant({ name: tenantName }, adminSecret);
  console.log('✓ Tenant created successfully:', tenantData.id);

  const apiKeyData = await adminMaciClient.getSaasApiClient().createApiKey(
    {
      tenantId: tenantData.id,
      label: 'Test API Key',
      plan: 'pro'
    },
    adminSecret
  );
  const apiKey = apiKeyData.apiKey;
  console.log('✓ API Key created successfully:', apiKey);

  // Create MaciClient with API Key (required for saasClaimKey / saasSetMaxVotesPerOption)
  const maciClient = new MaciClient({
    network,
    rpcEndpoints,
    restEndpoints,
    saasApiEndpoint: API_BASE_URL,
    saasApiKey: apiKey,
    apiEndpoint: INDEXER_BASE_URL
  });

  // ==================== 2. Create AMACI Round with maxVotesPerOption ====================
  console.log('\n[2/8] Creating AMACI Round');
  console.log('  maxVotesPerOption (initial):', initialMaxVotesPerOption);

  const startVoting = new Date(Date.now() + VOTING_START_DELAY_MS);
  const endVoting = new Date(startVoting.getTime() + 11 * 60 * 1000); // 11 minutes later
  console.log('  Voting start:', startVoting.toISOString());
  console.log('  Voting end  :', endVoting.toISOString());

  const createRoundData = await maciClient.saasCreateAmaciRound({
    title: 'maxVotesPerOption Test Round',
    description: 'Testing per-option vote weight cap (maxVotesPerOption)',
    link: 'https://test.com',
    startVoting: startVoting.toISOString(),
    endVoting: endVoting.toISOString(),
    operator,
    maxVoter: maxVoter,
    voteOptionMap: ['Option A', 'Option B', 'Option C', 'Option D', 'Option E'],
    circuitType: MaciCircuitType.IP1V,
    voiceCreditAmount: 100,
    maxVotesPerOption: initialMaxVotesPerOption
  });

  if (createRoundData.status === 'failed') {
    throw new Error(`Round creation failed: ${createRoundData.error ?? 'unknown error'}`);
  }

  const contractAddress = createRoundData.contractAddress;
  if (!contractAddress) {
    throw new Error('Contract address not returned');
  }

  const ticket = createRoundData.ticket;
  if (!ticket) {
    throw new Error('Ticket not returned');
  }

  console.log('✓ Round created successfully!');
  console.log('  Contract Address:', contractAddress);
  console.log('  Status:', createRoundData.status);
  console.log('  TX Hash:', createRoundData.txHash);
  console.log('  Ticket:', ticket);
  console.log('  Poll ID:', createRoundData.pollId ?? 'N/A');

  // ==================== 3. Verify on-chain maxVotesPerOption ====================
  console.log('\n[3/8] Verifying on-chain maxVotesPerOption');

  const onChainCap = await waitForIndexer(
    () => maciClient.contract.getMaxVotesPerOption({ contractAddress }),
    { label: 'on-chain maxVotesPerOption', timeout: 30_000, interval: 2_000 }
  );
  console.log('  On-chain maxVotesPerOption:', onChainCap);

  if (BigInt(onChainCap) !== BigInt(initialMaxVotesPerOption)) {
    throw new Error(
      `On-chain maxVotesPerOption (${onChainCap}) does not match configured value (${initialMaxVotesPerOption})`
    );
  }
  console.log('✓ On-chain maxVotesPerOption matches round config');

  // Fetch the round's on-chain coordinator pubkey for voting (may differ from the
  // pre-deactivate coordinator key used when building the deactivate tree).
  // Wrap with waitForIndexer — the indexer may lag a few seconds behind chain confirmation.
  const roundInfo = await waitForIndexer(() => maciClient.getRoundInfo({ contractAddress }), {
    label: 'round info',
    timeout: 30_000,
    interval: 2_000
  });
  const roundCoordPubkey: [bigint, bigint] = [
    BigInt(roundInfo.coordinatorPubkeyX),
    BigInt(roundInfo.coordinatorPubkeyY)
  ];
  console.log('  Round Coord Pubkey:', roundCoordPubkey);

  // ==================== 4. Update the cap while still Pending ====================
  console.log(
    `\n[4/8] Round is still Pending (voting hasn't started) — lowering maxVotesPerOption ` +
      `from ${initialMaxVotesPerOption} to ${finalMaxVotesPerOption}`
  );

  const setCapResult = await maciClient.saasSetMaxVotesPerOption({
    contractAddress,
    maxVotesPerOption: finalMaxVotesPerOption
  });

  if (setCapResult.status === 'failed') {
    throw new Error(`setMaxVotesPerOption failed: ${setCapResult.error ?? 'unknown error'}`);
  }
  console.log('✓ maxVotesPerOption updated while Pending! TX Hash:', setCapResult.txHash);

  const updatedOnChainCap = await waitForIndexer(
    async () => {
      const cap = await maciClient.contract.getMaxVotesPerOption({ contractAddress });
      if (BigInt(cap) !== BigInt(finalMaxVotesPerOption)) {
        throw new Error(`cap not yet updated on-chain (still ${cap})`);
      }
      return cap;
    },
    { label: 'updated on-chain maxVotesPerOption', timeout: 30_000, interval: 2_000 }
  );
  console.log('✓ On-chain maxVotesPerOption confirmed updated:', updatedOnChainCap);

  // ==================== 5. Wait for voting to start ====================
  const msUntilStart = startVoting.getTime() - Date.now();
  const waitMs = Math.max(msUntilStart, 0) + 5_000; // small buffer past the start time
  console.log(`\n[5/8] Waiting ${Math.ceil(waitMs / 1000)}s for voting to start...`);

  const TICK_MS = 10_000;
  let remaining = waitMs;
  while (remaining > 0) {
    const tick = Math.min(TICK_MS, remaining);
    await sleep(tick);
    remaining -= tick;
    if (remaining > 0) {
      console.log(`  ... ${Math.ceil(remaining / 1000)}s remaining`);
    }
  }
  console.log('✓ Voting has started');

  // ==================== 6. Claim two keys + Pre-Add-New-Key ====================
  console.log('\n[6/8] Claiming two MACI Key pairs (saasClaimKey) + Pre-Add-New-Key');

  // Uses AMACI_CLAIM_KEY as the X-Amaci-Claim-Key header — no ticket required for this step
  const claimVoterClient = new VoterClient({
    network,
    rpcEndpoints,
    restEndpoints,
    saasApiEndpoint: API_BASE_URL,
    apiEndpoint: INDEXER_BASE_URL
  });

  const claimedKeyA = await claimVoterClient.saasClaimKey({ contractAddress, amaciClaimKey });
  console.log('✓ Voter A key claimed! Leaf Index:', claimedKeyA.leafIndex);

  const claimedKeyB = await claimVoterClient.saasClaimKey({ contractAddress, amaciClaimKey });
  console.log('✓ Voter B key claimed! Leaf Index:', claimedKeyB.leafIndex);

  // pollId is already embedded in the claim response — no extra contract call needed
  const pollId = claimedKeyA.pollId !== null ? Number(claimedKeyA.pollId) : undefined;
  console.log('  Poll ID (from claim):', pollId);

  console.log('  stateTreeDepth:', stateTreeDepth);
  console.log('  addKey wasm:', `add-new-key_v3/${circuitPower}/addKey.wasm`);
  console.log('  addKey zkey:', `add-new-key_v3/${circuitPower}/addKey.zkey`);

  async function preAddNewKeyFromClaim(
    claimedKey: typeof claimedKeyA,
    label: string,
    addr: string,
    roundTicket: string
  ) {
    const voterClient = new VoterClient({
      network,
      rpcEndpoints,
      restEndpoints,
      secretKey: claimedKey.secretKey,
      saasApiEndpoint: API_BASE_URL,
      apiEndpoint: INDEXER_BASE_URL
    });

    const preDeactivateCoordPubkey = voterClient.unpackMaciPubkey(claimedKey.coordinatorPubkey);

    // saasPreCreateNewAccount — pre-computed proof path: the Merkle proof (root,
    // pathElements, deactivateLeaf) comes directly from the claimMaciKey response.
    const { account, result } = await voterClient.saasPreCreateNewAccount({
      contractAddress: addr,
      stateTreeDepth,
      coordinatorPubkey: preDeactivateCoordPubkey,
      deactivateIdx: claimedKey.leafIndex,
      preComputedProof: {
        root: claimedKey.root,
        pathElements: claimedKey.pathElements,
        deactivateLeaf: claimedKey.deactivateLeaf
      },
      pollId,
      wasmFile: path.join(process.cwd(), `add-new-key_v3/${circuitPower}/addKey.wasm`),
      zkeyFile: path.join(process.cwd(), `add-new-key_v3/${circuitPower}/addKey.zkey`),
      ticket: roundTicket
    });

    if (result.status === 'failed') {
      throw new Error(`Pre-Add-New-Key failed for ${label}: ${result.error ?? 'unknown error'}`);
    }
    console.log(`✓ Pre-Add-New-Key succeeded for ${label}! TX Hash:`, result.txHash);

    await voterClient.waitForTransaction(result.txHash);

    const userIdx = await waitForIndexer(
      async () => {
        const idx = await account.getStateIdx({ contractAddress: addr });
        if (idx === -1) throw new Error('state index not yet available');
        return idx;
      },
      { label: `${label} state index`, timeout: 30_000, interval: 1_000 }
    );
    console.log(`  ${label} userIdx:`, userIdx);

    return account;
  }

  const voterA = await preAddNewKeyFromClaim(claimedKeyA, 'Voter A', contractAddress, ticket);
  const voterB = await preAddNewKeyFromClaim(claimedKeyB, 'Voter B', contractAddress, ticket);

  // ==================== 7. Vote tests against the final cap ====================
  console.log('\n[7/8] Vote tests');

  // ---- 7a. Voter A: vote weight exceeds the final cap → rejected client-side ----
  const overCapVote = { idx: 0, vc: finalMaxVotesPerOption + 3 };
  console.log(
    `\n[7a] Voter A votes ${overCapVote.vc} on option ${overCapVote.idx} ` +
      `(final cap is ${finalMaxVotesPerOption}) — expecting client-side rejection`
  );
  let overCapVoteWasRejected = false;
  try {
    await voterA.saasVote({
      contractAddress,
      operatorPubkey: roundCoordPubkey,
      selectedOptions: [overCapVote],
      ticket,
      pollId,
      maxVotesPerOption: finalMaxVotesPerOption
    });
  } catch (error) {
    overCapVoteWasRejected = true;
    console.log('✓ Over-cap vote correctly rejected:', (error as Error).message);
  }
  if (!overCapVoteWasRejected) {
    throw new Error('Expected the over-cap vote to be rejected client-side, but it succeeded');
  }

  // ---- 7b. Voter B: vote weight within the final cap → succeeds ----
  const withinCapVote = { idx: 0, vc: finalMaxVotesPerOption };
  console.log(
    `\n[7b] Voter B votes ${withinCapVote.vc} on option ${withinCapVote.idx} ` +
      `(final cap is ${finalMaxVotesPerOption}) — expecting success`
  );
  const withinCapResult = await voterB.saasVote({
    contractAddress,
    operatorPubkey: roundCoordPubkey,
    selectedOptions: [withinCapVote, { idx: 2, vc: 1 }],
    ticket,
    pollId,
    maxVotesPerOption: finalMaxVotesPerOption
  });
  console.log('✓ Within-cap vote succeeded!', withinCapResult);

  // ==================== 8. Confirm the cap is locked once voting has started ====================
  console.log(
    '\n[8/8] Voting has already started — confirming saasSetMaxVotesPerOption() is now rejected'
  );
  const setCapAfterStartResult = await maciClient.saasSetMaxVotesPerOption({
    contractAddress,
    maxVotesPerOption: 10
  });

  if (setCapAfterStartResult.status === 'failed') {
    console.log('✓ setMaxVotesPerOption correctly rejected after voting started');
    console.log('  Error:', setCapAfterStartResult.error ?? '(PeriodError from contract)');
  } else {
    console.error('✗ ERROR: setMaxVotesPerOption succeeded after voting started!');
    console.error('  The contract restriction is NOT working as expected.');
    process.exit(1);
  }

  // ==================== Completed ====================
  console.log('\n' + '='.repeat(80));
  console.log('Test completed!');
  console.log('='.repeat(80));
  console.log('\nSummary:');
  console.log('✓ Created an AMACI round with maxVotesPerOption set at creation time');
  console.log('✓ Verified the on-chain max_votes_per_option matches the round config');
  console.log('✓ Lowered the cap via saasSetMaxVotesPerOption() while still Pending');
  console.log('✓ Claimed two MACI key pairs via saasClaimKey() and completed Pre-Add-New-Key');
  console.log('✓ A vote exceeding the final cap was rejected client-side before any tx was sent');
  console.log('✓ A vote within the final cap was submitted and accepted');
  console.log('✓ Confirmed saasSetMaxVotesPerOption() is rejected once voting has started');
  console.log('\nContract Address:', contractAddress);
  console.log('\nClient Features Demonstrated:');
  console.log('  - MaciClient (requires API key):');
  console.log('    • saasCreateAmaciRound({ maxVotesPerOption }): set cap at creation time');
  console.log('    • saasSetMaxVotesPerOption(): update the cap — only while Pending');
  console.log('    • contract.getMaxVotesPerOption(): query the on-chain cap');
  console.log('  - VoterClient:');
  console.log('    • saasClaimKey(): claim pre-generated key + full deactivate Merkle proof');
  console.log('    • saasPreCreateNewAccount(): pre-computed proof path (preComputedProof)');
  console.log(
    '    • saasVote({ maxVotesPerOption }): client-side pre-check rejects over-cap votes'
  );
}

main().catch((error) => {
  console.error('\n❌ Test failed:', error);
  if (error instanceof Error) {
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
  }
  process.exit(1);
});
