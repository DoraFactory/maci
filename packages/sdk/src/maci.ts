import { ClientParams, CertificateEcosystem } from './types';
import { Http, Indexer, Contract, OracleCertificate, MACI } from './libs';
import { getDefaultParams } from './libs/const';
import {
  CreateAMaciRoundParams,
  CreateMaciRoundParams,
  CreateOracleMaciRoundParams,
} from './libs/contract/types';
import { OfflineSigner } from '@cosmjs/proto-signing';
import {
  genKeypair,
  genKeypairFromSign,
  Keypair,
  packPubKey,
  PubKey,
  unpackPubKey,
} from './libs/crypto';
import { OracleWhitelistConfig } from './libs/contract/ts/OracleMaci.types';
import { SignatureResponse } from './libs/oracle-certificate/types';
import { StdFee } from '@cosmjs/amino';
import { Groth16ProofType } from './libs/contract/ts/Maci.types';
import { isErrorResponse } from './libs/maci/maci';

/**
 * @class MaciClient
 * @description This class is used to interact with Maci Client.
 */
export class MaciClient {
  public network: 'mainnet' | 'testnet';
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
  public oracleCertificate: OracleCertificate;
  public maci: MACI;
  public maciKeypair: Keypair;

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
    registryAddress,
    maciCodeId,
    oracleCodeId,
    customFetch,
    defaultOptions,
    feegrantOperator,
    whitelistBackendPubkey,
    certificateApiEndpoint,
    maciKeypair,
  }: ClientParams) {
    this.signer = signer;
    this.network = network;
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
    this.maciKeypair = maciKeypair ?? genKeypair();

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
    this.oracleCertificate = new OracleCertificate({
      certificateApiEndpoint: this.certificateApiEndpoint,
      http: this.http,
    });
    this.maci = new MACI({
      contract: this.contract,
      indexer: this.indexer,
      oracleCertificate: this.oracleCertificate,
      maciKeypair: this.maciKeypair,
    });
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

  getMaciKeypair() {
    return this.maciKeypair;
  }

  getMaciPubkey() {
    return this.packMaciPubkey(this.maciKeypair.pubKey);
  }

  packMaciPubkey(pubkey?: PubKey) {
    return packPubKey(pubkey || this.maciKeypair.pubKey);
  }

  unpackMaciPubkey(pubkey: bigint | string) {
    return unpackPubKey(BigInt(pubkey));
  }

  async getAddress(signer?: OfflineSigner) {
    const [{ address }] = await this.getSigner(signer).getAccounts();
    return address;
  }

  async oracleMaciClient({
    signer,
    contractAddress,
  }: {
    signer?: OfflineSigner;
    contractAddress: string;
  }) {
    signer = this.getSigner(signer);
    return await this.contract.oracleMaciClient({
      signer,
      contractAddress,
    });
  }

  async registryClient({
    signer,
    contractAddress,
  }: {
    signer?: OfflineSigner;
    contractAddress: string;
  }) {
    signer = this.getSigner(signer);
    return await this.contract.registryClient({ signer, contractAddress });
  }

  async maciClient({
    signer,
    contractAddress,
  }: {
    signer?: OfflineSigner;
    contractAddress: string;
  }) {
    signer = this.getSigner(signer);
    return await this.contract.maciClient({ signer, contractAddress });
  }

  async amaciClient({
    signer,
    contractAddress,
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
      ...params,
    });
  }

  async createMaciRound(params: CreateMaciRoundParams) {
    return await this.contract.createMaciRound({
      signer: this.getSigner(params.signer),
      ...params,
    });
  }

  async createOracleMaciRound(params: CreateOracleMaciRoundParams) {
    return await this.contract.createOracleMaciRound({
      signer: this.getSigner(params.signer),
      ...params,
    });
  }

  async genKeypairFromSign({
    signer,
    address,
  }: {
    signer?: OfflineSigner;
    address?: string;
  } = {}) {
    return await genKeypairFromSign({
      signer: this.getSigner(signer),
      address,
      network: this.network,
    });
  }

  async getStateIdxInc({
    signer,
    address,
    contractAddress,
  }: {
    signer?: OfflineSigner;
    address?: string;
    contractAddress: string;
  }) {
    return await this.maci.getStateIdxInc({
      signer: this.getSigner(signer),
      address,
      contractAddress,
    });
  }

  async getVoiceCreditBalance({
    signer,
    stateIdx,
    contractAddress,
  }: {
    signer?: OfflineSigner;
    stateIdx: number;
    contractAddress: string;
  }) {
    return await this.maci.getVoiceCreditBalance({
      signer: this.getSigner(signer),
      stateIdx,
      contractAddress,
    });
  }

  async getStateIdxByPubKey({
    contractAddress,
    pubKey,
  }: {
    contractAddress: string;
    pubKey?: bigint[];
  }) {
    return await this.maci.getStateIdxByPubKey({
      contractAddress,
      pubKey: pubKey || this.maciKeypair.pubKey,
    });
  }

  async feegrantAllowance({
    signer,
    address,
    contractAddress,
  }: {
    signer?: OfflineSigner;
    address?: string;
    contractAddress: string;
  }) {
    address = await this.getAddress(signer);
    return await this.maci.feegrantAllowance({
      address,
      contractAddress,
    });
  }

  async hasFeegrant({
    signer,
    address,
    contractAddress,
  }: {
    signer?: OfflineSigner;
    address?: string;
    contractAddress: string;
  }): Promise<boolean> {
    address = await this.getAddress(signer);
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
  }: {
    signer?: OfflineSigner;
    address?: string;
    contractAddress: string;
    certificate?: {
      signature: string;
      amount: string;
    };
  }): Promise<string> {
    signer = this.getSigner(signer);
    if (!address) {
      address = await this.getAddress(signer);
    }
    return await this.maci.queryWhitelistBalanceOf({
      signer,
      address,
      contractAddress,
      certificate,
    });
  }

  async isWhitelisted({
    signer,
    address,
    contractAddress,
  }: {
    signer?: OfflineSigner;
    address?: string;
    contractAddress: string;
  }) {
    signer = this.getSigner(signer);
    if (!address) {
      address = await this.getAddress(signer);
    }
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
    signer?: OfflineSigner;
    contractAddress: string;
  }): Promise<OracleWhitelistConfig> {
    return await this.maci.getOracleWhitelistConfig({
      signer: this.getSigner(signer),
      contractAddress,
    });
  }

  async getRounds(after?: string, limit?: number) {
    const rounds = await this.indexer.getRounds(after || '', limit || 10);

    if (isErrorResponse(rounds)) {
      throw new Error(
        `Failed to get rounds: ${rounds.code} ${rounds.error.message}`
      );
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
    signer?: OfflineSigner;
    ecosystem: CertificateEcosystem;
    address?: string;
    contractAddress: string;
  }): Promise<SignatureResponse> {
    return await this.maci.requestOracleCertificate({
      signer: this.getSigner(signer),
      ecosystem,
      address,
      contractAddress,
    });
  }

  async signup({
    signer,
    address,
    contractAddress,
    maciKeypair,
    oracleCertificate,
    gasStation = false,
    fee,
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
      fee,
    });
  }

  async vote({
    signer,
    address,
    stateIdx,
    contractAddress,
    selectedOptions,
    operatorCoordPubKey,
    maciKeypair,
    gasStation = false,
  }: {
    signer?: OfflineSigner;
    address?: string;
    stateIdx: number;
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
      stateIdx,
      contractAddress,
      selectedOptions,
      operatorCoordPubKey,
      maciKeypair,
      gasStation,
    });
  }

  async deactivate({
    signer,
    address,
    contractAddress,
    gasStation = false,
    maciKeypair,
    fee,
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
      fee,
    });
  }

  async genAddKeyInput({
    contractAddress,
    maciKeypair,
  }: {
    contractAddress: string;
    maciKeypair?: Keypair;
  }) {
    return await this.maci.genAddKeyInput({
      maciKeypair: maciKeypair || this.maciKeypair,
      contractAddress,
    });
  }

  async addNewKey({
    signer,
    contractAddress,
    d,
    proof,
    nullifier,
    newMaciKeypair,
    fee = 'auto',
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
      fee,
    });
  }

  async claimAMaciRound({
    signer,
    contractAddress,
    fee = 'auto',
  }: {
    signer?: OfflineSigner;
    contractAddress: string;
    fee?: number | StdFee | 'auto';
  }) {
    return await this.maci.claimAMaciRound({
      signer: this.getSigner(signer),
      contractAddress,
      fee,
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
    fee = 'auto',
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
      fee,
    });
  }

  async batchRevokeWithdraw({
    signer,
    contractAddress,
    address,
    fee = 'auto',
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
      fee,
    });
  }
}
