import { OfflineSigner } from '@cosmjs/proto-signing';
import { Keypair } from '../libs/crypto';
import { FetchOptions } from '../libs/http/http';
export type * from '../libs/contract/types';
export type * from '../libs/crypto/types';

export enum MaciCircuitType {
  IP1V = '0',
  QV = '1'
}

export enum MaciCertSystemType {
  GROTH16 = 'groth16',
  PLONK = 'plonk'
}

export enum MaciRoundType {
  MACI = '0',
  AMACI = '1',
  ORACLE_MACI = '2'
}

export type CertificateEcosystem = 'cosmoshub' | 'doravota';

export type ClientParams = {
  signer?: OfflineSigner;
  network: 'mainnet' | 'testnet';
  rpcEndpoint?: string;
  restEndpoint?: string;
  apiEndpoint?: string; // Indexer GraphQL API endpoint
  saasApiEndpoint?: string; // MACI SaaS API endpoint
  saasApiKey?: string; // MACI SaaS API key
  certificateApiEndpoint?: string;
  registryAddress?: string;
  saasAddress?: string;
  apiSaasAddress?: string;
  maciCodeId?: number;
  oracleCodeId?: number;
  customFetch?: typeof fetch;
  defaultOptions?: FetchOptions;
  feegrantOperator?: string;
  whitelistBackendPubkey?: string;
  maciKeypair?: Keypair;
  secretKey?: string;
  mnemonic?: string;
};

export type ContractParams = {
  network: 'mainnet' | 'testnet';
  rpcEndpoint: string;
  registryAddress: string;
  saasAddress: string;
  apiSaasAddress: string;
  maciCodeId: number;
  oracleCodeId: number;
  whitelistBackendPubkey: string;
  feegrantOperator: string;
};

export type TransactionType = {
  id: string;
  blockHeight: string;
  txHash: string;
  timestamp: string;
  type: string;
  status: string;
  circuitName: string;
  fee: string;
  gasUsed: string;
  gasWanted: string;
  caller: string;
  contractAddress: string;
};

export type RoundType = {
  id: string;
  blockHeight: string;
  txHash: string;
  caller: string;
  admin: string;
  operator: string;
  contractAddress: string;
  circuitName: string;
  timestamp: string;
  votingStart: string;
  votingEnd: string;
  status: string;
  period: string;
  actionType: string;
  roundTitle: string;
  roundDescription: string;
  roundLink: string;
  coordinatorPubkeyX: string;
  coordinatorPubkeyY: string;
  voteOptionMap: string;
  results: string;
  allResult: string;
  gasStationEnable: boolean;
  totalGrant: string;
  baseGrant: string;
  totalBond: string;
  circuitType: string;
  circuitPower: string;
  certificationSystem: string;
  codeId: string;
  maciType: string;
  voiceCreditAmount: string;
  preDeactivateRoot: string;
  identity: string;
  // funds: string;
  operatorLogoUrl?: string;
  operatorMoniker?: string;
  resultsList?: {
    v: number;
    v2: number;
  }[];
};

export type SelectiveRoundType = Partial<RoundType>;

export type ProofType = {
  nodes: {
    id: string;
    blockHeight: string;
    txHash: string;
    contractAddress: string;
    timestamp: string;
    actionType: string;
    commitment: string;
    proof: string;
  }[];
};

export type OperatorDelayType = {
  blockHeight: string;
  delayProcessDmsgCount: number;
  delayDuration: string;
  delayReason: string;
  delayType: string;
  id: string;
  nodeId: string;
  operatorAddress: string;
  timestamp: string;
  roundAddress: string;
};

export type OperatorType = {
  id: string;
  validatorAddress: string;
  operatorAddress: string;
  coordinatorPubkeyX: string;
  coordinatorPubkeyY: string;
  identity: string;
  logoUrl: string;
  moniker: string;
  activeRoundsCount: number;
  completedRoundsCount: number;
};

export type CircuitType = {
  maciType: string;
  circuitType: string;
  displayName: string;
  repoUrl: string;
  zipUrl: string;
  roundCount?: number;
};

export type SignUpEventType = {
  id: string;
  blockHeight: string;
  txHash: string;
  contractAddress: string;
  timestamp: string;
  pubKey: string;
  stateIdx: number;
  balance: string;
};

export type CircuitsCountGraphqlResponse = {
  data: {
    rounds: {
      totalCount: number;
    };
  };
};

export type ErrorResponse = {
  code: number;
  error: {
    message: string;
    type: string;
  };
};

export type SuccessResponse<T> = {
  code: 200;
  data: T;
};

export type CircuitResponse =
  | SuccessResponse<{
      circuit: CircuitType;
    }>
  | ErrorResponse;

export type CircuitsResponse =
  | SuccessResponse<{
      circuits: CircuitType[];
    }>
  | ErrorResponse;

export type BalanceResponse =
  | SuccessResponse<{
      balance: string;
    }>
  | ErrorResponse;

export type OperatorResponse =
  | SuccessResponse<{
      operator: OperatorType;
    }>
  | ErrorResponse;

export type MissRateResponse =
  | SuccessResponse<{
      missRate: (MissRateType & {
        date: string;
      })[];
    }>
  | ErrorResponse;

// export type ClaimableResponse =
//   | SuccessResponse<{
//       claimable: ClaimableType;
//     }>
//   | ErrorResponse;

export type OperatorDelayOperationsResponse =
  | SuccessResponse<{
      operatorDelayOperations: {
        pageInfo: {
          endCursor: string;
          hasNextPage: boolean;
        };
        edges: {
          cursor: string;
          node: OperatorDelayType;
        }[];
        totalCount: number;
      };
    }>
  | ErrorResponse;

export type OperatorsResponse =
  | SuccessResponse<{
      operators: {
        pageInfo: {
          endCursor: string;
          hasNextPage: boolean;
        };
        edges: {
          cursor: string;
          node: OperatorType;
        }[];
        totalCount: number;
      };
    }>
  | ErrorResponse;

export type OperatorsGraphqlResponse = {
  data: {
    operators: {
      pageInfo: {
        endCursor: string;
        hasNextPage: boolean;
      };
      edges: {
        cursor: string;
        node: OperatorType;
      }[];
      totalCount: number;
    };
  };
};

export type RoundsCountGraphqlResponse = {
  data: {
    activeRoundsCount: {
      totalCount: number;
    };
    completedRoundsCount: {
      totalCount: number;
    };
  };
};

export type VoteCountGraphqlResponse = {
  data: {
    signupsCount: {
      totalCount: number;
    };
    messagesCount: {
      totalCount: number;
    };
  };
};

export type OperatorDelayOperationsGraphqlResponse = {
  data: {
    operatorDelayOperations: {
      pageInfo: {
        endCursor: string;
        hasNextPage: boolean;
      };
      edges: {
        cursor: string;
        node: OperatorDelayType;
      }[];
      totalCount: number;
    };
  };
};

export type TransactionGraphqlResponse = {
  data: {
    transaction: TransactionType;
  };
};

export type TransactionResponse =
  | SuccessResponse<{
      transaction: TransactionType;
    }>
  | ErrorResponse;

export type TransactionsGraphqlResponse = {
  data: {
    transactions: {
      pageInfo: {
        endCursor: string;
        hasNextPage: boolean;
      };
      edges: {
        cursor: string;
        node: TransactionType;
      }[];
      totalCount: number;
    };
  };
};

export type TransactionsResponse =
  | SuccessResponse<{
      transactions: {
        pageInfo: {
          endCursor: string;
          hasNextPage: boolean;
        };
        edges: {
          cursor: string;
          node: TransactionType;
        }[];
        totalCount: number;
      };
    }>
  | ErrorResponse;

export type RoundResponse =
  | SuccessResponse<{
      round: RoundType;
    }>
  | ErrorResponse;

export type SelectiveRoundResponse =
  | SuccessResponse<{
      round: SelectiveRoundType;
    }>
  | ErrorResponse;

export type RoundsResponse =
  | SuccessResponse<{
      rounds: {
        pageInfo: {
          endCursor: string;
          hasNextPage: boolean;
        };
        edges: {
          cursor: string;
          node: RoundType;
        }[];
        totalCount: number;
      };
    }>
  | ErrorResponse;

export type RoundGraphqlResponse = {
  data: {
    round: RoundType;
  };
};

/**
 * GraphQL response type for selective round fields
 */
export type SelectiveRoundGraphqlResponse = {
  data: {
    round: SelectiveRoundType;
  };
};

export type RoundsGraphqlResponse = {
  data: {
    rounds: {
      pageInfo: {
        endCursor: string;
        hasNextPage: boolean;
      };
      edges: {
        cursor: string;
        node: RoundType;
      }[];
      totalCount: number;
    };
  };
};

export type ProofResponse =
  | SuccessResponse<{
      proofData: ProofType;
    }>
  | ErrorResponse;

export type ProofGraphqlResponse = {
  data: {
    proofData: ProofType;
  };
};

export type SignUpEventsResponse =
  | SuccessResponse<{
      signUpEvents: SignUpEventType[];
    }>
  | ErrorResponse;

export type SignUpEventsGraphqlResponse = {
  data: {
    signUpEvents: {
      nodes: SignUpEventType[];
    };
  };
};

export type MissRateType = {
  delayCount: number;
  deactivateDelay: {
    count: number;
    dmsgCount: number;
  };
  tallyDelay: {
    count: number;
  };
  totalDelayDuration: number;
  avgDelayDuration: number;
  tallyCount: number;
  deactivateCount: number;
  missRate: number;
};

export type DeactivateMessage = {
  id: string;
  blockHeight: string;
  timestamp: string;
  txHash: string;
  deactivateMessage: string; // '[["0", "1", "2", "3", "4"]]'
  maciContractAddress: string;
  maciOperator: string;
};

export type AccountMangerParams = {
  mnemonic?: string;
  secretKey?: string | bigint;
};

export type DerivePathParams = {
  accountIndex?: number;
  isExternal?: boolean;
  addressIndex?: number;
};

export type VoterClientParams = {
  network: 'mainnet' | 'testnet';
  mnemonic?: string;
  secretKey?: string | bigint;
  registryAddress?: string;
  apiEndpoint?: string; // Indexer GraphQL API endpoint
  restEndpoint?: string; // DoraVota REST API endpoint
  saasApiEndpoint?: string; // MACI SaaS API endpoint
  saasApiKey?: string; // MACI SaaS API key
  customFetch?: typeof fetch;
  defaultOptions?: FetchOptions;
};
