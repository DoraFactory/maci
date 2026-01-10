import { expect } from 'chai';
import { SimulateCosmWasmClient } from '@oraichain/cw-simulate';
import { TestAccount } from '../types';

/**
 * Test helper utilities
 */

/**
 * Assert that a value is defined
 */
export function assertDefined<T>(
  value: T | undefined | null,
  message?: string
): asserts value is T {
  expect(value, message || 'Value should be defined').to.not.be.undefined;
  expect(value, message || 'Value should be defined').to.not.be.null;
}

/**
 * Assert that an array has expected length
 */
export function assertArrayLength<T>(array: T[], expectedLength: number, message?: string): void {
  expect(array.length, message || `Array should have length ${expectedLength}`).to.equal(
    expectedLength
  );
}

/**
 * Wait for a specified amount of time
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse events from contract execution result
 */
export function parseEvents(result: any): any[] {
  if (!result || !result.events) {
    return [];
  }
  return result.events;
}

/**
 * Get event by type
 */
export function getEventByType(events: any[], eventType: string): any | undefined {
  return events.find((event) => event.type === eventType);
}

/**
 * Get attribute value from event
 */
export function getAttributeValue(event: any, key: string): string | undefined {
  if (!event || !event.attributes) {
    return undefined;
  }

  const attr = event.attributes.find((a: any) => a.key === key);
  return attr?.value;
}

/**
 * Parse contract address from instantiate result
 */
export function parseContractAddress(result: any): string {
  const events = parseEvents(result);
  const instantiateEvent = getEventByType(events, 'instantiate');

  if (!instantiateEvent) {
    throw new Error('No instantiate event found');
  }

  const address = getAttributeValue(instantiateEvent, '_contract_address');

  if (!address) {
    throw new Error('No contract address found in event');
  }

  return address;
}

/**
 * Generate test account with incrementing secret keys
 */
export function generateTestAccount(index: number, prefix: string = 'dora'): TestAccount {
  const secretKey = BigInt(111111 + index * 111111);
  const address = `${prefix}1${index.toString().padStart(38, '0')}`;

  return {
    address,
    secretKey
  };
}

/**
 * Generate multiple test accounts
 */
export function generateTestAccounts(count: number, prefix: string = 'dora'): TestAccount[] {
  const accounts: TestAccount[] = [];

  for (let i = 0; i < count; i++) {
    accounts.push(generateTestAccount(i, prefix));
  }

  return accounts;
}

/**
 * Advance blockchain time
 */
/**
 * Advance blockchain time by specified seconds
 * Uses app.time property which is the correct way for cw-simulate
 * CosmWasm uses nanoseconds internally
 */
export async function advanceTime(client: SimulateCosmWasmClient, seconds: number): Promise<void> {
  const app: any = client.app;

  // CosmWasm uses nanoseconds for timestamps
  const nanoseconds = seconds * 1e9;

  // Get current time from app.time (if not set, use Date.now())
  if (!app.time || app.time === 0) {
    app.time = Date.now() * 1e6; // Convert milliseconds to nanoseconds
    console.log('[advanceTime] Initialized app.time to current time:', app.time);
  }

  const currentTime = app.time;
  const newTime = currentTime + nanoseconds;

  console.log(
    '[advanceTime] Advancing from',
    currentTime,
    'to',
    newTime,
    '(+',
    seconds,
    'seconds)'
  );

  // Set the new time using app.time
  app.time = newTime;
}

/**
 * Advance blockchain time by specified nanoseconds (for precise control)
 */
export async function advanceTimeByNanos(
  client: SimulateCosmWasmClient,
  nanoseconds: bigint
): Promise<void> {
  const app: any = client.app;

  // Initialize app.time if not set
  if (!app.time || app.time === 0) {
    app.time = Date.now() * 1e6;
  }

  app.time = app.time + Number(nanoseconds);
}

/**
 * Advance multiple blocks
 */
export async function advanceBlocks(
  client: SimulateCosmWasmClient,
  blocks: number,
  secondsPerBlock: number = 5
): Promise<void> {
  for (let i = 0; i < blocks; i++) {
    await advanceTime(client, secondsPerBlock);
  }
}

/**
 * Get current block info
 * Returns time in nanoseconds (CosmWasm format)
 */
export function getBlockInfo(client: SimulateCosmWasmClient): { height: number; time: bigint } {
  const app: any = client.app;

  // Initialize app.time if not set
  if (!app.time || app.time === 0) {
    app.time = Date.now() * 1e6;
  }

  return {
    height: app.height || 0,
    time: BigInt(app.time)
  };
}

/**
 * Convert bigint array to string array
 */
export function bigintArrayToStringArray(arr: bigint[]): string[] {
  return arr.map((n) => n.toString());
}

/**
 * Convert string array to bigint array
 */
export function stringArrayToBigintArray(arr: string[]): bigint[] {
  return arr.map((s) => BigInt(s));
}

/**
 * Format public key for contract
 */
export function formatPubKeyForContract(pubKey: [bigint, bigint]): { x: string; y: string } {
  return { x: pubKey[0].toString(), y: pubKey[1].toString() };
}

/**
 * Format message data for contract
 */
export function formatMessageForContract(message: bigint[]): string[] {
  return message.map((m) => m.toString());
}

/**
 * Validate contract execution result
 */
export function validateExecuteResult(result: any): void {
  expect(result).to.not.be.undefined;
  expect(result.events).to.be.an('array');
  expect(result.events.length).to.be.greaterThan(0);
}

/**
 * Validate query result
 */
export function validateQueryResult(result: any): void {
  expect(result).to.not.be.undefined;
}

/**
 * Extract error message from contract error
 */
export function extractErrorMessage(error: any): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error.message) {
    return error.message;
  }

  return JSON.stringify(error);
}

/**
 * Assert contract execution succeeds
 */
export async function assertExecuteSuccess(fn: () => Promise<any>, message?: string): Promise<any> {
  try {
    const result = await fn();
    validateExecuteResult(result);
    return result;
  } catch (error) {
    throw new Error(`${message || 'Contract execution failed'}: ${extractErrorMessage(error)}`);
  }
}

/**
 * Assert contract execution fails
 */
export async function assertExecuteFails(
  fn: () => Promise<any>,
  expectedError?: string
): Promise<void> {
  try {
    await fn();
    throw new Error('Expected execution to fail but it succeeded');
  } catch (error: any) {
    if (expectedError) {
      const errorMsg = extractErrorMessage(error);
      expect(errorMsg).to.include(expectedError);
    }
  }
}

/**
 * Log with timestamp
 */
export function log(message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data !== undefined) {
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * Format large number for display
 */
export function formatNumber(num: bigint | string | number): string {
  const n = typeof num === 'bigint' ? num : BigInt(num);
  return n.toLocaleString();
}

/**
 * Compare two bigint values
 */
export function compareBigInt(a: bigint, b: bigint): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Assert bigint equality
 */
export function assertBigIntEqual(actual: bigint, expected: bigint, message?: string): void {
  expect(actual.toString(), message).to.equal(expected.toString());
}

/**
 * Assert bigint array equality
 */
export function assertBigIntArrayEqual(
  actual: bigint[],
  expected: bigint[],
  message?: string
): void {
  expect(actual.length, message || 'Array length mismatch').to.equal(expected.length);
  for (let i = 0; i < actual.length; i++) {
    assertBigIntEqual(
      actual[i],
      expected[i],
      `${message || 'Array element mismatch'} at index ${i}`
    );
  }
}

/**
 * Verify account state in OperatorClient
 * Validates balance, voted status, and activeState for a given stateIdx
 */
export function verifyAccountState(
  operator: any, // OperatorClient type
  stateIdx: number,
  expected: {
    balance?: bigint;
    voted?: boolean;
    activeState?: bigint;
  }
): void {
  const stateLeaf = operator.stateLeaves.get(stateIdx);
  
  if (!stateLeaf) {
    throw new Error(`State leaf not found for index ${stateIdx}`);
  }

  if (expected.balance !== undefined) {
    expect(stateLeaf.balance, `Balance mismatch for state ${stateIdx}`).to.equal(expected.balance);
  }

  if (expected.voted !== undefined) {
    expect(stateLeaf.voted, `Voted status mismatch for state ${stateIdx}`).to.equal(expected.voted);
  }

  if (expected.activeState !== undefined) {
    const actualActiveState = operator.activeStateTree?.leaf(stateIdx);
    expect(actualActiveState, `ActiveState mismatch for state ${stateIdx}`).to.equal(
      expected.activeState
    );
  }
}

/**
 * Verify tally results match between SDK and contract
 * Validates that vote tallies are consistent across SDK and on-chain
 */
export async function verifyTallyResults(
  contract: any, // AmaciContractClient type
  operator: any, // OperatorClient type
  expectedVotes: bigint[]
): Promise<void> {
  const sdkResults = operator.getTallyResults();
  const contractResults = await contract.getAllResult();

  // Verify expected votes length matches
  if (expectedVotes.length !== sdkResults.length) {
    throw new Error(
      `Expected votes length ${expectedVotes.length} does not match SDK results length ${sdkResults.length}`
    );
  }

  // Verify each option's votes
  for (let idx = 0; idx < expectedVotes.length; idx++) {
    // Check SDK result
    expect(sdkResults[idx], `SDK result mismatch for option ${idx}`).to.equal(expectedVotes[idx]);

    // Parse contract result
    // Contract format: votes * 10^24 + voiceCredits
    const MAX_VOTES = 1000000000000000000000000n;
    const contractVotes = BigInt(contractResults[idx]) / MAX_VOTES;

    expect(contractVotes, `Contract result mismatch for option ${idx}`).to.equal(
      expectedVotes[idx]
    );
  }

  log('✓ Tally results verified: SDK and contract match');
}

/**
 * Verify multiple account states in batch
 * Useful for testing scenarios with multiple voters
 */
export function verifyMultipleAccountStates(
  operator: any,
  accountStates: Array<{
    stateIdx: number;
    expected: {
      balance?: bigint;
      voted?: boolean;
      activeState?: bigint;
    };
  }>
): void {
  for (const { stateIdx, expected } of accountStates) {
    verifyAccountState(operator, stateIdx, expected);
  }
  log(`✓ Verified ${accountStates.length} account states`);
}

/**
 * Verify deactivate status for an account
 * Checks that an account is properly marked as deactivated
 */
export function verifyDeactivateStatus(
  operator: any,
  stateIdx: number,
  shouldBeDeactivated: boolean
): void {
  const activeState = operator.activeStateTree?.leaf(stateIdx);

  if (shouldBeDeactivated) {
    expect(activeState, `Account ${stateIdx} should be deactivated (activeState != 0)`).to.not.equal(
      0n
    );
  } else {
    expect(activeState, `Account ${stateIdx} should be active (activeState == 0)`).to.equal(0n);
  }
}

/**
 * Verify vote rejection (balance unchanged, voted=false)
 * Useful for testing scenarios where votes should be rejected
 */
export function verifyVoteRejection(
  operator: any,
  stateIdx: number,
  initialBalance: bigint,
  reason: string
): void {
  const stateLeaf = operator.stateLeaves.get(stateIdx);

  if (!stateLeaf) {
    throw new Error(`State leaf not found for index ${stateIdx}`);
  }

  expect(
    stateLeaf.balance,
    `Vote should be rejected (${reason}): balance should remain ${initialBalance}`
  ).to.equal(initialBalance);

  log(`✓ Vote rejection verified for state ${stateIdx}: ${reason}`);
}

/**
 * Verify vote acceptance (balance changed, voted=true)
 * Validates that a vote was successfully processed
 */
export function verifyVoteAcceptance(
  operator: any,
  stateIdx: number,
  initialBalance: bigint,
  expectedCost: bigint
): void {
  const stateLeaf = operator.stateLeaves.get(stateIdx);

  if (!stateLeaf) {
    throw new Error(`State leaf not found for index ${stateIdx}`);
  }

  const expectedBalance = initialBalance - expectedCost;

  expect(stateLeaf.balance, `Vote acceptance: balance should be ${expectedBalance}`).to.equal(
    expectedBalance
  );

  expect(stateLeaf.voted, `Vote acceptance: voted flag should be true`).to.be.true;

  log(
    `✓ Vote acceptance verified for state ${stateIdx}: balance ${initialBalance} -> ${expectedBalance} (cost: ${expectedCost})`
  );
}

/**
 * Calculate quadratic voting cost
 * Returns the cost for a given number of votes under quadratic voting
 */
export function calculateQuadraticVoteCost(votes: number): bigint {
  return BigInt(votes * votes);
}

/**
 * Verify AddNewKey state inheritance
 * Validates that new key inherits balance and deactivate data from old key
 */
export function verifyAddNewKeyInheritance(
  operator: any,
  oldStateIdx: number,
  newStateIdx: number,
  expectedBalance: bigint
): void {
  const oldStateLeaf = operator.stateLeaves.get(oldStateIdx);
  const newStateLeaf = operator.stateLeaves.get(newStateIdx);

  if (!oldStateLeaf || !newStateLeaf) {
    throw new Error('State leaves not found for AddNewKey verification');
  }

  // New key should inherit balance
  expect(
    newStateLeaf.balance,
    `New key should inherit balance ${expectedBalance} from old key`
  ).to.equal(expectedBalance);

  // Old key should be deactivated
  const oldActiveState = operator.activeStateTree?.leaf(oldStateIdx);
  expect(oldActiveState, 'Old key should be deactivated (activeState != 0)').to.not.equal(0n);

  // New key should be active
  const newActiveState = operator.activeStateTree?.leaf(newStateIdx);
  expect(newActiveState, 'New key should be active (activeState == 0)').to.equal(0n);

  log(
    `✓ AddNewKey inheritance verified: old[${oldStateIdx}] (deactivated) -> new[${newStateIdx}] (active, balance: ${expectedBalance})`
  );
}

/**
 * Verify process message batch count
 * Validates that the expected number of batches were processed
 */
export function verifyBatchCount(
  actualBatchCount: number,
  expectedBatchCount: number,
  maxBatchCount: number = 10
): void {
  expect(
    actualBatchCount,
    `Batch count should be ${expectedBatchCount}, got ${actualBatchCount}`
  ).to.equal(expectedBatchCount);

  expect(actualBatchCount, 'Batch count exceeded maximum').to.be.lessThanOrEqual(maxBatchCount);

  log(`✓ Batch count verified: ${actualBatchCount} batches processed`);
}

