/**
 * Integration tests for Operator query methods
 * Tests run against the GraphQL endpoint.
 *
 * An active operator is fetched automatically in beforeAll so no env vars are needed.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Http } from '../../src/libs/http/http';
import { Operator } from '../../src/libs/query/operator';
import { isErrorResponse } from '../../src/libs/maci/maci';

const API = 'https://maci-testnet-graphql.dorafactory.org';

const AMACI_REGISTRY_TESTNET =
  'dora13c8aecstyxrhax9znvvh5zey89edrmd2k5va57pxvpe3fxtfsfeqlhsjnd';

function makeOperator(): Operator {
  const http = new Http(API, ['https://vota-testnet-rest.dorafactory.org']);
  return new Operator(http, AMACI_REGISTRY_TESTNET);
}

let resolvedOperatorAddress = '';

describe('Operator queries (integration)', () => {
  beforeAll(async () => {
    const operator = makeOperator();
    const res = await operator.getOperators('', 20);

    if (isErrorResponse(res)) {
      console.warn('[integration] getOperators failed — operator-specific tests will be skipped');
      return;
    }

    const active = res.data.operators.edges.find(
      (e) => e.node.operatorAddress && e.node.coordinatorPubkeyX
    );

    if (active) {
      resolvedOperatorAddress = active.node.operatorAddress;
      console.log(`[integration] Using operator: ${resolvedOperatorAddress}`);
    } else {
      console.warn('[integration] No active operator found — operator-specific tests will be skipped');
    }
  });

  it('getOperators returns a valid paginated response', async () => {
    const operator = makeOperator();
    const res = await operator.getOperators('', 3);

    if (res.code === 404) return;

    expect(res.code).toBe(200);
    if (isErrorResponse(res)) return;

    const { operators } = res.data;
    expect(operators.edges).toBeInstanceOf(Array);
    expect(typeof operators.totalCount).toBe('number');

    if (operators.edges.length > 0) {
      const node = operators.edges[0].node;
      expect(typeof node.operatorAddress).toBe('string');
      expect(typeof node.coordinatorPubkeyX).toBe('string');
    }
  });

  it('getOperatorByAddress returns 400 for invalid address', async () => {
    const operator = makeOperator();
    const res = await operator.getOperatorByAddress('not-an-address');
    expect(res.code).toBe(400);
  });

  it('getOperatorByAddress returns correct shape for active operator', async () => {
    if (!resolvedOperatorAddress) return;

    const operator = makeOperator();
    const res = await operator.getOperatorByAddress(resolvedOperatorAddress);

    if (res.code === 404) return;

    expect(res.code).toBe(200);
    if (isErrorResponse(res)) return;

    const { operator: op } = res.data;
    expect(typeof op.operatorAddress).toBe('string');
    expect(op.operatorAddress).toBe(resolvedOperatorAddress);
    expect(typeof op.coordinatorPubkeyX).toBe('string');
    expect(typeof op.coordinatorPubkeyY).toBe('string');
    expect(typeof op.activeRoundsCount).toBe('number');
    expect(typeof op.completedRoundsCount).toBe('number');
  });

  it('getOperatorDelayOperationsByAddress returns valid shape', async () => {
    if (!resolvedOperatorAddress) return;

    const operator = makeOperator();
    const res = await operator.getOperatorDelayOperationsByAddress(resolvedOperatorAddress, '', 5);

    if (!isErrorResponse(res)) {
      const { operatorDelayOperations } = res.data;
      expect(operatorDelayOperations.edges).toBeInstanceOf(Array);
      expect(typeof operatorDelayOperations.totalCount).toBe('number');

      if (operatorDelayOperations.edges.length > 0) {
        const node = operatorDelayOperations.edges[0].node;
        expect(typeof node.operatorAddress).toBe('string');
        expect(typeof node.contractAddress).toBe('string');
        expect(typeof node.delayType).toBe('string');
      }
    } else {
      expect([404]).toContain(res.code);
    }
  });

  it('queryMissRate returns valid shape and 7 daily entries', async () => {
    if (!resolvedOperatorAddress) return;

    const operator = makeOperator();
    const res = await operator.queryMissRate(resolvedOperatorAddress, 7);

    expect(res.code).toBe(200);
    if (isErrorResponse(res)) return;

    const { missRate } = res.data;
    expect(missRate).toBeInstanceOf(Array);
    expect(missRate.length).toBe(7);

    const entry = missRate[0];
    expect(typeof entry.date).toBe('string');
    expect(typeof entry.delayCount).toBe('number');
    expect(typeof entry.missRate).toBe('number');
    expect(entry.missRate).toBeGreaterThanOrEqual(0);
    expect(entry.missRate).toBeLessThanOrEqual(1);
    expect(entry.deactivateDelay).toMatchObject({
      count: expect.any(Number),
      dmsgCount: expect.any(Number)
    });
    expect(entry.tallyDelay).toMatchObject({
      count: expect.any(Number)
    });
  });

  it('queryMissRate result is sorted by date descending', async () => {
    if (!resolvedOperatorAddress) return;

    const operator = makeOperator();
    const res = await operator.queryMissRate(resolvedOperatorAddress, 5);

    if (isErrorResponse(res)) return;

    const dates = res.data.missRate.map((e) => e.date);
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i] >= dates[i + 1]).toBe(true);
    }
  });
});
