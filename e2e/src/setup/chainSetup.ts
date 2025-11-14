import { SimulateCosmWasmClient } from '@oraichain/cw-simulate';
import { TestEnvironmentConfig, TestAccount } from '../types';

/**
 * Chain setup and configuration
 */
export class ChainSetup {
  private chainId: string;
  private bech32Prefix: string;
  private client: SimulateCosmWasmClient | null;

  constructor(config?: TestEnvironmentConfig) {
    this.chainId = config?.chainId || 'testing';
    this.bech32Prefix = config?.bech32Prefix || 'orai';
    this.client = null;
  }

  /**
   * Create and configure a new SimulateCosmWasmClient
   */
  async createClient(): Promise<SimulateCosmWasmClient> {
    this.client = new SimulateCosmWasmClient({
      chainId: this.chainId,
      bech32Prefix: this.bech32Prefix,
      metering: false // Disable metering to avoid buffer overflow with large WASM files
    });

    return this.client;
  }

  /**
   * Get the client instance
   */
  getClient(): SimulateCosmWasmClient {
    if (!this.client) {
      throw new Error('Client not initialized. Call createClient() first.');
    }
    return this.client;
  }

  /**
   * Generate test accounts
   */
  generateTestAccounts(count: number): TestAccount[] {
    const accounts: TestAccount[] = [];

    for (let i = 0; i < count; i++) {
      // Generate deterministic test addresses
      const address = this.generateAddress(i);
      const secretKey = BigInt(111111 + i * 111111);

      accounts.push({
        address,
        secretKey
      });
    }

    return accounts;
  }

  /**
   * Initialize native balances for test accounts
   */
  async initializeBalances(accounts: TestAccount[]): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    // Set native balances for each account
    for (const account of accounts) {
      await this.client.app.bank.setBalance(account.address, [
        { denom: 'orai', amount: '1000000000000' } // 1M tokens
      ]);
    }
  }

  /**
   * Advance block time by specified seconds
   *
   * @param seconds Number of seconds to advance
   */
  async advanceBlock(seconds: number = 5): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    // CosmWasm uses nanoseconds for timestamps
    const nanoseconds = BigInt(seconds) * BigInt(1_000_000_000);

    // cw-simulate uses Unix timestamps, so add to current real time
    const currentRealTime = BigInt(Date.now()) * BigInt(1_000_000);
    const newTime = currentRealTime + nanoseconds;

    this.setBlockTime(Number(newTime));
  }

  /**
   * Set absolute block time (Unix nanoseconds)
   */
  setBlockTime(nanoseconds: number): void {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const app: any = this.client.app;

    // Update lastBlockTime which cw-simulate uses for env.block.time
    app.lastBlockTime = nanoseconds;

    // Also increment height
    if (app.height !== undefined) {
      app.height = (app.height || 0) + 1;
    }
  }

  /**
   * Advance block time by specified nanoseconds (for precise control)
   *
   * @param nanoseconds Number of nanoseconds to advance
   */
  async advanceBlockByNanos(nanoseconds: bigint): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const store: any = this.client.app.store;
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
   * Get current block info
   */
  getBlockInfo(): { height: number; time: bigint } {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const store: any = this.client.app.store;
    const currentState = store.get();

    return {
      height: currentState.height || 0,
      time: BigInt(currentState.lastBlockTime || 0)
    };
  }

  /**
   * Generate a bech32 address for testing
   */
  private generateAddress(index: number): string {
    // Generate a simple test address using the index
    const bytes = new Uint8Array(20);
    bytes[0] = index;

    // Convert to bech32 format (simplified for testing)
    const hexStr = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // For testing purposes, create a valid-looking address
    // In production, use proper bech32 encoding
    return `${this.bech32Prefix}1${hexStr.slice(0, 38)}`;
  }

  /**
   * Get chain info
   */
  getChainInfo() {
    return {
      chainId: this.chainId,
      bech32Prefix: this.bech32Prefix
    };
  }

  /**
   * Reset the chain state
   */
  async reset(): Promise<void> {
    this.client = null;
  }
}

/**
 * Create a new test environment
 */
export async function createTestEnvironment(config?: TestEnvironmentConfig): Promise<{
  client: SimulateCosmWasmClient;
  accounts: TestAccount[];
  chainSetup: ChainSetup;
}> {
  const chainSetup = new ChainSetup(config);
  const client = await chainSetup.createClient();

  // Generate default accounts if not provided
  const accounts = config?.accounts || chainSetup.generateTestAccounts(10);

  // Initialize balances
  await chainSetup.initializeBalances(accounts);

  return {
    client,
    accounts,
    chainSetup
  };
}
