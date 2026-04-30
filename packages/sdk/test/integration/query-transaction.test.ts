/**
 * Integration tests for Transaction query methods
 * Tests run against testnet GraphQL endpoint.
 */

import { describe, it, expect } from 'vitest';
import { Http } from '../../src/libs/http/http';
import { Transaction } from '../../src/libs/query/transaction';
import { isErrorResponse } from '../../src/libs/maci/maci';

const API = 'https://maci-testnet-graphql.dorafactory.org';

function makeTransaction(): Transaction {
  const http = new Http(API, ['https://vota-testnet-rest.dorafactory.org']);
  return new Transaction(http);
}

describe('Transaction queries (integration)', () => {
  it('getTransactions returns a valid paginated response', async () => {
    const tx = makeTransaction();
    const res = await tx.getTransactions('', 3);

    expect(res.code).toBe(200);
    if (res.code !== 200) return;

    const { transactions } = res.data;
    expect(transactions.edges).toBeInstanceOf(Array);
    expect(transactions.edges.length).toBeGreaterThan(0);
    expect(typeof transactions.totalCount).toBe('number');
    expect(transactions.pageInfo).toMatchObject({
      endCursor: expect.any(String),
      hasNextPage: expect.any(Boolean)
    });

    const node = transactions.edges[0].node;
    expect(typeof node.txHash).toBe('string');
    expect(typeof node.contractAddress).toBe('string');
    expect(typeof node.type).toBe('string');
  });

  it('getTransactionsByContractAddress returns 400 for invalid address', async () => {
    const tx = makeTransaction();
    const res = await tx.getTransactionsByContractAddress('not-an-address', '', 5);
    expect(res.code).toBe(400);
  });

  it('getTransactionsByContractAddress returns valid shape for known round', async () => {
    const tx = makeTransaction();

    // First grab a known contract address from getTransactions
    const allRes = await tx.getTransactions('', 1);
    if (allRes.code !== 200 || allRes.data.transactions.edges.length === 0) return;

    const addr = allRes.data.transactions.edges[0].node.contractAddress;
    if (!addr) return;

    const res = await tx.getTransactionsByContractAddress(addr, '', 3);

    if (res.code === 200) {
      expect(res.data.transactions.edges).toBeInstanceOf(Array);
      // Every result should belong to the queried contract
      for (const edge of res.data.transactions.edges) {
        expect(edge.node.contractAddress).toBe(addr);
      }
    } else {
      expect([404]).toContain(res.code);
    }
  });

  it('getTransactionByHash returns 404 for non-existent hash', async () => {
    const tx = makeTransaction();
    const res = await tx.getTransactionByHash(
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    );
    expect(res.code).toBe(404);
  });

  it('getTransactionByHash returns valid shape for known tx', async () => {
    const tx = makeTransaction();

    // Grab a hash from the list
    const allRes = await tx.getTransactions('', 1);
    if (allRes.code !== 200 || allRes.data.transactions.edges.length === 0) return;

    const txHash = allRes.data.transactions.edges[0].node.txHash;
    const res = await tx.getTransactionByHash(txHash);

    if (res.code === 200) {
      expect(res.data.transaction.txHash).toBe(txHash);
      expect(typeof res.data.transaction.blockHeight).toBe('string');
      expect(typeof res.data.transaction.type).toBe('string');
    } else {
      expect([404]).toContain(res.code);
    }
  });
});
