import { OfflineSigner } from '@cosmjs/proto-signing';
import { ContractParams } from '../../types';
import {
  createAMaciClientBy,
  createContractClientByWallet,
  createMaciClientBy,
  createOracleMaciClientBy,
  createRegistryClientBy,
  createSaasClientBy,
} from './config';
import {
  CreateAMaciRoundParams,
  CreateMaciRoundParams,
  CreateOracleMaciRoundParams,
  CreateSaasOracleMaciRoundParams,
} from './types';
import { getAMaciRoundCircuitFee, getContractParams } from './utils';
import { QTR_LIB } from './vars';
import { MaciRoundType, MaciCertSystemType } from '../../types';
import { unpackPubKey } from '../crypto';
import { StdFee, GasPrice, calculateFee } from '@cosmjs/stargate';

export const prefix = 'dora';

export class Contract {
  public network: 'mainnet' | 'testnet';
  public rpcEndpoint: string;
  public registryAddress: string;
  public saasAddress: string;
  public maciCodeId: number;
  public oracleCodeId: number;
  public saasOracleCodeId: number;
  public feegrantOperator: string;
  public whitelistBackendPubkey: string;

  constructor({
    network,
    rpcEndpoint,
    registryAddress,
    saasAddress,
    maciCodeId,
    oracleCodeId,
    saasOracleCodeId,
    feegrantOperator,
    whitelistBackendPubkey,
  }: ContractParams) {
    this.network = network;
    this.rpcEndpoint = rpcEndpoint;
    this.registryAddress = registryAddress;
    this.saasAddress = saasAddress;
    this.maciCodeId = maciCodeId;
    this.oracleCodeId = oracleCodeId;
    this.saasOracleCodeId = saasOracleCodeId;
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
    maxVoter,
    voteOptionMap,
    circuitType,
    whitelistEcosystem,
    whitelistSnapshotHeight,
    whitelistVotingPowerArgs,
    whitelistBackendPubkey,
    feegrantOperator,
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
        max_voters: maxVoter.toString(),
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
        whitelist_backend_pubkey: whitelistBackendPubkey
          ? whitelistBackendPubkey
          : this.whitelistBackendPubkey,
        whitelist_ecosystem: whitelistEcosystem,
        whitelist_snapshot_height: whitelistSnapshotHeight,
        whitelist_voting_power_args: whitelistVotingPowerArgs,
        circuit_type: maciVoteType,
        certification_system: maciCertSystem,
        feegrant_operator: feegrantOperator
          ? feegrantOperator
          : this.feegrantOperator,
      },
      `[Oracle MACI] ${title}`,
      fee
    );

    return instantiateResponse;
  }

  async createSaasOracleMaciRound({
    signer,
    operatorPubkey,
    startVoting,
    endVoting,
    title,
    description,
    link,
    maxVoter,
    voteOptionMap,
    whitelistBackendPubkey,
  }: CreateSaasOracleMaciRoundParams & { signer: OfflineSigner }) {
    const startTime = (startVoting.getTime() * 1_000_000).toString();
    const endTime = (endVoting.getTime() * 1_000_000).toString();

    const client = await createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.saasAddress,
    });
    const [operatorPubkeyX, operatorPubkeyY] = unpackPubKey(
      BigInt(operatorPubkey)
    );

    const createResponse = await client.createOracleMaciRound({
      certificationSystem: '0',
      circuitType: '0',
      coordinator: {
        x: operatorPubkeyX.toString(),
        y: operatorPubkeyY.toString(),
      },
      maxVoters: maxVoter,
      roundInfo: {
        title,
        description: description || '',
        link: link || '',
      },
      startTime,
      endTime,
      voteOptionMap,
      whitelistBackendPubkey:
        whitelistBackendPubkey || this.whitelistBackendPubkey,
    });

    let contractAddress = '';
    createResponse.events.map((event) => {
      if (event.type === 'wasm') {
        let actionEvent = event.attributes.find(
          (attr) => attr.key === 'action'
        )!;
        if (actionEvent.value === 'created_oracle_maci_round') {
          contractAddress = event.attributes
            .find((attr) => attr.key === 'round_addr')!
            .value.toString();
        }
      }
    });
    return {
      ...createResponse,
      contractAddress,
    };
  }

  async setSaasOracleMaciRoundInfo({
    signer,
    contractAddress,
    title,
    description,
    link,
    gasStation = false,
    fee = 1.8,
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    title: string;
    description: string;
    link: string;
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }) {
    const client = await createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.saasAddress,
    });

    const roundInfo = {
      title,
      description,
      link,
    };

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        set_round_info: {
          contract_addr: contractAddress,
          round_info: roundInfo,
        },
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.saasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg)),
            },
          },
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(
        Math.round(gasEstimation * multiplier),
        gasPrice
      );
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.saasAddress,
      };
      return client.setRoundInfo(
        {
          contractAddr: contractAddress,
          roundInfo,
        },
        grantFee
      );
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.saasAddress,
      };
      return client.setRoundInfo(
        {
          contractAddr: contractAddress,
          roundInfo,
        },
        grantFee
      );
    }

    return client.setRoundInfo(
      {
        contractAddr: contractAddress,
        roundInfo,
      },
      fee
    );
  }

  async setSaasOracleMaciRoundVoteOptions({
    signer,
    contractAddress,
    voteOptionMap,
    gasStation = false,
    fee = 1.8,
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    voteOptionMap: string[];
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }) {
    const client = await createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.saasAddress,
    });

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        set_vote_options_map: {
          contract_addr: contractAddress,
          vote_option_map: voteOptionMap,
        },
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.saasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg)),
            },
          },
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(
        Math.round(gasEstimation * multiplier),
        gasPrice
      );
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.saasAddress,
      };
      return client.setVoteOptionsMap(
        {
          contractAddr: contractAddress,
          voteOptionMap,
        },
        grantFee
      );
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.saasAddress,
      };
      return client.setVoteOptionsMap(
        {
          contractAddr: contractAddress,
          voteOptionMap,
        },
        grantFee
      );
    }

    return client.setVoteOptionsMap(
      {
        contractAddr: contractAddress,
        voteOptionMap,
      },
      fee
    );
  }

  async addSaasOperator({
    signer,
    operator,
    gasStation = false,
    fee = 1.8,
  }: {
    signer: OfflineSigner;
    operator: string;
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }) {
    const client = await createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.saasAddress,
    });

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        add_operator: {
          operator,
        },
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.saasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg)),
            },
          },
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(
        Math.round(gasEstimation * multiplier),
        gasPrice
      );
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.saasAddress,
      };
      return client.addOperator({ operator }, grantFee);
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.saasAddress,
      };
      return client.addOperator({ operator }, grantFee);
    }

    return client.addOperator({ operator }, fee);
  }

  async removeSaasOperator({
    signer,
    operator,
    gasStation = false,
    fee = 1.8,
  }: {
    signer: OfflineSigner;
    operator: string;
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }) {
    const client = await createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.saasAddress,
    });

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        remove_operator: {
          operator,
        },
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.saasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg)),
            },
          },
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(
        Math.round(gasEstimation * multiplier),
        gasPrice
      );
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.saasAddress,
      };
      return client.removeOperator({ operator }, grantFee);
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.saasAddress,
      };
      return client.removeOperator({ operator }, grantFee);
    }

    return client.removeOperator({ operator }, fee);
  }

  async isSaasOperator({
    signer,
    operator,
  }: {
    signer: OfflineSigner;
    operator: string;
  }) {
    const client = await createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.saasAddress,
    });
    return client.isOperator({ address: operator });
  }

  async depositSaas({
    signer,
    amount,
    gasStation = false,
    fee = 1.8,
  }: {
    signer: OfflineSigner;
    amount: string;
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }) {
    const client = await createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.saasAddress,
    });

    const funds = [
      {
        denom: 'peaka',
        amount: amount,
      },
    ];

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        deposit: {},
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.saasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg)),
              funds,
            },
          },
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(
        Math.round(gasEstimation * multiplier),
        gasPrice
      );
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.saasAddress,
      };
      return client.deposit(grantFee, undefined, funds);
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.saasAddress,
      };
      return client.deposit(grantFee, undefined, funds);
    }

    return client.deposit(fee, undefined, funds);
  }

  async withdrawSaas({
    signer,
    amount,
    gasStation = false,
    fee = 1.8,
  }: {
    signer: OfflineSigner;
    amount: string;
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }) {
    const client = await createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.saasAddress,
    });

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        withdraw: {
          amount,
        },
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.saasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg)),
            },
          },
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(
        Math.round(gasEstimation * multiplier),
        gasPrice
      );
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.saasAddress,
      };
      return client.withdraw({ amount }, grantFee);
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.saasAddress,
      };
      return client.withdraw({ amount }, grantFee);
    }

    return client.withdraw({ amount }, fee);
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

  async saasClient({
    signer,
    contractAddress,
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }) {
    return createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress,
    });
  }

  async contractClient({ signer }: { signer: OfflineSigner }) {
    return createContractClientByWallet(this.rpcEndpoint, signer);
  }
}
