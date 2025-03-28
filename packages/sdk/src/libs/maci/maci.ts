import { OfflineSigner } from '@cosmjs/proto-signing';
import {
  Account,
  batchGenMessage,
  Circom,
  PublicKey,
  stringizing,
} from '../circom';
import { Contract } from '../contract';
import { Indexer } from '../indexer';
import { OracleCertificate } from '../oracle-certificate';
import {
  MsgExecuteContractEncodeObject,
  SigningCosmWasmClient,
} from '@cosmjs/cosmwasm-stargate';
import { GasPrice, calculateFee, StdFee } from '@cosmjs/stargate';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx.js';
import { CertificateEcosystem, ErrorResponse } from '../../types';
import { SignatureResponse } from '../oracle-certificate/types';
import { OracleWhitelistConfig } from '../contract/ts/OracleMaci.types';
import { getAMaciRoundCircuitFee } from '../contract/utils';

export function isErrorResponse(response: unknown): response is ErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    typeof (response as ErrorResponse).error === 'object' &&
    'message' in (response as ErrorResponse).error
  );
}

export class MACI {
  public circom: Circom;
  public contract: Contract;
  public indexer: Indexer;
  public oracleCertificate: OracleCertificate;
  constructor({
    circom,
    contract,
    indexer,
    oracleCertificate,
  }: {
    circom: Circom;
    contract: Contract;
    indexer: Indexer;
    oracleCertificate: OracleCertificate;
  }) {
    this.circom = circom;
    this.contract = contract;
    this.indexer = indexer;
    this.oracleCertificate = oracleCertificate;
  }

  async getStateIdxInc({
    signer,
    address,
    contractAddress,
  }: {
    signer: OfflineSigner;
    address: string;
    contractAddress: string;
  }) {
    const client = await this.contract.maciClient({
      signer,
      contractAddress,
    });

    const stateIdx = await client.getStateIdxInc({ address });
    return stateIdx;
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
    const client = await this.contract.maciClient({
      signer,
      contractAddress,
    });

    const voiceCredit = await client.getVoiceCreditBalance({
      index: stateIdx.toString(),
    });
    return voiceCredit;
  }

  async getStateIdxByPubKey({
    contractAddress,
    pubKey,
  }: {
    contractAddress: string;
    pubKey: bigint[];
  }) {
    const response = await this.indexer.getSignUpEventByPubKey(
      contractAddress,
      pubKey
    );

    if (isErrorResponse(response)) {
      return -1;
    }
    return response.data.signUpEvents[0].stateIdx;
  }

  async feegrantAllowance({
    address,
    contractAddress,
  }: {
    address: string;
    contractAddress: string;
  }) {
    try {
      const response = await this.oracleCertificate.feegrantAllowance(
        contractAddress,
        address
      );
      return response;
    } catch (error) {
      return {
        granter: contractAddress,
        grantee: address,
        spend_limit: [],
      };
    }
  }

  // only for maci and oracle maci, amaci will set the voice credit when deploy the contract
  async queryWhitelistBalanceOf({
    signer,
    address,
    contractAddress,
    certificate,
    mode = 'maci',
  }: {
    signer: OfflineSigner;
    address: string;
    contractAddress: string;
    certificate?: string;
    mode?: 'maci' | 'amaci';
  }): Promise<string> {
    if (mode === 'amaci') {
      const isWhiteListed = await this.isWhitelisted({
        signer,
        address,
        contractAddress,
      });

      if (isWhiteListed) {
        const round = await this.indexer.getRoundById(contractAddress);

        if (!isErrorResponse(round)) {
          return round.data.round.voiceCreditAmount;
        } else {
          throw new Error(
            `Failed to query amaci voice credit: ${round.error.type} ${round.error.message}`
          );
        }
      } else {
        return '0';
      }
    }

    if (certificate) {
      const client = await this.contract.oracleMaciClient({
        signer,
        contractAddress,
      });

      const balance = await client.whiteBalanceOf({
        amount: address,
        certificate,
        sender: address,
      });

      return balance;
    } else {
      const client = await this.contract.maciClient({
        signer,
        contractAddress,
      });

      const balance = await client.whiteBalanceOf({
        sender: address,
      });

      return balance;
    }
  }

  async isWhitelisted({
    signer,
    address,
    contractAddress,
  }: {
    signer: OfflineSigner;
    address: string;
    contractAddress: string;
  }) {
    const client = await this.contract.amaciClient({
      signer,
      contractAddress,
    });

    const isWhitelisted = await client.isWhiteList({
      sender: address,
    });

    return isWhitelisted;
  }

  async getOracleWhitelistConfig({
    signer,
    contractAddress,
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }): Promise<OracleWhitelistConfig> {
    const client = await this.contract.oracleMaciClient({
      signer,
      contractAddress,
    });

    const snapshotHeight = await client.queryOracleWhitelistConfig();
    return snapshotHeight;
  }

  async getRoundInfo({ contractAddress }: { contractAddress: string }) {
    const roundInfo = await this.indexer.getRoundById(contractAddress);

    if (isErrorResponse(roundInfo)) {
      throw new Error(
        `Failed to get round info: ${roundInfo.error.type} ${roundInfo.error.message}`
      );
    }

    return roundInfo.data.round;
  }

  async getRoundCircuitType({ contractAddress }: { contractAddress: string }) {
    const roundInfo = await this.getRoundInfo({ contractAddress });

    return roundInfo.circuitType; // 0: 1p1v, 1: qv
  }

  async queryRoundIsQv({ contractAddress }: { contractAddress: string }) {
    const circuitType = await this.getRoundCircuitType({ contractAddress });

    return circuitType === '1';
  }

  async queryRoundClaimable({
    contractAddress,
  }: {
    contractAddress: string;
  }): Promise<{
    claimable: boolean | null;
    balance: string | null;
  }> {
    try {
      const roundInfo = await this.getRoundInfo({ contractAddress });

      if (roundInfo.maciType !== 'aMACI') {
        return {
          claimable: null,
          balance: null,
        };
      }

      const votingEndTime = new Date(Number(roundInfo.votingEnd) / 10 ** 6);
      const currentTime = new Date();
      const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;

      if (currentTime.getTime() - votingEndTime.getTime() <= threeDaysInMs) {
        return {
          claimable: null,
          balance: null,
        };
      }

      const roundBalance = await this.indexer.balanceOf(contractAddress);
      if (isErrorResponse(roundBalance)) {
        throw new Error(
          `Failed to query round balance: ${roundBalance.error.type} ${roundBalance.error.message}`
        );
      }

      if (
        roundBalance.data.balance &&
        roundBalance.data.balance !== '0' &&
        roundBalance.data.balance !== ''
      ) {
        return {
          claimable: true,
          balance: roundBalance.data.balance,
        };
      }

      return {
        claimable: false,
        balance: roundBalance.data.balance,
      };
    } catch (error) {
      console.error('Error in queryRoundClaimable:', error);
      return {
        claimable: null,
        balance: null,
      };
    }
  }

  async queryAMaciChargeFee({
    maxVoter,
    maxOption,
  }: {
    maxVoter: number;
    maxOption: number;
  }) {
    const fee = getAMaciRoundCircuitFee(maxVoter, maxOption);
    return fee;
  }

  async queryRoundGasStation({ contractAddress }: { contractAddress: string }) {
    const roundInfo = await this.getRoundInfo({ contractAddress });

    return roundInfo.gasStationEnable;
  }

  parseRoundStatus(
    votingStart: number,
    votingEnd: number,
    status: string,
    currentTime: Date
  ): string {
    const startTime = new Date(votingStart / 10 ** 6);
    const endTime = new Date(votingEnd / 10 ** 6);

    // Inherit logic from Maci Explorer
    if (Number(votingStart) === 0) {
      return 'Created';
    }

    if (Number(votingEnd) === 0) {
      if (startTime < currentTime) {
        return 'Ongoing';
      }
    } else {
      if (startTime < currentTime && currentTime < endTime) {
        return 'Ongoing';
      }
      if (currentTime > endTime) {
        if (status !== 'Closed') {
          return 'Tallying';
        }
      }
    }

    return status;
  }

  async queryRoundBalance({ contractAddress }: { contractAddress: string }) {
    const roundBalance = await this.indexer.balanceOf(contractAddress);
    if (isErrorResponse(roundBalance)) {
      throw new Error(
        `Failed to query round balance: ${roundBalance.error.type} ${roundBalance.error.message}`
      );
    }

    return roundBalance.data.balance;
  }

  async requestOracleCertificate({
    signer,
    ecosystem,
    address,
    contractAddress,
  }: {
    signer: OfflineSigner;
    ecosystem: CertificateEcosystem;
    address: string;
    contractAddress: string;
  }): Promise<SignatureResponse> {
    const oracleWhitelistConfig = await this.getOracleWhitelistConfig({
      signer,
      contractAddress,
    });

    const signResponse = await this.oracleCertificate.sign({
      ecosystem,
      address,
      contractAddress,
      height: oracleWhitelistConfig.snapshot_height,
    });

    return signResponse;
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
    address: string;
    contractAddress: string;
    maciAccount?: Account;
    oracleCertificate?: {
      amount: string;
      signature: string;
    };
    gasStation?: boolean;
  }) {
    try {
      if (maciAccount === undefined) {
        maciAccount = await this.circom.genKeypairFromSign(signer, address);
      }

      const client = await this.contract.contractClient({
        signer,
      });

      if (oracleCertificate) {
        return await this.signupOracle({
          client,
          address,
          pubKey: maciAccount.pubKey,
          contractAddress,
          oracleCertificate,
          gasStation,
        });
      } else {
        return await this.signupSimple({
          client,
          address,
          pubKey: maciAccount.pubKey,
          contractAddress,
          gasStation,
        });
      }
    } catch (error) {
      throw Error(`Signup failed! ${error}`);
    }
  }

  private async processVoteOptions({
    selectedOptions,
    contractAddress,
    voiceCreditBalance,
  }: {
    selectedOptions: {
      idx: number;
      vc: number;
    }[];
    contractAddress: string;
    voiceCreditBalance: string;
  }) {
    // Check for duplicate options
    const idxSet = new Set();
    for (const option of selectedOptions) {
      if (idxSet.has(option.idx)) {
        throw new Error(
          `Duplicate option index (${option.idx}) is not allowed`
        );
      }
      idxSet.add(option.idx);
    }

    // Filter and sort options
    const options = selectedOptions
      .filter((o) => !!o.vc)
      .sort((a, b) => a.idx - b.idx);

    // Calculate used voice credits
    const isQv = await this.queryRoundIsQv({ contractAddress });
    const usedVc = options.reduce((s, o) => s + (isQv ? o.vc * o.vc : o.vc), 0);

    if (Number(voiceCreditBalance) < usedVc) {
      throw new Error('Insufficient voice credit balance');
    }

    return options;
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
    address: string;
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
    if (stateIdx === -1) {
      throw new Error('State index is not set, Please signup first');
    }

    try {
      const voiceCreditBalance = await this.getVoiceCreditBalance({
        signer,
        stateIdx,
        contractAddress,
      });

      const options = await this.processVoteOptions({
        selectedOptions,
        contractAddress,
        voiceCreditBalance,
      });

      if (maciAccount === undefined) {
        maciAccount = await this.circom.genKeypairFromSign(signer, address);
      }

      const plan = options.map((o) => {
        return [o.idx, o.vc] as [number, number];
      });

      const payload = batchGenMessage(
        stateIdx,
        maciAccount,
        operatorCoordPubKey,
        plan
      );

      const client = await this.contract.contractClient({
        signer,
      });

      return await this.publishMessage({
        client,
        address,
        payload,
        contractAddress,
        gasStation,
      });
    } catch (error) {
      throw Error(`Vote failed! ${error}`);
    }
  }

  async publishMessage({
    client,
    address,
    payload,
    contractAddress,
    gasStation,
  }: {
    client: SigningCosmWasmClient;
    address: string;
    payload: {
      msg: bigint[];
      encPubkeys: PublicKey;
    }[];
    contractAddress: string;
    gasStation: boolean;
  }) {
    const msgs: MsgExecuteContractEncodeObject[] = payload.map(
      ({ msg, encPubkeys }) => ({
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: MsgExecuteContract.fromPartial({
          sender: address,
          contract: contractAddress,
          msg: new TextEncoder().encode(
            JSON.stringify(
              stringizing({
                publish_message: {
                  enc_pub_key: {
                    x: encPubkeys[0],
                    y: encPubkeys[1],
                  },
                  message: {
                    data: msg,
                  },
                },
              })
            )
          ),
        }),
      })
    );

    const gasPrice = GasPrice.fromString('100000000000peaka');
    const fee = calculateFee(20000000 * msgs.length, gasPrice);

    if (gasStation) {
      const grantFee: StdFee = {
        amount: fee.amount,
        gas: fee.gas,
        granter: contractAddress,
      };
      return client.signAndBroadcast(address, msgs, grantFee);
    }
    return client.signAndBroadcast(address, msgs, fee);
  }

  async signupSimple({
    client,
    address,
    pubKey,
    contractAddress,
    gasStation,
  }: {
    client: SigningCosmWasmClient;
    address: string;
    pubKey: PublicKey;
    contractAddress: string;
    gasStation?: boolean;
  }) {
    const gasPrice = GasPrice.fromString('100000000000peaka');
    const fee = calculateFee(60000000, gasPrice);

    if (gasStation === true) {
      const grantFee: StdFee = {
        amount: fee.amount,
        gas: fee.gas,
        granter: contractAddress,
      };
      return client.execute(
        address,
        contractAddress,
        {
          sign_up: {
            pubkey: {
              x: pubKey[0].toString(),
              y: pubKey[1].toString(),
            },
          },
        },
        grantFee
      );
    }

    return client.execute(
      address,
      contractAddress,
      {
        sign_up: {
          pubkey: {
            x: pubKey[0].toString(),
            y: pubKey[1].toString(),
          },
        },
      },
      fee
    );
  }

  async signupOracle({
    client,
    address,
    pubKey,
    contractAddress,
    oracleCertificate,
    gasStation,
  }: {
    client: SigningCosmWasmClient;
    address: string;
    pubKey: PublicKey;
    contractAddress: string;
    oracleCertificate: {
      amount: string;
      signature: string;
    };
    gasStation?: boolean;
  }) {
    const gasPrice = GasPrice.fromString('100000000000peaka');
    const fee = calculateFee(60000000, gasPrice);

    if (gasStation === true) {
      const grantFee: StdFee = {
        amount: fee.amount,
        gas: fee.gas,
        granter: contractAddress,
      };
      return client.execute(
        address,
        contractAddress,
        {
          sign_up: {
            pubkey: {
              x: pubKey[0].toString(),
              y: pubKey[1].toString(),
            },
            amount: oracleCertificate.amount,
            certificate: oracleCertificate.signature,
          },
        },
        grantFee
      );
    }

    return client.execute(
      address,
      contractAddress,
      {
        sign_up: {
          pubkey: {
            x: pubKey[0].toString(),
            y: pubKey[1].toString(),
          },
          amount: oracleCertificate.amount,
          certificate: oracleCertificate.signature,
        },
      },
      fee
    );
  }

  async claimAMaciRound({
    signer,
    contractAddress,
  }: {
    signer: OfflineSigner;
    contractAddress: string;
  }) {
    const client = await this.contract.amaciClient({
      signer,
      contractAddress,
    });

    return client.claim();
  }

  async getOracleCertificateConfig() {
    const ecosystems = await this.oracleCertificate.listEcosystems();
    return ecosystems;
  }
}
