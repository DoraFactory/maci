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
  SelectiveRoundResponse,
  CertificateEcosystem,
  ErrorResponse,
  RoundType,
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
import { Account, PublicKey } from './libs/circom';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { OracleWhitelistConfig } from './libs/contract/ts/OracleMaci.types';
import { SignatureResponse } from './libs/oracle-certificate/types';
import { StdFee } from '@cosmjs/stargate';

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

  async getStateIdxInc({
    signer,
    address,
    contractAddress,
  }: {
    signer: OfflineSigner;
    address?: string;
    contractAddress: string;
  }) {
    return await this.maci.getStateIdxInc({
      signer,
      address,
      contractAddress,
    });
  }

  async getVoiceCreditBalance({
    signer,
    stateIdx,
    contractAddress,
  }: {
    signer: OfflineSigner;
    stateIdx: number;
    contractAddress: string;
  }) {
    return await this.maci.getVoiceCreditBalance({
      signer,
      stateIdx,
      contractAddress,
    });
  }

  async getStateIdxByPubKey({
    contractAddress,
    pubKey,
  }: {
    contractAddress: string;
    pubKey: bigint[];
  }) {
    return await this.maci.getStateIdxByPubKey({
      contractAddress,
      pubKey,
    });
  }

  async feegrantAllowance({
    address,
    contractAddress,
  }: {
    address: string;
    contractAddress: string;
  }) {
    return await this.maci.feegrantAllowance({
      address,
      contractAddress,
    });
  }

  async hasFeegrant({
    address,
    contractAddress,
  }: {
    address: string;
    contractAddress: string;
  }): Promise<boolean> {
    return await this.maci.hasFeegrant({
      address,
      contractAddress,
    });
  }

  async queryWhitelistBalanceOf({
    signer,
    address,
    contractAddress,
    certificate,
    mode = 'maci',
  }: {
    signer: OfflineSigner;
    address?: string;
    contractAddress: string;
    certificate?: string;
    mode?: 'maci' | 'amaci';
  }): Promise<string> {
    return await this.maci.queryWhitelistBalanceOf({
      signer,
      address,
      contractAddress,
      certificate,
      mode,
    });
  }

  async isWhitelisted({
    signer,
    address,
    contractAddress,
  }: {
    signer: OfflineSigner;
    address?: string;
    contractAddress: string;
  }) {
    return await this.maci.isWhitelisted({
      signer,
      address,
      contractAddress,
    });
  }

  async getOracleWhitelistConfig({
    signer,
    contractAddress,
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }): Promise<OracleWhitelistConfig> {
    return await this.maci.getOracleWhitelistConfig({
      signer,
      contractAddress,
    });
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

  async queryRoundClaimable({
    contractAddress,
  }: {
    contractAddress: string;
  }): Promise<{
    claimable: boolean | null;
    balance: string | null;
  }> {
    return await this.maci.queryRoundClaimable({ contractAddress });
  }

  async queryAMaciChargeFee({
    maxVoter,
    maxOption,
  }: {
    maxVoter: number;
    maxOption: number;
  }) {
    return await this.maci.queryAMaciChargeFee({
      maxVoter,
      maxOption,
    });
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
    return this.maci.parseRoundStatus(
      votingStart,
      votingEnd,
      status,
      currentTime
    );
  }

  async queryRoundBalance({ contractAddress }: { contractAddress: string }) {
    return await this.maci.queryRoundBalance({ contractAddress });
  }

  async requestOracleCertificate({
    signer,
    ecosystem,
    address,
    contractAddress,
  }: {
    signer: OfflineSigner;
    ecosystem: CertificateEcosystem;
    address?: string;
    contractAddress: string;
  }): Promise<SignatureResponse> {
    return await this.maci.requestOracleCertificate({
      signer,
      ecosystem,
      address,
      contractAddress,
    });
  }

  async signup({
    signer,
    address,
    contractAddress,
    maciAccount,
    oracleCertificate,
    gasStation = false,
  }: {
    signer: OfflineSigner;
    address?: string;
    contractAddress: string;
    maciAccount?: Account;
    oracleCertificate?: {
      amount: string;
      signature: string;
    };
    gasStation?: boolean;
  }) {
    return await this.maci.signup({
      signer,
      address,
      contractAddress,
      maciAccount,
      oracleCertificate,
      gasStation,
    });
  }

  async vote({
    signer,
    address,
    stateIdx,
    contractAddress,
    selectedOptions,
    operatorCoordPubKey,
    maciAccount,
    gasStation = false,
  }: {
    signer: OfflineSigner;
    address?: string;
    stateIdx: number;
    contractAddress: string;
    selectedOptions: {
      idx: number;
      vc: number;
    }[];
    operatorCoordPubKey: PublicKey;
    maciAccount?: Account;
    gasStation?: boolean;
  }) {
    return await this.maci.vote({
      signer,
      address,
      stateIdx,
      contractAddress,
      selectedOptions,
      operatorCoordPubKey,
      maciAccount,
      gasStation,
    });
  }

  async claimAMaciRound({
    signer,
    contractAddress,
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }) {
    return await this.maci.claimAMaciRound({
      signer,
      contractAddress,
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
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    address?: string;
    amount: string;
  }) {
    return await this.maci.batchGrantWithBond({
      signer,
      contractAddress,
      address,
      amount,
    });
  }

  async batchRevokeWithdraw({
    signer,
    contractAddress,
    address,
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    address?: string;
  }) {
    return await this.maci.batchRevokeWithdraw({
      signer,
      contractAddress,
      address,
    });
  }
}
