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
export function generateTestAccount(index: number, prefix: string = 'orai'): TestAccount {
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
export function generateTestAccounts(count: number, prefix: string = 'orai'): TestAccount[] {
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
 * CosmWasm uses nanoseconds internally
 */
export async function advanceTime(client: SimulateCosmWasmClient, seconds: number): Promise<void> {
  // CosmWasm uses nanoseconds for timestamps
  const nanoseconds = BigInt(seconds) * BigInt(1_000_000_000);

  // Access app's internal state
  const app: any = client.app;

  // Try to get current state from store
  if (app.store && typeof app.store.get === 'function') {
    const currentState = app.store.get();
    const currentHeight = currentState.height || 0;
    const currentTime = currentState.lastBlockTime || 0;

    // Update via store if it has an update method
    if (typeof app.store.update === 'function') {
      app.store.update((state: any) => ({
        ...state,
        height: currentHeight + 1,
        lastBlockTime: currentTime + Number(nanoseconds)
      }));
    } else {
      // Fallback: directly modify app properties
      if (app.height !== undefined) app.height = currentHeight + 1;
      if (app.lastBlockTime !== undefined) app.lastBlockTime = currentTime + Number(nanoseconds);
    }
  } else {
    // Fallback: directly modify app properties
    const currentHeight = app.height || 0;
    const currentTime = app.lastBlockTime || 0;
    app.height = currentHeight + 1;
    app.lastBlockTime = currentTime + Number(nanoseconds);
  }
}

/**
 * Advance blockchain time by specified nanoseconds (for precise control)
 */
export async function advanceTimeByNanos(
  client: SimulateCosmWasmClient,
  nanoseconds: bigint
): Promise<void> {
  const store: any = client.app.store;
  const currentState = store.get();
  const currentBlock = currentState.height || 0;
  const currentTime = currentState.lastBlockTime || 0;

  store.set({
    ...currentState,
    height: currentBlock + 1,
    lastBlockTime: currentTime + Number(nanoseconds)
  });
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
  const store: any = client.app.store;
  const currentState = store.get();

  return {
    height: currentState.height || 0,
    time: BigInt(currentState.lastBlockTime || 0)
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
