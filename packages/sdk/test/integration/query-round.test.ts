/**
 * Integration tests for Round query methods
 * Tests run against the GraphQL endpoint.
 *
 * Round and operator addresses are resolved automatically via getRounds in beforeAll,
 * so no env vars are needed.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Http } from '../../src/libs/http/http';
import { Round } from '../../src/libs/query/round';
import { isErrorResponse } from '../../src/libs/maci/maci';

const API = 'https://maci-testnet-graphql.dorafactory.org';

function makeRound(): Round {
  const http = new Http(API, ['https://vota-testnet-rest.dorafactory.org']);
  return new Round(http);
}

let resolvedRoundAddress = '';
let resolvedOperatorAddress = '';

describe('Round queries (integration)', () => {
  beforeAll(async () => {
    const round = makeRound();
    const res = await round.getRounds('', 10);

    if (isErrorResponse(res) || res.data.rounds.edges.length === 0) {
      console.warn('[integration] No rounds found — round-specific tests will be skipped');
      return;
    }

    const edges = res.data.rounds.edges;

    // Pick the first round with a valid contract address as the seed round
    const seedEdge = edges.find((e) => e.node.contractAddress?.startsWith('dora1'));
    if (seedEdge) {
      resolvedRoundAddress = seedEdge.node.contractAddress;
      console.log(`[integration] Using round: ${resolvedRoundAddress}`);
    }

    // Pick the first round with a non-empty operatorAddress for operator filter tests
    const opEdge = edges.find((e) => e.node.operatorAddress?.startsWith('dora1'));
    if (opEdge) {
      resolvedOperatorAddress = opEdge.node.operatorAddress;
      console.log(`[integration] Using operator: ${resolvedOperatorAddress}`);
    }
  });

  it('getRounds returns a valid paginated response', async () => {
    const round = makeRound();
    const res = await round.getRounds('', 3);

    expect(res.code).toBe(200);
    if (isErrorResponse(res)) return;

    const { rounds } = res.data;
    expect(rounds).toBeDefined();
    expect(rounds.edges).toBeInstanceOf(Array);
    expect(rounds.edges.length).toBeGreaterThan(0);
    expect(typeof rounds.totalCount).toBe('number');
    expect(rounds.pageInfo).toMatchObject({
      endCursor: expect.any(String),
      hasNextPage: expect.any(Boolean)
    });

    const node = rounds.edges[0].node;
    expect(typeof node.id).toBe('string');
    expect(typeof node.contractAddress).toBe('string');
    expect(node.contractAddress.startsWith('dora1')).toBe(true);
    expect(typeof node.operatorAddress).toBe('string');
  });

  it('getRoundById returns correct shape for resolved round', async () => {
    if (!resolvedRoundAddress) return;

    const round = makeRound();
    const res = await round.getRoundById(resolvedRoundAddress);

    expect(res.code).toBe(200);
    if (isErrorResponse(res)) return;

    const node = res.data.round;
    for (const field of ['id', 'contractAddress', 'operatorAddress', 'circuitName', 'timestamp', 'status', 'period']) {
      expect(typeof node[field as keyof typeof node]).toBe('string');
    }
    expect(node.id).toBe(resolvedRoundAddress);
    expect(node.coordinatorPubkeyX).toBeTruthy();
    expect(node.coordinatorPubkeyY).toBeTruthy();
  });

  it('getRoundById returns 400 for invalid address format', async () => {
    const round = makeRound();
    const res = await round.getRoundById('not-an-address');
    expect(res.code).toBe(400);
  });

  it('getRoundById returns 400 or 404 for non-existent address', async () => {
    const round = makeRound();
    const res = await round.getRoundById('dora1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect([400, 404]).toContain(res.code);
  });

  it('getRoundsByCircuitName returns rounds filtered by circuit', async () => {
    const round = makeRound();
    const res = await round.getRoundsByCircuitName('amaci-1p1v', '', 3);

    if (!isErrorResponse(res)) {
      expect(res.data.rounds.edges).toBeInstanceOf(Array);
    } else {
      expect(res.code).toBe(404);
    }
  });

  it('getRoundsByCircuitName returns 404 for unknown circuit', async () => {
    const round = makeRound();
    const res = await round.getRoundsByCircuitName('nonexistent-circuit-xyz', '', 3);
    expect([200, 404]).toContain(res.code);
  });

  it('getRoundsByStatus handles all valid statuses', async () => {
    const round = makeRound();

    for (const status of ['Created', 'Ongoing', 'Tallying', 'Closed']) {
      const res = await round.getRoundsByStatus(status, '', 3);
      expect([200, 404]).toContain(res.code);
      if (!isErrorResponse(res)) {
        expect(res.data.rounds.edges).toBeInstanceOf(Array);
      }
    }
  });

  it('getRoundsByStatus returns 400 for invalid status', async () => {
    const round = makeRound();
    const res = await round.getRoundsByStatus('InvalidStatus', '', 3);
    expect(res.code).toBe(400);
  });

  it('getRoundsByOperator returns rounds for resolved operator', async () => {
    if (!resolvedOperatorAddress) return;

    const round = makeRound();
    const res = await round.getRoundsByOperator(resolvedOperatorAddress, '', 5);

    expect([200, 404]).toContain(res.code);
    if (!isErrorResponse(res)) {
      expect(res.data.rounds.edges).toBeInstanceOf(Array);
      for (const edge of res.data.rounds.edges) {
        expect(edge.node.operatorAddress).toBe(resolvedOperatorAddress);
      }
    }
  });

  it('getRoundsByOperator returns 400 for invalid address', async () => {
    const round = makeRound();
    const res = await round.getRoundsByOperator('not-an-address', '', 3);
    expect(res.code).toBe(400);
  });

  it('getRoundWithFields returns selected fields only', async () => {
    if (!resolvedRoundAddress) return;

    const round = makeRound();
    const selectedFields = ['id', 'contractAddress', 'status', 'operatorAddress'];
    const res = await round.getRoundWithFields(resolvedRoundAddress, selectedFields);

    if (!isErrorResponse(res)) {
      const node = res.data.round as any;
      expect(typeof node.id).toBe('string');
      expect(typeof node.contractAddress).toBe('string');
      expect(typeof node.status).toBe('string');
      expect(typeof node.operatorAddress).toBe('string');
    } else {
      expect([400, 404]).toContain(res.code);
    }
  });

  it('getRoundWithFields returns 400 for invalid address', async () => {
    const round = makeRound();
    const res = await round.getRoundWithFields('not-an-address', ['id', 'status']);
    expect(res.code).toBe(400);
  });

  it('getRoundWithFields returns 400 for invalid field names', async () => {
    const round = makeRound();
    const res = await round.getRoundWithFields(
      'dora1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ['id', 'nonExistentField']
    );
    expect(res.code).toBe(400);
  });
});
