import { OfflineSigner } from '@cosmjs/proto-signing';
import {
  Keypair,
  batchGenMessage,
  PubKey,
  stringizing,
  genAddKeyProof,
} from '../crypto';
import { Contract } from '../contract';
import { Indexer } from '../indexer';
import { OracleCertificate } from '../oracle-certificate';
import {
  MsgExecuteContractEncodeObject,
  SigningCosmWasmClient,
} from '@cosmjs/cosmwasm-stargate';
import { GasPrice, calculateFee, StdFee } from '@cosmjs/stargate';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx.js';
import { CertificateEcosystem, ErrorResponse, RoundType } from '../../types';
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
  public contract: Contract;
  public indexer: Indexer;
  public oracleCertificate: OracleCertificate;
  public maciKeypair: Keypair;
  constructor({
    contract,
    indexer,
    oracleCertificate,
    maciKeypair,
  }: {
    contract: Contract;
    indexer: Indexer;
    oracleCertificate: OracleCertificate;
    maciKeypair: Keypair;
  }) {
    this.contract = contract;
    this.indexer = indexer;
    this.oracleCertificate = oracleCertificate;
    this.maciKeypair = maciKeypair;
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
    if (!address) {
      address = (await signer.getAccounts())[0].address;
    }

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

  async hasFeegrant({
    address,
    contractAddress,
  }: {
    address: string;
    contractAddress: string;
  }): Promise<boolean> {
    try {
      const response = await this.oracleCertificate.feegrantAllowance(
        contractAddress,
        address
      );
      return response.spend_limit.length > 0;
    } catch (error) {
      return false;
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
    address?: string;
    contractAddress: string;
    certificate?: {
      signature: string;
      amount: string;
    };
    mode?: 'maci' | 'amaci';
  }): Promise<string> {
    if (!address) {
      address = (await signer.getAccounts())[0].address;
    }

    if (mode === 'amaci') {
      const isWhiteListed = await this.isWhitelisted({
        signer,
        address,
        contractAddress,
      });

      if (isWhiteListed) {
        const round = await this.indexer.getRoundWithFields(contractAddress, [
          'voiceCreditAmount',
        ]);

        if (!isErrorResponse(round)) {
          if (round.data.round.voiceCreditAmount) {
            return round.data.round.voiceCreditAmount;
          } else {
            return '0';
          }
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
        amount: certificate.amount,
        certificate: certificate.signature,
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
    address?: string;
    contractAddress: string;
  }) {
    if (!address) {
      address = (await signer.getAccounts())[0].address;
    }

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
    const roundInfo = await this.indexer.getRoundWithFields(contractAddress);

    if (isErrorResponse(roundInfo)) {
      throw new Error(
        `Failed to get round info: ${roundInfo.error.type} ${roundInfo.error.message}`
      );
    }

    return roundInfo.data.round as RoundType;
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
    address?: string;
    contractAddress: string;
  }): Promise<SignatureResponse> {
    const oracleWhitelistConfig = await this.getOracleWhitelistConfig({
      signer,
      contractAddress,
    });

    if (!address) {
      address = (await signer.getAccounts())[0].address;
    }

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
    maciKeypair,
    oracleCertificate,
    gasStation = false,
    fee,
  }: {
    signer: OfflineSigner;
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
    try {
      if (!address) {
        address = (await signer.getAccounts())[0].address;
      }

      if (maciKeypair === undefined) {
        maciKeypair = this.maciKeypair;
        // maciKeypair = await this.crypto.genKeypairFromSign(signer, address);
      }

      const client = await this.contract.contractClient({
        signer,
      });

      if (oracleCertificate) {
        return await this.signupOracle({
          client,
          address,
          pubKey: maciKeypair.pubKey,
          contractAddress,
          oracleCertificate,
          gasStation,
          fee,
        });
      } else {
        return await this.signupSimple({
          client,
          address,
          pubKey: maciKeypair.pubKey,
          contractAddress,
          gasStation,
          fee,
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
    maciKeypair,
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
    operatorCoordPubKey: PubKey;
    maciKeypair?: Keypair;
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

      if (!address) {
        address = (await signer.getAccounts())[0].address;
      }

      if (maciKeypair === undefined) {
        maciKeypair = this.maciKeypair;
        // maciKeypair = await this.crypto.genKeypairFromSign(signer, address);
      }

      const plan = options.map((o) => {
        return [o.idx, o.vc] as [number, number];
      });

      const payload = batchGenMessage(
        stateIdx,
        maciKeypair,
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
      encPubkeys: PubKey;
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
    fee,
  }: {
    client: SigningCosmWasmClient;
    address: string;
    pubKey: PubKey;
    contractAddress: string;
    gasStation?: boolean;
    fee?: StdFee;
  }) {
    const gasPrice = GasPrice.fromString('100000000000peaka');
    fee = fee || calculateFee(60000000, gasPrice);

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
    fee,
  }: {
    client: SigningCosmWasmClient;
    address: string;
    pubKey: PubKey;
    contractAddress: string;
    oracleCertificate: {
      amount: string;
      signature: string;
    };
    gasStation?: boolean;
    fee?: StdFee;
  }) {
    const gasPrice = GasPrice.fromString('100000000000peaka');
    fee = fee || calculateFee(60000000, gasPrice);

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

  // async submitDeactivate({
  //   signer,
  //   client,
  //   address,
  //   maciAccount,
  //   contractAddress,
  //   gasStation,
  //   fee,
  // }: {
  //   signer: OfflineSigner;
  //   client: SigningCosmWasmClient;
  //   address?: string;
  //   maciAccount: Keypair;
  //   contractAddress: string;
  //   gasStation: boolean;
  //   fee?: StdFee;
  // }) {
  //   try {
  //     address = address || (await signer.getAccounts())[0].address;

  //     const stateIdx = await this.getStateIdxInc({
  //       signer,
  //       address,
  //       contractAddress,
  //     });

  //     const operatorCoordPubKey = await this.getRoundInfo({
  //       contractAddress,
  //     });

  //     const payload = batchGenMessage(
  //       Number(stateIdx),
  //       maciAccount,
  //       [
  //         BigInt(operatorCoordPubKey.coordinatorPubkeyX),
  //         BigInt(operatorCoordPubKey.coordinatorPubkeyY),
  //       ],
  //       [[0, 0]]
  //     );

  //     const { msg, encPubkeys } = payload[0];

  //     const gasPrice = GasPrice.fromString('100000000000peaka');
  //     fee = fee || calculateFee(20000000, gasPrice);

  //     return client.execute(
  //       address,
  //       contractAddress,
  //       stringizing({
  //         publish_deactivate_message: {
  //           enc_pub_key: {
  //             x: encPubkeys[0],
  //             y: encPubkeys[1],
  //           },
  //           message: {
  //             data: msg,
  //           },
  //         },
  //       }),
  //       gasStation === true
  //         ? {
  //             amount: fee.amount,
  //             gas: fee.gas,
  //             granter: contractAddress,
  //           }
  //         : fee
  //     );
  //   } catch (error) {
  //     throw Error(`Submit deactivate failed! ${error}`);
  //   }
  // }

  async fetchAllDeactivateLogs({
    contractAddress,
  }: {
    contractAddress: string;
  }) {
    const deactivates =
      await this.indexer.fetchAllDeactivateLogs(contractAddress);
    return deactivates;
  }

  // async addNewKey({
  //   signer,
  //   client,
  //   address,
  //   maciAccount,
  //   contractAddress,
  //   gasStation,
  //   fee,
  // }: {
  //   signer: OfflineSigner;
  //   client: SigningCosmWasmClient;
  //   address?: string;
  //   maciAccount: Keypair;
  //   contractAddress: string;
  //   gasStation: boolean;
  //   fee?: StdFee;
  // }) {
  //   const deactivates = await this.fetchAllDeactivateLogs({
  //     contractAddress,
  //   });

  //   const roundInfo = await this.getRoundInfo({
  //     contractAddress,
  //   });

  //   const inputObj = await genAddKeyProof(4, {
  //     coordPubKey: [
  //       BigInt(roundInfo.coordinatorPubkeyX),
  //       BigInt(roundInfo.coordinatorPubkeyY),
  //     ],
  //     oldKey: maciAccount,
  //     deactivates: deactivates.map((d: any) => d.map(BigInt)),
  //   });
  // }

  async claimAMaciRound({
    signer,
    contractAddress,
    fee = 'auto',
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    fee?: number | StdFee | 'auto';
  }) {
    const client = await this.contract.amaciClient({
      signer,
      contractAddress,
    });

    return client.claim(fee);
  }

  async getOracleCertificateConfig() {
    const ecosystems = await this.oracleCertificate.listEcosystems();
    return ecosystems;
  }

  /**
   * Batch grant with bond (for maci)
   * @param signer
   * @param contractAddress
   * @param address
   * @param amount
   * @returns
   */
  async batchGrantWithBond({
    signer,
    contractAddress,
    address,
    amount,
    fee = 'auto',
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    amount: string;
    address?: string;
    fee?: number | StdFee | 'auto';
  }) {
    const client = await this.contract.contractClient({
      signer,
    });

    if (!address) {
      address = (await signer.getAccounts())[0].address;
    }

    const msgs: MsgExecuteContractEncodeObject[] = [
      {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: MsgExecuteContract.fromPartial({
          sender: address,
          contract: contractAddress,
          msg: new TextEncoder().encode(
            JSON.stringify(
              stringizing({
                grant: {
                  max_amount: BigInt('100000000000000000000000'),
                },
              })
            )
          ),
        }),
      },
      {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: MsgExecuteContract.fromPartial({
          sender: address,
          contract: contractAddress,
          msg: new TextEncoder().encode(
            JSON.stringify(
              stringizing({
                bond: {},
              })
            )
          ),
          funds: [
            {
              denom: 'peaka',
              amount,
            },
          ],
        }),
      },
    ];

    try {
      const result = await client.signAndBroadcast(address, msgs, fee);
      return result;
    } catch (err) {
      throw err;
    }
  }

  /**
   * Batch revoke with withdraw (for maci)
   * @param client
   * @param contractAddress
   * @param address
   * @returns
   */
  async batchRevokeWithdraw({
    signer,
    contractAddress,
    address,
    fee = 'auto',
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    address?: string;
    fee?: number | StdFee | 'auto';
  }) {
    const client = await this.contract.contractClient({
      signer,
    });

    if (!address) {
      address = (await signer.getAccounts())[0].address;
    }

    const msgs: MsgExecuteContractEncodeObject[] = [
      {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: MsgExecuteContract.fromPartial({
          sender: address,
          contract: contractAddress,
          msg: new TextEncoder().encode(
            JSON.stringify(
              stringizing({
                withdraw: {},
              })
            )
          ),
        }),
      },
      {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: MsgExecuteContract.fromPartial({
          sender: address,
          contract: contractAddress,
          msg: new TextEncoder().encode(
            JSON.stringify(
              stringizing({
                revoke: {},
              })
            )
          ),
        }),
      },
    ];

    try {
      const result = await client.signAndBroadcast(address, msgs, fee);
      return result;
    } catch (err) {
      throw err;
    }
  }
}
