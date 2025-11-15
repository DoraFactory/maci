import { SimulateCosmWasmClient } from '@oraichain/cw-simulate';

/**
 * Base contract client with common methods
 */
export class BaseContractClient {
  protected client: SimulateCosmWasmClient;
  protected contractAddress: string;
  protected sender: string;

  constructor(client: SimulateCosmWasmClient, contractAddress: string, sender: string) {
    this.client = client;
    this.contractAddress = contractAddress;
    this.sender = sender;
  }

  /**
   * Execute a contract method
   */
  async execute(msg: any, funds: any[] = []): Promise<any> {
    return await this.client.execute(
      this.sender,
      this.contractAddress,
      msg,
      'auto',
      undefined,
      funds
    );
  }

  /**
   * Query a contract
   */
  async query(msg: any): Promise<any> {
    return await this.client.queryContractSmart(this.contractAddress, msg);
  }

  /**
   * Get contract address
   */
  getContractAddress(): string {
    return this.contractAddress;
  }

  /**
   * Update sender address
   */
  setSender(sender: string): void {
    this.sender = sender;
  }
}

/**
 * AMACI contract client
 */
export class AmaciContractClient extends BaseContractClient {
  /**
   * Sign up a user
   */
  async signUp(pubkey: { x: string; y: string }, certificate?: string): Promise<any> {
    return await this.execute({
      sign_up: {
        pubkey,
        certificate
      }
    });
  }

  /**
   * Publish deactivate message
   */
  async publishDeactivateMessage(
    message: string[],
    encPubKey: { x: string; y: string }
  ): Promise<any> {
    return await this.execute({
      publish_deactivate_message: {
        message: { data: message },
        enc_pub_key: encPubKey
      }
    });
  }

  /**
   * Process deactivate message
   */
  async processDeactivateMessage(
    size: string,
    newDeactivateCommitment: string,
    newDeactivateRoot: string,
    proof: { a: string; b: string; c: string }
  ): Promise<any> {
    return await this.execute({
      process_deactivate_message: {
        size,
        new_deactivate_commitment: newDeactivateCommitment,
        new_deactivate_root: newDeactivateRoot,
        groth16_proof: proof
      }
    });
  }

  /**
   * Add new key
   */
  async addNewKey(
    pubkey: { x: string; y: string },
    nullifier: string,
    d: [string, string, string, string],
    proof: { a: string; b: string; c: string }
  ): Promise<any> {
    return await this.execute({
      add_new_key: {
        pubkey,
        nullifier,
        d,
        groth16_proof: proof
      }
    });
  }

  /**
   * Publish message (vote)
   */
  async publishMessage(message: string[], encPubKey: { x: string; y: string }): Promise<any> {
    return await this.execute({
      publish_message: {
        message: { data: message },
        enc_pub_key: encPubKey
      }
    });
  }

  /**
   * Start process period
   */
  async startProcessPeriod(): Promise<any> {
    return await this.execute({
      start_process_period: {}
    });
  }

  /**
   * Process message
   */
  async processMessage(
    newStateCommitment: string,
    proof: { a: string; b: string; c: string }
  ): Promise<any> {
    return await this.execute({
      process_message: {
        new_state_commitment: newStateCommitment,
        groth16_proof: proof
      }
    });
  }

  /**
   * Stop processing period
   */
  async stopProcessingPeriod(): Promise<any> {
    return await this.execute({
      stop_processing_period: {}
    });
  }

  /**
   * Process tally
   */
  async processTally(
    newTallyCommitment: string,
    proof: { a: string; b: string; c: string }
  ): Promise<any> {
    return await this.execute({
      process_tally: {
        new_tally_commitment: newTallyCommitment,
        groth16_proof: proof
      }
    });
  }

  /**
   * Stop tallying period
   */
  async stopTallyingPeriod(results: string[], salt: string): Promise<any> {
    return await this.execute({
      stop_tallying_period: {
        results,
        salt
      }
    });
  }

  /**
   * Query: Get round info
   */
  async getRoundInfo(): Promise<any> {
    return await this.query({ get_round_info: {} });
  }

  /**
   * Query: Get period
   */
  async getPeriod(): Promise<any> {
    return await this.query({ get_period: {} });
  }

  /**
   * Query: Get number of sign ups
   */
  async getNumSignUp(): Promise<any> {
    return await this.query({ get_num_sign_up: {} });
  }

  /**
   * Query: Get message chain length
   */
  async getMsgChainLength(): Promise<any> {
    return await this.query({ get_msg_chain_length: {} });
  }

  /**
   * Query: Get deactivate message chain length
   */
  async getDMsgChainLength(): Promise<any> {
    return await this.query({ get_d_msg_chain_length: {} });
  }

  /**
   * Query: Get result
   */
  async getResult(index: string): Promise<any> {
    return await this.query({ get_result: { index } });
  }

  /**
   * Query: Get all results
   */
  async getAllResult(): Promise<any> {
    return await this.query({ get_all_result: {} });
  }

  /**
   * Query: Get processed message count
   */
  async getProcessedMsgCount(): Promise<any> {
    return await this.query({ get_processed_msg_count: {} });
  }

  /**
   * Query: Get processed deactivate message count
   */
  async getProcessedDMsgCount(): Promise<any> {
    return await this.query({ get_processed_d_msg_count: {} });
  }
}

/**
 * API-MACI contract client
 */
export class ApiMaciContractClient extends BaseContractClient {
  /**
   * Sign up a user
   */
  async signUp(params: {
    amount: string;
    certificate: string;
    pubkey: { x: string; y: string };
  }): Promise<any> {
    return await this.execute({
      sign_up: {
        amount: params.amount,
        certificate: params.certificate,
        pubkey: params.pubkey
      }
    });
  }

  /**
   * Publish message (vote)
   */
  async publishMessage(
    message: string[],
    encPubKey: [string, string] | { x: string; y: string }
  ): Promise<any> {
    const pubkeyObj = Array.isArray(encPubKey) ? { x: encPubKey[0], y: encPubKey[1] } : encPubKey;

    return await this.execute({
      publish_message: {
        message: { data: message },
        enc_pub_key: pubkeyObj
      }
    });
  }

  /**
   * Start process period
   */
  async startProcessPeriod(): Promise<any> {
    return await this.execute({
      start_process_period: {}
    });
  }

  /**
   * Process message
   */
  async processMessage(
    newStateCommitment: string,
    proof: { a: string; b: string; c: string }
  ): Promise<any> {
    return await this.execute({
      process_message: {
        new_state_commitment: newStateCommitment,
        groth16_proof: proof
      }
    });
  }

  /**
   * Stop processing period and transition to tallying
   */
  async stopProcessingPeriod(): Promise<any> {
    return await this.execute({
      stop_processing_period: {}
    });
  }

  /**
   * Process tally
   */
  async processTally(
    newTallyCommitment: string,
    proof: { a: string; b: string; c: string }
  ): Promise<any> {
    return await this.execute({
      process_tally: {
        new_tally_commitment: newTallyCommitment,
        groth16_proof: proof
      }
    });
  }

  /**
   * Stop tallying period and finalize results
   */
  async stopTallyingPeriod(results: string[], salt: string): Promise<any> {
    return await this.execute({
      stop_tallying_period: {
        results,
        salt
      }
    });
  }

  /**
   * Query: Get all results
   */
  async getAllResult(): Promise<any> {
    return await this.query({ get_all_result: {} });
  }

  /**
   * Query: Get period
   */
  async getPeriod(): Promise<any> {
    return await this.query({ get_period: {} });
  }
}

/**
 * Registry contract client
 */
export class RegistryContractClient extends BaseContractClient {
  /**
   * Create a new round
   */
  async createRound(roundId: string, roundInfo: any): Promise<any> {
    return await this.execute({
      create_round: {
        round_id: roundId,
        round_info: roundInfo
      }
    });
  }

  /**
   * Query: Get round
   */
  async getRound(roundId: string): Promise<any> {
    return await this.query({
      get_round: {
        round_id: roundId
      }
    });
  }

  /**
   * Query: List all rounds
   */
  async listRounds(limit?: number, startAfter?: string): Promise<any> {
    return await this.query({
      list_rounds: {
        limit,
        start_after: startAfter
      }
    });
  }
}
