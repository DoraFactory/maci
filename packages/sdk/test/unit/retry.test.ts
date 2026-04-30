/**
 * Unit tests for Contract.withRetry (accessed via any-cast for private method testing)
 *
 * Verifies:
 * - BroadcastTxError causes immediate failure (no retry)
 * - Network errors trigger primary-first endpoint rotation
 * - Succeeds on a later attempt after failures
 * - Respects retries count
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BroadcastTxError } from '@cosmjs/stargate';
import { Contract } from '../../src/libs/contract/contract';

// ─── Minimal ContractParams for instantiation ─────────────────────────────────

function makeContract(rpcUrls: string[], retries = 3, retryDelay = 200) {
  return new Contract({
    network: 'testnet',
    rpcEndpoints: rpcUrls,
    registryAddress: 'dora1registry',
    saasAddress: 'dora1saas',
    apiSaasAddress: 'dora1api',
    maciCodeId: 1,
    oracleCodeId: 2,
    feegrantOperator: 'dora1feeop',
    whitelistBackendPubkey: 'pubkey',
    retries,
    retryDelay
  });
}

// Helper to access the private withRetry method
function callWithRetry<T>(
  contract: Contract,
  fn: (rpcEndpoint: string) => Promise<T>
): Promise<T> {
  return (contract as any).withRetry(fn);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Contract.withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns result immediately when fn succeeds on first attempt', async () => {
    const contract = makeContract(['https://rpc1.example.com'], 3);
    const fn = vi.fn().mockResolvedValue('success');

    const resultPromise = callWithRetry(contract, fn);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('https://rpc1.example.com');
  });

  it('does NOT retry on BroadcastTxError — fails immediately', async () => {
    const contract = makeContract(['https://rpc1.example.com', 'https://rpc2.example.com'], 3);
    const broadcastError = new BroadcastTxError(4, 'sdk', 'insufficient fee');
    const fn = vi.fn().mockRejectedValue(broadcastError);

    const resultPromise = callWithRetry(contract, fn);
    resultPromise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toBeInstanceOf(BroadcastTxError);
    // Only 1 call — no retry on BroadcastTxError
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on generic network error and succeeds on second attempt', async () => {
    const contract = makeContract(['https://rpc1.example.com', 'https://rpc2.example.com'], 3);
    const visitedUrls: string[] = [];

    const fn = vi.fn().mockImplementation(async (url: string) => {
      visitedUrls.push(url);
      if (url === 'https://rpc1.example.com') {
        throw new Error('fetch failed: network error');
      }
      return 'ok';
    });

    const resultPromise = callWithRetry(contract, fn);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('ok');
    expect(visitedUrls[0]).toBe('https://rpc1.example.com');
    expect(visitedUrls[1]).toBe('https://rpc2.example.com');
  });

  it('exhausts all retries and throws last error', async () => {
    const contract = makeContract(['https://rpc1.example.com'], 3, 200);
    const fn = vi.fn().mockRejectedValue(new Error('connection refused'));

    const resultPromise = callWithRetry(contract, fn);
    resultPromise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toThrow('connection refused');
    // 1 initial + 3 retries = 4 total
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('starts from primary endpoint on every new call (primary-first)', async () => {
    const contract = makeContract(['https://rpc1.example.com', 'https://rpc2.example.com'], 3);
    const call1Urls: string[] = [];
    const call2Urls: string[] = [];

    // First call: rpc1 fails, rpc2 succeeds
    const fn1 = vi.fn().mockImplementation(async (url: string) => {
      call1Urls.push(url);
      if (url.includes('rpc1')) throw new Error('err');
      return 'first';
    });

    const p1 = callWithRetry(contract, fn1);
    await vi.runAllTimersAsync();
    await p1;

    // Second call: rpc1 succeeds immediately (should start from primary again)
    const fn2 = vi.fn().mockImplementation(async (url: string) => {
      call2Urls.push(url);
      return 'second';
    });

    const p2 = callWithRetry(contract, fn2);
    await vi.runAllTimersAsync();
    await p2;

    // First call: started at rpc1 (failed), moved to rpc2
    expect(call1Urls[0]).toContain('rpc1');
    expect(call1Urls[1]).toContain('rpc2');

    // Second call: starts at rpc1 again (primary-first)
    expect(call2Urls[0]).toContain('rpc1');
    expect(call2Urls).toHaveLength(1);
  });

  it('cycles through endpoints in order when all are failing', async () => {
    const contract = makeContract(
      ['https://rpc1.example.com', 'https://rpc2.example.com', 'https://rpc3.example.com'],
      5, // 5 retries → 6 calls
      200
    );
    const visitedUrls: string[] = [];

    const fn = vi.fn().mockImplementation(async (url: string) => {
      visitedUrls.push(url);
      throw new Error('all fail');
    });

    const resultPromise = callWithRetry(contract, fn);
    resultPromise.catch(() => {});
    await vi.runAllTimersAsync();
    await resultPromise.catch(() => {});

    // Should cycle: rpc1, rpc2, rpc3, rpc1, rpc2, rpc3
    expect(visitedUrls[0]).toContain('rpc1');
    expect(visitedUrls[1]).toContain('rpc2');
    expect(visitedUrls[2]).toContain('rpc3');
    expect(visitedUrls[3]).toContain('rpc1');
  });

  it('uses configured retryDelay (fixed, not exponential)', async () => {
    const contract = makeContract(['https://rpc1.example.com'], 2, 200);
    const callTimes: number[] = [];
    let fakeNow = 0;

    const fn = vi.fn().mockImplementation(async () => {
      callTimes.push(fakeNow);
      throw new Error('fail');
    });

    // Use fake timer ticks to simulate fixed delays
    const resultPromise = callWithRetry(contract, fn);
    resultPromise.catch(() => {});
    // advance 200ms twice for the 2 retries
    fakeNow = 200;
    await vi.advanceTimersByTimeAsync(200);
    fakeNow = 400;
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(200);
    await resultPromise.catch(() => {});

    // 1 initial + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
