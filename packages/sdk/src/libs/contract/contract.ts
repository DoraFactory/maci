import { OfflineSigner } from '@cosmjs/proto-signing';
import { ContractParams } from '../../types';
import {
  createAMaciClientBy,
  createAMaciQueryClientBy,
  createApiSaasClientBy,
  createContractClientByWallet,
  createMaciClientBy,
  createRegistryClientBy,
  createSaasClientBy
} from './config';
import {
  CreateAMaciRoundParams,
  CreateApiSaasAmaciRoundParams,
  CreateApiSaasMaciRoundParams,
  CreateMaciRoundParams
} from './types';
import { getAMaciRoundCircuitFee, getMaciRoundCircuitFee, getContractParams } from './utils';
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
  public apiSaasAddress: string;
  public maciCodeId: number;
  public oracleCodeId: number;
  public feegrantOperator: string;
  public whitelistBackendPubkey: string;

  constructor({
    network,
    rpcEndpoint,
    registryAddress,
    saasAddress,
    apiSaasAddress,
    maciCodeId,
    oracleCodeId,
    feegrantOperator,
    whitelistBackendPubkey
  }: ContractParams) {
    this.network = network;
    this.rpcEndpoint = rpcEndpoint;
    this.registryAddress = registryAddress;
    this.saasAddress = saasAddress;
    this.apiSaasAddress = apiSaasAddress;
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
    voteOptionMap,
    voiceCreditAmount,
    circuitType,
    preDeactivateRoot,
    preDeactivateCoordinator,
    oracleWhitelistPubkey,
    fee = 'auto'
  }: CreateAMaciRoundParams & { signer: OfflineSigner }) {
    const start_time = (startVoting.getTime() * 10 ** 6).toString();
    const end_time = (endVoting.getTime() * 10 ** 6).toString();
    const client = await createRegistryClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.registryAddress
    });

    const requiredFee = getAMaciRoundCircuitFee(this.network, maxVoter, voteOptionMap.length);

    preDeactivateRoot = preDeactivateRoot || '0';

    // Convert preDeactivateCoordinator to {x, y} format if provided
    let preDeactivateCoordinatorPubKey: { x: string; y: string } | undefined = undefined;
    if (preDeactivateCoordinator !== undefined) {
      let coordinatorX: bigint;
      let coordinatorY: bigint;

      if (typeof preDeactivateCoordinator === 'bigint') {
        // If it's a packed bigint, unpack it
        [coordinatorX, coordinatorY] = unpackPubKey(preDeactivateCoordinator);
      } else {
        // If it's already a PubKey array [x, y]
        [coordinatorX, coordinatorY] = preDeactivateCoordinator;
      }

      preDeactivateCoordinatorPubKey = {
        x: coordinatorX.toString(),
        y: coordinatorY.toString()
      };
    }

    const res = await client.createRound(
      {
        operator,
        preDeactivateRoot,
        preDeactivateCoordinator: preDeactivateCoordinatorPubKey,
        voiceCreditAmount,
        whitelist,
        roundInfo: {
          title,
          description: description || '',
          link: link || ''
        },
        votingTime: {
          start_time: Number(start_time),
          end_time: Number(end_time)
        },
        maxVoter: maxVoter.toString(),
        voteOptionMap,
        certificationSystem: '0',
        circuitType,
        oracleWhitelistPubkey
      },
      fee,
      undefined,
      [requiredFee]
    );
    let contractAddress = '';
    res.events.map((event: any) => {
      if (event.type === 'wasm') {
        let actionEvent = event.attributes.find((attr: any) => attr.key === 'action')!;
        if (actionEvent.value === 'created_round') {
          contractAddress = event.attributes
            .find((attr: any) => attr.key === 'round_addr')!
            .value.toString();
        }
      }
    });
    return {
      ...res,
      contractAddress
    };
  }

  async createMaciRound({
    signer,
    startVoting,
    endVoting,
    coordinator,
    title,
    description,
    link,
    maxVoter,
    voteOptionMap,
    circuitType,
    whitelistBackendPubkey,
    whitelistVotingPowerMode,
    fee = 'auto'
  }: CreateMaciRoundParams & { signer: OfflineSigner }) {
    const start_time = (startVoting.getTime() * 10 ** 6).toString();
    const end_time = (endVoting.getTime() * 10 ** 6).toString();
    const client = await createRegistryClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.registryAddress
    });

    const requiredFee = getMaciRoundCircuitFee(this.network, maxVoter, voteOptionMap.length);

    // Convert coordinator to {x, y} format
    let coordinatorX: bigint;
    let coordinatorY: bigint;

    if (typeof coordinator === 'bigint') {
      // If it's a packed bigint, unpack it
      [coordinatorX, coordinatorY] = unpackPubKey(coordinator);
    } else {
      // If it's already a PubKey array [x, y]
      [coordinatorX, coordinatorY] = coordinator;
    }

    const coordinatorPubKey = {
      x: coordinatorX.toString(),
      y: coordinatorY.toString()
    };

    const res = await client.createMaciRound(
      {
        coordinator: coordinatorPubKey,
        whitelistBackendPubkey,
        whitelistVotingPowerMode,
        roundInfo: {
          title,
          description: description || '',
          link: link || ''
        },
        votingTime: {
          start_time: Number(start_time),
          end_time: Number(end_time)
        },
        maxVoters: maxVoter,
        voteOptionMap,
        certificationSystem: '0',
        circuitType
      },
      fee,
      undefined,
      [requiredFee]
    );
    let contractAddress = '';
    res.events.map((event: any) => {
      if (event.type === 'wasm') {
        let actionEvent = event.attributes.find((attr: any) => attr.key === 'action')!;
        if (actionEvent.value === 'created_maci_round') {
          contractAddress = event.attributes
            .find((attr: any) => attr.key === 'round_addr')!
            .value.toString();
        }
      }
    });
    return {
      ...res,
      contractAddress
    };
  }

  async setSaasOracleMaciRoundInfo({
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
  }) {
    const client = await createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.saasAddress
    });

    const roundInfo = {
      title,
      description,
      link
    };

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        set_round_info: {
          contract_addr: contractAddress,
          round_info: roundInfo
        }
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.saasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg))
            }
          }
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(Math.round(gasEstimation * multiplier), gasPrice);
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.saasAddress
      };
      return client.setRoundInfo(
        {
          contractAddr: contractAddress,
          roundInfo
        },
        grantFee
      );
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.saasAddress
      };
      return client.setRoundInfo(
        {
          contractAddr: contractAddress,
          roundInfo
        },
        grantFee
      );
    }

    return client.setRoundInfo(
      {
        contractAddr: contractAddress,
        roundInfo
      },
      fee
    );
  }

  async setSaasOracleMaciRoundVoteOptions({
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
  }) {
    const client = await createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.saasAddress
    });

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        set_vote_options_map: {
          contract_addr: contractAddress,
          vote_option_map: voteOptionMap
        }
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.saasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg))
            }
          }
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(Math.round(gasEstimation * multiplier), gasPrice);
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.saasAddress
      };
      return client.setVoteOptionsMap(
        {
          contractAddr: contractAddress,
          voteOptionMap
        },
        grantFee
      );
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.saasAddress
      };
      return client.setVoteOptionsMap(
        {
          contractAddr: contractAddress,
          voteOptionMap
        },
        grantFee
      );
    }

    return client.setVoteOptionsMap(
      {
        contractAddr: contractAddress,
        voteOptionMap
      },
      fee
    );
  }

  async saasGrantToVoter({
    signer,
    baseAmount,
    contractAddress,
    grantee,
    gasStation = false,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    baseAmount: string;
    contractAddress: string;
    grantee: string;
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }) {
    const client = await createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.saasAddress
    });

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        grant_to_voter: {
          base_amount: baseAmount,
          contract_addr: contractAddress,
          grantee
        }
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.saasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg))
            }
          }
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(Math.round(gasEstimation * multiplier), gasPrice);
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.saasAddress
      };
      return client.grantToVoter(
        {
          baseAmount,
          contractAddr: contractAddress,
          grantee
        },
        grantFee
      );
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.saasAddress
      };
      return client.grantToVoter(
        {
          baseAmount,
          contractAddr: contractAddress,
          grantee
        },
        grantFee
      );
    }

    return client.grantToVoter(
      {
        baseAmount,
        contractAddr: contractAddress,
        grantee
      },
      fee
    );
  }

  async addSaasOperator({
    signer,
    operator,
    gasStation = false,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    operator: string;
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }) {
    const client = await createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.saasAddress
    });

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        add_operator: {
          operator
        }
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.saasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg))
            }
          }
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(Math.round(gasEstimation * multiplier), gasPrice);
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.saasAddress
      };
      return client.addOperator({ operator }, grantFee);
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.saasAddress
      };
      return client.addOperator({ operator }, grantFee);
    }

    return client.addOperator({ operator }, fee);
  }

  async removeSaasOperator({
    signer,
    operator,
    gasStation = false,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    operator: string;
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }) {
    const client = await createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.saasAddress
    });

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        remove_operator: {
          operator
        }
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.saasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg))
            }
          }
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(Math.round(gasEstimation * multiplier), gasPrice);
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.saasAddress
      };
      return client.removeOperator({ operator }, grantFee);
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.saasAddress
      };
      return client.removeOperator({ operator }, grantFee);
    }

    return client.removeOperator({ operator }, fee);
  }

  async isSaasOperator({ signer, operator }: { signer: OfflineSigner; operator: string }) {
    const client = await createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.saasAddress
    });
    return client.isOperator({ address: operator });
  }

  async depositSaas({
    signer,
    amount,
    gasStation = false,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    amount: string;
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }) {
    const client = await createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.saasAddress
    });

    const funds = [
      {
        denom: 'peaka',
        amount: amount
      }
    ];

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        deposit: {}
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
              funds
            }
          }
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(Math.round(gasEstimation * multiplier), gasPrice);
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.saasAddress
      };
      return client.deposit(grantFee, undefined, funds);
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.saasAddress
      };
      return client.deposit(grantFee, undefined, funds);
    }

    return client.deposit(fee, undefined, funds);
  }

  async withdrawSaas({
    signer,
    amount,
    gasStation = false,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    amount: string;
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }) {
    const client = await createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.saasAddress
    });

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        withdraw: {
          amount
        }
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.saasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg))
            }
          }
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(Math.round(gasEstimation * multiplier), gasPrice);
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.saasAddress
      };
      return client.withdraw({ amount }, grantFee);
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.saasAddress
      };
      return client.withdraw({ amount }, grantFee);
    }

    return client.withdraw({ amount }, fee);
  }

  async queryRoundInfo({ signer, roundAddress }: { signer: OfflineSigner; roundAddress: string }) {
    const client = await createMaciClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: roundAddress
    });
    const roundInfo = await client.getRoundInfo();
    return roundInfo;
  }

  async getStateIdx({
    contractAddress,
    pubkey
  }: {
    contractAddress: string;
    pubkey: { x: string; y: string };
  }) {
    const client = await createAMaciQueryClientBy({
      rpcEndpoint: this.rpcEndpoint,
      contractAddress
    });
    const stateIdx = await client.signuped({ pubkey });
    return stateIdx;
  }

  async getPollId({
    contractAddress
  }: {
    contractAddress: string;
  }) {
    const client = await createAMaciQueryClientBy({
      rpcEndpoint: this.rpcEndpoint,
      contractAddress
    });
    const pollId = await client.getPollId();
    return pollId;
  }

  async registryClient({
    signer,
    contractAddress
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }) {
    return createRegistryClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress
    });
  }

  async maciClient({
    signer,
    contractAddress
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }) {
    return createMaciClientBy({
      rpcEndpoint: this.rpcEndpoint,
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
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress
    });
  }

  async saasClient({
    signer,
    contractAddress
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }) {
    return createSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress
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
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress
    });
  }

  async contractClient({ signer }: { signer: OfflineSigner }) {
    return createContractClientByWallet(this.rpcEndpoint, signer);
  }

  async createApiSaasMaciRound({
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
    gasStation = false,
    fee = 1.8
  }: CreateApiSaasMaciRoundParams & { signer: OfflineSigner }) {
    const startTime = (startVoting.getTime() * 1_000_000).toString();
    const endTime = (endVoting.getTime() * 1_000_000).toString();

    const client = await createApiSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.apiSaasAddress
    });
    const [operatorPubkeyX, operatorPubkeyY] = Array.isArray(operatorPubkey)
      ? operatorPubkey
      : unpackPubKey(BigInt(operatorPubkey));

    const roundParams = {
      certificationSystem: '0',
      circuitType: '0',
      coordinator: {
        x: operatorPubkeyX.toString(),
        y: operatorPubkeyY.toString()
      },
      maxVoters: maxVoter,
      roundInfo: {
        title,
        description: description || '',
        link: link || ''
      },
      startTime,
      endTime,
      voteOptionMap,
      whitelistBackendPubkey: whitelistBackendPubkey || this.whitelistBackendPubkey
    };

    let createResponse;

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        create_api_maci_round: {
          certification_system: '0',
          circuit_type: '0',
          coordinator: roundParams.coordinator,
          max_voters: roundParams.maxVoters.toString(),
          round_info: roundParams.roundInfo,
          start_time: roundParams.startTime,
          end_time: roundParams.endTime,
          vote_option_map: roundParams.voteOptionMap,
          whitelist_backend_pubkey: roundParams.whitelistBackendPubkey
        }
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.apiSaasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg))
            }
          }
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(Math.round(gasEstimation * multiplier), gasPrice);
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.apiSaasAddress
      };
      createResponse = await client.createMaciRound(roundParams, grantFee);
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.apiSaasAddress
      };
      createResponse = await client.createMaciRound(roundParams, grantFee);
    } else {
      createResponse = await client.createMaciRound(roundParams, fee);
    }

    let contractAddress = '';
    createResponse.events.map((event) => {
      if (event.type === 'wasm') {
        let actionEvent = event.attributes.find((attr) => attr.key === 'action')!;
        if (actionEvent.value === 'created_maci_round') {
          contractAddress = event.attributes
            .find((attr) => attr.key === 'round_addr')!
            .value.toString();
        }
      }
    });
    return {
      ...createResponse,
      contractAddress
    };
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
  }) {
    const client = await createApiSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.apiSaasAddress
    });

    const roundInfo = {
      title,
      description,
      link
    };

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        set_round_info: {
          contract_addr: contractAddress,
          round_info: roundInfo
        }
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.apiSaasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg))
            }
          }
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(Math.round(gasEstimation * multiplier), gasPrice);
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.apiSaasAddress
      };
      return client.setRoundInfo(
        {
          contractAddr: contractAddress,
          roundInfo
        },
        grantFee
      );
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.apiSaasAddress
      };
      return client.setRoundInfo(
        {
          contractAddr: contractAddress,
          roundInfo
        },
        grantFee
      );
    }

    return client.setRoundInfo(
      {
        contractAddr: contractAddress,
        roundInfo
      },
      fee
    );
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
  }) {
    const client = await createApiSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.apiSaasAddress
    });

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        set_vote_options_map: {
          contract_addr: contractAddress,
          vote_option_map: voteOptionMap
        }
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.apiSaasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg))
            }
          }
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(Math.round(gasEstimation * multiplier), gasPrice);
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.apiSaasAddress
      };
      return client.setVoteOptionsMap(
        {
          contractAddr: contractAddress,
          voteOptionMap
        },
        grantFee
      );
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.apiSaasAddress
      };
      return client.setVoteOptionsMap(
        {
          contractAddr: contractAddress,
          voteOptionMap
        },
        grantFee
      );
    }

    return client.setVoteOptionsMap(
      {
        contractAddr: contractAddress,
        voteOptionMap
      },
      fee
    );
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
  }) {
    const client = await createApiSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.apiSaasAddress
    });

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        add_operator: {
          operator
        }
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.apiSaasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg))
            }
          }
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(Math.round(gasEstimation * multiplier), gasPrice);
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.apiSaasAddress
      };
      return client.addOperator({ operator }, grantFee);
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.apiSaasAddress
      };
      return client.addOperator({ operator }, grantFee);
    }

    return client.addOperator({ operator }, fee);
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
  }) {
    const client = await createApiSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.apiSaasAddress
    });

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        remove_operator: {
          operator
        }
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.apiSaasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg))
            }
          }
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(Math.round(gasEstimation * multiplier), gasPrice);
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.apiSaasAddress
      };
      return client.removeOperator({ operator }, grantFee);
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.apiSaasAddress
      };
      return client.removeOperator({ operator }, grantFee);
    }

    return client.removeOperator({ operator }, fee);
  }

  async isApiSaasOperator({ signer, operator }: { signer: OfflineSigner; operator: string }) {
    const client = await createApiSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.apiSaasAddress
    });
    return client.isOperator({ address: operator });
  }

  async createApiSaasAmaciRound({
    signer,
    operator,
    startVoting,
    endVoting,
    title,
    description,
    link,
    maxVoter,
    voteOptionMap,
    whitelist,
    voiceCreditAmount,
    preDeactivateRoot,
    preDeactivateCoordinator,
    oracleWhitelistPubkey,
    circuitType,
    gasStation = false,
    fee = 1.8
  }: CreateApiSaasAmaciRoundParams & { signer: OfflineSigner }) {
    const startTime = (startVoting.getTime() * 1_000_000).toString();
    const endTime = (endVoting.getTime() * 1_000_000).toString();

    const client = await createApiSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.apiSaasAddress
    });

    // Convert preDeactivateCoordinator to {x, y} format if provided
    let preDeactivateCoordinatorPubKey: { x: string; y: string } | undefined = undefined;
    if (preDeactivateCoordinator !== undefined) {
      let coordinatorX: bigint;
      let coordinatorY: bigint;

      if (typeof preDeactivateCoordinator === 'bigint') {
        // If it's a packed bigint, unpack it
        [coordinatorX, coordinatorY] = unpackPubKey(preDeactivateCoordinator);
      } else {
        // If it's already a PubKey array [x, y]
        [coordinatorX, coordinatorY] = preDeactivateCoordinator;
      }

      preDeactivateCoordinatorPubKey = {
        x: coordinatorX.toString(),
        y: coordinatorY.toString()
      };
    }

    const roundParams = {
      certificationSystem: '0',
      circuitType: circuitType.toString(),
      maxVoter: maxVoter.toString(),
      operator,
      oracleWhitelistPubkey,
      preDeactivateRoot: preDeactivateRoot || '0',
      preDeactivateCoordinator: preDeactivateCoordinatorPubKey,
      roundInfo: {
        title,
        description: description || '',
        link: link || ''
      },
      voiceCreditAmount,
      voteOptionMap,
      votingTime: {
        start_time: startTime,
        end_time: endTime
      },
      whitelist
    };

    let createResponse;

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        create_amaci_round: {
          certification_system: '0',
          circuit_type: circuitType.toString(),
          max_voter: maxVoter.toString(),
          operator,
          oracle_whitelist_pubkey: oracleWhitelistPubkey,
          pre_deactivate_root: preDeactivateRoot || '0',
          pre_deactivate_coordinator: preDeactivateCoordinatorPubKey,
          round_info: roundParams.roundInfo,
          voice_credit_amount: voiceCreditAmount,
          vote_option_map: voteOptionMap,
          voting_time: roundParams.votingTime,
          whitelist
        }
      };
      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: this.apiSaasAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg))
            }
          }
        ],
        ''
      );
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(Math.round(gasEstimation * multiplier), gasPrice);
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: this.apiSaasAddress
      };
      createResponse = await client.createAmaciRound(roundParams, grantFee);
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: this.apiSaasAddress
      };
      createResponse = await client.createAmaciRound(roundParams, grantFee);
    } else {
      createResponse = await client.createAmaciRound(roundParams, fee);
    }

    let contractAddress = '';
    createResponse.events.map((event) => {
      if (event.type === 'wasm') {
        let actionEvent = event.attributes.find((attr) => attr.key === 'action');
        if (actionEvent && actionEvent.value === 'created_round') {
          const roundAddrEvent = event.attributes.find((attr) => attr.key === 'round_addr');
          if (roundAddrEvent) {
            contractAddress = roundAddrEvent.value.toString();
          }
        }
      }
    });
    return {
      ...createResponse,
      contractAddress
    };
  }
}
