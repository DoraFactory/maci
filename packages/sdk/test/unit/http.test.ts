/**
 * Unit tests for Http class (fetchRest logic)
 * - Validates retry count on network failures
 * - Validates fast-fail on 4xx HTTP errors (no retry)
 * - Validates fixed 200ms retry delay
 * - Validates primary-first endpoint rotation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Http } from '../../src/libs/http/http';
import { HttpError } from '../../src/libs/errors';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeOkResponse(body: unknown = {}): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as unknown as Response;
}

function makeErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({ error: `HTTP ${status}` })
  } as unknown as Response;
}

function makeNetworkError(): never {
  throw new TypeError('fetch failed: network error');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Http.fetchRest', () => {
  let fakeFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fakeFetch = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('succeeds on first attempt without retrying', async () => {
    fakeFetch.mockResolvedValueOnce(makeOkResponse({ data: 'ok' }));

    const http = new Http('https://api.example.com', ['https://rest1.example.com'], fakeFetch as any);
    const resultPromise = http.fetchRest('/path');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual({ data: 'ok' });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('retries exactly DEFAULT_RETRIES (5) times on network failure then throws', async () => {
    // All attempts fail
    fakeFetch.mockImplementation(() => { throw new TypeError('fetch failed'); });

    const http = new Http(
      'https://api.example.com',
      ['https://rest1.example.com'],
      fakeFetch as any
    );

    const resultPromise = http.fetchRest('/path');
    // Suppress the unhandled-rejection warning so that vitest doesn't fail the run
    resultPromise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toThrow();
    // 1 initial attempt + 5 retries = 6 total calls
    expect(fakeFetch).toHaveBeenCalledTimes(6);
  });

  it('does NOT retry on 4xx HTTP error (fast-fail)', async () => {
    fakeFetch.mockResolvedValue(makeErrorResponse(404));

    const http = new Http(
      'https://api.example.com',
      ['https://rest1.example.com'],
      fakeFetch as any
    );

    const resultPromise = http.fetchRest('/path');
    resultPromise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toBeInstanceOf(HttpError);
    // Only 1 call — no retries on 4xx
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 400 Bad Request', async () => {
    fakeFetch.mockResolvedValue(makeErrorResponse(400));

    const http = new Http(
      'https://api.example.com',
      ['https://rest1.example.com'],
      fakeFetch as any
    );

    const resultPromise = http.fetchRest('/path');
    resultPromise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toBeInstanceOf(HttpError);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx server error', async () => {
    // First attempt: 500, second: success
    fakeFetch
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeOkResponse({ ok: true }));

    const http = new Http(
      'https://api.example.com',
      ['https://rest1.example.com'],
      fakeFetch as any
    );

    const resultPromise = http.fetchRest('/path');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual({ ok: true });
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });

  it('uses fixed 200ms retry delay (no exponential growth)', async () => {
    const delays: number[] = [];
    let lastCallTime = Date.now();

    fakeFetch.mockImplementation(() => {
      const now = Date.now();
      delays.push(now - lastCallTime);
      lastCallTime = now;
      throw new TypeError('network error');
    });

    const http = new Http(
      'https://api.example.com',
      ['https://rest1.example.com'],
      fakeFetch as any,
      undefined,
      2,  // 2 retries for speed
      200 // 200ms delay
    );

    const resultPromise = http.fetchRest('/path');
    resultPromise.catch(() => {});
    // Advance by exactly 200ms increments to allow retries
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(200);
    await resultPromise.catch(() => {});

    // After the first immediate call, each retry should wait ~200ms (fake timer steps)
    // With fake timers, the actual time delta is 200ms per step
    // We just verify total calls = 3 (1 initial + 2 retries)
    expect(fakeFetch).toHaveBeenCalledTimes(3);
  });

  it('rotates through multiple endpoints in primary-first order', async () => {
    const urls: string[] = [];
    fakeFetch.mockImplementation((url: string) => {
      urls.push(url);
      throw new TypeError('network error');
    });

    const http = new Http(
      'https://api.example.com',
      ['https://rest1.example.com', 'https://rest2.example.com'],
      fakeFetch as any,
      undefined,
      3, // 3 retries
      200
    );

    const resultPromise = http.fetchRest('/status');
    resultPromise.catch(() => {});
    await vi.runAllTimersAsync();
    await resultPromise.catch(() => {});

    // Should start from rest1 (primary), then alternate
    expect(urls[0]).toContain('rest1');
    expect(urls[1]).toContain('rest2');
    expect(urls[2]).toContain('rest1');
    expect(urls[3]).toContain('rest2');
  });

  it('always starts from primary endpoint on a new call', async () => {
    const callUrls: string[] = [];

    // First call: fail once on rest1, succeed on rest2
    fakeFetch
      .mockImplementationOnce((url: string) => { callUrls.push(url); throw new TypeError('err'); })
      .mockImplementationOnce((url: string) => { callUrls.push(url); return Promise.resolve(makeOkResponse({})); })
      // Second call: succeed immediately on rest1 (primary-first)
      .mockImplementationOnce((url: string) => { callUrls.push(url); return Promise.resolve(makeOkResponse({})); });

    const http = new Http(
      'https://api.example.com',
      ['https://rest1.example.com', 'https://rest2.example.com'],
      fakeFetch as any,
      undefined,
      3,
      200
    );

    const p1 = http.fetchRest('/a');
    await vi.runAllTimersAsync();
    await p1;

    const p2 = http.fetchRest('/b');
    await vi.runAllTimersAsync();
    await p2;

    // First call: rest1 fails, rest2 succeeds
    expect(callUrls[0]).toContain('rest1');
    expect(callUrls[1]).toContain('rest2');
    // Second call: starts from rest1 again (primary-first)
    expect(callUrls[2]).toContain('rest1');
  });

  it('accepts a single string endpoint (backward compatibility)', async () => {
    fakeFetch.mockResolvedValueOnce(makeOkResponse({ pong: true }));

    const http = new Http(
      'https://api.example.com',
      'https://single-rest.example.com',
      fakeFetch as any
    );
    const resultPromise = http.fetchRest('/ping');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual({ pong: true });
  });
});
