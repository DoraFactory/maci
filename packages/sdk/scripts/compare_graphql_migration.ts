/**
 * GraphQL Migration Comparison Script
 *
 * Runs the same logical queries against both the old and new GraphQL endpoints,
 * normalizes field names according to the migration mapping, and prints a diff report.
 *
 * Usage:
 *   pnpm tsx scripts/compare_graphql_migration.ts
 *
 * Required environment variables (can be set in .env):
 *   COMPARE_ROUND_ADDRESS    - a round contract address that exists on both endpoints
 *   COMPARE_OPERATOR_ADDRESS - an operator address that exists on both endpoints
 *   OLD_API_ENDPOINT         - old GraphQL endpoint (defaults to vota-testnet-api)
 *   NEW_API_ENDPOINT         - new GraphQL endpoint (defaults to maci-testnet-graphql)
 */

import dotenv from 'dotenv';

dotenv.config();

// ─── Endpoints ────────────────────────────────────────────────────────────────

const OLD_API = process.env.OLD_API_ENDPOINT ?? 'https://vota-testnet-api.dorafactory.org';
const NEW_API = process.env.NEW_API_ENDPOINT ?? 'https://maci-testnet-graphql.dorafactory.org';

const ROUND_ADDRESS = process.env.COMPARE_ROUND_ADDRESS ?? '';
const OPERATOR_ADDRESS = process.env.COMPARE_OPERATOR_ADDRESS ?? '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function gql<T>(endpoint: string, query: string): Promise<T> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query })
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${endpoint}`);
  }
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`GraphQL error: ${json.errors[0].message}`);
  }
  return json.data as T;
}

// ─── Normalization helpers ────────────────────────────────────────────────────

/** Normalize a single round node from the OLD schema to match new schema field names. */
function normalizeOldRound(node: Record<string, unknown>): Record<string, unknown> {
  const { operator, identity, ...rest } = node;
  return {
    ...rest,
    operatorAddress: operator,
    // identity is now nested under operator{identity} in new schema — compared separately
    _identityForComparison: identity
  };
}

/** Normalize a single OperatorDelayOperation node from the OLD schema. */
function normalizeOldDelayOp(node: Record<string, unknown>): Record<string, unknown> {
  const { nodeId, roundAddress, ...rest } = node;
  return {
    ...rest,
    contractAddress: roundAddress
    // nodeId dropped from new schema
  };
}

/** Normalize a single DeactivateMessage node from the OLD schema. */
function normalizeOldDeactivateMsg(node: Record<string, unknown>): Record<string, unknown> {
  const { maciContractAddress, maciOperator, ...rest } = node;
  return {
    ...rest,
    contractAddress: maciContractAddress,
    operatorAddress: maciOperator
  };
}

// ─── Field comparison ─────────────────────────────────────────────────────────

type Diff = { field: string; old: unknown; new: unknown };

function compareObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  skipFields: string[] = []
): Diff[] {
  const diffs: Diff[] = [];
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  for (const key of keys) {
    if (skipFields.includes(key)) continue;
    if (key.startsWith('_')) continue; // internal comparison helpers
    const oldVal = JSON.stringify(oldObj[key] ?? null);
    const newVal = JSON.stringify(newObj[key] ?? null);
    if (oldVal !== newVal) {
      diffs.push({ field: key, old: oldObj[key], new: newObj[key] });
    }
  }
  return diffs;
}

function printResult(label: string, diffs: Diff[]) {
  if (diffs.length === 0) {
    console.log(`  ✅ ${label} — PASS`);
  } else {
    console.log(`  ❌ ${label} — ${diffs.length} diff(s):`);
    for (const d of diffs) {
      console.log(`     field "${d.field}": old=${JSON.stringify(d.old)}  new=${JSON.stringify(d.new)}`);
    }
  }
  return diffs.length;
}

// ─── Test cases ───────────────────────────────────────────────────────────────

let totalFailures = 0;

// ── 1. getRoundById ────────────────────────────────────────────────────────────

async function compareRoundById(address: string) {
  console.log('\n[1] getRoundById:', address);
  if (!address) {
    console.log('  ⚠️  COMPARE_ROUND_ADDRESS not set, skipping');
    return;
  }

  const OLD_QUERY = `query { round(id: "${address}") {
    id blockHeight txHash caller admin operator contractAddress circuitName
    timestamp votingStart votingEnd status period actionType roundTitle
    roundDescription roundLink coordinatorPubkeyX coordinatorPubkeyY
    voteOptionMap results allResult gasStationEnable totalGrant baseGrant
    totalBond circuitType circuitPower certificationSystem codeId maciType
    voiceCreditAmount preDeactivateRoot identity
  }}`;

  const NEW_QUERY = `query { round(id: "${address}") {
    id blockHeight txHash caller admin operatorAddress contractAddress circuitName
    timestamp votingStart votingEnd status period actionType roundTitle
    roundDescription roundLink coordinatorPubkeyX coordinatorPubkeyY
    voteOptionMap results allResult gasStationEnable totalGrant baseGrant
    totalBond circuitType circuitPower certificationSystem codeId maciType
    voiceCreditAmount preDeactivateRoot
    operator { identity }
  }}`;

  const [oldData, newData] = await Promise.all([
    gql<any>(OLD_API, OLD_QUERY),
    gql<any>(NEW_API, NEW_QUERY)
  ]);

  if (!oldData?.round || !newData?.round) {
    console.log('  ⚠️  One endpoint returned no data');
    return;
  }

  // Flatten nested operator.identity from new schema
  const newNode = { ...newData.round, _identityForComparison: newData.round.operator?.identity };
  delete newNode.operator;

  const normalizedOld = normalizeOldRound(oldData.round);
  const diffs = compareObjects(normalizedOld, newNode);
  totalFailures += printResult('round fields', diffs);

  // Compare identity separately (may be in nested object)
  if (normalizedOld._identityForComparison !== newNode._identityForComparison) {
    console.log(
      `  ❌ identity mismatch: old=${normalizedOld._identityForComparison}  new=${newNode._identityForComparison}`
    );
    totalFailures++;
  } else {
    console.log(`  ✅ identity — PASS`);
  }
}

// ── 2. getRoundsByOperator ─────────────────────────────────────────────────────

async function compareRoundsByOperator(operatorAddress: string) {
  console.log('\n[2] getRoundsByOperator:', operatorAddress);
  if (!operatorAddress) {
    console.log('  ⚠️  COMPARE_OPERATOR_ADDRESS not set, skipping');
    return;
  }

  const OLD_QUERY = `query { rounds(filter: { operator: { equalTo: "${operatorAddress}" } }, first: 5) {
    edges { node { id contractAddress operator status votingEnd } }
  }}`;

  const NEW_QUERY = `query { rounds(filter: { operatorAddress: { equalTo: "${operatorAddress}" } }, first: 5) {
    edges { node { id contractAddress operatorAddress status votingEnd } }
  }}`;

  const [oldData, newData] = await Promise.all([
    gql<any>(OLD_API, OLD_QUERY),
    gql<any>(NEW_API, NEW_QUERY)
  ]);

  const oldEdges: any[] = oldData?.rounds?.edges ?? [];
  const newEdges: any[] = newData?.rounds?.edges ?? [];

  if (oldEdges.length !== newEdges.length) {
    console.log(`  ❌ count mismatch: old=${oldEdges.length}  new=${newEdges.length}`);
    totalFailures++;
    return;
  }

  let edgeFails = 0;
  for (let i = 0; i < oldEdges.length; i++) {
    const normalizedOld = normalizeOldRound(oldEdges[i].node);
    const diffs = compareObjects(normalizedOld, newEdges[i].node);
    edgeFails += diffs.length;
    if (diffs.length > 0) {
      console.log(`  ❌ edge[${i}] diffs:`);
      diffs.forEach((d) => console.log(`     "${d.field}": old=${JSON.stringify(d.old)}  new=${JSON.stringify(d.new)}`));
    }
  }
  totalFailures += printResult(`rounds edges (${oldEdges.length} items)`, edgeFails > 0 ? [{ field: 'see above', old: null, new: null }] : []);
}

// ── 3. getOperatorByAddress ────────────────────────────────────────────────────

async function compareOperatorByAddress(address: string) {
  console.log('\n[3] getOperatorByAddress:', address);
  if (!address) {
    console.log('  ⚠️  COMPARE_OPERATOR_ADDRESS not set, skipping');
    return;
  }

  const SHARED_QUERY = `query { operators(filter: { operatorAddress: { equalTo: "${address}" } }) {
    edges { node { id validatorAddress operatorAddress coordinatorPubkeyX coordinatorPubkeyY identity } }
  }}`;

  // operators query uses same field names on both old and new endpoints
  const [oldData, newData] = await Promise.all([
    gql<any>(OLD_API, SHARED_QUERY),
    gql<any>(NEW_API, SHARED_QUERY)
  ]);

  const oldNode = oldData?.operators?.edges?.[0]?.node;
  const newNode = newData?.operators?.edges?.[0]?.node;

  if (!oldNode || !newNode) {
    console.log('  ⚠️  One endpoint returned no operator data');
    return;
  }

  const diffs = compareObjects(oldNode, newNode);
  totalFailures += printResult('operator fields', diffs);
}

// ── 4. operatorDelayOperations ─────────────────────────────────────────────────

async function compareOperatorDelayOperations(address: string) {
  console.log('\n[4] operatorDelayOperations:', address);
  if (!address) {
    console.log('  ⚠️  COMPARE_OPERATOR_ADDRESS not set, skipping');
    return;
  }

  const startTimestamp = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60; // 30 days ago

  const OLD_QUERY = `query { operatorDelayOperations(
    filter: { operatorAddress: { equalTo: "${address}" }, timestamp: { greaterThanOrEqualTo: "${startTimestamp}" } },
    first: 5, orderBy: [TIMESTAMP_DESC]
  ) { edges { node {
    blockHeight delayProcessDmsgCount delayDuration delayReason delayType
    id nodeId operatorAddress timestamp roundAddress
  } } }}`;

  const NEW_QUERY = `query { operatorDelayOperations(
    filter: { operatorAddress: { equalTo: "${address}" }, timestamp: { greaterThanOrEqualTo: "${startTimestamp}" } },
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

  if (oldEdges.length === 0 && newEdges.length === 0) {
    console.log('  ℹ️  No delay operations in range — skipping value comparison');
    return;
  }

  if (oldEdges.length !== newEdges.length) {
    console.log(`  ❌ count mismatch: old=${oldEdges.length}  new=${newEdges.length}`);
    totalFailures++;
    return;
  }

  let edgeFails = 0;
  for (let i = 0; i < oldEdges.length; i++) {
    const normalizedOld = normalizeOldDelayOp(oldEdges[i].node);
    const diffs = compareObjects(normalizedOld, newEdges[i].node);
    edgeFails += diffs.length;
    if (diffs.length > 0) {
      console.log(`  ❌ edge[${i}] diffs:`);
      diffs.forEach((d) => console.log(`     "${d.field}": old=${JSON.stringify(d.old)}  new=${JSON.stringify(d.new)}`));
    }
  }
  totalFailures += printResult(`operatorDelayOperations edges (${oldEdges.length} items)`, edgeFails > 0 ? [{ field: 'see above', old: null, new: null }] : []);
}

// ── 5. fetchAllDeactivateLogs (deactivateMessages → uploadedDeactivateMessages) ──

async function compareDeactivateLogs(contractAddress: string) {
  console.log('\n[5] fetchAllDeactivateLogs:', contractAddress);
  if (!contractAddress) {
    console.log('  ⚠️  COMPARE_ROUND_ADDRESS not set, skipping');
    return;
  }

  const OLD_QUERY = `query { deactivateMessages(
    first: 5, orderBy: [BLOCK_HEIGHT_ASC],
    filter: { maciContractAddress: { equalTo: "${contractAddress}" } }
  ) { nodes { id blockHeight timestamp txHash maciContractAddress maciOperator } }}`;

  const NEW_QUERY = `query { uploadedDeactivateMessages(
    first: 5, orderBy: [BLOCK_HEIGHT_ASC],
    filter: { contractAddress: { equalTo: "${contractAddress}" } }
  ) { nodes { id blockHeight timestamp txHash contractAddress operatorAddress } }}`;

  const [oldData, newData] = await Promise.all([
    gql<any>(OLD_API, OLD_QUERY),
    gql<any>(NEW_API, NEW_QUERY)
  ]);

  const oldNodes: any[] = oldData?.deactivateMessages?.nodes ?? [];
  const newNodes: any[] = newData?.uploadedDeactivateMessages?.nodes ?? [];

  if (oldNodes.length === 0 && newNodes.length === 0) {
    console.log('  ℹ️  No deactivate messages for this contract — skipping value comparison');
    return;
  }

  if (oldNodes.length !== newNodes.length) {
    console.log(`  ❌ count mismatch: old=${oldNodes.length}  new=${newNodes.length}`);
    totalFailures++;
    return;
  }

  let nodeFails = 0;
  for (let i = 0; i < oldNodes.length; i++) {
    const normalizedOld = normalizeOldDeactivateMsg(oldNodes[i]);
    const diffs = compareObjects(normalizedOld, newNodes[i]);
    nodeFails += diffs.length;
    if (diffs.length > 0) {
      console.log(`  ❌ node[${i}] diffs:`);
      diffs.forEach((d) => console.log(`     "${d.field}": old=${JSON.stringify(d.old)}  new=${JSON.stringify(d.new)}`));
    }
  }
  totalFailures += printResult(`deactivate message nodes (${oldNodes.length} items)`, nodeFails > 0 ? [{ field: 'see above', old: null, new: null }] : []);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== GraphQL Migration Comparison ===');
  console.log(`OLD: ${OLD_API}`);
  console.log(`NEW: ${NEW_API}`);
  console.log(`Round:    ${ROUND_ADDRESS || '(not set)'}`);
  console.log(`Operator: ${OPERATOR_ADDRESS || '(not set)'}`);

  if (!ROUND_ADDRESS && !OPERATOR_ADDRESS) {
    console.log('\n⚠️  Neither COMPARE_ROUND_ADDRESS nor COMPARE_OPERATOR_ADDRESS is set.');
    console.log('Set them in .env or as environment variables and re-run.');
    process.exit(1);
  }

  await compareRoundById(ROUND_ADDRESS);
  await compareRoundsByOperator(OPERATOR_ADDRESS);
  await compareOperatorByAddress(OPERATOR_ADDRESS);
  await compareOperatorDelayOperations(OPERATOR_ADDRESS);
  await compareDeactivateLogs(ROUND_ADDRESS);

  console.log('\n=== Summary ===');
  if (totalFailures === 0) {
    console.log('✅ All comparisons passed — data is consistent between old and new endpoints.');
    process.exit(0);
  } else {
    console.log(`❌ ${totalFailures} failure(s) detected — review the diffs above before completing migration.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
