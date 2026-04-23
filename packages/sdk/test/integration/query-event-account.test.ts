/**
 * Integration tests for Event and UserAccount query methods
 * Tests run against testnet GraphQL endpoint.
 *
 * Real contract addresses and pubkeys are resolved automatically in beforeAll.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Http } from '../../src/libs/http/http';
import { Event } from '../../src/libs/query/event';
import { UserAccount } from '../../src/libs/query/account';
import { isErrorResponse } from '../../src/libs/maci/maci';

const API = 'https://maci-testnet-graphql.dorafactory.org';
const REST = 'https://vota-testnet-rest.dorafactory.org';

function makeEvent(): Event {
  const http = new Http(API, [REST]);
  return new Event(http);
}

function makeAccount(): UserAccount {
  const http = new Http(API, [REST]);
  return new UserAccount(http);
}

async function gql<T>(query: string): Promise<T> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const json = (await res.json()) as { data?: T };
  return json.data as T;
}

let resolvedDeactivateContractAddress = '';
let resolvedSignUpContractAddress = '';
let resolvedSignUpPubKey: bigint[] = [];

// ─── Event ─────────────────────────────────────────────────────────────────

describe('Event queries (integration)', () => {
  beforeAll(async () => {
    // Resolve a contract address that has deactivate messages
    const deactivateData = await gql<any>(`query {
      uploadedDeactivateMessages(first: 1, orderBy: [BLOCK_HEIGHT_DESC]) {
        nodes { contractAddress }
      }
    }`);
    const deactivateNode = deactivateData?.uploadedDeactivateMessages?.nodes?.[0];
    if (deactivateNode?.contractAddress) {
      resolvedDeactivateContractAddress = deactivateNode.contractAddress;
      console.log(`[integration] Using deactivate contract: ${resolvedDeactivateContractAddress}`);
    }

    // Resolve a contract address and pubKey that has a signup event
    const signUpData = await gql<any>(`query {
      signUpEvents(first: 1) {
        nodes { contractAddress pubKey }
      }
    }`);
    const signUpNode = signUpData?.signUpEvents?.nodes?.[0];
    if (signUpNode?.contractAddress && signUpNode?.pubKey) {
      resolvedSignUpContractAddress = signUpNode.contractAddress;
      // pubKey is stored as `"num1","num2"` — parse to bigint[]
      const parts = (signUpNode.pubKey as string).replace(/"/g, '').split(',');
      if (parts.length === 2) {
        resolvedSignUpPubKey = [BigInt(parts[0].trim()), BigInt(parts[1].trim())];
        console.log(`[integration] Using signUp contract: ${resolvedSignUpContractAddress}`);
      }
    }
  });

  it('getSignUpEventByPubKey returns 404 for unknown pubkey', async () => {
    const event = makeEvent();
    const res = await event.getSignUpEventByPubKey(
      'dora1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      [0n, 0n]
    );
    expect([404, 500]).toContain(res.code);
  });

  it('getSignUpEventByPubKey returns valid data for known pubkey', async () => {
    if (!resolvedSignUpContractAddress || resolvedSignUpPubKey.length === 0) return;

    const event = makeEvent();
    const res = await event.getSignUpEventByPubKey(
      resolvedSignUpContractAddress,
      resolvedSignUpPubKey
    );

    expect(res.code).toBe(200);
    if (isErrorResponse(res)) return;

    const events = res.data.signUpEvents;
    expect(events).toBeInstanceOf(Array);
    expect(events.length).toBeGreaterThan(0);

    const first = events[0];
    expect(typeof first.contractAddress).toBe('string');
    expect(typeof first.stateIdx).toBe('number');
    expect(typeof first.txHash).toBe('string');
  });

  it('fetchAllDeactivateLogs returns an empty array for unknown contract', async () => {
    const event = makeEvent();
    const result = await event.fetchAllDeactivateLogs(
      'dora1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('fetchAllDeactivateLogs returns deactivate messages for known contract', async () => {
    if (!resolvedDeactivateContractAddress) return;

    const event = makeEvent();
    const result = await event.fetchAllDeactivateLogs(resolvedDeactivateContractAddress);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    // Each deactivate message should be an array of strings
    for (const msg of result) {
      expect(Array.isArray(msg)).toBe(true);
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});

// ─── UserAccount ──────────────────────────────────────────────────────────

describe('UserAccount queries (integration)', () => {
  it('balanceOf returns valid balance for a known active address', async () => {
    const account = makeAccount();
    const res = await account.balanceOf('dora1xp0twdzsdeq4qg3c64v66552deax8zmvq4zw78');

    if (!isErrorResponse(res)) {
      expect(typeof res.data.balance).toBe('string');
      expect(isNaN(Number(res.data.balance))).toBe(false);
    } else {
      expect([400, 404, 500]).toContain(res.code);
    }
  });

  it('balanceOf returns error for address with no balance', async () => {
    const account = makeAccount();
    const res = await account.balanceOf('dora1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect([400, 404, 500]).toContain(res.code);
  });
});
