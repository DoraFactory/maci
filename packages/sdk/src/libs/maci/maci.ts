import { OfflineSigner } from '@cosmjs/proto-signing';
import { Keypair, batchGenMessage, PubKey, stringizing, genAddKeyInput } from '../crypto';
import { Contract } from '../contract';
import { Indexer } from '../indexer';
import { OracleCertificate } from '../oracle-certificate';
import { MsgExecuteContractEncodeObject, SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { GasPrice, calculateFee, StdFee } from '@cosmjs/stargate';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx.js';
import { CertificateEcosystem, ErrorResponse, RoundType } from '../../types';
import { SignatureResponse } from '../oracle-certificate/types';
import { Groth16ProofType, NullableString, RegistrationStatus } from '../contract/ts/AMaci.types';
import {
  DEFAULT_FEE_CONFIG,
  DEFAULT_DELAY_CONFIG,
  DEACTIVATE_FEE,
  FEE_DENOM,
  FeeConfig,
  DelayConfig,
  MESSAGE_FEE
} from './config';

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
  public network: 'mainnet' | 'testnet';
  public contract: Contract;
  public indexer: Indexer;
  public oracleCertificate: OracleCertificate;
  public maciKeypair: Keypair;
  /** Cached fee config, initialized from defaults. Call fetchFeeConfig({ contractAddress }) to refresh from a round contract. */
  public feeConfig: FeeConfig;
  /** Cached delay config, initialized from defaults. Call fetchDelayConfig({ contractAddress }) to refresh from a round contract. */
  public delayConfig: DelayConfig;

  constructor({
    contract,
    indexer,
    oracleCertificate,
    maciKeypair
  }: {
    contract: Contract;
    indexer: Indexer;
    oracleCertificate: OracleCertificate;
    maciKeypair: Keypair;
  }) {
    this.network = contract.network;
    this.contract = contract;
    this.indexer = indexer;
    this.oracleCertificate = oracleCertificate;
    this.maciKeypair = maciKeypair;
    this.feeConfig = { ...DEFAULT_FEE_CONFIG };
    this.delayConfig = { ...DEFAULT_DELAY_CONFIG };
  }

  /**
   * Fetch the fee configuration from the given round contract and cache it locally.
   * Call this once after instantiation (or whenever fees may have changed) to ensure
   * the SDK uses the correct on-chain fee values for the specific round.
   */
  async fetchFeeConfig({ contractAddress }: { contractAddress: string }): Promise<FeeConfig> {
    try {
      const roundClient = await this.contract.amaciQueryClient({ contractAddress });
      const feeConfig = await roundClient.getFeeConfig();
      this.feeConfig = {
        ...this.feeConfig,
        messageFee: feeConfig.message_fee,
        deactivateFee: feeConfig.deactivate_fee,
        signupFee: feeConfig.signup_fee
      };
    } catch {
      // Fall back to cached/default values if round contract is unreachable
    }
    return this.feeConfig;
  }

  /**
   * Fetch the delay configuration from the given round contract and cache it locally.
   * Call this once after instantiation (or whenever delays may have changed) to ensure
   * the SDK uses the correct on-chain delay values for the specific round.
   */
  async fetchDelayConfig({ contractAddress }: { contractAddress: string }): Promise<DelayConfig> {
    try {
      const roundClient = await this.contract.amaciQueryClient({ contractAddress });
      const delayConfig = await roundClient.getDelayConfig();
      this.delayConfig = {
        baseDelay: delayConfig.base_delay,
        messageDelay: delayConfig.message_delay,
        signupDelay: delayConfig.signup_delay,
        deactivateDelay: delayConfig.deactivate_delay
      };
    } catch {
      // Fall back to cached/default values if round contract is unreachable
    }
    return this.delayConfig;
  }

  async getPollId({ contractAddress }: { contractAddress: string }) {
    const client = await this.contract.amaciQueryClient({ contractAddress });
    return client.getPollId();
  }

  async getStateIdxInc({
    address,
    contractAddress
  }: {
    address: string;
    contractAddress: string;
  }) {
    const client = await this.contract.amaciQueryClient({ contractAddress });
    return client.getStateIdxInc({ address });
  }

  async getVoiceCreditBalance({
    stateIdx,
    contractAddress
  }: {
    stateIdx: number;
    contractAddress: string;
  }) {
    const client = await this.contract.amaciQueryClient({ contractAddress });
    return client.getVoiceCreditBalance({ index: stateIdx.toString() });
  }

  async getStateIdxByPubKey({
    contractAddress,
    pubKey
  }: {
    contractAddress: string;
    pubKey: bigint[];
  }) {
    const response = await this.indexer.getSignUpEventByPubKey(contractAddress, pubKey);

    if (isErrorResponse(response)) {
      return -1;
    }
    return response.data.signUpEvents[0].stateIdx;
  }

  async feegrantAllowance({
    address,
    contractAddress
  }: {
    address: string;
    contractAddress: string;
  }) {
    try {
      const response = await this.oracleCertificate.feegrantAllowance(contractAddress, address);
      return response;
    } catch (error) {
      return {
        granter: contractAddress,
        grantee: address,
        spend_limit: []
      };
    }
  }

  async hasFeegrant({
    address,
    contractAddress
  }: {
    address: string;
    contractAddress: string;
  }): Promise<boolean> {
    try {
      const response = await this.oracleCertificate.feegrantAllowance(contractAddress, address);
      return response.spend_limit.length > 0;
    } catch (error) {
      return false;
    }
  }

  async queryRegistrationStatus({
    contractAddress,
    address,
    pubkey,
    certificate,
    amount
  }: {
    contractAddress: string;
    /** For SignUpWithStaticWhitelist: the user's wallet address */
    address?: string;
    /** For SignUpWithOracle / PrePopulated: the user's MACI pubkey */
    pubkey?: { x: string; y: string };
    /** For SignUpWithOracle: the oracle-issued certificate (base64 signature) */
    certificate?: string;
    /** For SignUpWithOracle + Dynamic VoiceCreditMode: the amount included in the certificate */
    amount?: string;
  }): Promise<RegistrationStatus> {
    const client = await this.contract.amaciQueryClient({ contractAddress });

    return client.queryRegistrationStatus({
      sender: address,
      pubkey,
      certificate,
      amount
    });
  }

  async getOracleWhitelistConfig({
    contractAddress
  }: {
    contractAddress: string;
  }): Promise<NullableString> {
    const client = await this.contract.amaciQueryClient({ contractAddress });
    return client.queryOracleWhitelistConfig();
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

  async queryRoundClaimable({ contractAddress }: { contractAddress: string }): Promise<{
    claimable: boolean | null;
    balance: string | null;
  }> {
    try {
      const roundInfo = await this.getRoundInfo({ contractAddress });

      if (roundInfo.maciType !== 'aMACI') {
        return {
          claimable: null,
          balance: null
        };
      }

      const votingEndTime = new Date(Number(roundInfo.votingEnd) / 10 ** 6);
      const currentTime = new Date();
      const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;

      if (currentTime.getTime() - votingEndTime.getTime() <= threeDaysInMs) {
        return {
          claimable: null,
          balance: null
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
          balance: roundBalance.data.balance
        };
      }

      return {
        claimable: false,
        balance: roundBalance.data.balance
      };
    } catch (error) {
      console.error('Error in queryRoundClaimable:', error);
      return {
        claimable: null,
        balance: null
      };
    }
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
    height
  }: {
    signer: OfflineSigner;
    ecosystem: CertificateEcosystem;
    address?: string;
    contractAddress: string;
    height?: string;
  }): Promise<SignatureResponse> {
    if (!address) {
      address = (await signer.getAccounts())[0].address;
    }

    const signResponse = await this.oracleCertificate.sign({
      ecosystem,
      address,
      contractAddress,
      height: height || '0'
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
    fee
  }: {
    signer: OfflineSigner;
    address?: string;
    contractAddress: string;
    maciKeypair?: Keypair;
    oracleCertificate?: {
      amount?: string;
      signature: string;
    };
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }) {
    try {
      if (!address) {
        address = (await signer.getAccounts())[0].address;
      }

      if (maciKeypair === undefined) {
        maciKeypair = this.maciKeypair;
      }

      const client = await this.contract.contractClient({
        signer
      });

      // Unified signup using MACI client (supports Oracle whitelist)
      const msg = {
        sign_up: {
          pubkey: {
            x: maciKeypair.pubKey[0].toString(),
            y: maciKeypair.pubKey[1].toString()
          },
          amount: oracleCertificate?.amount || '0',
          certificate: oracleCertificate?.signature || ''
        }
      };

      const signupFunds = [{ denom: FEE_DENOM, amount: this.feeConfig.signupFee }];

      if (gasStation === true && typeof fee !== 'object') {
        // When gasStation is true and fee is not StdFee, simulate first then add granter
        const gasEstimation = await client.simulate(
          address,
          [
            {
              typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
              value: {
                sender: address,
                contract: contractAddress,
                msg: new TextEncoder().encode(JSON.stringify(msg)),
                funds: signupFunds
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
          granter: contractAddress
        };
        return client.execute(address, contractAddress, msg, grantFee, undefined, signupFunds);
      } else if (gasStation === true && typeof fee === 'object') {
        // When gasStation is true and fee is StdFee, add granter
        const grantFee: StdFee = {
          ...fee,
          granter: contractAddress
        };
        return client.execute(address, contractAddress, msg, grantFee, undefined, signupFunds);
      }

      return client.execute(address, contractAddress, msg, fee || 'auto', undefined, signupFunds);
    } catch (error) {
      throw Error(`Signup failed! ${error}`);
    }
  }

  async rawSignup({
    signer,
    address,
    contractAddress,
    pubKey,
    oracleCertificate,
    gasStation = false,
    granter,
    fee
  }: {
    signer: OfflineSigner;
    address?: string;
    contractAddress: string;
    pubKey: PubKey;
    oracleCertificate?: {
      amount?: string;
      signature: string;
    };
    gasStation?: boolean;
    granter?: string;
    fee?: StdFee | 'auto' | number;
  }) {
    try {
      if (!address) {
        address = (await signer.getAccounts())[0].address;
      }

      const client = await this.contract.contractClient({
        signer
      });

      // Unified signup using MACI client (supports Oracle whitelist)
      const msg = {
        sign_up: {
          pubkey: {
            x: pubKey[0].toString(),
            y: pubKey[1].toString()
          },
          amount: oracleCertificate?.amount || '0',
          certificate: oracleCertificate?.signature || ''
        }
      };

      const signupFunds = [{ denom: FEE_DENOM, amount: this.feeConfig.signupFee }];

      if (gasStation === true && granter === this.contract.apiSaasAddress) {
        // SAAS path: the SAAS contract covers signup_fee from its own balance;
        // the operator's gas is covered by feegrant from the SAAS contract.
        return this.contract.signupViaSaas({
          signer,
          contractAddress,
          pubkey: {
            x: pubKey[0].toString(),
            y: pubKey[1].toString()
          },
          certificate: oracleCertificate?.signature,
          amount: oracleCertificate?.amount,
          granter,
          fee
        });
      } else if (gasStation === true && typeof fee !== 'object') {
        // When gasStation is true and fee is not StdFee, simulate first then add granter
        const gasEstimation = await client.simulate(
          address,
          [
            {
              typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
              value: {
                sender: address,
                contract: contractAddress,
                msg: new TextEncoder().encode(JSON.stringify(msg)),
                funds: signupFunds
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
          granter: granter || contractAddress
        };
        return client.execute(address, contractAddress, msg, grantFee, undefined, signupFunds);
      } else if (gasStation === true && typeof fee === 'object') {
        // When gasStation is true and fee is StdFee, add granter
        const grantFee: StdFee = {
          ...fee,
          granter: granter || contractAddress
        };
        return client.execute(address, contractAddress, msg, grantFee, undefined, signupFunds);
      }

      return client.execute(address, contractAddress, msg, fee || 'auto', undefined, signupFunds);
    } catch (error) {
      throw Error(`Signup failed! ${error}`);
    }
  }

  private async processVoteOptions({
    selectedOptions,
    contractAddress,
    voiceCreditBalance
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
        throw new Error(`Duplicate option index (${option.idx}) is not allowed`);
      }
      idxSet.add(option.idx);
    }

    // Filter and sort options
    const options = selectedOptions.filter((o) => !!o.vc).sort((a, b) => a.idx - b.idx);

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
    contractAddress,
    selectedOptions,
    operatorCoordPubKey,
    maciKeypair,
    gasStation = false,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    address?: string;
    contractAddress: string;
    selectedOptions: {
      idx: number;
      vc: number;
    }[];
    operatorCoordPubKey: PubKey;
    maciKeypair?: Keypair;
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }) {
    if (maciKeypair === undefined) {
      maciKeypair = this.maciKeypair;
    }

    const stateIdx = await this.getStateIdxByPubKey({
      contractAddress,
      pubKey: maciKeypair.pubKey
    });

    if (stateIdx === -1) {
      throw new Error('State index is not set, Please signup or addNewKey first');
    }

    try {
      const round = await this.indexer.getRoundWithFields(contractAddress, [
        'maciType',
        'voiceCreditAmount'
      ]);

      if (isErrorResponse(round)) {
        throw new Error(`Failed to get round info: ${round.error.type} ${round.error.message}`);
      }

      let voiceCreditBalance;
      if (round.data.round.maciType === 'aMACI') {
        const round = await this.indexer.getRoundWithFields(contractAddress, ['voiceCreditAmount']);

        if (!isErrorResponse(round)) {
          if (round.data.round.voiceCreditAmount) {
            voiceCreditBalance = round.data.round.voiceCreditAmount;
          } else {
            voiceCreditBalance = '0';
          }
        } else {
          throw new Error(
            `Failed to query amaci voice credit: ${round.error.type} ${round.error.message}`
          );
        }
      } else {
        voiceCreditBalance = await this.getVoiceCreditBalance({
          stateIdx,
          contractAddress
        });
      }

      const options = await this.processVoteOptions({
        selectedOptions,
        contractAddress,
        voiceCreditBalance
      });
      if (!address) {
        address = (await signer.getAccounts())[0].address;
      }

      const plan = options.map((o) => {
        return [o.idx, o.vc] as [number, number];
      });

      // Get poll_id from contract
      const pollId = await this.getPollId({ contractAddress });

      const payload = batchGenMessage(
        stateIdx,
        maciKeypair,
        operatorCoordPubKey,
        plan,
        Number(pollId)
      );

      // Use batch publish for amaci
      if (round.data.round.maciType === 'aMACI') {
        return await this.publishMessageBatch({
          signer,
          address,
          payload,
          contractAddress,
          gasStation,
          fee
        });
      }

      const client = await this.contract.contractClient({
        signer
      });

      return await this.publishMessage({
        client,
        address,
        payload,
        contractAddress,
        gasStation,
        fee
      });
    } catch (error) {
      throw Error(`Vote failed! ${error}`);
    }
  }

  async rawVote({
    signer,
    address,
    contractAddress,
    payload,
    gasStation = false,
    granter,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    address?: string;
    contractAddress: string;
    payload: {
      msg: bigint[];
      encPubkeys: PubKey;
    }[];
    gasStation?: boolean;
    granter?: string;
    fee?: StdFee | 'auto' | number;
  }) {
    try {
      if (!address) {
        address = (await signer.getAccounts())[0].address;
      }

      const msgLength = payload[0]?.msg.length ?? 0;

      if (msgLength === 7) {
        return await this.publishMessageBatchLegacy({
          signer,
          address,
          payload,
          contractAddress,
          gasStation,
          granter,
          fee
        });
      }

      return await this.publishMessageBatch({
        signer,
        address,
        payload,
        contractAddress,
        gasStation,
        granter,
        fee
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
    granter,
    fee = 1.8
  }: {
    client: SigningCosmWasmClient;
    address: string;
    payload: {
      msg: bigint[];
      encPubkeys: PubKey;
    }[];
    contractAddress: string;
    gasStation: boolean;
    granter?: string;
    fee?: StdFee | 'auto' | number;
  }) {
    const msgs: MsgExecuteContractEncodeObject[] = payload.map(({ msg, encPubkeys }) => ({
      typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
      value: MsgExecuteContract.fromPartial({
        sender: address,
        contract: contractAddress,
        msg: new TextEncoder().encode(
          JSON.stringify(
            stringizing({
              publish_message: {
                messages: [{ data: msg }],
                enc_pub_keys: [{ x: encPubkeys[0], y: encPubkeys[1] }]
              }
            })
          )
        ),
        funds: [{ denom: FEE_DENOM, amount: this.feeConfig.messageFee }]
      })
    }));

    if (gasStation && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const gasEstimation = await client.simulate(address, msgs, '');
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(Math.round(gasEstimation * multiplier), gasPrice);
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: granter || contractAddress
      };
      return client.signAndBroadcast(address, msgs, grantFee);
    } else if (gasStation && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: granter || contractAddress
      };
      return client.signAndBroadcast(address, msgs, grantFee);
    }

    return client.signAndBroadcast(address, msgs, fee);
  }

  async publishMessageBatch({
    signer,
    address,
    payload,
    contractAddress,
    gasStation,
    granter,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    address?: string;
    payload: {
      msg: bigint[];
      encPubkeys: PubKey;
    }[];
    contractAddress: string;
    gasStation?: boolean;
    granter?: string;
    fee?: StdFee | 'auto' | number;
  }) {
    if (!address) {
      address = (await signer.getAccounts())[0].address;
    }

    const amaciClient = await this.contract.amaciClient({
      signer,
      contractAddress
    });

    const messages = payload.map((p) => ({
      data: p.msg.map((m) => m.toString()) as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    }));

    const encPubKeys = payload.map((p) => ({
      x: p.encPubkeys[0].toString(),
      y: p.encPubkeys[1].toString()
    }));

    // Total fee: messageFee per message (use cached feeConfig, call fetchFeeConfig() to refresh)
    const totalFee = (BigInt(this.feeConfig.messageFee) * BigInt(payload.length)).toString();
    const batchFunds = [{ denom: FEE_DENOM, amount: totalFee }];

    if (gasStation && granter === this.contract.apiSaasAddress) {
      // SAAS path: the SAAS contract covers message fees from its own balance;
      // the operator's gas is covered by feegrant from the SAAS contract.
      return this.contract.publishMessageViaSaas({
        signer,
        contractAddress,
        encPubKeys,
        messages,
        granter,
        fee
      });
    } else if (gasStation && typeof fee !== 'object') {
      // Standard feegrant path: granter covers the operator's gas via feegrant,
      // but the caller's account still pays batchFunds directly.
      const client = await this.contract.contractClient({ signer });
      const msgForSimulate: MsgExecuteContractEncodeObject = {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: MsgExecuteContract.fromPartial({
          sender: address,
          contract: contractAddress,
          msg: new TextEncoder().encode(
            JSON.stringify({ publish_message: { enc_pub_keys: encPubKeys, messages } })
          ),
          funds: batchFunds
        })
      };
      const gasEstimation = await client.simulate(address, [msgForSimulate], '');
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(Math.round(gasEstimation * multiplier), gasPrice);
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: granter || contractAddress
      };
      return amaciClient.publishMessage({ encPubKeys, messages }, grantFee, undefined, batchFunds);
    } else if (gasStation && typeof fee === 'object') {
      // Standard feegrant path with pre-built StdFee.
      const grantFee: StdFee = {
        ...fee,
        granter: granter || contractAddress
      };
      return amaciClient.publishMessage({ encPubKeys, messages }, grantFee, undefined, batchFunds);
    }

    return amaciClient.publishMessage({ encPubKeys, messages }, fee, undefined, batchFunds);
  }

  async publishMessageBatchLegacy({
    signer,
    address,
    payload,
    contractAddress,
    gasStation,
    granter,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    address?: string;
    payload: {
      msg: bigint[];
      encPubkeys: PubKey;
    }[];
    contractAddress: string;
    gasStation?: boolean;
    granter?: string;
    fee?: StdFee | 'auto' | number;
  }) {
    if (!address) {
      address = (await signer.getAccounts())[0].address;
    }

    const client = await this.contract.contractClient({ signer });

    const messages = payload.map((p) => ({
      data: p.msg
    }));

    const encPubKeys = payload.map((p) => ({
      x: p.encPubkeys[0],
      y: p.encPubkeys[1]
    }));

    const totalFee = (BigInt(this.feeConfig.messageFee) * BigInt(payload.length)).toString();
    const batchFunds = [{ denom: FEE_DENOM, amount: totalFee }];

    const msg: MsgExecuteContractEncodeObject = {
      typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
      value: MsgExecuteContract.fromPartial({
        sender: address,
        contract: contractAddress,
        msg: new TextEncoder().encode(
          JSON.stringify(
            stringizing({
              publish_message_batch: {
                enc_pub_keys: encPubKeys,
                messages
              }
            })
          )
        ),
        funds: batchFunds
      })
    };

    if (gasStation && typeof fee !== 'object') {
      const gasEstimation = await client.simulate(address, [msg], '');
      const multiplier = typeof fee === 'number' ? fee : 1.8;
      const gasPrice = GasPrice.fromString('10000000000peaka');
      const calculatedFee = calculateFee(Math.round(gasEstimation * multiplier), gasPrice);
      const grantFee: StdFee = {
        amount: calculatedFee.amount,
        gas: calculatedFee.gas,
        granter: granter || contractAddress
      };
      return client.signAndBroadcast(address, [msg], grantFee);
    } else if (gasStation && typeof fee === 'object') {
      const grantFee: StdFee = {
        ...fee,
        granter: granter || contractAddress
      };
      return client.signAndBroadcast(address, [msg], grantFee);
    }

    return client.signAndBroadcast(address, [msg], fee);
  }

  async deactivate({
    signer,
    address,
    maciKeypair,
    contractAddress,
    gasStation,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    address?: string;
    maciKeypair?: Keypair;
    contractAddress: string;
    gasStation?: boolean;
    fee?: StdFee | 'auto' | number;
  }) {
    try {
      address = address || (await signer.getAccounts())[0].address;

      if (maciKeypair === undefined) {
        maciKeypair = this.maciKeypair;
      }

      const client = await this.contract.contractClient({
        signer
      });

      const stateIdx = await this.getStateIdxInc({
        address,
        contractAddress
      });

      const operatorCoordPubKey = await this.getRoundInfo({
        contractAddress
      });

      // Get poll_id from contract
      const pollId = await this.getPollId({ contractAddress });

      const payload = batchGenMessage(
        Number(stateIdx),
        maciKeypair,
        [
          BigInt(operatorCoordPubKey.coordinatorPubkeyX),
          BigInt(operatorCoordPubKey.coordinatorPubkeyY)
        ],
        [[0, 0]],
        Number(pollId)
      );

      const { msg, encPubkeys } = payload[0];

      const deactivateMsg = stringizing({
        publish_deactivate_message: {
          enc_pub_key: {
            x: encPubkeys[0],
            y: encPubkeys[1]
          },
          message: {
            data: msg
          }
        }
      });

      const deactivateFunds = [{ denom: FEE_DENOM, amount: this.feeConfig.deactivateFee }];

      if (gasStation === true && typeof fee !== 'object') {
        // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
        const gasEstimation = await client.simulate(
          address,
          [
            {
              typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
              value: MsgExecuteContract.fromPartial({
                sender: address,
                contract: contractAddress,
                msg: new TextEncoder().encode(JSON.stringify(deactivateMsg)),
                funds: deactivateFunds
              })
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
          granter: contractAddress
        };
        return client.execute(address, contractAddress, deactivateMsg, grantFee, undefined, deactivateFunds);
      } else if (gasStation === true && typeof fee === 'object') {
        // When gasStation is true and fee is StdFee, add granter
        const grantFee: StdFee = {
          ...fee,
          granter: contractAddress
        };
        return client.execute(address, contractAddress, deactivateMsg, grantFee, undefined, deactivateFunds);
      }

      return client.execute(address, contractAddress, deactivateMsg, fee, undefined, deactivateFunds);
    } catch (error) {
      throw Error(`Submit deactivate failed! ${error}`);
    }
  }

  async rawDeactivate({
    signer,
    address,
    contractAddress,
    payload,
    gasStation = false,
    granter,
    fee = 1.8
  }: {
    signer: OfflineSigner;
    address?: string;
    contractAddress: string;
    payload: {
      msg: bigint[];
      encPubkeys: PubKey;
    };
    gasStation?: boolean;
    granter?: string;
    fee?: StdFee | 'auto' | number;
  }) {
    try {
      address = address || (await signer.getAccounts())[0].address;

      const { msg, encPubkeys } = payload;

      if (gasStation === true && granter === this.contract.apiSaasAddress) {
        // SAAS path: the SAAS contract covers the deactivate fee from its own balance;
        // the operator's gas is covered by feegrant from the SAAS contract.
        return this.contract.publishDeactivateMessageViaSaas({
          signer,
          contractAddress,
          encPubKey: {
            x: encPubkeys[0].toString(),
            y: encPubkeys[1].toString()
          },
          message: {
            data: msg.map((m) => m.toString())
          },
          granter,
          fee
        });
      }

      const client = await this.contract.contractClient({ signer });

      const deactivateMsg = stringizing({
        publish_deactivate_message: {
          enc_pub_key: {
            x: encPubkeys[0],
            y: encPubkeys[1]
          },
          message: {
            data: msg
          }
        }
      });

      const deactivateFunds = [{ denom: FEE_DENOM, amount: this.feeConfig.deactivateFee }];

      if (gasStation === true && typeof fee !== 'object') {
        // Standard feegrant path: granter covers the operator's gas via feegrant,
        // but the caller's account still pays deactivateFunds directly.
        const gasEstimation = await client.simulate(
          address,
          [
            {
              typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
              value: MsgExecuteContract.fromPartial({
                sender: address,
                contract: contractAddress,
                msg: new TextEncoder().encode(JSON.stringify(deactivateMsg)),
                funds: deactivateFunds
              })
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
          granter: granter || contractAddress
        };
        return client.execute(address, contractAddress, deactivateMsg, grantFee, undefined, deactivateFunds);
      } else if (gasStation === true && typeof fee === 'object') {
        // Standard feegrant path with pre-built StdFee.
        const grantFee: StdFee = {
          ...fee,
          granter: granter || contractAddress
        };
        return client.execute(address, contractAddress, deactivateMsg, grantFee, undefined, deactivateFunds);
      }

      return client.execute(address, contractAddress, deactivateMsg, fee, undefined, deactivateFunds);
    } catch (error) {
      throw Error(`Submit deactivate failed! ${error}`);
    }
  }

  async fetchAllDeactivateLogs({ contractAddress }: { contractAddress: string }) {
    const deactivates = await this.indexer.fetchAllDeactivateLogs(contractAddress);
    return deactivates;
  }

  async genAddKeyInput({
    maciKeypair,
    newMaciKeypair,
    contractAddress
  }: {
    maciKeypair: Keypair;
    newMaciKeypair: Keypair;
    contractAddress: string;
  }) {
    const deactivates = await this.fetchAllDeactivateLogs({
      contractAddress
    });

    const roundInfo = await this.getRoundInfo({
      contractAddress
    });

    const pollId = await this.getPollId({ contractAddress });

    const circuitPower = roundInfo.circuitPower;
    const stateTreeDepth = Number(circuitPower.split('-')[0]);
    const inputObj = genAddKeyInput(stateTreeDepth + 2, {
      coordPubKey: [BigInt(roundInfo.coordinatorPubkeyX), BigInt(roundInfo.coordinatorPubkeyY)],
      oldKey: maciKeypair,
      deactivates: deactivates.map((d: any) => d.map(BigInt)),
      newPubKey: newMaciKeypair.pubKey,
      pollId: BigInt(pollId)
    });
    return inputObj;
  }

  async addNewKey({
    signer,
    contractAddress,
    d,
    proof,
    nullifier,
    newMaciKeypair,
    fee = 'auto'
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    d: string[];
    proof: Groth16ProofType;
    nullifier: bigint;
    newMaciKeypair: Keypair;
    fee?: number | StdFee | 'auto';
  }) {
    const client = await this.contract.amaciClient({
      signer,
      contractAddress
    });

    const signupFunds = [{ denom: FEE_DENOM, amount: this.feeConfig.signupFee }];
    return await client.addNewKey(
      {
        d,
        groth16Proof: proof,
        nullifier: nullifier.toString(),
        pubkey: {
          x: newMaciKeypair.pubKey[0].toString(),
          y: newMaciKeypair.pubKey[1].toString()
        }
      },
      fee,
      undefined,
      signupFunds
    );
  }

  async rawAddNewKey({
    signer,
    contractAddress,
    d,
    proof,
    nullifier,
    newPubkey,
    gasStation = false,
    granter,
    fee = 'auto'
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    d: string[];
    proof: Groth16ProofType;
    nullifier: bigint;
    newPubkey: PubKey;
    gasStation?: boolean;
    granter?: string;
    fee?: number | StdFee | 'auto';
  }) {
    const client = await this.contract.amaciClient({
      signer,
      contractAddress
    });

    const signupFunds = [{ denom: FEE_DENOM, amount: this.feeConfig.signupFee }];
    const keyParams = {
      d,
      groth16Proof: proof,
      nullifier: nullifier.toString(),
      pubkey: {
        x: newPubkey[0].toString(),
        y: newPubkey[1].toString()
      }
    };

    if (gasStation === true && granter === this.contract.apiSaasAddress) {
      // SAAS path: the SAAS contract covers signup_fee from its own balance;
      // the operator's gas is covered by feegrant from the SAAS contract.
      return this.contract.addNewKeyViaSaas({
        signer,
        contractAddress,
        pubkey: keyParams.pubkey,
        nullifier: keyParams.nullifier,
        d,
        groth16Proof: proof,
        granter,
        fee
      });
    } else if (gasStation === true && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contract.contractClient({ signer });

      const msg = {
        add_new_key: {
          d,
          groth16_proof: proof,
          nullifier: nullifier.toString(),
          pubkey: {
            x: newPubkey[0].toString(),
            y: newPubkey[1].toString()
          }
        }
      };

      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: contractAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg)),
              funds: signupFunds
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
        granter: granter || contractAddress
      };

      return await client.addNewKey(keyParams, grantFee, undefined, signupFunds);
    } else if (gasStation === true && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: granter || contractAddress
      };

      return await client.addNewKey(keyParams, grantFee, undefined, signupFunds);
    }

    return await client.addNewKey(keyParams, fee, undefined, signupFunds);
  }

  async rawPreAddNewKey({
    signer,
    contractAddress,
    d,
    proof,
    nullifier,
    newPubkey,
    gasStation = false,
    granter,
    fee = 'auto'
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    d: string[];
    proof: Groth16ProofType;
    nullifier: bigint;
    newPubkey: PubKey;
    gasStation?: boolean;
    granter?: string;
    fee?: number | StdFee | 'auto';
  }) {
    const client = await this.contract.amaciClient({
      signer,
      contractAddress
    });

    const signupFunds = [{ denom: FEE_DENOM, amount: this.feeConfig.signupFee }];
    const keyParams = {
      d,
      groth16Proof: proof,
      nullifier: nullifier.toString(),
      pubkey: {
        x: newPubkey[0].toString(),
        y: newPubkey[1].toString()
      }
    };

    if (gasStation === true && granter === this.contract.apiSaasAddress) {
      // SAAS path: the SAAS contract covers signup_fee from its own balance;
      // the operator's gas is covered by feegrant from the SAAS contract.
      return this.contract.preAddNewKeyViaSaas({
        signer,
        contractAddress,
        pubkey: keyParams.pubkey,
        nullifier: keyParams.nullifier,
        d,
        groth16Proof: proof,
        granter,
        fee
      });
    } else if (gasStation === true && typeof fee !== 'object') {
      // When gasStation is true and fee is not StdFee, we need to simulate first then add granter
      const [{ address }] = await signer.getAccounts();
      const contractClient = await this.contract.contractClient({ signer });

      const msg = {
        pre_add_new_key: {
          d,
          groth16_proof: proof,
          nullifier: nullifier.toString(),
          pubkey: {
            x: newPubkey[0].toString(),
            y: newPubkey[1].toString()
          }
        }
      };

      const gasEstimation = await contractClient.simulate(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: address,
              contract: contractAddress,
              msg: new TextEncoder().encode(JSON.stringify(msg)),
              funds: signupFunds
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
        granter: granter || contractAddress
      };

      return await client.preAddNewKey(keyParams, grantFee, undefined, signupFunds);
    } else if (gasStation === true && typeof fee === 'object') {
      // When gasStation is true and fee is StdFee, add granter
      const grantFee: StdFee = {
        ...fee,
        granter: granter || contractAddress
      };

      return await client.preAddNewKey(keyParams, grantFee, undefined, signupFunds);
    }

    return await client.preAddNewKey(keyParams, fee, undefined, signupFunds);
  }

  async claimAMaciRound({
    signer,
    contractAddress,
    fee = 'auto'
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    fee?: number | StdFee | 'auto';
  }) {
    const client = await this.contract.amaciClient({
      signer,
      contractAddress
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
    fee = 'auto'
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    amount: string;
    address?: string;
    fee?: number | StdFee | 'auto';
  }) {
    const client = await this.contract.contractClient({
      signer
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
                  max_amount: BigInt('100000000000000000000000')
                }
              })
            )
          )
        })
      },
      {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: MsgExecuteContract.fromPartial({
          sender: address,
          contract: contractAddress,
          msg: new TextEncoder().encode(
            JSON.stringify(
              stringizing({
                bond: {}
              })
            )
          ),
          funds: [
            {
              denom: 'peaka',
              amount
            }
          ]
        })
      }
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
    fee = 'auto'
  }: {
    signer: OfflineSigner;
    contractAddress: string;
    address?: string;
    fee?: number | StdFee | 'auto';
  }) {
    const client = await this.contract.contractClient({
      signer
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
                withdraw: {}
              })
            )
          )
        })
      },
      {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: MsgExecuteContract.fromPartial({
          sender: address,
          contract: contractAddress,
          msg: new TextEncoder().encode(
            JSON.stringify(
              stringizing({
                revoke: {}
              })
            )
          )
        })
      }
    ];

    try {
      const result = await client.signAndBroadcast(address, msgs, fee);
      return result;
    } catch (err) {
      throw err;
    }
  }
}
