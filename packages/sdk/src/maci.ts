import {
  BalanceResponse,
  ClientParams,
  RoundResponse,
  RoundsResponse,
  OperatorResponse,
  OperatorsResponse,
  CircuitResponse,
  TransactionResponse,
  TransactionsResponse,
  CircuitsResponse,
  ProofResponse,
} from './types';
import {
  Http,
  Indexer,
  Contract,
  OracleCertificate,
  Circom,
  MACI,
} from './libs';
import { getDefaultParams } from './libs/const';
import {
  CreateAMaciRoundParams,
  CreateMaciRoundParams,
  CreateOracleMaciRoundParams,
} from './libs/contract/types';
import { OfflineSigner } from '@cosmjs/proto-signing';

/**
 * @class MaciClient
 * @description This class is used to interact with Maci Client.
 */
export class MaciClient {
  public rpcEndpoint: string;
  public restEndpoint: string;
  public apiEndpoint: string;
  public certificateApiEndpoint: string;

  public registryAddress: string;
  public maciCodeId: number;
  public oracleCodeId: number;
  public feegrantOperator: string;
  public whitelistBackendPubkey: string;

  public http: Http;
  public indexer: Indexer;
  public contract: Contract;
  public circom: Circom;
  public oracleCertificate: OracleCertificate;
  public maci: MACI;

  /**
   * @constructor
   * @param {ClientParams} params - The parameters for the Maci Client instance.
   */
  constructor({
    network,
    rpcEndpoint,
    restEndpoint,
    apiEndpoint,
    registryAddress,
    maciCodeId,
    oracleCodeId,
    customFetch,
    defaultOptions,
    feegrantOperator,
    whitelistBackendPubkey,
    certificateApiEndpoint,
  }: ClientParams) {
    const defaultParams = getDefaultParams(network);

    this.rpcEndpoint = rpcEndpoint || defaultParams.rpcEndpoint;
    this.restEndpoint = restEndpoint || defaultParams.restEndpoint;
    this.apiEndpoint = apiEndpoint || defaultParams.apiEndpoint;
    this.certificateApiEndpoint =
      certificateApiEndpoint || defaultParams.certificateApiEndpoint;
    this.registryAddress = registryAddress || defaultParams.registryAddress;
    this.maciCodeId = maciCodeId || defaultParams.maciCodeId;
    this.oracleCodeId = oracleCodeId || defaultParams.oracleCodeId;
    this.feegrantOperator =
      feegrantOperator || defaultParams.oracleFeegrantOperator;
    this.whitelistBackendPubkey =
      whitelistBackendPubkey || defaultParams.oracleWhitelistBackendPubkey;

    this.http = new Http(
      this.apiEndpoint,
      this.restEndpoint,
      customFetch,
      defaultOptions
    );
    this.indexer = new Indexer({
      restEndpoint: this.restEndpoint,
      apiEndpoint: this.apiEndpoint,
      registryAddress: this.registryAddress,
      http: this.http,
    });
    this.contract = new Contract({
      rpcEndpoint: this.rpcEndpoint,
      registryAddress: this.registryAddress,
      maciCodeId: this.maciCodeId,
      oracleCodeId: this.oracleCodeId,
      feegrantOperator: this.feegrantOperator,
      whitelistBackendPubkey: this.whitelistBackendPubkey,
    });
    this.circom = new Circom({ network });
    this.oracleCertificate = new OracleCertificate({
      certificateApiEndpoint: this.certificateApiEndpoint,
      http: this.http,
    });
    this.maci = new MACI({
      circom: this.circom,
      contract: this.contract,
      indexer: this.indexer,
      oracleCertificate: this.oracleCertificate,
    });
  }

  async oracleMaciClient({
    signer,
    contractAddress,
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }) {
    return await this.contract.oracleMaciClient({
      signer,
      contractAddress,
    });
  }

  async registryClient({
    signer,
    contractAddress,
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }) {
    return await this.contract.registryClient({ signer, contractAddress });
  }

  async maciClient({
    signer,
    contractAddress,
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }) {
    return await this.contract.maciClient({ signer, contractAddress });
  }

  async amaciClient({
    signer,
    contractAddress,
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }) {
    return await this.contract.amaciClient({ signer, contractAddress });
  }

  async createAMaciRound(params: CreateAMaciRoundParams) {
    return await this.contract.createAMaciRound(params);
  }

  async createMaciRound(params: CreateMaciRoundParams) {
    return await this.contract.createMaciRound(params);
  }

  async createOracleMaciRound(params: CreateOracleMaciRoundParams) {
    return await this.contract.createOracleMaciRound(params);
  }

  /**
   * @method balanceOf
   * @description Get the balance of a specific address.
   * @param {string} address - The address to check the balance for.
   * @returns {Promise<BalanceResponse>} The balance response.
   */
  async balanceOf(address: string): Promise<BalanceResponse> {
    return await this.indexer.account.balanceOf(address);
  }

  /**
   * @method getRoundById
   * @description Get a round by its ID.
   * @param {string} id - The ID of the round.
   * @returns {Promise<RoundResponse>} The round response.
   */
  async getRoundById(id: string): Promise<RoundResponse> {
    return await this.indexer.round.getRoundById(id);
  }

  /**
   * @method getRounds
   * @description Get multiple rounds.
   * @param {string} after - The cursor to start after.
   * @param {number} [limit] - The number of rounds to retrieve.
   * @returns {Promise<RoundsResponse>} The rounds response.
   */
  async getRounds(after: string, limit?: number): Promise<RoundsResponse> {
    return await this.indexer.round.getRounds(after, limit);
  }

  /**
   * @method getRoundsByStatus
   * @description Get rounds by their status.
   * @param {string} status - The status of the rounds to retrieve.
   * @param {string} after - The cursor to start after.
   * @param {number} [limit] - The number of rounds to retrieve.
   * @returns {Promise<RoundsResponse>} The rounds response.
   */
  async getRoundsByStatus(
    status: string,
    after: string,
    limit?: number
  ): Promise<RoundsResponse> {
    return await this.indexer.round.getRoundsByStatus(status, after, limit);
  }

  /**
   * @method getRoundsByCircuitName
   * @description Get rounds by their circuit name.
   * @param {string} name - The name of the circuit.
   * @param {string} after - The cursor to start after.
   * @param {number} [limit] - The number of rounds to retrieve.
   * @returns {Promise<RoundsResponse>} The rounds response.
   */
  async getRoundsByCircuitName(
    name: string,
    after: string,
    limit?: number
  ): Promise<RoundsResponse> {
    return await this.indexer.round.getRoundsByCircuitName(name, after, limit);
  }

  /**
   * @method getRoundsByOperator
   * @description Get rounds by their operator address.
   * @param {string} address - The address of the operator.
   * @param {string} after - The cursor to start after.
   * @param {number} [limit] - The number of rounds to retrieve.
   * @returns {Promise<RoundsResponse>} The rounds response.
   */
  async getRoundsByOperator(
    address: string,
    after: string,
    limit?: number
  ): Promise<RoundsResponse> {
    return await this.indexer.round.getRoundsByOperator(address, after, limit);
  }

  /**
   * @method getOperatorByAddress
   * @description Get an operator by their address.
   * @param {string} address - The address of the operator.
   * @returns {Promise<OperatorResponse>} The operator response.
   */
  async getOperatorByAddress(address: string): Promise<OperatorResponse> {
    return await this.indexer.operator.getOperatorByAddress(address);
  }

  /**
   * @method getOperators
   * @description Get multiple operators.
   * @param {string} after - The cursor to start after.
   * @param {number} [limit] - The number of operators to retrieve.
   * @returns {Promise<OperatorsResponse>} The operators response.
   */
  async getOperators(
    after: string,
    limit?: number
  ): Promise<OperatorsResponse> {
    return await this.indexer.operator.getOperators(after, limit);
  }

  /**
   * @method getCircuitByName
   * @description Get a circuit by its name.
   * @param {string} name - The name of the circuit.
   * @returns {Promise<CircuitResponse>} The circuit response.
   */
  async getCircuitByName(name: string): Promise<CircuitResponse> {
    return await this.indexer.circuit.getCircuitByName(name);
  }

  /**
   * @method getCircuits
   * @description Get all available circuits.
   * @returns {Promise<CircuitsResponse>} The circuits response.
   */
  async getCircuits(): Promise<CircuitsResponse> {
    return await this.indexer.circuit.getCircuits();
  }

  /**
   * @method getTransactionByHash
   * @description Get a transaction by its hash.
   * @param {string} hash - The hash of the transaction.
   * @returns {Promise<TransactionResponse>} The transaction response.
   */
  async getTransactionByHash(hash: string): Promise<TransactionResponse> {
    return await this.indexer.transaction.getTransactionByHash(hash);
  }

  /**
   * @method getTransactions
   * @description Get multiple transactions.
   * @param {string} after - The cursor to start after.
   * @param {number} [limit] - The number of transactions to retrieve.
   * @returns {Promise<TransactionsResponse>} The transactions response.
   */
  async getTransactions(
    after: string,
    limit?: number
  ): Promise<TransactionsResponse> {
    return await this.indexer.transaction.getTransactions(after, limit);
  }

  /**
   * @method getTransactionsByContractAddress
   * @description Get transactions by contract address.
   * @param {string} address - The contract address.
   * @param {string} after - The cursor to start after.
   * @param {number} [limit] - The number of transactions to retrieve.
   * @returns {Promise<TransactionsResponse>} The transactions response.
   */
  async getTransactionsByContractAddress(
    address: string,
    after: string,
    limit?: number
  ): Promise<TransactionsResponse> {
    return await this.indexer.transaction.getTransactionsByContractAddress(
      address,
      after,
      limit
    );
  }

  /**
   * @method getProofByContractAddress
   * @description Get proof data by contract address.
   * @param {string} address - The contract address.
   * @returns {Promise<ProofResponse>} The proof response.
   */
  async getProofByContractAddress(address: string): Promise<ProofResponse> {
    return await this.indexer.proof.getProofByContractAddress(address);
  }
}
