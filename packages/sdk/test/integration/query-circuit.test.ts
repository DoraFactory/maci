/**
 * Integration tests for Circuit query methods
 * Tests run against testnet GraphQL endpoint.
 */

import { describe, it, expect } from 'vitest';
import { Http } from '../../src/libs/http/http';
import { Circuit } from '../../src/libs/query/circuit';

const API = 'https://maci-testnet-graphql.dorafactory.org';

function makeCircuit(): Circuit {
  const http = new Http(API, ['https://vota-testnet-rest.dorafactory.org']);
  return new Circuit(http);
}

describe('Circuit queries (integration)', () => {
  it('getCircuits returns all known circuits with roundCount', async () => {
    const circuit = makeCircuit();
    const res = await circuit.getCircuits();

    expect(res.code).toBe(200);
    if (res.code !== 200) return;

    const { circuits } = res.data;
    expect(circuits).toBeInstanceOf(Array);
    expect(circuits.length).toBeGreaterThan(0);

    for (const c of circuits) {
      expect(typeof c.maciType).toBe('string');
      expect(typeof c.displayName).toBe('string');
      expect(typeof c.roundCount).toBe('number');
      expect(c.roundCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('getCircuitByName returns valid shape for a known circuit', async () => {
    const circuit = makeCircuit();
    const res = await circuit.getCircuitByName('amaci-1p1v');

    expect(res.code).toBe(200);
    if (res.code !== 200) return;

    const { circuit: c } = res.data;
    expect(c.maciType).toBe('aMACI');
    expect(c.circuitType).toBe('1p1v');
    expect(typeof c.roundCount).toBe('number');
  });

  it('getCircuitByName returns 404 for unknown circuit', async () => {
    const circuit = makeCircuit();
    const res = await circuit.getCircuitByName('nonexistent-circuit-xyz');
    expect(res.code).toBe(404);
  });

  it('getCircuitByName returns 404 for all known circuit keys', async () => {
    const circuit = makeCircuit();

    for (const name of ['maci-1p1v', 'maci-qv', 'amaci-1p1v', 'amaci-qv']) {
      const res = await circuit.getCircuitByName(name);
      // All known circuits should return 200
      expect(res.code).toBe(200);
      if (res.code === 200) {
        expect(typeof res.data.circuit.displayName).toBe('string');
      }
    }
  });
});
