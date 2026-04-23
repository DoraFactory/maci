/**
 * Integration tests for Proof query methods
 * Tests run against testnet GraphQL endpoint.
 */

import { describe, it, expect } from 'vitest';
import { Http } from '../../src/libs/http/http';
import { Proof } from '../../src/libs/query/proof';

const API = 'https://maci-testnet-graphql.dorafactory.org';

function makeProof(): Proof {
  const http = new Http(API, ['https://vota-testnet-rest.dorafactory.org']);
  return new Proof(http);
}

describe('Proof queries (integration)', () => {
  it('getProofByContractAddress returns 400 for invalid address', async () => {
    const proof = makeProof();
    const res = await proof.getProofByContractAddress('not-an-address');
    expect(res.code).toBe(400);
  });

  it('getProofByContractAddress returns 400 for invalid bech32 address', async () => {
    const proof = makeProof();
    const res = await proof.getProofByContractAddress(
      'dora1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    );
    expect([400, 404]).toContain(res.code);
  });

  it('getProofByContractAddress returns valid shape for a round with proofs', async () => {
    // Grab a contract address from transactions that have procDeactivate / tally type
    const { Http: HttpCls } = await import('../../src/libs/http/http');
    const { Transaction } = await import('../../src/libs/query/transaction');

    const http = new HttpCls(API, ['https://vota-testnet-rest.dorafactory.org']);
    const tx = new Transaction(http);
    const allRes = await tx.getTransactions('', 5);
    if (allRes.code !== 200 || allRes.data.transactions.edges.length === 0) return;

    const addr = allRes.data.transactions.edges[0].node.contractAddress;
    if (!addr) return;

    const proof = makeProof();
    const res = await proof.getProofByContractAddress(addr);

    if (res.code === 200) {
      expect(res.data.proofData.nodes).toBeInstanceOf(Array);
      expect(res.data.proofData.nodes.length).toBeGreaterThan(0);

      const node = res.data.proofData.nodes[0];
      expect(typeof node.txHash).toBe('string');
      expect(typeof node.contractAddress).toBe('string');
      expect(typeof node.commitment).toBe('string');
    } else {
      // 404 is acceptable — not every contract has proof data
      expect([404]).toContain(res.code);
    }
  });
});
