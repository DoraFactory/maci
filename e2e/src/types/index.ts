// Type definitions for e2e testing framework

import { SimulateCosmWasmClient } from '@oraichain/cw-simulate';
import { OperatorClient, VoterClient } from '@dorafactory/maci-sdk';

// Contract deployment info
export interface ContractInfo {
  codeId: number;
  contractAddress: string;
}

// Deployed contracts registry
export interface DeployedContracts {
  amaci?: ContractInfo;
  apiMaci?: ContractInfo;
  registry?: ContractInfo;
  apiSaas?: ContractInfo;
}

// Test account info
export interface TestAccount {
  address: string;
  mnemonic?: string;
  secretKey?: bigint;
}

// Test environment configuration
export interface TestEnvironmentConfig {
  chainId?: string;
  bech32Prefix?: string;
  accounts?: TestAccount[];
}

// Circuit proof data
export interface Groth16Proof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: string;
  curve: string;
}

// Contract proof format
export interface ContractProofType {
  a: string;
  b: string;
  c: string;
}

// Test context
export interface TestContext {
  client: SimulateCosmWasmClient;
  contracts: DeployedContracts;
  operator: OperatorClient;
  voters: VoterClient[];
  accounts: TestAccount[];
}

// WASM bytecode cache
export interface WasmBytecodeCache {
  amaci?: Uint8Array;
  apiMaci?: Uint8Array;
  registry?: Uint8Array;
  apiSaas?: Uint8Array;
}

