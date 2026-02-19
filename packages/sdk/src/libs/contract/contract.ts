import { OfflineSigner } from '@cosmjs/proto-signing';
import { ContractParams } from '../../types';
import {
  createAMaciClientBy,
  createAMaciQueryClientBy,
  createApiSaasClientBy,
  createContractClientByWallet,
  createRegistryClientBy
} from './config';
import {
  CreateAMaciRoundParams,
  CreateApiSaasAmaciRoundParams,
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

  async createAMaciRound(params: CreateAMaciRoundParams & { signer: OfflineSigner }) {
    const { signer } = params;
    const roundInfo = {
      title: params.title,
      description: params.description ?? '',
      link: params.link ?? ''
    };
    const votingTime = {
      start_time: params.startVoting.getTime() * 1_000_000,
      end_time: params.endVoting.getTime() * 1_000_000
    };

    const client = await createRegistryClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.registryAddress
    });

    const requiredFee = getAMaciRoundCircuitFee(
      this.network,
      params.maxVoter,
      params.voteOptionMap.length
    );
    const fee = params.fee ?? 'auto';

    const res = await client.createRound(
      {
        certificationSystem: params.certificationSystem ?? '0',
        circuitType: params.circuitType.toString(),
        deactivateEnabled: params.deactivateEnabled,
        maxVoter: params.maxVoter.toString(),
        operator: params.operator,
        registrationMode: params.registrationMode,
        roundInfo,
        voiceCreditMode: params.voiceCreditMode,
        voteOptionMap: params.voteOptionMap,
        votingTime
      },
      fee,
      undefined,
      [requiredFee]
    );

    let contractAddress = '';
    for (const event of res.events) {
      if (event.type === 'wasm') {
        const actionEvent = event.attributes.find(
          (attr: { key: string; value: string }) => attr.key === 'action'
        );
        if (actionEvent && actionEvent.value === 'created_round') {
          const roundAddrEvent = event.attributes.find(
            (attr: { key: string; value: string }) => attr.key === 'round_addr'
          );
          if (roundAddrEvent) {
            contractAddress = roundAddrEvent.value.toString();
            break;
          }
        }
      }
    }
    return {
      ...res,
      contractAddress
    };
  }

  async queryRoundInfo({ signer, roundAddress }: { signer: OfflineSigner; roundAddress: string }) {
    const client = await createAMaciClientBy({
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

  async getPollId({ contractAddress }: { contractAddress: string }) {
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

  async amaciQueryClient({ contractAddress }: { contractAddress: string }) {
    return createAMaciQueryClientBy({
      rpcEndpoint: this.rpcEndpoint,
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

  async createApiSaasAmaciRound(params: CreateApiSaasAmaciRoundParams & { signer: OfflineSigner }) {
    const { signer } = params;
    const roundInfo = {
      title: params.title,
      description: params.description ?? '',
      link: params.link ?? ''
    };
    const votingTime = {
      start_time: (params.startVoting.getTime() * 1_000_000).toString(),
      end_time: (params.endVoting.getTime() * 1_000_000).toString()
    };
    const circuitType = params.circuitType.toString();

    const client = await createApiSaasClientBy({
      rpcEndpoint: this.rpcEndpoint,
      wallet: signer,
      contractAddress: this.apiSaasAddress
    });

    const roundParams = {
      certificationSystem: params.certificationSystem ?? '0',
      circuitType,
      deactivateEnabled: params.deactivateEnabled,
      maxVoter: params.maxVoter.toString(),
      operator: params.operator,
      registrationMode: params.registrationMode,
      roundInfo,
      voiceCreditMode: params.voiceCreditMode,
      voteOptionMap: params.voteOptionMap,
      votingTime
    };

    const gasStation = params.gasStation ?? false;
    const fee = params.fee ?? 1.8;
    let createResponse;

    if (gasStation && typeof fee !== 'object') {
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contractClient({ signer });
      const msg = {
        create_amaci_round: {
          certification_system: roundParams.certificationSystem,
          circuit_type: roundParams.circuitType,
          deactivate_enabled: roundParams.deactivateEnabled,
          max_voter: roundParams.maxVoter,
          operator: roundParams.operator,
          registration_mode: roundParams.registrationMode,
          round_info: roundParams.roundInfo,
          voice_credit_mode: roundParams.voiceCreditMode,
          vote_option_map: roundParams.voteOptionMap,
          voting_time: roundParams.votingTime
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
    for (const event of createResponse.events) {
      if (event.type === 'wasm') {
        const actionEvent = event.attributes.find(
          (attr: { key: string; value: string }) => attr.key === 'action'
        );
        if (actionEvent && actionEvent.value === 'created_round') {
          const roundAddrEvent = event.attributes.find(
            (attr: { key: string; value: string }) => attr.key === 'round_addr'
          );
          if (roundAddrEvent) {
            contractAddress = roundAddrEvent.value.toString();
            break;
          }
        }
      }
    }
    return {
      ...createResponse,
      contractAddress
    };
  }
}
