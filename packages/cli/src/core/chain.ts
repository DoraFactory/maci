import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate';

/**
 * On-chain storage format for vkeys (Groth16VkeyStr in state.rs).
 * Fields are Vec<u8> serialised by serde as number arrays.
 * Field names match state.rs: alpha_1, beta_2, gamma_2, delta_2, ic0, ic1.
 */
export type Groth16VkeyOnChainRaw = {
  alpha_1: number[];
  beta_2: number[];
  gamma_2: number[];
  delta_2: number[];
  ic0: number[];
  ic1: number[];
};

/**
 * Normalised vkey format used throughout this CLI.
 * Values are uncompressed BN128 point hex strings (same encoding as
 * adaptToUncompressed in the SDK): G1 = 128 hex chars, G2 = 256 hex chars.
 */
export type Groth16VkeyOnChain = {
  vk_alpha1: string;
  vk_beta_2: string;
  vk_gamma_2: string;
  vk_delta_2: string;
  vk_ic0: string;
  vk_ic1: string;
};

export type OnChainVkeys = {
  processVkey: Groth16VkeyOnChain;
  tallyVkey: Groth16VkeyOnChain;
  deactivateVkey?: Groth16VkeyOnChain;
  addNewKeyVkey?: Groth16VkeyOnChain;
};

/** Convert the raw on-chain byte-array vkey to normalised hex-string format */
function normaliseVkey(raw: Groth16VkeyOnChainRaw): Groth16VkeyOnChain {
  return {
    vk_alpha1: Buffer.from(raw.alpha_1).toString('hex'),
    vk_beta_2: Buffer.from(raw.beta_2).toString('hex'),
    vk_gamma_2: Buffer.from(raw.gamma_2).toString('hex'),
    vk_delta_2: Buffer.from(raw.delta_2).toString('hex'),
    vk_ic0: Buffer.from(raw.ic0).toString('hex'),
    vk_ic1: Buffer.from(raw.ic1).toString('hex'),
  };
}

function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

async function queryRawItem(
  client: CosmWasmClient,
  contractAddress: string,
  key: string
): Promise<unknown | null> {
  const raw = await client.queryContractRaw(contractAddress, encode(key));
  if (!raw || raw.length === 0) return null;
  return JSON.parse(new TextDecoder().decode(raw));
}

export async function getOnChainVkeys(
  rpcEndpoint: string,
  contractAddress: string
): Promise<OnChainVkeys> {
  const client = await CosmWasmClient.connect(rpcEndpoint);

  const [processVkey, tallyVkey, deactivateVkey, addNewKeyVkey] =
    await Promise.all([
      queryRawItem(client, contractAddress, 'groth16_process_vkeys'),
      queryRawItem(client, contractAddress, 'groth16_tally_vkeys'),
      queryRawItem(client, contractAddress, 'groth16_deactivate_vkeys').catch(
        () => null
      ),
      queryRawItem(client, contractAddress, 'groth16_newkey_vkeys').catch(
        () => null
      ),
    ]);

  if (!processVkey || !tallyVkey) {
    throw new Error(
      `Could not read vkeys from contract ${contractAddress}. ` +
        `Ensure the contract is an aMACI/MACI round contract.`
    );
  }

  return {
    processVkey: normaliseVkey(processVkey as Groth16VkeyOnChainRaw),
    tallyVkey: normaliseVkey(tallyVkey as Groth16VkeyOnChainRaw),
    deactivateVkey: deactivateVkey
      ? normaliseVkey(deactivateVkey as Groth16VkeyOnChainRaw)
      : undefined,
    addNewKeyVkey: addNewKeyVkey
      ? normaliseVkey(addNewKeyVkey as Groth16VkeyOnChainRaw)
      : undefined,
  };
}

export async function getMsgChainLength(
  rpcEndpoint: string,
  contractAddress: string
): Promise<string> {
  const client = await CosmWasmClient.connect(rpcEndpoint);
  const result: string = await client.queryContractSmart(contractAddress, {
    get_msg_chain_length: {},
  });
  return result;
}

export async function getStateCommitment(
  rpcEndpoint: string,
  contractAddress: string
): Promise<string> {
  const client = await CosmWasmClient.connect(rpcEndpoint);
  const result: string = await client.queryContractSmart(contractAddress, {
    query_current_state_commitment: {},
  });
  return result;
}

export async function getTallyCommitment(
  rpcEndpoint: string,
  contractAddress: string
): Promise<string> {
  const client = await CosmWasmClient.connect(rpcEndpoint);
  const raw = await client.queryContractRaw(
    contractAddress,
    new TextEncoder().encode('current_tally_commitment')
  );
  if (!raw || raw.length === 0) return '0';
  return JSON.parse(new TextDecoder().decode(raw)) as string;
}

export async function getNumSignUps(
  rpcEndpoint: string,
  contractAddress: string
): Promise<string> {
  const client = await CosmWasmClient.connect(rpcEndpoint);
  const result: string = await client.queryContractSmart(contractAddress, {
    get_num_sign_up: {},
  });
  return result;
}

export async function getRoundPeriod(
  rpcEndpoint: string,
  contractAddress: string
): Promise<string> {
  const client = await CosmWasmClient.connect(rpcEndpoint);
  const result: { status: string } = await client.queryContractSmart(
    contractAddress,
    { get_period: {} }
  );
  return result.status ?? String(result);
}

// ─── Recheck (Layer 2) chain queries ────────────────────────────────────────

export type RecheckChainConfig = {
  /** Poseidon hash of the coordinator's public key */
  coordinatorHash: bigint;
  /** Deactivate commitment (constant during processMessage phase) */
  deactivateCommitment: bigint;
  /** Poll ID — used in processMessage input slot [7] */
  pollId: bigint;
  /** Circuit type: 0 = 1p1v, 1 = qv */
  circuitType: bigint;
  /** Max vote options */
  maxVoteOptions: bigint;
  /** Number of signed-up users */
  numSignUps: bigint;
  /**
   * State tree root.
   * The initial state commitment = poseidon2(stateTreeRoot, 0n),
   * set by start_process_period.  State tree does not change during
   * Processing/Tallying, so current root == root at process start.
   */
  stateTreeRoot: bigint;
};

export async function getRecheckChainConfig(
  rpcEndpoint: string,
  contractAddress: string
): Promise<RecheckChainConfig> {
  const client = await CosmWasmClient.connect(rpcEndpoint);

  const [
    coordinatorHash,
    deactivateCommitment,
    pollId,
    circuitType,
    maxVoteOptions,
    numSignUps,
    stateTreeRoot,
  ] = await Promise.all([
    queryRawItem(client, contractAddress, 'coordinator_hash'),
    queryRawItem(client, contractAddress, 'current_deactivate_commitment'),
    queryRawItem(client, contractAddress, 'poll_id'),
    queryRawItem(client, contractAddress, 'circuit_type'),
    queryRawItem(client, contractAddress, 'max_vote_options'),
    client.queryContractSmart(contractAddress, { get_num_sign_up: {} }) as Promise<string>,
    client.queryContractSmart(contractAddress, { get_state_tree_root: {} }) as Promise<string>,
  ]);

  return {
    coordinatorHash: BigInt((coordinatorHash as string | null) ?? '0'),
    deactivateCommitment: BigInt((deactivateCommitment as string | null) ?? '0'),
    // poll_id may be stored as a JSON number (u64)
    pollId: BigInt(String(pollId ?? '0')),
    circuitType: BigInt((circuitType as string | null) ?? '0'),
    maxVoteOptions: BigInt((maxVoteOptions as string | null) ?? '0'),
    numSignUps: BigInt(String(numSignUps ?? '0')),
    stateTreeRoot: BigInt(String(stateTreeRoot ?? '0')),
  };
}
