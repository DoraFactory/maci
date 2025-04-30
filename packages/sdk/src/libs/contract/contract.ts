import { OfflineSigner } from '@cosmjs/proto-signing';
import { ContractParams } from '../../types';
import {
  createAMaciClientBy,
  createContractClientByWallet,
  createMaciClientBy,
  createOracleMaciClientBy,
  createRegistryClientBy,
} from './config';
import {
  CreateAMaciRoundParams,
  CreateMaciRoundParams,
  CreateOracleMaciRoundParams,
} from './types';
import { getAMaciRoundCircuitFee, getContractParams } from './utils';
import { QTR_LIB } from './vars';
import { MaciRoundType, MaciCertSystemType } from '../../types';
import { unpackPubKey } from '../crypto';

export const prefix = 'dora';

export class Contract {
  public network: 'mainnet' | 'testnet';
  public rpcEndpoint: string;
  public registryAddress: string;
  public maciCodeId: number;
  public oracleCodeId: number;
  public feegrantOperator: string;
  public whitelistBackendPubkey: string;

  constructor({
    network,
    rpcEndpoint,
    registryAddress,
    maciCodeId,
    oracleCodeId,
    feegrantOperator,
    whitelistBackendPubkey,
  }: ContractParams) {
    this.network = network;
    this.rpcEndpoint = rpcEndpoint;
    this.registryAddress = registryAddress;
    this.maciCodeId = maciCodeId;
    this.oracleCodeId = oracleCodeId;
    this.feegrantOperator = feegrantOperator;
    this.whitelistBackendPubkey = whitelistBackendPubkey;
  }

  async createAMaciRound({
    signer,
    startVoting,
    endVoting,
    operator,
    whitelist,
    title,
    description,
    link,
    maxVoter,
    maxOption,
    voiceCreditAmount,
    circuitType,
    preDeactivateRoot,
    fee = 'auto',
  }: CreateAMaciRoundParams & { signer: OfflineSigner }) {
    const start_time = (startVoting.getTime() * 10 ** 6).toString();
    const end_time = (endVoting.getTime() * 10 ** 6).toString();
    const client = await createRegistryClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.registryAddress,
    });

    const requiredFee = getAMaciRoundCircuitFee(
      this.network,
      maxVoter,
      maxOption
    );

    preDeactivateRoot = preDeactivateRoot || '0';
    const res = await client.createRound(
      {
        operator,
        preDeactivateRoot,
        voiceCreditAmount,
        whitelist,
        roundInfo: {
          title,
          description: description || '',
          link: link || '',
        },
        votingTime: {
          start_time,
          end_time,
        },
        maxVoter: maxVoter.toString(),
        maxOption: maxOption.toString(),
        certificationSystem: '0',
        circuitType,
      },
      fee,
      undefined,
      [requiredFee]
    );
    let contractAddress = '';
    res.events.map((event) => {
      if (event.type === 'wasm') {
        let actionEvent = event.attributes.find(
          (attr) => attr.key === 'action'
        )!;
        if (actionEvent.value === 'created_round') {
          contractAddress = event.attributes
            .find((attr) => attr.key === 'round_addr')!
            .value.toString();
        }
      }
    });
    return {
      ...res,
      contractAddress,
    };
  }

  async createMaciRound({
    signer,
    operatorPubkey,
    startVoting,
    endVoting,
    whitelist,
    title,
    description,
    link,
    maxVoter,
    maxOption,
    circuitType,
    certSystemType,
    fee = 'auto',
  }: CreateMaciRoundParams & { signer: OfflineSigner }) {
    const start_time = (startVoting.getTime() * 10 ** 6).toString();
    const end_time = (endVoting.getTime() * 10 ** 6).toString();
    const [{ address }] = await signer.getAccounts();
    const client = await createContractClientByWallet(this.rpcEndpoint, signer);
    const [operatorPubkeyX, operatorPubkeyY] = unpackPubKey(
      BigInt(operatorPubkey)
    );
    const {
      parameters,
      groth16ProcessVkey,
      groth16TallyVkey,
      plonkProcessVkey,
      plonkTallyVkey,
      maciVoteType,
      maciCertSystem,
    } = getContractParams(
      MaciRoundType.MACI,
      circuitType,
      certSystemType,
      maxVoter,
      maxOption
    );

    const instantiateResponse = await client.instantiate(
      address,
      this.maciCodeId,
      {
        round_info: { title, description: description || '', link: link || '' },
        voting_time: {
          start_time,
          end_time,
        },
        parameters,
        coordinator: {
          x: operatorPubkeyX.toString(),
          y: operatorPubkeyY.toString(),
        },
        groth16_process_vkey: groth16ProcessVkey,
        groth16_tally_vkey: groth16TallyVkey,
        plonk_process_vkey: plonkProcessVkey,
        plonk_tally_vkey: plonkTallyVkey,
        max_vote_options: maxOption.toString(),
        whitelist,
        circuit_type: maciVoteType,
        certification_system: maciCertSystem,
        qtr_lib: QTR_LIB,
      },
      `[MACI] ${title}`,
      fee
    );

    return instantiateResponse;
  }

  async createOracleMaciRound({
    signer,
    operatorPubkey,
    startVoting,
    endVoting,
    title,
    description,
    link,
    voteOptionMap,
    circuitType,
    whitelistEcosystem,
    whitelistSnapshotHeight,
    whitelistVotingPowerArgs,
    fee = 'auto',
  }: CreateOracleMaciRoundParams & { signer: OfflineSigner }) {
    const start_time = (startVoting.getTime() * 1_000_000).toString();
    const end_time = (endVoting.getTime() * 1_000_000).toString();
    const [{ address }] = await signer.getAccounts();
    const client = await createContractClientByWallet(this.rpcEndpoint, signer);
    const [operatorPubkeyX, operatorPubkeyY] = unpackPubKey(
      BigInt(operatorPubkey)
    );
    const { maciVoteType, maciCertSystem } = getContractParams(
      MaciRoundType.ORACLE_MACI,
      circuitType,
      MaciCertSystemType.GROTH16,
      0,
      0
    );

    const instantiateResponse = await client.instantiate(
      address,
      this.oracleCodeId,
      {
        round_info: { title, description: description || '', link: link || '' },
        voting_time: {
          start_time,
          end_time,
        },
        coordinator: {
          x: operatorPubkeyX.toString(),
          y: operatorPubkeyY.toString(),
        },
        vote_option_map: voteOptionMap,
        whitelist_backend_pubkey: this.whitelistBackendPubkey,
        whitelist_ecosystem: whitelistEcosystem,
        whitelist_snapshot_height: whitelistSnapshotHeight,
        whitelist_voting_power_args: whitelistVotingPowerArgs,
        circuit_type: maciVoteType,
        certification_system: maciCertSystem,
        feegrant_operator: this.feegrantOperator,
      },
      `[Oracle MACI] ${title}`,
      fee
    );

    return instantiateResponse;
  }

  async queryRoundInfo({
    signer,
    roundAddress,
  }: {
    signer: OfflineSigner;
    roundAddress: string;
  }) {
    const client = await createMaciClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: roundAddress,
    });
    const roundInfo = await client.getRoundInfo();
    return roundInfo;
  }

  async oracleMaciClient({
    signer,
    contractAddress,
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }) {
    const client = await createOracleMaciClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress,
    });
    return client;
  }

  async registryClient({
    signer,
    contractAddress,
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }) {
    return createRegistryClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress,
    });
  }

  async maciClient({
    signer,
    contractAddress,
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }) {
    return createMaciClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress,
    });
  }

  async amaciClient({
    signer,
    contractAddress,
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }) {
    return createAMaciClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress,
    });
  }

  async contractClient({ signer }: { signer: OfflineSigner }) {
    return createContractClientByWallet(this.rpcEndpoint, signer);
  }
}
