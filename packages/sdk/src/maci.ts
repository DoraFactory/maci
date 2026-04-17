import { ClientParams, CertificateEcosystem } from './types';
import { Http, Indexer, Contract, OracleCertificate, MACI, MaciApiClient } from './libs';
import type { operations } from './libs/api/types';
import { getDefaultParams } from './libs/const';
import { CreateAMaciRoundParams, CreateApiSaasAmaciRoundParams } from './libs/contract/types';
import { OfflineSigner } from '@cosmjs/proto-signing';
import {
  genKeypair,
  genKeypairFromSign,
  Keypair,
  packPubKey,
  PubKey,
  unpackPubKey
} from './libs/crypto';
import { SignatureResponse } from './libs/oracle-certificate/types';
import { StdFee } from '@cosmjs/amino';
import {
  Groth16ProofType,
  NullableString,
  RegistrationStatus
} from './libs/contract/ts/AMaci.types';
import { isErrorResponse } from './libs/maci/maci';

/**
 * @class MaciClient
 * @description This class is used to interact with Maci Client.
 */
export class MaciClient {
  public network: 'mainnet' | 'testnet';
  public rpcEndpoint: string;
  public restEndpoint: string;
  public apiEndpoint: string; // Indexer GraphQL API endpoint
  public saasApiEndpoint?: string; // MACI SaaS API endpoint
  public certificateApiEndpoint: string;

  public registryAddress: string;
  public saasAddress: string;
  public apiSaasAddress: string;
  public maciCodeId: number;
  public oracleCodeId: number;
  public feegrantOperator: string;
  public whitelistBackendPubkey: string;

  public http: Http;
  public indexer: Indexer;
  public contract: Contract;
  public oracleCertificate: OracleCertificate;
  public maci: MACI;
  public maciKeypair: Keypair;
  public saasApiClient?: MaciApiClient;

  public signer?: OfflineSigner;

  /**
   * @constructor
   * @param {ClientParams} params - The parameters for the Maci Client instance.
   */
  constructor({
    signer,
    network,
    rpcEndpoint,
    restEndpoint,
    apiEndpoint,
    saasApiEndpoint,
    saasApiKey,
    registryAddress,
    saasAddress,
    apiSaasAddress,
    maciCodeId,
    oracleCodeId,
    customFetch,
    defaultOptions,
    feegrantOperator,
    whitelistBackendPubkey,
    certificateApiEndpoint,
    maciKeypair
  }: ClientParams) {
    this.signer = signer;
    this.network = network;
    const defaultParams = getDefaultParams(network);

    this.rpcEndpoint = rpcEndpoint || defaultParams.rpcEndpoint;
    this.restEndpoint = restEndpoint || defaultParams.restEndpoint;
    this.apiEndpoint = apiEndpoint || defaultParams.apiEndpoint; // Indexer GraphQL API
    this.saasApiEndpoint = saasApiEndpoint || defaultParams.saasApiEndpoint; // MACI SaaS API
    this.certificateApiEndpoint = certificateApiEndpoint || defaultParams.certificateApiEndpoint;
    this.registryAddress = registryAddress || defaultParams.registryAddress;
    this.saasAddress = saasAddress || defaultParams.saasAddress;
    this.apiSaasAddress = apiSaasAddress || defaultParams.apiSaasAddress;
    this.maciCodeId = maciCodeId || defaultParams.maciCodeId;
    this.oracleCodeId = oracleCodeId || defaultParams.oracleCodeId;
    this.feegrantOperator = feegrantOperator || defaultParams.oracleFeegrantOperator;
    this.whitelistBackendPubkey =
      whitelistBackendPubkey || defaultParams.oracleWhitelistBackendPubkey;
    this.maciKeypair = maciKeypair ?? genKeypair();

    this.http = new Http(this.apiEndpoint, this.restEndpoint, customFetch, defaultOptions);
    this.indexer = new Indexer({
      restEndpoint: this.restEndpoint,
      apiEndpoint: this.apiEndpoint, // Indexer GraphQL API
      registryAddress: this.registryAddress,
      http: this.http
    });
    this.contract = new Contract({
      network: this.network,
      rpcEndpoint: this.rpcEndpoint,
      registryAddress: this.registryAddress,
      saasAddress: this.saasAddress,
      apiSaasAddress: this.apiSaasAddress,
      maciCodeId: this.maciCodeId,
      oracleCodeId: this.oracleCodeId,
      feegrantOperator: this.feegrantOperator,
      whitelistBackendPubkey: this.whitelistBackendPubkey
    });
    this.oracleCertificate = new OracleCertificate({
      certificateApiEndpoint: this.certificateApiEndpoint,
      http: this.http
    });
    this.maci = new MACI({
      contract: this.contract,
      indexer: this.indexer,
      oracleCertificate: this.oracleCertificate,
      maciKeypair: this.maciKeypair
    });

    // Initialize MACI SaaS API client if saasApiEndpoint exists
    if (this.saasApiEndpoint) {
      this.saasApiClient = new MaciApiClient({
        baseUrl: this.saasApiEndpoint,
        apiKey: saasApiKey,
        customFetch
      });
    }
  }

  getSigner(signer?: OfflineSigner) {
    if (signer) {
      return signer;
    }
    if (this.signer) {
      return this.signer;
    }
    throw new Error('No signer provided, please provide a signer');
  }

  /**
   * Set SaaS API key for MaciApiClient
   */
  setSaasApiKey(apiKey: string) {
    if (!this.saasApiClient) {
      throw new Error(
        'SaaS API client not initialized. Please provide saasApiEndpoint in constructor.'
      );
    }
    this.saasApiClient.setApiKey(apiKey);
  }

  /**
   * Get SaaS API client instance
   */
  getSaasApiClient(): MaciApiClient {
    if (!this.saasApiClient) {
      throw new Error(
        'SaaS API client not initialized. Please provide saasApiEndpoint in constructor.'
      );
    }
    return this.saasApiClient;
  }

  /**
   * Poll the chain REST endpoint until the given transaction is committed on-chain,
   * then return its `tx_response` object with an added `status` field.
   *
   * @param txHash - On-chain transaction hash to wait for.
   * @param options.timeout  - Max wait time in milliseconds (default: 60 000 ms).
   * @param options.interval - Polling interval in milliseconds (default: 2 000 ms).
   * @returns The Cosmos `tx_response` record plus `status`: `'success'` when `code === 0`, `'failed'` otherwise.
   * @throws If the transaction is not found within the timeout period.
   */
  async waitForTransaction(
    txHash: string,
    options: { timeout?: number; interval?: number } = {}
  ) {
    const timeout = options.timeout ?? 60_000;
    const interval = options.interval ?? 2_000;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      try {
        const data = await this.http.fetchRest(`/cosmos/tx/v1beta1/txs/${txHash}`);
        if (data?.tx_response) {
          const txResponse = data.tx_response as {
            height: string;
            txhash: string;
            code: number;
            raw_log: string;
            gas_wanted: string;
            gas_used: string;
            timestamp: string;
            events: { type: string; attributes: { key: string; value: string }[] }[];
          };
          return {
            ...txResponse,
            status: txResponse.code === 0 ? ('success' as const) : ('failed' as const)
          };
        }
      } catch {
        // Transaction not yet on chain (404), keep polling
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error(
      `waitForTransaction: transaction ${txHash} not found on chain within ${timeout}ms`
    );
  }

  getMaciKeypair() {
    return this.maciKeypair;
  }

  getMaciPubkey() {
    return this.packMaciPubkey(this.maciKeypair.pubKey);
  }

  packMaciPubkey(pubkey?: PubKey) {
    return packPubKey(pubkey || this.maciKeypair.pubKey);
  }

  unpackMaciPubkey(pubkey: bigint | string | PubKey): PubKey {
    // If it's already a PubKey (array of two bigints), return it directly
    if (Array.isArray(pubkey) && pubkey.length === 2) {
      return pubkey as PubKey;
    }
    // Otherwise, unpack from bigint or string
    return unpackPubKey(BigInt(pubkey));
  }

  async getAddress(signer?: OfflineSigner) {
    const [{ address }] = await this.getSigner(signer).getAccounts();
    return address;
  }

  async registryClient({
    signer,
    contractAddress
  }: {
    signer?: OfflineSigner;
    contractAddress: string;
  }) {
    signer = this.getSigner(signer);
    return await this.contract.registryClient({ signer, contractAddress });
  }

  async amaciClient({
    signer,
    contractAddress
  }: {
    signer?: OfflineSigner;
    contractAddress: string;
  }) {
    signer = this.getSigner(signer);
    return await this.contract.amaciClient({ signer, contractAddress });
  }

  async createAMaciRound(params: CreateAMaciRoundParams) {
    return await this.contract.createAMaciRound({
      signer: this.getSigner(params.signer),
      ...params
    });
  }

  async createApiSaasAmaciRound(params: CreateApiSaasAmaciRoundParams) {
    return await this.contract.createApiSaasAmaciRound({
      signer: this.getSigner(params.signer),
      ...params
    });
  }

  async genKeypairFromSign({
    signer,
    address
  }: {
    signer?: OfflineSigner;
    address?: string;
  } = {}) {
    return await genKeypairFromSign({
      signer: this.getSigner(signer),
      address,
      network: this.network
    });
  }

  async getStateIdxInc({
    signer,
    address,
    contractAddress
  }: {
    signer?: OfflineSigner;
    address?: string;
    contractAddress: string;
  }) {
    if (!address) {
      address = await this.getAddress(signer);
    }
    return await this.maci.getStateIdxInc({ address, contractAddress });
  }

  async getVoiceCreditBalance({
    signer,
    stateIdx,
    maciKeypair,
    contractAddress
  }: {
    signer?: OfflineSigner;
    stateIdx?: number;
    maciKeypair?: Keypair;
    contractAddress: string;
  }) {
    if (maciKeypair === undefined) {
      maciKeypair = this.maciKeypair;
    }

    if (stateIdx === undefined) {
      stateIdx = await this.getStateIdxByPubKey({
        contractAddress,
        pubKey: maciKeypair.pubKey
      });
    }

    return await this.maci.getVoiceCreditBalance({
      stateIdx,
      contractAddress
    });
  }

  async getStateIdxByPubKey({
    contractAddress,
    pubKey
  }: {
    contractAddress: string;
    pubKey?: bigint[];
  }) {
    return await this.maci.getStateIdxByPubKey({
      contractAddress,
      pubKey: pubKey || this.maciKeypair.pubKey
    });
  }

  async feegrantAllowance({
    signer,
    address,
    contractAddress
  }: {
    signer?: OfflineSigner;
    address?: string;
    contractAddress: string;
  }) {
    address = await this.getAddress(signer);
    return await this.maci.feegrantAllowance({
      address,
      contractAddress
    });
  }

  async hasFeegrant({
    signer,
    address,
    contractAddress
  }: {
    signer?: OfflineSigner;
    address?: string;
    contractAddress: string;
  }): Promise<boolean> {
    if (address === undefined) {
      address = await this.getAddress(signer);
    }
    return await this.maci.hasFeegrant({
      address,
      contractAddress
    });
  }

  async queryRegistrationStatus({
    signer,
    contractAddress,
    address,
    pubkey,
    certificate,
    amount
  }: {
    signer?: OfflineSigner;
    contractAddress: string;
    /** For SignUpWithStaticWhitelist: the user's wallet address */
    address?: string;
    /** For SignUpWithOracle / PrePopulated: the user's MACI pubkey */
    pubkey?: { x: string; y: string };
    /** For SignUpWithOracle: the oracle-issued certificate (base64 signature) */
    certificate?: string;
    /** For SignUpWithOracle + Dynamic VoiceCreditMode: the amount included in the certificate */
    amount?: string;
  }): Promise<RegistrationStatus> {
    signer = this.getSigner(signer);
    if (!address && !pubkey) {
      address = await this.getAddress(signer);
    }
    return await this.maci.queryRegistrationStatus({
      contractAddress,
      address,
      pubkey,
      certificate,
      amount
    });
  }

  async getOracleWhitelistConfig({
    signer,
    contractAddress
  }: {
    signer?: OfflineSigner;
    contractAddress: string;
  }): Promise<NullableString> {
    return await this.maci.getOracleWhitelistConfig({ contractAddress });
  }

  async getRounds(after?: string, limit?: number) {
    const rounds = await this.indexer.getRounds(after || '', limit || 10);

    if (isErrorResponse(rounds)) {
      throw new Error(`Failed to get rounds: ${rounds.code} ${rounds.error.message}`);
    }

    return rounds;
  }

  async getRoundInfo({ contractAddress }: { contractAddress: string }) {
    return await this.maci.getRoundInfo({ contractAddress });
  }

  async getRoundCircuitType({ contractAddress }: { contractAddress: string }) {
    return await this.maci.getRoundCircuitType({ contractAddress });
  }

  async queryRoundIsQv({ contractAddress }: { contractAddress: string }) {
    return await this.maci.queryRoundIsQv({ contractAddress });
  }

  async queryRoundClaimable({ contractAddress }: { contractAddress: string }): Promise<{
    claimable: boolean | null;
    balance: string | null;
  }> {
    return await this.maci.queryRoundClaimable({ contractAddress });
  }

  async queryRoundGasStation({ contractAddress }: { contractAddress: string }) {
    return await this.maci.queryRoundGasStation({ contractAddress });
  }

  parseRoundStatus(
    votingStart: number,
    votingEnd: number,
    status: string,
    currentTime: Date
  ): string {
    return this.maci.parseRoundStatus(votingStart, votingEnd, status, currentTime);
  }

  async queryRoundBalance({ contractAddress }: { contractAddress: string }) {
    return await this.maci.queryRoundBalance({ contractAddress });
  }

  async requestOracleCertificate({
    signer,
    ecosystem,
    address,
    contractAddress
  }: {
    signer?: OfflineSigner;
    ecosystem: CertificateEcosystem;
    address?: string;
    contractAddress: string;
  }): Promise<SignatureResponse> {
    return await this.maci.requestOracleCertificate({
      signer: this.getSigner(signer),
      ecosystem,
      address,
      contractAddress
    });
  }

  async signup({
    signer,
    address,
    contractAddress,
    maciKeypair,
    oracleCertificate,
    gasStation = false,
    fee
  }: {
    signer?: OfflineSigner;
    address?: string;
    contractAddress: string;
    maciKeypair?: Keypair;
    oracleCertificate?: {
      amount: string;
      signature: string;
    };
    gasStation?: boolean;
    fee?: StdFee;
  }) {
    return await this.maci.signup({
      signer: this.getSigner(signer),
      address,
      contractAddress,
      maciKeypair,
      oracleCertificate,
      gasStation,
      fee
    });
  }

  async vote({
    signer,
    address,
    contractAddress,
    selectedOptions,
    operatorCoordPubKey,
    maciKeypair,
    gasStation = false
  }: {
    signer?: OfflineSigner;
    address?: string;
    contractAddress: string;
    selectedOptions: {
      idx: number;
      vc: number;
    }[];
    operatorCoordPubKey: PubKey;
    maciKeypair?: Keypair;
    gasStation?: boolean;
  }) {
    return await this.maci.vote({
      signer: this.getSigner(signer),
      address,
      contractAddress,
      selectedOptions,
      operatorCoordPubKey,
      maciKeypair,
      gasStation
    });
  }

  async deactivate({
    signer,
    address,
    contractAddress,
    gasStation = false,
    maciKeypair,
    fee
  }: {
    signer?: OfflineSigner;
    address?: string;
    contractAddress: string;
    gasStation?: boolean;
    maciKeypair?: Keypair;
    fee?: StdFee;
  }) {
    return await this.maci.deactivate({
      signer: this.getSigner(signer),
      address,
      maciKeypair,
      contractAddress,
      gasStation,
      fee
    });
  }

  async genAddKeyInput({
    contractAddress,
    maciKeypair,
    newMaciKeypair
  }: {
    contractAddress: string;
    maciKeypair?: Keypair;
    newMaciKeypair: Keypair;
  }) {
    return await this.maci.genAddKeyInput({
      maciKeypair: maciKeypair || this.maciKeypair,
      newMaciKeypair,
      contractAddress
    });
  }

  async addNewKey({
    signer,
    contractAddress,
    d,
    proof,
    nullifier,
    newMaciKeypair,
    fee = 'auto'
  }: {
    signer?: OfflineSigner;
    contractAddress: string;
    d: string[];
    proof: Groth16ProofType;
    nullifier: bigint;
    newMaciKeypair: Keypair;
    fee?: number | StdFee | 'auto';
  }) {
    return await this.maci.addNewKey({
      signer: this.getSigner(signer),
      contractAddress,
      d,
      proof,
      nullifier,
      newMaciKeypair,
      fee
    });
  }

  async claimAMaciRound({
    signer,
    contractAddress,
    fee = 'auto'
  }: {
    signer?: OfflineSigner;
    contractAddress: string;
    fee?: number | StdFee | 'auto';
  }) {
    return await this.maci.claimAMaciRound({
      signer: this.getSigner(signer),
      contractAddress,
      fee
    });
  }

  async getOracleCertificateConfig() {
    return await this.maci.getOracleCertificateConfig();
  }

  async batchGrantWithBond({
    signer,
    contractAddress,
    address,
    amount,
    fee = 'auto'
  }: {
    signer?: OfflineSigner;
    contractAddress: string;
    address?: string;
    amount: string;
    fee?: number | StdFee | 'auto';
  }) {
    if (!address) {
      address = await this.getAddress(signer);
    }
    return await this.maci.batchGrantWithBond({
      signer: this.getSigner(signer),
      contractAddress,
      address,
      amount,
      fee
    });
  }

  async batchRevokeWithdraw({
    signer,
    contractAddress,
    address,
    fee = 'auto'
  }: {
    signer?: OfflineSigner;
    contractAddress: string;
    address?: string;
    fee?: number | StdFee | 'auto';
  }) {
    if (!address) {
      address = await this.getAddress(signer);
    }
    return await this.maci.batchRevokeWithdraw({
      signer: this.getSigner(signer),
      contractAddress,
      address,
      fee
    });
  }

  async rawSignup({
    signer,
    address,
    contractAddress,
    pubKey,
    oracleCertificate,
    gasStation = false,
    granter,
    fee
  }: {
    signer?: OfflineSigner;
    address?: string;
    contractAddress: string;
    pubKey: PubKey;
    oracleCertificate?: {
      amount: string;
      signature: string;
    };
    gasStation?: boolean;
    granter?: string;
    fee?: StdFee;
  }) {
    return await this.maci.rawSignup({
      signer: this.getSigner(signer),
      address,
      contractAddress,
      pubKey,
      oracleCertificate,
      gasStation,
      granter,
      fee
    });
  }

  async rawVote({
    signer,
    address,
    contractAddress,
    payload,
    gasStation = false,
    granter,
    fee
  }: {
    signer?: OfflineSigner;
    address?: string;
    contractAddress: string;
    payload: {
      msg: bigint[];
      encPubkeys: PubKey;
    }[];
    gasStation?: boolean;
    granter?: string;
    fee?: StdFee | 'auto' | number;
  }) {
    return await this.maci.rawVote({
      signer: this.getSigner(signer),
      address,
      contractAddress,
      payload,
      gasStation,
      granter,
      fee
    });
  }

  async getSignUpEventByPubKey(contractAddress: string, pubKey: bigint[]) {
    return await this.indexer.getSignUpEventByPubKey(contractAddress, pubKey);
  }

  async fetchAllDeactivateLogs(contractAddress: string) {
    return await this.indexer.fetchAllDeactivateLogs(contractAddress);
  }

  async rawDeactivate({
    signer,
    address,
    contractAddress,
    payload,
    gasStation = false,
    granter,
    fee
  }: {
    signer?: OfflineSigner;
    address?: string;
    contractAddress: string;
    payload: {
      msg: bigint[];
      encPubkeys: PubKey;
    };
    gasStation?: boolean;
    granter?: string;
    fee?: StdFee | 'auto' | number;
  }) {
    return await this.maci.rawDeactivate({
      signer: this.getSigner(signer),
      address,
      contractAddress,
      payload,
      gasStation,
      granter,
      fee
    });
  }

  async rawAddNewKey({
    signer,
    contractAddress,
    d,
    proof,
    nullifier,
    newPubkey,
    gasStation = false,
    granter,
    fee
  }: {
    signer?: OfflineSigner;
    contractAddress: string;
    d: string[];
    proof: Groth16ProofType;
    nullifier: bigint;
    newPubkey: PubKey;
    gasStation?: boolean;
    granter?: string;
    fee?: StdFee | 'auto' | number;
  }) {
    return await this.maci.rawAddNewKey({
      signer: this.getSigner(signer),
      contractAddress,
      d,
      proof,
      nullifier,
      newPubkey,
      gasStation,
      granter,
      fee
    });
  }

  async rawPreAddNewKey({
    signer,
    contractAddress,
    d,
    proof,
    nullifier,
    newPubkey,
    gasStation = false,
    granter,
    fee
  }: {
    signer?: OfflineSigner;
    contractAddress: string;
    d: string[];
    proof: Groth16ProofType;
    nullifier: bigint;
    newPubkey: PubKey;
    gasStation?: boolean;
    granter?: string;
    fee?: StdFee | 'auto' | number;
  }) {
    return await this.maci.rawPreAddNewKey({
      signer: this.getSigner(signer),
      contractAddress,
      d,
      proof,
      nullifier,
      newPubkey,
      gasStation,
      granter,
      fee
    });
  }

  // ==================== SaaS API Client Methods ====================

  /**
   * Create AMaci round via SaaS API
   * @param params - Round creation parameters
   */
  async saasCreateAmaciRound(
    params: operations['createAmaciRound']['requestBody']['content']['application/json']
  ) {
    if (!this.saasApiClient) {
      throw new Error('SaaS API client not initialized');
    }
    return await this.saasApiClient.createAmaciRound(params);
  }

  /**
   * Set round info via SaaS API
   * @param params - Round info parameters
   */
  async saasSetRoundInfo(
    params: operations['setRoundInfo']['requestBody']['content']['application/json']
  ) {
    if (!this.saasApiClient) {
      throw new Error('SaaS API client not initialized');
    }
    return await this.saasApiClient.setRoundInfo(params);
  }

  /**
   * Set vote options via SaaS API
   * @param params - Vote options parameters
   */
  async saasSetVoteOptions(
    params: operations['setVoteOptions']['requestBody']['content']['application/json']
  ) {
    if (!this.saasApiClient) {
      throw new Error('SaaS API client not initialized');
    }
    return await this.saasApiClient.setVoteOptions(params);
  }

}
