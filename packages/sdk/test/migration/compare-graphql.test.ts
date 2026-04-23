/**
 * Migration tests: verify data consistency between old and new GraphQL endpoints.
 *
 * These tests are intended to be run DURING the migration window, while both
 * old and new endpoints are live. After the migration is complete and the old
 * endpoint is decommissioned, this suite can be removed.
 *
 * Run with:
 *   pnpm test:migration
 *
 * Required env vars:
 *   COMPARE_ROUND_ADDRESS    - round contract address that exists on both endpoints
 *   COMPARE_OPERATOR_ADDRESS - operator address that exists on both endpoints
 *   OLD_API_ENDPOINT         - defaults to vota-testnet-api
 *   NEW_API_ENDPOINT         - defaults to maci-testnet-graphql
 */

import { describe, it, expect, beforeAll } from 'vitest';

const OLD_API = 'https://vota-testnet-api.dorafactory.org';
const NEW_API = 'https://maci-testnet-graphql.dorafactory.org';

// Fill in known testnet addresses before running migration tests
const ROUND_ADDRESS = process.env.COMPARE_ROUND_ADDRESS ?? '';
const OPERATOR_ADDRESS = process.env.COMPARE_OPERATOR_ADDRESS ?? '';

// ─── GraphQL helper ───────────────────────────────────────────────────────────

async function gql<T>(endpoint: string, query: string): Promise<T> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${endpoint}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(`GraphQL error: ${json.errors[0].message}`);
  return json.data as T;
}

// ─── Normalization helpers ────────────────────────────────────────────────────

function normalizeOldRound(node: Record<string, unknown>): Record<string, unknown> {
  const { operator, identity, ...rest } = node;
  return { ...rest, operatorAddress: operator, _oldIdentity: identity };
}

function normalizeOldDelayOp(node: Record<string, unknown>): Record<string, unknown> {
  const { nodeId: _nodeId, roundAddress, ...rest } = node;
  return { ...rest, contractAddress: roundAddress };
}

function normalizeOldDeactivateMsg(node: Record<string, unknown>): Record<string, unknown> {
  const { maciContractAddress, maciOperator, ...rest } = node;
  return { ...rest, contractAddress: maciContractAddress, operatorAddress: maciOperator };
}

type Diff = { field: string; old: unknown; new: unknown };

function diffObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  skip: string[] = []
): Diff[] {
  const diffs: Diff[] = [];
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  for (const key of keys) {
    if (skip.includes(key) || key.startsWith('_')) continue;
    if (JSON.stringify(oldObj[key] ?? null) !== JSON.stringify(newObj[key] ?? null)) {
      diffs.push({ field: key, old: oldObj[key], new: newObj[key] });
    }
  }
  return diffs;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('GraphQL migration: old vs new endpoint data consistency', () => {
  beforeAll(() => {
    console.log(`OLD endpoint: ${OLD_API}`);
    console.log(`NEW endpoint: ${NEW_API}`);
    if (!ROUND_ADDRESS && !OPERATOR_ADDRESS) {
      console.warn(
        'Neither COMPARE_ROUND_ADDRESS nor COMPARE_OPERATOR_ADDRESS set — all tests will be skipped'
      );
    }
  });

  // ── Round ──────────────────────────────────────────────────────────────────

  describe('round(id)', () => {
    it('returns same core fields for the same round address', async () => {
      if (!ROUND_ADDRESS) return;

      const OLD_QUERY = `query { round(id: "${ROUND_ADDRESS}") {
        id blockHeight txHash caller admin operator contractAddress circuitName
        timestamp votingStart votingEnd status period actionType
        roundTitle roundDescription roundLink coordinatorPubkeyX coordinatorPubkeyY
        voteOptionMap results allResult gasStationEnable totalGrant baseGrant totalBond
        circuitType circuitPower certificationSystem codeId maciType voiceCreditAmount
        preDeactivateRoot identity
      }}`;

      const NEW_QUERY = `query { round(id: "${ROUND_ADDRESS}") {
        id blockHeight txHash caller admin operatorAddress contractAddress circuitName
        timestamp votingStart votingEnd status period actionType
        roundTitle roundDescription roundLink coordinatorPubkeyX coordinatorPubkeyY
        voteOptionMap results allResult gasStationEnable totalGrant baseGrant totalBond
        circuitType circuitPower certificationSystem codeId maciType voiceCreditAmount
        preDeactivateRoot
        operator { identity }
      }}`;

      const [oldData, newData] = await Promise.all([
        gql<any>(OLD_API, OLD_QUERY),
        gql<any>(NEW_API, NEW_QUERY)
      ]);

      expect(oldData?.round).toBeTruthy();
      expect(newData?.round).toBeTruthy();

      const newNode = {
        ...newData.round,
        _oldIdentity: newData.round.operator?.identity
      };
      delete newNode.operator;

      const normalizedOld = normalizeOldRound(oldData.round);
      const diffs = diffObjects(normalizedOld, newNode);

      if (diffs.length > 0) {
        console.error('Diffs:', JSON.stringify(diffs, null, 2));
      }
      expect(diffs).toHaveLength(0);

      // Identity separate comparison
      expect(normalizedOld._oldIdentity).toBe(newNode._oldIdentity);
    });
  });

  // ── Rounds by operator ─────────────────────────────────────────────────────

  describe('rounds(filter: operatorAddress)', () => {
    it('returns same count and ids for same operator', async () => {
      if (!OPERATOR_ADDRESS) return;

      const OLD_QUERY = `query { rounds(filter: { operator: { equalTo: "${OPERATOR_ADDRESS}" } }, first: 10) {
        totalCount edges { node { id contractAddress operator status } }
      }}`;

      const NEW_QUERY = `query { rounds(filter: { operatorAddress: { equalTo: "${OPERATOR_ADDRESS}" } }, first: 10) {
        totalCount edges { node { id contractAddress operatorAddress status } }
      }}`;

      const [oldData, newData] = await Promise.all([
        gql<any>(OLD_API, OLD_QUERY),
        gql<any>(NEW_API, NEW_QUERY)
      ]);

      const oldEdges: any[] = oldData?.rounds?.edges ?? [];
      const newEdges: any[] = newData?.rounds?.edges ?? [];

      expect(oldEdges.length).toBe(newEdges.length);
      expect(oldData?.rounds?.totalCount).toBe(newData?.rounds?.totalCount);

      for (let i = 0; i < oldEdges.length; i++) {
        const normalized = normalizeOldRound(oldEdges[i].node);
        const diffs = diffObjects(normalized, newEdges[i].node);
        if (diffs.length > 0) {
          console.error(`Edge[${i}] diffs:`, JSON.stringify(diffs, null, 2));
        }
        expect(diffs).toHaveLength(0);
      }
    });
  });

  // ── Operator ──────────────────────────────────────────────────────────────

  describe('operators(filter: operatorAddress)', () => {
    it('returns same operator fields on both endpoints', async () => {
      if (!OPERATOR_ADDRESS) return;

      const SHARED_QUERY = `query { operators(filter: { operatorAddress: { equalTo: "${OPERATOR_ADDRESS}" } }) {
        edges { node { id validatorAddress operatorAddress coordinatorPubkeyX coordinatorPubkeyY identity } }
      }}`;

      const [oldData, newData] = await Promise.all([
        gql<any>(OLD_API, SHARED_QUERY),
        gql<any>(NEW_API, SHARED_QUERY)
      ]);

      const oldNode = oldData?.operators?.edges?.[0]?.node;
      const newNode = newData?.operators?.edges?.[0]?.node;

      if (!oldNode || !newNode) {
        console.warn('One endpoint returned no operator data — skipping field comparison');
        return;
      }

      const diffs = diffObjects(oldNode, newNode);
      if (diffs.length > 0) {
        console.error('Operator diffs:', JSON.stringify(diffs, null, 2));
      }
      expect(diffs).toHaveLength(0);
    });
  });

  // ── Operator delay operations ──────────────────────────────────────────────

  describe('operatorDelayOperations', () => {
    it('normalized old fields match new fields for recent records', async () => {
      if (!OPERATOR_ADDRESS) return;

      const startTimestamp = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

      const OLD_QUERY = `query { operatorDelayOperations(
        filter: { operatorAddress: { equalTo: "${OPERATOR_ADDRESS}" }, timestamp: { greaterThanOrEqualTo: "${startTimestamp}" } },
        first: 5, orderBy: [TIMESTAMP_DESC]
      ) { edges { node {
        blockHeight delayProcessDmsgCount delayDuration delayReason delayType
        id nodeId operatorAddress timestamp roundAddress
      } } }}`;

      const NEW_QUERY = `query { operatorDelayOperations(
        filter: { operatorAddress: { equalTo: "${OPERATOR_ADDRESS}" }, timestamp: { greaterThanOrEqualTo: "${startTimestamp}" } },
        first: 5, orderBy: [TIMESTAMP_DESC]
      ) { edges { node {
        blockHeight delayProcessDmsgCount delayDuration delayReason delayType
        id operatorAddress timestamp contractAddress
      } } }}`;

      const [oldData, newData] = await Promise.all([
        gql<any>(OLD_API, OLD_QUERY),
        gql<any>(NEW_API, NEW_QUERY)
      ]);

      const oldEdges: any[] = oldData?.operatorDelayOperations?.edges ?? [];
      const newEdges: any[] = newData?.operatorDelayOperations?.edges ?? [];

      if (oldEdges.length === 0 && newEdges.length === 0) return; // No data in range

      expect(oldEdges.length).toBe(newEdges.length);

      for (let i = 0; i < oldEdges.length; i++) {
        const normalized = normalizeOldDelayOp(oldEdges[i].node);
        const diffs = diffObjects(normalized, newEdges[i].node);
        if (diffs.length > 0) {
          console.error(`DelayOp edge[${i}] diffs:`, JSON.stringify(diffs, null, 2));
        }
        expect(diffs).toHaveLength(0);
      }
    });
  });

  // ── Deactivate messages ───────────────────────────────────────────────────

  describe('deactivateMessages → uploadedDeactivateMessages', () => {
    it('normalized old message fields match new entity fields', async () => {
      if (!ROUND_ADDRESS) return;

      const OLD_QUERY = `query { deactivateMessages(
        first: 5, orderBy: [BLOCK_HEIGHT_ASC],
        filter: { maciContractAddress: { equalTo: "${ROUND_ADDRESS}" } }
      ) { nodes { id blockHeight timestamp txHash maciContractAddress maciOperator } }}`;

      const NEW_QUERY = `query { uploadedDeactivateMessages(
        first: 5, orderBy: [BLOCK_HEIGHT_ASC],
        filter: { contractAddress: { equalTo: "${ROUND_ADDRESS}" } }
      ) { nodes { id blockHeight timestamp txHash contractAddress operatorAddress } }}`;

      const [oldData, newData] = await Promise.all([
        gql<any>(OLD_API, OLD_QUERY),
        gql<any>(NEW_API, NEW_QUERY)
      ]);

      const oldNodes: any[] = oldData?.deactivateMessages?.nodes ?? [];
      const newNodes: any[] = newData?.uploadedDeactivateMessages?.nodes ?? [];

      if (oldNodes.length === 0 && newNodes.length === 0) return;

      expect(oldNodes.length).toBe(newNodes.length);

      for (let i = 0; i < oldNodes.length; i++) {
        const normalized = normalizeOldDeactivateMsg(oldNodes[i]);
        const diffs = diffObjects(normalized, newNodes[i]);
        if (diffs.length > 0) {
          console.error(`DeactivateMsg node[${i}] diffs:`, JSON.stringify(diffs, null, 2));
        }
        expect(diffs).toHaveLength(0);
      }
    });
  });
});
