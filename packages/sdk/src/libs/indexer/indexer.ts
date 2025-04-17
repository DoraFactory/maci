import {
  BalanceResponse,
  RoundResponse,
  RoundsResponse,
  OperatorResponse,
  OperatorsResponse,
  CircuitResponse,
  TransactionResponse,
  TransactionsResponse,
  CircuitsResponse,
  ProofResponse,
  SignUpEventsResponse,
  OperatorDelayOperationsResponse,
  MissRateResponse,
  SelectiveRoundResponse,
  DeactivateMessage,
} from '../../types';
import { IndexerParams } from './types';
import { Http } from '../http';
import {
  Round,
  UserAccount,
  Circuit,
  Operator,
  Proof,
  Transaction,
  Event,
} from '../query';

/**
 * @class Indexer
 * @description This class is used to interact with Maci Indexer.
 */
export class Indexer {
  public restEndpoint: string;
  public apiEndpoint: string;
  public registryAddress: string;

  public http: Http;
  public round: Round;
  public account: UserAccount;
  public circuit: Circuit;
  public operator: Operator;
  public proof: Proof;
  public transaction: Transaction;
  public event: Event;

  /**
   * @constructor
   * @param {IndexerParams} params - The parameters for the Maci Indexer instance.
   */
  constructor({
    restEndpoint,
    apiEndpoint,
    registryAddress,
    http,
  }: IndexerParams) {
    this.http = http;

    this.restEndpoint = restEndpoint;
    this.apiEndpoint = apiEndpoint;
    this.registryAddress = registryAddress;

    this.round = new Round(this.http);
    this.account = new UserAccount(this.http);
    this.circuit = new Circuit(this.http);
    this.operator = new Operator(this.http, this.registryAddress);
    this.proof = new Proof(this.http);
    this.transaction = new Transaction(this.http);
    this.event = new Event(this.http);
  }

  /**
   * @method balanceOf
   * @description Get the balance of a specific address.
   * @param {string} address - The address to check the balance for.
   * @returns {Promise<BalanceResponse>} The balance response.
   */
  async balanceOf(address: string): Promise<BalanceResponse> {
    return await this.account.balanceOf(address);
  }

  /**
   * @method getRoundById
   * @description Get a round by its ID.
   * @param {string} id - The ID of the round.
   * @returns {Promise<RoundResponse>} The round response.
   */
  async getRoundById(id: string): Promise<RoundResponse> {
    return await this.round.getRoundById(id);
  }

  /**
   * @method getRoundWithFields
   * @description Get a round by its address with selective fields.
   * @param {string} address - The address of the round.
   * @param {string[]} [fields] - The fields to retrieve.
   * @returns {Promise<SelectiveRoundResponse>} The round response.
   */
  async getRoundWithFields(
    address: string,
    fields?: string[]
  ): Promise<SelectiveRoundResponse> {
    return await this.round.getRoundWithFields(address, fields);
  }

  /**
   * @method getRounds
   * @description Get multiple rounds.
   * @param {string} after - The cursor to start after.
   * @param {number} [limit] - The number of rounds to retrieve.
   * @returns {Promise<RoundsResponse>} The rounds response.
   */
  async getRounds(after: string, limit?: number): Promise<RoundsResponse> {
    return await this.round.getRounds(after, limit);
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
    return await this.round.getRoundsByStatus(status, after, limit);
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
    return await this.round.getRoundsByCircuitName(name, after, limit);
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
    return await this.round.getRoundsByOperator(address, after, limit);
  }

  /**
   * @method getOperatorByAddress
   * @description Get an operator by their address.
   * @param {string} address - The address of the operator.
   * @returns {Promise<OperatorResponse>} The operator response.
   */
  async getOperatorByAddress(address: string): Promise<OperatorResponse> {
    return await this.operator.getOperatorByAddress(address);
  }

  async getOperatorDelayOperationsByAddress(
    address: string,
    after: string,
    limit?: number
  ): Promise<OperatorDelayOperationsResponse> {
    return await this.operator.getOperatorDelayOperationsByAddress(
      address,
      after,
      limit
    );
  }

  async queryMissRate(
    address: string,
    durationDay: number
  ): Promise<MissRateResponse> {
    return await this.operator.queryMissRate(address, durationDay);
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
    return await this.operator.getOperators(after, limit);
  }

  /**
   * @method getCircuitByName
   * @description Get a circuit by its name.
   * @param {string} name - The name of the circuit.
   * @returns {Promise<CircuitResponse>} The circuit response.
   */
  async getCircuitByName(name: string): Promise<CircuitResponse> {
    return await this.circuit.getCircuitByName(name);
  }

  /**
   * @method getCircuits
   * @description Get all available circuits.
   * @returns {Promise<CircuitsResponse>} The circuits response.
   */
  async getCircuits(): Promise<CircuitsResponse> {
    return await this.circuit.getCircuits();
  }

  /**
   * @method getTransactionByHash
   * @description Get a transaction by its hash.
   * @param {string} hash - The hash of the transaction.
   * @returns {Promise<TransactionResponse>} The transaction response.
   */
  async getTransactionByHash(hash: string): Promise<TransactionResponse> {
    return await this.transaction.getTransactionByHash(hash);
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
    return await this.transaction.getTransactions(after, limit);
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
    return await this.transaction.getTransactionsByContractAddress(
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
    return await this.proof.getProofByContractAddress(address);
  }

  /**
   * @method getStateIdxByPubKey
   * @description Get the state index of a specific public key.
   * @param {string} contractAddress - The contract address.
   * @param {bigint[]} pubKey - The public key.
   * @returns {Promise<SignUpEventsResponse>} The sign up events response.
   */
  async getSignUpEventByPubKey(
    contractAddress: string,
    pubKey: bigint[]
  ): Promise<SignUpEventsResponse> {
    return await this.event.getSignUpEventByPubKey(contractAddress, pubKey);
  }

  async fetchAllDeactivateLogs(
    contractAddress: string
  ): Promise<DeactivateMessage[]> {
    return await this.event.fetchAllDeactivateLogs(contractAddress);
  }
}
