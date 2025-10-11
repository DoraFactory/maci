import CryptoJS from 'crypto-js';
import { solidityPackedSha256 } from 'ethers';
import { groth16, ZKArtifact } from 'snarkjs';

import { MaciAccount } from './libs/account';
import { MaciApiClient } from './libs/api';
import type { operations, paths } from './libs/api/types';
import {
  packPubKey,
  unpackPubKey,
  genEcdhSharedKey,
  genKeypair,
  genRandomSalt,
  rerandomize,
  Tree,
  stringizing,
  SNARK_FIELD_SIZE,
  adaptToUncompressed
} from './libs/crypto';
import { poseidon } from './libs/crypto/hashing';
import { poseidonEncrypt } from '@zk-kit/poseidon-cipher';
import { VoterClientParams, DerivePathParams, PubKey, PrivKey, DeactivateMessage } from './types';
import { Indexer, Http } from './libs';
import { getDefaultParams } from './libs/const';
import { isErrorResponse } from './libs/maci/maci';

/**
 * @class Maci Voter Client
 * @description This class is used to interact with Maci Voter Client.
 */
export class VoterClient {
  public network: 'mainnet' | 'testnet';

  public accountManager: MaciAccount;
  public saasApiClient: MaciApiClient;

  public http: Http;
  public indexer: Indexer;

  public restEndpoint: string;
  public apiEndpoint: string;
  public saasApiEndpoint: string;
  public registryAddress: string;

  /**
   * @constructor
   * @param {VoterClientParams} params - The parameters for the Maci Voter Client instance.
   */
  constructor({
    network,
    mnemonic,
    secretKey,
    apiEndpoint,
    restEndpoint,
    saasApiEndpoint,
    saasApiKey,
    registryAddress,
    customFetch,
    defaultOptions
  }: VoterClientParams) {
    this.network = network;
    this.accountManager = new MaciAccount({ mnemonic, secretKey });

    const defaultParams = getDefaultParams(network);

    this.restEndpoint = restEndpoint || defaultParams.restEndpoint;
    this.apiEndpoint = apiEndpoint || defaultParams.apiEndpoint; // Indexer GraphQL API
    this.saasApiEndpoint = saasApiEndpoint || defaultParams.saasApiEndpoint; // MACI SaaS API
    this.registryAddress = registryAddress || defaultParams.registryAddress;

    this.http = new Http(this.apiEndpoint, this.restEndpoint, customFetch, defaultOptions);
    this.indexer = new Indexer({
      restEndpoint: this.restEndpoint,
      apiEndpoint: this.apiEndpoint, // Indexer GraphQL API
      registryAddress: this.registryAddress,
      http: this.http
    });

    // Initialize SaaS API client if saasApiEndpoint is provided
    this.saasApiClient = new MaciApiClient({
      baseUrl: this.saasApiEndpoint,
      apiKey: saasApiKey,
      customFetch
    });
  }

  /**
   * Set SaaS API key for MaciApiClient
   */
  setSaasApiKey(apiKey: string) {
    if (!this.saasApiClient) {
      throw new Error(
        'SaaS API client not initialized. Please provide saasApiEndpoint in constructor.'
      );
    }
    this.saasApiClient.setApiKey(apiKey);
  }

  /**
   * Get SaaS API client instance
   */
  getSaasApiClient(): MaciApiClient {
    if (!this.saasApiClient) {
      throw new Error(
        'SaaS API client not initialized. Please provide saasApiEndpoint in constructor.'
      );
    }
    return this.saasApiClient;
  }

  /**
   * else:
   * it will generate signer from the mnemonic with the given derivePathParams.
   * @param derivePathParams, such as { accountIndex: 2, isExternal: false, addressIndex: 10 }, comply with the BIP44 standard
   */
  getSigner(derivePathParams?: DerivePathParams) {
    return this.accountManager.getKeyPair(derivePathParams);
  }

  packMaciPubkey(pubkey?: PubKey) {
    return packPubKey(pubkey || this.accountManager.currentPubkey.toPoints());
  }

  unpackMaciPubkey(pubkey: bigint | string) {
    return unpackPubKey(BigInt(pubkey));
  }

  getPubkey(derivePathParams?: DerivePathParams) {
    return this.accountManager.getKeyPair(derivePathParams).getPublicKey();
  }

  buildVotePayload({
    stateIdx,
    operatorPubkey,
    selectedOptions,
    derivePathParams
  }: {
    stateIdx: number;
    operatorPubkey: bigint;
    selectedOptions: {
      idx: number;
      vc: number;
    }[];
    derivePathParams?: DerivePathParams;
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

    const plan = options.map((o) => {
      return [o.idx, o.vc] as [number, number];
    });

    const payload = this.batchGenMessage(stateIdx, operatorPubkey, plan, derivePathParams);

    return stringizing(payload) as {
      msg: string[];
      encPubkeys: string[];
    }[];
  }

  batchGenMessage(
    stateIdx: number,
    operatorPubkey: bigint,
    plan: [number, number][],
    derivePathParams?: DerivePathParams
  ) {
    const genMessage = this.genMessageFactory(stateIdx, operatorPubkey, derivePathParams);

    const payload = [];
    for (let i = plan.length - 1; i >= 0; i--) {
      const p = plan[i];
      const encAccount = genKeypair();
      const msg = genMessage(BigInt(encAccount.privKey), i + 1, p[0], p[1], i === plan.length - 1);

      payload.push({
        msg,
        encPubkeys: encAccount.pubKey
      });
    }

    return payload;
  }

  genMessageFactory(
    stateIdx: number,
    operatorPubkey: bigint,
    // signPriKey: PrivKey,
    // signPubKey: PubKey,
    // coordPubKey: PubKey,
    derivePathParams?: DerivePathParams
  ) {
    return (
      encPriKey: PrivKey,
      nonce: number,
      voIdx: number,
      newVotes: number,
      isLastCmd: boolean,
      salt?: bigint
    ): bigint[] => {
      if (!salt) {
        // uint56
        salt = BigInt(`0x${CryptoJS.lib.WordArray.random(7).toString(CryptoJS.enc.Hex)}`);
      }

      const packaged =
        BigInt(nonce) +
        (BigInt(stateIdx) << 32n) +
        (BigInt(voIdx) << 64n) +
        (BigInt(newVotes) << 96n) +
        (BigInt(salt) << 192n);

      const signer = this.getSigner(derivePathParams);

      let newPubKey = [...signer.getPublicKey().toPoints()];
      if (isLastCmd) {
        newPubKey = [0n, 0n];
      }

      const hash = poseidon([packaged, ...newPubKey]);
      // const signature = signMessage(bigInt2Buffer(signPriKey), hash);
      const signature = signer.sign(hash);

      const command = [packaged, ...newPubKey, ...signature.R8, signature.S];
      const coordPubkey = this.unpackMaciPubkey(operatorPubkey);

      const message = poseidonEncrypt(command, genEcdhSharedKey(encPriKey, coordPubkey), 0n);

      return message;
    };
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

  async buildAddNewKeyPayload({
    stateTreeDepth,
    operatorPubkey,
    deactivates,
    wasmFile,
    zkeyFile,
    derivePathParams
  }: {
    stateTreeDepth: number;
    operatorPubkey: bigint;
    deactivates: DeactivateMessage[];
    wasmFile: ZKArtifact;
    zkeyFile: ZKArtifact;
    derivePathParams?: DerivePathParams;
  }): Promise<{
    proof: {
      a: string;
      b: string;
      c: string;
    };
    d: string[];
    nullifier: string;
  }> {
    const [coordPubkeyX, coordPubkeyY] = this.unpackMaciPubkey(operatorPubkey);
    // const stateTreeDepth = Number(circuitPower.split('-')[0]);
    const addKeyInput = await this.genAddKeyInput(stateTreeDepth + 2, {
      coordPubKey: [coordPubkeyX, coordPubkeyY],
      deactivates: deactivates.map((d: any) => d.map(BigInt)),
      derivePathParams
    });

    if (addKeyInput === null) {
      throw Error('genAddKeyInput failed');
    }

    // 1. generate proof
    const { proof } = await groth16.fullProve(addKeyInput, wasmFile, zkeyFile);

    // 2. compress proof to vote proof
    const proofHex = await adaptToUncompressed(proof);

    // 3. send addNewKey tx
    return {
      proof: proofHex,
      d: [
        addKeyInput.d1[0].toString(),
        addKeyInput.d1[1].toString(),
        addKeyInput.d2[0].toString(),
        addKeyInput.d2[1].toString()
      ],
      nullifier: addKeyInput.nullifier.toString()
    };
  }

  async buildPreAddNewKeyPayload({
    stateTreeDepth,
    coordinatorPubkey,
    deactivates,
    wasmFile,
    zkeyFile,
    derivePathParams
  }: {
    stateTreeDepth: number;
    coordinatorPubkey: bigint;
    deactivates: bigint[][];
    wasmFile: ZKArtifact;
    zkeyFile: ZKArtifact;
    derivePathParams?: DerivePathParams;
  }): Promise<{
    proof: {
      a: string;
      b: string;
      c: string;
    };
    d: string[];
    nullifier: string;
  }> {
    const [coordPubkeyX, coordPubkeyY] = this.unpackMaciPubkey(coordinatorPubkey);
    // const stateTreeDepth = Number(circuitPower.split('-')[0]);
    const addKeyInput = await this.genPreAddKeyInput(stateTreeDepth + 2, {
      coordPubKey: [coordPubkeyX, coordPubkeyY],
      deactivates: deactivates.map((d: any) => d.map(BigInt)),
      derivePathParams
    });

    if (addKeyInput === null) {
      throw Error('genPreAddKeyInput failed, cannot find deactivate idx');
    }

    // 1. generate proof
    const { proof } = await groth16.fullProve(addKeyInput, wasmFile, zkeyFile);

    // 2. compress proof to vote proof
    const proofHex = await adaptToUncompressed(proof);

    // 3. send addNewKey tx
    return {
      proof: proofHex,
      d: [
        addKeyInput.d1[0].toString(),
        addKeyInput.d1[1].toString(),
        addKeyInput.d2[0].toString(),
        addKeyInput.d2[1].toString()
      ],
      nullifier: addKeyInput.nullifier.toString()
    };
  }

  async genAddKeyInput(
    depth: number,
    {
      coordPubKey,
      deactivates,
      derivePathParams
    }: {
      coordPubKey: PubKey;
      deactivates: bigint[][];
      derivePathParams?: DerivePathParams;
    }
  ) {
    const signer = this.getSigner(derivePathParams);

    const sharedKeyHash = poseidon(signer.genEcdhSharedKey(coordPubKey));

    const randomVal = genRandomSalt();
    const deactivateIdx = deactivates.findIndex((d) => d[4] === sharedKeyHash);
    if (deactivateIdx < 0) {
      return null;
    }

    const deactivateLeaf = deactivates[deactivateIdx];

    const c1 = [deactivateLeaf[0], deactivateLeaf[1]];
    const c2 = [deactivateLeaf[2], deactivateLeaf[3]];

    const { d1, d2 } = rerandomize(coordPubKey, { c1, c2 }, randomVal);

    const nullifier = poseidon([signer.getFormatedPrivKey(), 1444992409218394441042n]);

    const tree = new Tree(5, depth, 0n);
    const leaves = deactivates.map((d) => poseidon(d));
    tree.initLeaves(leaves);

    const deactivateRoot = tree.root;
    const deactivateLeafPathElements = tree.pathElementOf(deactivateIdx);

    const inputHash =
      BigInt(
        solidityPackedSha256(
          new Array(7).fill('uint256'),
          stringizing([
            deactivateRoot,
            poseidon(coordPubKey),
            nullifier,
            d1[0],
            d1[1],
            d2[0],
            d2[1]
          ]) as string[]
        )
      ) % SNARK_FIELD_SIZE;

    const input = {
      inputHash,
      coordPubKey,
      deactivateRoot,
      deactivateIndex: deactivateIdx,
      deactivateLeaf: poseidon(deactivateLeaf),
      c1,
      c2,
      randomVal,
      d1,
      d2,
      deactivateLeafPathElements,
      nullifier,
      oldPrivateKey: signer.getFormatedPrivKey()
    };

    return input;
  }

  async genPreAddKeyInput(
    depth: number,
    {
      coordPubKey,
      deactivates,
      derivePathParams
    }: {
      coordPubKey: PubKey;
      deactivates: bigint[][];
      derivePathParams?: DerivePathParams;
    }
  ) {
    const signer = this.getSigner(derivePathParams);

    const sharedKeyHash = poseidon(signer.genEcdhSharedKey(coordPubKey));

    const randomVal = genRandomSalt();
    const deactivateIdx = deactivates.findIndex((d) => d[4] === sharedKeyHash);
    if (deactivateIdx < 0) {
      return null;
    }

    const deactivateLeaf = deactivates[deactivateIdx];

    const c1: [bigint, bigint] = [deactivateLeaf[0], deactivateLeaf[1]];
    const c2: [bigint, bigint] = [deactivateLeaf[2], deactivateLeaf[3]];

    const { d1, d2 } = rerandomize(coordPubKey, { c1, c2 }, randomVal);

    const nullifier = poseidon([signer.getFormatedPrivKey(), 1444992409218394441042n]);

    const tree = new Tree(5, depth, 0n);
    const leaves = deactivates.map((d) => poseidon(d));
    tree.initLeaves(leaves);

    const deactivateRoot = tree.root;
    const deactivateLeafPathElements = tree.pathElementOf(deactivateIdx);

    const inputHash =
      BigInt(
        solidityPackedSha256(
          new Array(7).fill('uint256'),
          stringizing([
            deactivateRoot,
            poseidon(coordPubKey),
            nullifier,
            d1[0],
            d1[1],
            d2[0],
            d2[1]
          ]) as string[]
        )
      ) % SNARK_FIELD_SIZE;

    const input = {
      inputHash,
      coordPubKey,
      deactivateRoot,
      deactivateIndex: deactivateIdx,
      deactivateLeaf: poseidon(deactivateLeaf),
      c1,
      c2,
      randomVal,
      d1,
      d2,
      deactivateLeafPathElements,
      nullifier,
      oldPrivateKey: signer.getFormatedPrivKey()
    };

    return input;
  }

  async buildDeactivatePayload({
    stateIdx,
    operatorPubkey,
    derivePathParams
  }: {
    stateIdx: number;
    operatorPubkey: bigint;
    derivePathParams?: DerivePathParams;
  }) {
    const payload = this.batchGenMessage(stateIdx, operatorPubkey, [[0, 0]], derivePathParams);
    return stringizing(payload[0]) as {
      msg: string[];
      encPubkeys: string[];
    };
  }

  // ==================== SaaS API Client Methods ====================

  /**
   * Get pre-deactivate data via SaaS API
   * @param contractAddress - Contract address
   */
  async saasGetPreDeactivate(contractAddress: string) {
    if (!this.saasApiClient) {
      throw new Error('SaaS API client not initialized');
    }
    return await this.saasApiClient.getPreDeactivate({ contractAddress });
  }

  /**
   * Pre add new key via SaaS API
   * @param params - Pre add new key parameters
   */
  async saasSubmitPreAddNewKey(
    params: operations['preAddNewKey']['requestBody']['content']['application/json']
  ) {
    if (!this.saasApiClient) {
      throw new Error('SaaS API client not initialized');
    }
    return await this.saasApiClient.preAddNewKey(params);
  }

  /**
   * Vote via SaaS API
   * @param params - Vote parameters
   */
  async saasSubmitVote(params: operations['vote']['requestBody']['content']['application/json']) {
    if (!this.saasApiClient) {
      throw new Error('SaaS API client not initialized');
    }
    return await this.saasApiClient.vote(params);
  }

  // ==================== Maci Voter Methods ====================
  async saasPreCreateNewAccount({
    contractAddress,
    stateTreeDepth,
    coordinatorPubkey,
    deactivates,
    wasmFile,
    zkeyFile,
    derivePathParams
  }: {
    contractAddress: string;
    stateTreeDepth: number;
    coordinatorPubkey: bigint;
    deactivates: bigint[][];
    wasmFile: ZKArtifact;
    zkeyFile: ZKArtifact;
    derivePathParams?: DerivePathParams;
  }) {
    const addNewKeyPayload = await this.buildPreAddNewKeyPayload({
      stateTreeDepth,
      coordinatorPubkey,
      deactivates,
      wasmFile,
      zkeyFile,
      derivePathParams
    });

    const newVoterClient = new VoterClient({
      network: this.network,
      restEndpoint: this.restEndpoint,
      apiEndpoint: this.apiEndpoint,
      saasApiEndpoint: this.saasApiEndpoint,
      registryAddress: this.registryAddress
    });

    const addNewKeyResult = await newVoterClient.saasSubmitPreAddNewKey({
      contractAddress: contractAddress,
      proof: addNewKeyPayload.proof,
      d: addNewKeyPayload.d,
      nullifier: addNewKeyPayload.nullifier,
      newPubkey: newVoterClient
        .getPubkey()
        .toPoints()
        .map((p) => p.toString())
    });

    return {
      result: addNewKeyResult,
      account: newVoterClient
    };
  }

  async saasVote({
    contractAddress,
    // stateIdx,
    operatorPubkey,
    selectedOptions,
    derivePathParams
  }: {
    contractAddress: string;
    // stateIdx: number;
    operatorPubkey: bigint;
    selectedOptions: {
      idx: number;
      vc: number;
    }[];
    derivePathParams?: DerivePathParams;
  }) {
    const stateIdx = await this.getStateIdxByPubKey({
      contractAddress,
      pubKey: this.getPubkey(derivePathParams).toPoints()
    });

    if (stateIdx === -1) {
      throw new Error('State index is not set, Please signup or addNewKey first');
    }

    const payload = this.buildVotePayload({
      stateIdx,
      operatorPubkey,
      selectedOptions,
      derivePathParams
    });

    const voteResult = await this.saasSubmitVote({
      contractAddress,
      payload
    });

    return voteResult;
  }
}
