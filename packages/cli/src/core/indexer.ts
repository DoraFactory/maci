export type RoundInfo = {
  contractAddress: string;
  circuitPower: string;
  maciType: string;
  status: string;
  circuitName: string;
  /** Nanosecond Unix timestamp */
  votingStart: string;
  /** Nanosecond Unix timestamp */
  votingEnd: string;
  /** Indexed sign-up count */
  signUpsCount: number;
  /** Operator address */
  operatorAddress: string;
};

export type ProofEntry = {
  id: string;
  txHash: string;
  timestamp: string;
  actionType: string;
  commitment: string;
  proof: string;
  verifyResult: string;
};

export type MessageCountResult = {
  total: number;
};

async function graphql<T>(endpoint: string, query: string): Promise<T> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`Indexer request failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`Indexer GraphQL error: ${json.errors[0].message}`);
  }
  return json.data;
}

type RoundGqlNode = {
  contractAddress: string;
  circuitPower: string;
  maciType: string;
  status: string;
  circuitName: string;
  votingStart: string;
  votingEnd: string;
  signUps: { totalCount: number };
  operator: { operatorAddress: string } | null;
};

export async function getRoundInfo(
  endpoint: string,
  contractAddress: string
): Promise<RoundInfo | null> {
  const data = await graphql<{
    rounds: { nodes: RoundGqlNode[] };
  }>(
    endpoint,
    `query {
      rounds(filter: { contractAddress: { equalTo: "${contractAddress}" } }) {
        nodes {
          contractAddress
          circuitPower
          maciType
          status
          circuitName
          votingStart
          votingEnd
          signUps { totalCount }
          operator { operatorAddress }
        }
      }
    }`
  );
  const node = data.rounds.nodes[0];
  if (!node) return null;
  return {
    contractAddress: node.contractAddress,
    circuitPower: node.circuitPower,
    maciType: node.maciType,
    status: node.status,
    circuitName: node.circuitName,
    votingStart: node.votingStart,
    votingEnd: node.votingEnd,
    signUpsCount: node.signUps.totalCount,
    operatorAddress: node.operator?.operatorAddress ?? 'unknown',
  };
}

export async function getProofs(
  endpoint: string,
  contractAddress: string
): Promise<ProofEntry[]> {
  const data = await graphql<{
    proofData: { nodes: ProofEntry[] };
  }>(
    endpoint,
    `query {
      proofData(
        first: 10000
        filter: { contractAddress: { equalTo: "${contractAddress}" } }
        orderBy: [TIMESTAMP_ASC]
      ) {
        nodes {
          id
          txHash
          timestamp
          actionType
          commitment
          proof
          verifyResult
        }
      }
    }`
  );
  return data.proofData.nodes;
}

export async function getMessageCount(
  endpoint: string,
  contractAddress: string
): Promise<number> {
  const data = await graphql<{
    publishMessageEvents: { totalCount: number };
  }>(
    endpoint,
    `query {
      publishMessageEvents(
        filter: { contractAddress: { equalTo: "${contractAddress}" } }
      ) {
        totalCount
      }
    }`
  );
  return data.publishMessageEvents.totalCount;
}

export type IndexedMessage = {
  msgChainLength: number;
  message: string;
  encPubKey: string;
};

/**
 * Fetch all PublishMessageEvent records for a round, ordered by msgChainLength ASC.
 * Uses offset-based pagination to handle large rounds.
 */
export async function getMessages(
  endpoint: string,
  contractAddress: string,
  onProgress?: (fetched: number, total: number) => void
): Promise<IndexedMessage[]> {
  const PAGE_SIZE = 500;
  const messages: IndexedMessage[] = [];

  // First fetch to get totalCount and first page
  const first = await graphql<{
    publishMessageEvents: { totalCount: number; nodes: IndexedMessage[] };
  }>(
    endpoint,
    `query {
      publishMessageEvents(
        first: ${PAGE_SIZE}
        offset: 0
        filter: { contractAddress: { equalTo: "${contractAddress}" } }
        orderBy: [MSG_CHAIN_LENGTH_ASC]
      ) {
        totalCount
        nodes { msgChainLength message encPubKey }
      }
    }`
  );

  const total = first.publishMessageEvents.totalCount;
  messages.push(...first.publishMessageEvents.nodes);
  onProgress?.(messages.length, total);

  // Paginate remaining pages
  let offset = PAGE_SIZE;
  while (messages.length < total) {
    const page = await graphql<{
      publishMessageEvents: { nodes: IndexedMessage[] };
    }>(
      endpoint,
      `query {
        publishMessageEvents(
          first: ${PAGE_SIZE}
          offset: ${offset}
          filter: { contractAddress: { equalTo: "${contractAddress}" } }
          orderBy: [MSG_CHAIN_LENGTH_ASC]
        ) {
          nodes { msgChainLength message encPubKey }
        }
      }`
    );
    messages.push(...page.publishMessageEvents.nodes);
    offset += PAGE_SIZE;
    onProgress?.(messages.length, total);
  }

  return messages;
}
