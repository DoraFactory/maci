import { OfflineSigner, EncodeObject } from '@cosmjs/proto-signing';
import { ContractParams } from '../../types';
import {
  createAMaciClientBy,
  createAMaciQueryClientBy,
  createApiSaasClientBy,
  createContractClientByWallet,
  createRegistryClientBy,
  createRegistryQueryClientBy
} from './config';
import { CreateAMaciRoundParams, CreateApiSaasAmaciRoundParams } from './types';
import { StdFee, GasPrice, calculateFee, BroadcastTxError } from '@cosmjs/stargate';
import { DEFAULT_BASE_FEE, FEE_DENOM } from '../maci/config';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';

export const prefix = 'dora';

function toUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

const DEFAULT_GAS_PRICE = GasPrice.fromString('10000000000peaka');
const DEFAULT_RETRIES = 5;
const DEFAULT_RETRY_DELAY = 200;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simulate the transaction to estimate gas and resolve the final StdFee.
 * Simulation also acts as a pre-flight check — any obvious tx errors
 * (wrong params, insufficient balance, etc.) are surfaced before broadcast.
 */
async function resolveFee(
  signingClient: SigningCosmWasmClient,
  address: string,
  msgs: EncodeObject[],
  fee: StdFee | 'auto' | number,
  granter?: string
): Promise<StdFee> {
  let stdFee: StdFee;
  if (typeof fee === 'object') {
    stdFee = fee;
  } else {
    const multiplier = typeof fee === 'number' ? fee : 1.8;
    const gasEstimation = await signingClient.simulate(address, msgs, '');
    stdFee = calculateFee(Math.round(gasEstimation * multiplier), DEFAULT_GAS_PRICE);
  }
  if (granter) {
    return { ...stdFee, granter };
  }
  return stdFee;
}


export class Contract {
  public network: 'mainnet' | 'testnet';
  public rpcUrls: string[];
  public registryAddress: string;
  public saasAddress: string;
  public apiSaasAddress: string;
  public maciCodeId: number;
  public oracleCodeId: number;
  public feegrantOperator: string;
  public whitelistBackendPubkey: string;

  private retries: number;
  private retryDelay: number;

  constructor({
    network,
    rpcEndpoints,
    registryAddress,
    saasAddress,
    apiSaasAddress,
    maciCodeId,
    oracleCodeId,
    feegrantOperator,
    whitelistBackendPubkey,
    retries,
    retryDelay
  }: ContractParams) {
    this.network = network;
    this.rpcUrls = rpcEndpoints;
    this.registryAddress = registryAddress;
    this.saasAddress = saasAddress;
    this.apiSaasAddress = apiSaasAddress;
    this.maciCodeId = maciCodeId;
    this.oracleCodeId = oracleCodeId;
    this.feegrantOperator = feegrantOperator;
    this.whitelistBackendPubkey = whitelistBackendPubkey;
    this.retries = retries ?? DEFAULT_RETRIES;
    this.retryDelay = retryDelay ?? DEFAULT_RETRY_DELAY;
  }

  /**
   * Execute fn with primary-first multi-endpoint failover and exponential backoff retry.
   * Every call starts from rpcUrls[0] (primary). On failure the next endpoint is tried
   * in order, cycling back to the primary once all endpoints have been exhausted.
   * Retries only on connection-level errors; tx-level rejections fail fast.
   */
  private async withRetry<T>(fn: (rpcEndpoint: string) => Promise<T>): Promise<T> {
    let lastError: unknown;
    let urlIndex = 0; // always start from primary on every new call
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const rpcEndpoint = this.rpcUrls[urlIndex];
      try {
        return await fn(rpcEndpoint);
      } catch (err) {
        // BroadcastTxError means the tx was rejected by the mempool (bad sequence,
        // insufficient gas, wrong params, etc.). Switching endpoints won't help — fail fast.
        if (err instanceof BroadcastTxError) {
          throw err;
        }
        lastError = err;
        const nextIndex = (urlIndex + 1) % this.rpcUrls.length;
        const delay = this.retryDelay;
        console.warn(
          `[Contract] RPC request failed (attempt ${attempt + 1}/${this.retries + 1}) on ${rpcEndpoint}: ${(err as Error)?.message ?? err}` +
            (attempt < this.retries
              ? ` — retrying on ${this.rpcUrls[nextIndex]} in ${delay}ms`
              : ' — all retries exhausted')
        );
        urlIndex = nextIndex;
        if (attempt < this.retries) {
          await sleep(delay);
        }
      }
    }
    throw lastError;
  }

  // ==================== Query Methods (unchanged) ====================

  async queryRoundInfo({ signer, roundAddress }: { signer: OfflineSigner; roundAddress: string }) {
    return this.withRetry(async (rpcEndpoint) => {
      const client = await createAMaciQueryClientBy({ rpcEndpoint, contractAddress: roundAddress });
      return client.getRoundInfo();
    });
  }

  async getStateIdx({
    contractAddress,
    pubkey
  }: {
    contractAddress: string;
    pubkey: { x: string; y: string };
  }) {
    return this.withRetry(async (rpcEndpoint) => {
      const client = await createAMaciQueryClientBy({ rpcEndpoint, contractAddress });
      return client.signuped({ pubkey });
    });
  }

  async getPollId({ contractAddress }: { contractAddress: string }) {
    return this.withRetry(async (rpcEndpoint) => {
      const client = await createAMaciQueryClientBy({ rpcEndpoint, contractAddress });
      return client.getPollId();
    });
  }

  async isApiSaasOperator({ signer, operator }: { signer: OfflineSigner; operator: string }) {
    return this.withRetry(async (rpcEndpoint) => {
      const client = await createApiSaasClientBy({
        rpcEndpoint,
        wallet: signer,
        contractAddress: this.apiSaasAddress
      });
      return client.isOperator({ address: operator });
    });
  }

  // ==================== Client Accessors ====================

  async registryClient({
    signer,
    contractAddress
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }) {
    return createRegistryClientBy({
      rpcEndpoint: this.rpcUrls[0],
      wallet: signer,
      contractAddress
    });
  }

  async amaciClient({
    signer,
    contractAddress
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }) {
    return createAMaciClientBy({
      rpcEndpoint: this.rpcUrls[0],
      wallet: signer,
      contractAddress
    });
  }

  async amaciQueryClient({ contractAddress }: { contractAddress: string }) {
    return createAMaciQueryClientBy({
      rpcEndpoint: this.rpcUrls[0],
      contractAddress
    });
  }

  async registryQueryClient() {
    return createRegistryQueryClientBy({
      rpcEndpoint: this.rpcUrls[0],
      contractAddress: this.registryAddress
    });
  }

  async apiSaasClient({
    signer,
    contractAddress
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }) {
    return createApiSaasClientBy({
      rpcEndpoint: this.rpcUrls[0],
      wallet: signer,
      contractAddress
    });
  }

  async contractClient({ signer }: { signer: OfflineSigner }) {
    return createContractClientByWallet(this.rpcUrls[0], signer);
  }

  // ==================== Write Transaction Methods ====================

  async createAMaciRound(
    params: CreateAMaciRoundParams & { signer: OfflineSigner }
  ): Promise<{ txHash: string }> {
    const { signer } = params;
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const [{ address }] = await signer.getAccounts();

      const msg = {
        create_round: {
          certification_system: params.certificationSystem ?? '0',
          circuit_type: params.circuitType.toString(),
          deactivate_enabled: params.deactivateEnabled,
          operator: params.operator,
          registration_mode: params.registrationMode,
          round_info: {
            title: params.title,
            description: params.description ?? '',
            link: params.link ?? ''
          },
          voice_credit_mode: params.voiceCreditMode,
          vote_option_map: params.voteOptionMap,
          voting_time: {
            start_time: (BigInt(params.startVoting.getTime()) * 1_000_000n).toString(),
            end_time: (BigInt(params.endVoting.getTime()) * 1_000_000n).toString()
          }
        }
      };

      const executeMsg: EncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: address,
          contract: this.registryAddress,
          msg: toUtf8(JSON.stringify(msg)),
          funds: [{ denom: FEE_DENOM, amount: DEFAULT_BASE_FEE }]
        }
      };

      const fee = await resolveFee(signingClient, address, [executeMsg], params.fee ?? 'auto');
      const txHash = await signingClient.signAndBroadcastSync(address, [executeMsg], fee);
      return { txHash };
    });
  }

  async setApiSaasMaciRoundInfo({
    signer,
    contractAddress,
    title,
    description,
    link,
    gasStation = false,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    title: string;
    description: string;
    link: string;
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }): Promise<{ txHash: string }> {
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const [{ address }] = await signer.getAccounts();

      const msg = {
        set_round_info: {
          contract_addr: contractAddress,
          round_info: { title, description, link }
        }
      };

      const executeMsg: EncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: address,
          contract: this.apiSaasAddress,
          msg: toUtf8(JSON.stringify(msg)),
          funds: []
        }
      };

      const granter = gasStation ? this.apiSaasAddress : undefined;
      const stdFee = await resolveFee(signingClient, address, [executeMsg], fee, granter);
      const txHash = await signingClient.signAndBroadcastSync(address, [executeMsg], stdFee);
      return { txHash };
    });
  }

  async setApiSaasMaciRoundVoteOptions({
    signer,
    contractAddress,
    voteOptionMap,
    gasStation = false,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    voteOptionMap: string[];
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }): Promise<{ txHash: string }> {
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const [{ address }] = await signer.getAccounts();

      const msg = {
        set_vote_options_map: {
          contract_addr: contractAddress,
          vote_option_map: voteOptionMap
        }
      };

      const executeMsg: EncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: address,
          contract: this.apiSaasAddress,
          msg: toUtf8(JSON.stringify(msg)),
          funds: []
        }
      };

      const granter = gasStation ? this.apiSaasAddress : undefined;
      const stdFee = await resolveFee(signingClient, address, [executeMsg], fee, granter);
      const txHash = await signingClient.signAndBroadcastSync(address, [executeMsg], stdFee);
      return { txHash };
    });
  }

  async addApiSaasOperator({
    signer,
    operator,
    gasStation = false,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    operator: string;
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }): Promise<{ txHash: string }> {
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const [{ address }] = await signer.getAccounts();

      const msg = { add_operator: { operator } };

      const executeMsg: EncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: address,
          contract: this.apiSaasAddress,
          msg: toUtf8(JSON.stringify(msg)),
          funds: []
        }
      };

      const granter = gasStation ? this.apiSaasAddress : undefined;
      const stdFee = await resolveFee(signingClient, address, [executeMsg], fee, granter);
      const txHash = await signingClient.signAndBroadcastSync(address, [executeMsg], stdFee);
      return { txHash };
    });
  }

  async removeApiSaasOperator({
    signer,
    operator,
    gasStation = false,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    operator: string;
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }): Promise<{ txHash: string }> {
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const [{ address }] = await signer.getAccounts();

      const msg = { remove_operator: { operator } };

      const executeMsg: EncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: address,
          contract: this.apiSaasAddress,
          msg: toUtf8(JSON.stringify(msg)),
          funds: []
        }
      };

      const granter = gasStation ? this.apiSaasAddress : undefined;
      const stdFee = await resolveFee(signingClient, address, [executeMsg], fee, granter);
      const txHash = await signingClient.signAndBroadcastSync(address, [executeMsg], stdFee);
      return { txHash };
    });
  }

  async createApiSaasAmaciRound(
    params: CreateApiSaasAmaciRoundParams & { signer: OfflineSigner }
  ): Promise<{ txHash: string }> {
    const { signer } = params;
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const [{ address }] = await signer.getAccounts();

      const msg = {
        create_amaci_round: {
          certification_system: params.certificationSystem ?? '0',
          circuit_type: params.circuitType.toString(),
          deactivate_enabled: params.deactivateEnabled,
          operator: params.operator,
          registration_mode: params.registrationMode,
          round_info: {
            title: params.title,
            description: params.description ?? '',
            link: params.link ?? ''
          },
          voice_credit_mode: params.voiceCreditMode,
          vote_option_map: params.voteOptionMap,
          voting_time: {
            start_time: (BigInt(params.startVoting.getTime()) * 1_000_000n).toString(),
            end_time: (BigInt(params.endVoting.getTime()) * 1_000_000n).toString()
          }
        }
      };

      const executeMsg: EncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: address,
          contract: this.apiSaasAddress,
          msg: toUtf8(JSON.stringify(msg)),
          funds: []
        }
      };

      const granter = (params.gasStation ?? false) ? this.apiSaasAddress : undefined;
      const stdFee = await resolveFee(
        signingClient,
        address,
        [executeMsg],
        params.fee ?? 1.8,
        granter
      );
      const txHash = await signingClient.signAndBroadcastSync(address, [executeMsg], stdFee);
      return { txHash };
    });
  }

  async signupViaSaas({
    signer,
    contractAddress,
    pubkey,
    certificate,
    amount,
    granter,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    pubkey: { x: string; y: string };
    certificate?: string;
    amount?: string;
    granter?: string;
    fee?: StdFee | 'auto' | number;
  }): Promise<{ txHash: string }> {
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const [{ address }] = await signer.getAccounts();

      const msg = {
        sign_up: {
          contract_addr: contractAddress,
          pubkey,
          certificate: certificate ?? null,
          amount: amount ?? null
        }
      };

      const executeMsg: EncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: address,
          contract: this.apiSaasAddress,
          msg: toUtf8(JSON.stringify(msg)),
          funds: []
        }
      };

      const saasGranter = granter ?? this.apiSaasAddress;
      const stdFee = await resolveFee(signingClient, address, [executeMsg], fee, saasGranter);
      const txHash = await signingClient.signAndBroadcastSync(address, [executeMsg], stdFee);
      return { txHash };
    });
  }

  async preAddNewKeyViaSaas({
    signer,
    contractAddress,
    pubkey,
    nullifier,
    d,
    groth16Proof,
    granter,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    pubkey: { x: string; y: string };
    nullifier: string;
    d: string[];
    groth16Proof: { a: string; b: string; c: string };
    granter?: string;
    fee?: StdFee | 'auto' | number;
  }): Promise<{ txHash: string }> {
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const [{ address }] = await signer.getAccounts();

      const msg = {
        pre_add_new_key: {
          contract_addr: contractAddress,
          pubkey,
          nullifier,
          d,
          groth16_proof: groth16Proof
        }
      };

      const executeMsg: EncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: address,
          contract: this.apiSaasAddress,
          msg: toUtf8(JSON.stringify(msg)),
          funds: []
        }
      };

      const saasGranter = granter ?? this.apiSaasAddress;
      const stdFee = await resolveFee(signingClient, address, [executeMsg], fee, saasGranter);
      const txHash = await signingClient.signAndBroadcastSync(address, [executeMsg], stdFee);
      return { txHash };
    });
  }

  async preAddNewKey({
    signer,
    contractAddress,
    pubkey,
    nullifier,
    d,
    groth16Proof,
    granter,
    funds = [],
    fee = 'auto'
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    pubkey: { x: string; y: string };
    nullifier: string;
    d: string[];
    groth16Proof: { a: string; b: string; c: string };
    granter?: string;
    funds?: { denom: string; amount: string }[];
    fee?: StdFee | 'auto' | number;
  }): Promise<{ txHash: string }> {
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const [{ address }] = await signer.getAccounts();

      const msg = {
        pre_add_new_key: {
          d,
          groth16_proof: groth16Proof,
          nullifier,
          pubkey
        }
      };

      const executeMsg: EncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: address,
          contract: contractAddress,
          msg: toUtf8(JSON.stringify(msg)),
          funds
        }
      };

      const stdFee = await resolveFee(signingClient, address, [executeMsg], fee, granter);
      const txHash = await signingClient.signAndBroadcastSync(address, [executeMsg], stdFee);
      return { txHash };
    });
  }

  async addNewKeyViaSaas({
    signer,
    contractAddress,
    pubkey,
    nullifier,
    d,
    groth16Proof,
    granter,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    pubkey: { x: string; y: string };
    nullifier: string;
    d: string[];
    groth16Proof: { a: string; b: string; c: string };
    granter?: string;
    fee?: StdFee | 'auto' | number;
  }): Promise<{ txHash: string }> {
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const [{ address }] = await signer.getAccounts();

      const msg = {
        add_new_key: {
          contract_addr: contractAddress,
          pubkey,
          nullifier,
          d,
          groth16_proof: groth16Proof
        }
      };

      const executeMsg: EncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: address,
          contract: this.apiSaasAddress,
          msg: toUtf8(JSON.stringify(msg)),
          funds: []
        }
      };

      const saasGranter = granter ?? this.apiSaasAddress;
      const stdFee = await resolveFee(signingClient, address, [executeMsg], fee, saasGranter);
      const txHash = await signingClient.signAndBroadcastSync(address, [executeMsg], stdFee);
      return { txHash };
    });
  }

  async publishMessageViaSaas({
    signer,
    contractAddress,
    encPubKeys,
    messages,
    granter,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    encPubKeys: { x: string; y: string }[];
    messages: { data: string[] }[];
    granter?: string;
    fee?: StdFee | 'auto' | number;
  }): Promise<{ txHash: string }> {
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const [{ address }] = await signer.getAccounts();

      const msg = {
        publish_message: {
          contract_addr: contractAddress,
          enc_pub_keys: encPubKeys,
          messages
        }
      };

      const executeMsg: EncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: address,
          contract: this.apiSaasAddress,
          msg: toUtf8(JSON.stringify(msg)),
          funds: []
        }
      };

      const saasGranter = granter ?? this.apiSaasAddress;
      const stdFee = await resolveFee(signingClient, address, [executeMsg], fee, saasGranter);
      const txHash = await signingClient.signAndBroadcastSync(address, [executeMsg], stdFee);
      return { txHash };
    });
  }

  async publishDeactivateMessageViaSaas({
    signer,
    contractAddress,
    encPubKey,
    message,
    granter,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    encPubKey: { x: string; y: string };
    message: { data: string[] };
    granter?: string;
    fee?: StdFee | 'auto' | number;
  }): Promise<{ txHash: string }> {
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const [{ address }] = await signer.getAccounts();

      const msg = {
        publish_deactivate_message: {
          contract_addr: contractAddress,
          enc_pub_key: encPubKey,
          message
        }
      };

      const executeMsg: EncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: address,
          contract: this.apiSaasAddress,
          msg: toUtf8(JSON.stringify(msg)),
          funds: []
        }
      };

      const saasGranter = granter ?? this.apiSaasAddress;
      const stdFee = await resolveFee(signingClient, address, [executeMsg], fee, saasGranter);
      const txHash = await signingClient.signAndBroadcastSync(address, [executeMsg], stdFee);
      return { txHash };
    });
  }

  // ── Direct (non-SAAS) write methods ──────────────────────────────────────

  async signup({
    signer,
    contractAddress,
    pubkey,
    amount = '0',
    certificate = '',
    granter,
    funds = [],
    fee = 'auto'
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    pubkey: { x: string; y: string };
    amount?: string;
    certificate?: string;
    granter?: string;
    funds?: { denom: string; amount: string }[];
    fee?: StdFee | 'auto' | number;
  }): Promise<{ txHash: string }> {
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const [{ address }] = await signer.getAccounts();

      const msg = {
        sign_up: {
          pubkey,
          amount,
          certificate
        }
      };

      const executeMsg: EncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: address,
          contract: contractAddress,
          msg: toUtf8(JSON.stringify(msg)),
          funds
        }
      };

      const stdFee = await resolveFee(signingClient, address, [executeMsg], fee, granter);
      const txHash = await signingClient.signAndBroadcastSync(address, [executeMsg], stdFee);
      return { txHash };
    });
  }

  async addNewKey({
    signer,
    contractAddress,
    pubkey,
    nullifier,
    d,
    groth16Proof,
    granter,
    funds = [],
    fee = 'auto'
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    pubkey: { x: string; y: string };
    nullifier: string;
    d: string[];
    groth16Proof: { a: string; b: string; c: string };
    granter?: string;
    funds?: { denom: string; amount: string }[];
    fee?: StdFee | 'auto' | number;
  }): Promise<{ txHash: string }> {
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const [{ address }] = await signer.getAccounts();

      const msg = {
        add_new_key: {
          d,
          groth16_proof: groth16Proof,
          nullifier,
          pubkey
        }
      };

      const executeMsg: EncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: address,
          contract: contractAddress,
          msg: toUtf8(JSON.stringify(msg)),
          funds
        }
      };

      const stdFee = await resolveFee(signingClient, address, [executeMsg], fee, granter);
      const txHash = await signingClient.signAndBroadcastSync(address, [executeMsg], stdFee);
      return { txHash };
    });
  }

  async publishMessage({
    signer,
    contractAddress,
    encPubKeys,
    messages,
    granter,
    funds = [],
    fee = 'auto'
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    encPubKeys: { x: string; y: string }[];
    messages: { data: string[] }[];
    granter?: string;
    funds?: { denom: string; amount: string }[];
    fee?: StdFee | 'auto' | number;
  }): Promise<{ txHash: string }> {
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const [{ address }] = await signer.getAccounts();

      const msg = {
        publish_message: {
          enc_pub_keys: encPubKeys,
          messages
        }
      };

      const executeMsg: EncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: address,
          contract: contractAddress,
          msg: toUtf8(JSON.stringify(msg)),
          funds
        }
      };

      const stdFee = await resolveFee(signingClient, address, [executeMsg], fee, granter);
      const txHash = await signingClient.signAndBroadcastSync(address, [executeMsg], stdFee);
      return { txHash };
    });
  }

  /**
   * Generic execute with retry – used for the legacy publish_message_batch format
   * where the caller pre-builds the EncodeObject (e.g. with stringizing).
   */
  async executeWithRetry({
    signer,
    address,
    msgs,
    granter,
    fee = 'auto'
  }: {
    signer: OfflineSigner;
    address: string;
    msgs: EncodeObject[];
    granter?: string;
    fee?: StdFee | 'auto' | number;
  }): Promise<{ txHash: string }> {
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const stdFee = await resolveFee(signingClient, address, msgs, fee, granter);
      const txHash = await signingClient.signAndBroadcastSync(address, msgs, stdFee);
      return { txHash };
    });
  }

  async publishDeactivateMessage({
    signer,
    contractAddress,
    encPubKey,
    message,
    granter,
    funds = [],
    fee = 'auto'
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    encPubKey: { x: string; y: string };
    message: { data: string[] };
    granter?: string;
    funds?: { denom: string; amount: string }[];
    fee?: StdFee | 'auto' | number;
  }): Promise<{ txHash: string }> {
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const [{ address }] = await signer.getAccounts();

      const msg = {
        publish_deactivate_message: {
          enc_pub_key: encPubKey,
          message
        }
      };

      const executeMsg: EncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: address,
          contract: contractAddress,
          msg: toUtf8(JSON.stringify(msg)),
          funds
        }
      };

      const stdFee = await resolveFee(signingClient, address, [executeMsg], fee, granter);
      const txHash = await signingClient.signAndBroadcastSync(address, [executeMsg], stdFee);
      return { txHash };
    });
  }

  async claim({
    signer,
    contractAddress,
    funds = [],
    fee = 'auto'
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    funds?: { denom: string; amount: string }[];
    fee?: StdFee | 'auto' | number;
  }): Promise<{ txHash: string }> {
    return this.withRetry(async (rpcEndpoint) => {
      const signingClient = await createContractClientByWallet(rpcEndpoint, signer);
      const [{ address }] = await signer.getAccounts();

      const executeMsg: EncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: address,
          contract: contractAddress,
          msg: toUtf8(JSON.stringify({ claim: {} })),
          funds
        }
      };

      const stdFee = await resolveFee(signingClient, address, [executeMsg], fee, undefined);
      const txHash = await signingClient.signAndBroadcastSync(address, [executeMsg], stdFee);
      return { txHash };
    });
  }
}
