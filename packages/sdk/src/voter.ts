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
  adaptToUncompressed,
  packElement,
  computeInputHash
} from './libs/crypto';
import { poseidon } from './libs/crypto/hashing';
import { poseidonEncrypt } from '@zk-kit/poseidon-cipher';
import { VoterClientParams, DerivePathParams, PubKey, PrivKey, DeactivateMessage } from './types';
import { Indexer, Http } from './libs';
import { getDefaultParams } from './libs/const';
import { isErrorResponse } from './libs/maci/maci';
import { Contract } from './libs/contract';

/**
 * Build a sorted, comma-separated string of K-anonymous leaf indices for a
 * pre-deactivate proof request.
 *
 * The real `deactivateIdx` is mixed with up to `kMax - 1` random decoy
 * indices drawn from `[0, voterScale)` so that the server cannot identify
 * which leaf the caller actually owns.
 *
 * K-max is capped at `min(200, floor(voterScale * 0.1) || 1)` to stay within
 * the API's per-request limit.
 *
 * When `voterScale` is not provided the function returns just the real index
 * (K=1, no anonymity).
 */
function buildKAnonymousIndices(deactivateIdx: number, voterScale: number): string {
  const kMax = Math.min(200, Math.floor(voterScale * 0.1) || 1);

  // Fisher-Yates shuffle over all indices except the real one, then take kMax-1 decoys.
  const pool = Array.from({ length: voterScale }, (_, i) => i).filter((i) => i !== deactivateIdx);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return [deactivateIdx, ...pool.slice(0, kMax - 1)].sort((a, b) => a - b).join(',');
}

/**
 * @class Maci Voter Client
 * @description This class is used to interact with Maci Voter Client.
 */
export class VoterClient {
  public network: 'mainnet' | 'testnet';

  public accountManager: MaciAccount;
  public saasApiClient: MaciApiClient;
  public contract: Contract;

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

    // Initialize Contract instance
    this.contract = new Contract({
      network: this.network,
      rpcEndpoint: defaultParams.rpcEndpoint,
      registryAddress: this.registryAddress,
      saasAddress: defaultParams.saasAddress,
      apiSaasAddress: defaultParams.apiSaasAddress,
      maciCodeId: defaultParams.maciCodeId,
      oracleCodeId: defaultParams.oracleCodeId,
      feegrantOperator: defaultParams.oracleFeegrantOperator,
      whitelistBackendPubkey: defaultParams.oracleWhitelistBackendPubkey
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

  unpackMaciPubkey(pubkey: bigint | string | PubKey): PubKey {
    // If it's already a PubKey (array of two bigints), return it directly
    if (Array.isArray(pubkey) && pubkey.length === 2) {
      return pubkey as PubKey;
    }
    // Otherwise, unpack from bigint or string
    return unpackPubKey(BigInt(pubkey));
  }

  getPubkey(derivePathParams?: DerivePathParams) {
    return this.accountManager.getKeyPair(derivePathParams).getPublicKey();
  }

  /**
   * Normalize and validate vote options.
   * This method performs duplicate checking, filtering, sorting, and format conversion.
   *
   * @param selectedOptions - Array of vote options with idx and vc
   * @returns Normalized plan format: [voteOptionIndex, voteWeight][]
   * @throws Error if duplicate option indices are found
   */
  normalizeVoteOptions(
    selectedOptions: {
      idx: number;
      vc: number;
    }[]
  ): [number, number][] {
    // Check for duplicate options
    const idxSet = new Set<number>();
    for (const option of selectedOptions) {
      if (idxSet.has(option.idx)) {
        throw new Error(`Duplicate option index (${option.idx}) is not allowed`);
      }
      idxSet.add(option.idx);
    }

    // Filter and sort options
    const options = selectedOptions.filter((o) => !!o.vc).sort((a, b) => a.idx - b.idx);

    // Convert to plan format
    const plan = options.map((o) => {
      return [o.idx, o.vc] as [number, number];
    });

    return plan;
  }

  /**
   * Build vote payload for batch message publishing
   * @param stateIdx - The state index of the voter
   * @param operatorPubkey - The coordinator's public key
   * @param selectedOptions - The vote options with their vote credits
   * @param pollId - The poll ID for this round (prevents replay attacks)
   * @param derivePathParams - Optional BIP44 derive path parameters
   * @returns Stringified vote payload ready for submission
   */
  buildVotePayload({
    stateIdx,
    operatorPubkey,
    selectedOptions,
    pollId,
    derivePathParams
  }: {
    stateIdx: number;
    operatorPubkey: bigint | string | PubKey;
    selectedOptions: {
      idx: number;
      vc: number;
    }[];
    /** When omitted the legacy message format (no `pollId` in packed element) is used. */
    pollId?: bigint | number;
    derivePathParams?: DerivePathParams;
  }) {
    const plan = this.normalizeVoteOptions(selectedOptions);

    const payload =
      pollId !== undefined
        ? this.batchGenMessage(stateIdx, operatorPubkey, pollId, plan, derivePathParams)
        : this.legacyBatchGenMessage(stateIdx, operatorPubkey, plan, derivePathParams);

    return stringizing(payload) as {
      msg: string[];
      encPubkeys: string[];
    }[];
  }

  /**
   * Generate multiple encrypted messages in batch
   * Messages are generated in reverse order for on-chain processing
   * @param stateIdx - The state index of the voter
   * @param operatorPubkey - The coordinator's public key
   * @param pollId - The poll ID for this round
   * @param plan - Array of [voteOptionIndex, voteCredit] tuples
   * @param derivePathParams - Optional BIP44 derive path parameters
   * @returns Array of encrypted messages with their encryption public keys
   */
  batchGenMessage(
    stateIdx: number,
    operatorPubkey: bigint | string | PubKey,
    pollId: bigint | number,
    plan: [number, number][],
    derivePathParams?: DerivePathParams
  ) {
    const genMessage = this.genMessageFactory(stateIdx, operatorPubkey, pollId, derivePathParams);

    const payload = [];
    for (let i = plan.length - 1; i >= 0; i--) {
      const p = plan[i];
      const encAccount = genKeypair();
      const isLastCmd = i === plan.length - 1;
      const msg = genMessage(BigInt(encAccount.privKey), i + 1, p[0], p[1], isLastCmd);

      payload.push({
        msg,
        encPubkeys: encAccount.pubKey
      });
    }

    return payload;
  }

  /**
   * Create a message factory for generating encrypted vote messages
   * The factory returns a function that can generate individual messages
   * @param stateIdx - The state index of the voter
   * @param operatorPubkey - The coordinator's public key
   * @param pollId - The poll ID for this round (prevents replay attacks across different polls)
   * @param derivePathParams - Optional BIP44 derive path parameters
   * @returns A function that generates encrypted messages
   */
  genMessageFactory(
    stateIdx: number,
    operatorPubkey: bigint | string | PubKey,
    pollId: bigint | number,
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
      if (salt === undefined) {
        // Generate random 56-bit salt
        salt = BigInt(`0x${CryptoJS.lib.WordArray.random(7).toString(CryptoJS.enc.Hex)}`);
      }

      // Pack command data including pollId to prevent replay attacks
      const packaged = packElement({ nonce, stateIdx, voIdx, newVotes, pollId });

      const signer = this.getSigner(derivePathParams);

      let newPubKey: PubKey;
      if (isLastCmd) {
        // Last command uses null public key to indicate end of batch
        newPubKey = [0n, 0n];
      } else {
        // For non-last commands, keep the current public key (no rotation)
        newPubKey = [...signer.getPublicKey().toPoints()];
      }

      // Create hash for signing: [packed_data, newPubKey_x, newPubKey_y]
      // Signature does NOT include salt
      const hash = poseidon([packaged, ...newPubKey]);
      const signature = signer.sign(hash);

      // Build command array: [packed_data, newPubKey_x, newPubKey_y, salt, sig_R8_x, sig_R8_y, sig_S]
      const command = [packaged, ...newPubKey, BigInt(salt), ...signature.R8, signature.S];
      const coordPubkey = this.unpackMaciPubkey(operatorPubkey);

      // Encrypt command with shared key derived from encPriKey and coordinator's public key
      const message = poseidonEncrypt(command, genEcdhSharedKey(encPriKey, coordPubkey), 0n);
      return message;
    };
  }

  async getPollId(contractAddress: string): Promise<number> {
    try {
      const pollId = await this.contract.getPollId({
        contractAddress
      });
      if (pollId === null) {
        throw new Error('Poll ID not found');
      }
      return Number(pollId);
    } catch (error) {
      throw new Error(`Failed to get poll_id from ${contractAddress}: ${error}`);
    }
  }

  async getStateIdx({
    contractAddress,
    pubkey,
    derivePathParams
  }: {
    contractAddress: string;
    pubkey?: PubKey | string | bigint;
    derivePathParams?: DerivePathParams;
  }) {
    // If pubkey is not provided, get it from the current signer
    if (!pubkey) {
      pubkey = this.getPubkey(derivePathParams).toPoints();
    }
    pubkey = this.unpackMaciPubkey(pubkey);

    try {
      const stateIdx = await this.contract.getStateIdx({
        contractAddress,
        pubkey: { x: pubkey[0].toString(), y: pubkey[1].toString() }
      });
      if (stateIdx === null) {
        return -1;
      }
      return parseInt(stateIdx);
    } catch (error) {
      // Query via indexer
      const response = await this.indexer.getSignUpEventByPubKey(contractAddress, pubkey);

      if (isErrorResponse(response)) {
        return -1;
      }
      return response.data.signUpEvents[0].stateIdx;
    }
  }

  async buildAddNewKeyPayload({
    stateTreeDepth,
    operatorPubkey,
    deactivates,
    newPubkey,
    pollId,
    wasmFile,
    zkeyFile,
    derivePathParams
  }: {
    stateTreeDepth: number;
    operatorPubkey: bigint | string | PubKey;
    deactivates: DeactivateMessage[] | bigint[][] | string[][];
    /** Required when `pollId` is provided (new circuit). Omit for legacy mode. */
    newPubkey?: PubKey;
    /** When omitted the legacy circuit input (no `pollId` / `newPubKey` in ZK inputs) is used. */
    pollId?: bigint;
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

    let addKeyInput: Awaited<ReturnType<typeof this.genAddKeyInput>> | Awaited<ReturnType<typeof this.legacyGenAddKeyInput>>;

    if (pollId !== undefined) {
      if (!newPubkey) {
        throw new Error('buildAddNewKeyPayload: `newPubkey` is required when `pollId` is provided');
      }
      addKeyInput = await this.genAddKeyInput(stateTreeDepth + 2, {
        coordPubKey: [coordPubkeyX, coordPubkeyY],
        deactivates: deactivates.map((d: any) => d.map(BigInt)),
        newPubKey: newPubkey,
        pollId,
        derivePathParams
      });
    } else {
      addKeyInput = await this.legacyGenAddKeyInput(stateTreeDepth + 2, {
        coordPubKey: [coordPubkeyX, coordPubkeyY],
        deactivates: deactivates.map((d: any) => d.map(BigInt)),
        derivePathParams
      });
    }

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
    contractAddress,
    deactivateIdx,
    voterScale,
    preComputedProof,
    newPubkey,
    pollId,
    wasmFile,
    zkeyFile,
    derivePathParams
  }: {
    stateTreeDepth: number;
    coordinatorPubkey: bigint | string | PubKey;
    /** Raw deactivate leaf data for local Merkle tree construction. When omitted, either `preComputedProof` or the SaaS API path must be used. */
    deactivates?: bigint[][] | string[][];
    /** Contract address used for the K-anonymous API proof path. Required only when neither `deactivates` nor `preComputedProof` is provided. */
    contractAddress?: string;
    /**
     * Leaf index of this account in the deactivate tree.
     * Required when `preComputedProof` is provided.
     * When provided on the local or API path the costly `sharedKeyHash` scan is skipped.
     */
    deactivateIdx?: number;
    /**
     * Pre-deactivate tree capacity (i.e. `preDeactivateScale` from the create-round response).
     * Only needed for the K-anonymous API path. Ignored when `preComputedProof` is provided.
     */
    voterScale?: number;
    /**
     * Pre-computed Merkle proof from an external source (e.g. `claimMaciKey` response).
     * When provided, both the local tree construction and the SaaS API proof request are skipped entirely.
     * Must be accompanied by `deactivateIdx`.
     */
    preComputedProof?: {
      root: string;
      pathElements: string[][];
      deactivateLeaf: string[];
    };
    /** Required when `pollId` is provided (new circuit). Omit for legacy mode. */
    newPubkey?: PubKey;
    /** When omitted the legacy circuit input (no `pollId` / `newPubKey` in ZK inputs) is used. */
    pollId?: bigint;
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

    if (pollId === undefined) {
      // Legacy path: no pollId / newPubKey in ZK circuit inputs.
      if (!deactivates || deactivates.length === 0) {
        throw new Error(
          'buildPreAddNewKeyPayload: `deactivates` is required in legacy mode (pollId omitted)'
        );
      }
      const addKeyInput = await this.legacyGenPreAddKeyInput(stateTreeDepth + 2, {
        coordPubKey: [coordPubkeyX, coordPubkeyY],
        deactivates: deactivates.map((d: any) => d.map(BigInt)),
        derivePathParams
      });
      if (addKeyInput === null) {
        throw Error('legacyGenPreAddKeyInput failed, cannot find deactivate idx');
      }
      const { proof } = await groth16.fullProve(addKeyInput, wasmFile, zkeyFile);
      const proofHex = await adaptToUncompressed(proof);
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

    // New-version path: pollId provided.
    if (!newPubkey) {
      throw new Error('buildPreAddNewKeyPayload: `newPubkey` is required when `pollId` is provided');
    }

    const coordPubKey: PubKey = [coordPubkeyX, coordPubkeyY];

    let resolvedDeactivates: bigint[][];
    let preComputedTreeProof: { root: string; pathElements: string[][] } | undefined;
    let preComputedLeaf: bigint[] | undefined;

    if (deactivates && deactivates.length > 0) {
      // Local path: caller supplied full deactivate data, build Merkle tree locally.
      // deactivateIdx is optional — when omitted the sharedKeyHash search runs inside genPreAddKeyInput.
      resolvedDeactivates = deactivates.map((d: any) => d.map(BigInt));
    } else if (preComputedProof) {
      // Pre-computed proof path: caller provided root, pathElements and deactivateLeaf directly
      // (e.g. from a claimMaciKey response). No local tree construction or API call needed.
      if (deactivateIdx === undefined) {
        throw new Error(
          'buildPreAddNewKeyPayload: `deactivateIdx` is required when `preComputedProof` is provided'
        );
      }
      preComputedLeaf = preComputedProof.deactivateLeaf.map(BigInt);
      preComputedTreeProof = {
        root: preComputedProof.root,
        pathElements: preComputedProof.pathElements
      };
      resolvedDeactivates = [];
    } else {
      // K-anonymous API path: fetch proof from the SaaS API using contractAddress + deactivateIdx + voterScale.
      if (!contractAddress) {
        throw new Error(
          'buildPreAddNewKeyPayload: `contractAddress` is required when `deactivates` is not provided'
        );
      }
      if (deactivateIdx === undefined) {
        throw new Error(
          'buildPreAddNewKeyPayload: `deactivateIdx` is required when `deactivates` is not provided'
        );
      }
      if (voterScale === undefined) {
        throw new Error(
          'buildPreAddNewKeyPayload: `voterScale` is required for the K-anonymous API path'
        );
      }

      // Build K-anonymous indices: the real index mixed with random decoys drawn from [0, voterScale).
      const indicesParam = buildKAnonymousIndices(deactivateIdx, voterScale);

      const proofResp = await this.saasApiClient.getPreDeactivateProof(
        contractAddress,
        indicesParam
      );

      const pkg = proofResp.proofs.find((p) => p.leafIndex === deactivateIdx);
      if (!pkg) {
        throw new Error(
          `buildPreAddNewKeyPayload: proof package for leafIndex ${deactivateIdx} not found in API response`
        );
      }

      preComputedLeaf = pkg.deactivateLeaf.map(BigInt);
      preComputedTreeProof = {
        root: proofResp.root,
        pathElements: pkg.pathElements
      };
      resolvedDeactivates = [];
    }

    const genPreAddKeyInputStart = Date.now();
    const addKeyInput = await this.genPreAddKeyInput(stateTreeDepth + 2, {
      coordPubKey,
      deactivates: resolvedDeactivates,
      newPubKey: newPubkey,
      pollId,
      derivePathParams,
      preComputedTreeProof,
      preComputedLeaf,
      deactivateIdx
    });
    console.log(`[genPreAddKeyInput] elapsed: ${Date.now() - genPreAddKeyInputStart}ms`);

    if (addKeyInput === null) {
      throw Error('genPreAddKeyInput failed, cannot find deactivate idx');
    }

    // 1. generate proof
    const fullProveStart = Date.now();
    const { proof } = await groth16.fullProve(addKeyInput, wasmFile, zkeyFile);
    console.log(`[fullProve] elapsed: ${Date.now() - fullProveStart}ms`);

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
      newPubKey,
      pollId,
      derivePathParams
    }: {
      coordPubKey: PubKey;
      deactivates: bigint[][];
      newPubKey: PubKey;
      pollId: bigint;
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

    // Round-specific nullifier: Poseidon(oldPrivKey, pollId)
    const nullifier = poseidon([signer.getFormatedPrivKey(), pollId]);

    const tree = new Tree(5, depth, 0n);
    const leaves = deactivates.map((d) => poseidon(d));
    tree.initLeaves(leaves);

    const deactivateRoot = tree.root;
    const deactivateLeafPathElements = tree.pathElementOf(deactivateIdx);

    const inputHash = computeInputHash([
      deactivateRoot,
      poseidon(coordPubKey),
      nullifier,
      d1[0],
      d1[1],
      d2[0],
      d2[1],
      poseidon(newPubKey),
      pollId
    ]);

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
      oldPrivateKey: signer.getFormatedPrivKey(),
      newPubKey,
      pollId
    };

    return input;
  }

  async genPreAddKeyInput(
    depth: number,
    {
      coordPubKey,
      deactivates,
      newPubKey,
      pollId,
      derivePathParams,
      preComputedTreeProof,
      preComputedLeaf,
      deactivateIdx: providedDeactivateIdx
    }: {
      coordPubKey: PubKey;
      deactivates: bigint[][];
      newPubKey: PubKey;
      pollId: bigint;
      derivePathParams?: DerivePathParams;
      /**
       * When provided, skip local Merkle tree construction and use the API-supplied
       * root and path elements instead.
       */
      preComputedTreeProof?: {
        root: string;
        pathElements: string[][];
      };
      /**
       * Pre-fetched leaf data `[c1.x, c1.y, c2.x, c2.y, sharedKeyHash]` from the
       * API proof response.  When provided together with `deactivateIdx`, the
       * `deactivates` array is not accessed at all.
       */
      preComputedLeaf?: bigint[];
      /**
       * Leaf index of this account in the deactivate tree, as returned by the API
       * in `accounts[n].accountIndex` at signup time.  When provided the costly
       * `sharedKeyHash` search over `deactivates` is skipped.
       */
      deactivateIdx?: number;
    }
  ) {
    let t0 = Date.now();

    const signer = this.getSigner(derivePathParams);
    console.log(`[genPreAddKeyInput] getSigner: ${Date.now() - t0}ms`);
    t0 = Date.now();

    const randomVal = genRandomSalt();
    let deactivateIdx: number;

    if (providedDeactivateIdx !== undefined) {
      deactivateIdx = providedDeactivateIdx;
      console.log(
        `[genPreAddKeyInput] using provided deactivateIdx=${deactivateIdx} (skip search)`
      );
    } else {
      const sharedKeyHash = poseidon(signer.genEcdhSharedKey(coordPubKey));
      console.log(`[genPreAddKeyInput] genEcdhSharedKey + poseidon: ${Date.now() - t0}ms`);
      t0 = Date.now();

      deactivateIdx = deactivates.findIndex((d) => d[4] === sharedKeyHash);
      if (deactivateIdx < 0) {
        return null;
      }
      console.log(`[genPreAddKeyInput] genRandomSalt + findDeactivateIdx: ${Date.now() - t0}ms`);
      t0 = Date.now();
    }

    const deactivateLeaf = preComputedLeaf ?? deactivates[deactivateIdx];
    if (!deactivateLeaf) {
      return null;
    }

    const c1: [bigint, bigint] = [deactivateLeaf[0], deactivateLeaf[1]];
    const c2: [bigint, bigint] = [deactivateLeaf[2], deactivateLeaf[3]];

    const { d1, d2 } = rerandomize(coordPubKey, { c1, c2 }, randomVal);
    console.log(`[genPreAddKeyInput] rerandomize: ${Date.now() - t0}ms`);
    t0 = Date.now();

    // Round-specific nullifier: Poseidon(oldPrivKey, pollId)
    const nullifier = poseidon([signer.getFormatedPrivKey(), pollId]);
    console.log(`[genPreAddKeyInput] nullifier (poseidon): ${Date.now() - t0}ms`);
    t0 = Date.now();

    let deactivateRoot: bigint;
    let deactivateLeafPathElements: bigint[][];

    if (preComputedTreeProof) {
      // Use API-supplied Merkle root and path elements — skip local tree construction.
      deactivateRoot = BigInt(preComputedTreeProof.root);
      deactivateLeafPathElements = preComputedTreeProof.pathElements.map((level) =>
        level.map(BigInt)
      );
      console.log(`[genPreAddKeyInput] using preComputedTreeProof (API path)`);
    } else {
      const tree = new Tree(5, depth, 0n);
      const leaves = deactivates.map((d) => poseidon(d));
      tree.initLeaves(leaves);
      console.log(`[genPreAddKeyInput] build tree + initLeaves: ${Date.now() - t0}ms`);
      t0 = Date.now();

      deactivateRoot = tree.root;
      deactivateLeafPathElements = tree.pathElementOf(deactivateIdx);
      console.log(`[genPreAddKeyInput] tree.root + pathElementOf: ${Date.now() - t0}ms`);
      t0 = Date.now();
    }

    const inputHash = computeInputHash([
      deactivateRoot,
      poseidon(coordPubKey),
      nullifier,
      d1[0],
      d1[1],
      d2[0],
      d2[1],
      poseidon(newPubKey),
      pollId
    ]);
    console.log(`[genPreAddKeyInput] computeInputHash: ${Date.now() - t0}ms`);
    t0 = Date.now();

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
      oldPrivateKey: signer.getFormatedPrivKey(),
      newPubKey,
      pollId
    };

    return input;
  }

  /**
   * Build deactivate message payload
   * Deactivate messages use a specific nonce (default 0) and are independent from vote messages
   * @param stateIdx - The state index of the voter
   * @param operatorPubkey - The coordinator's public key
   * @param pollId - The poll ID for this round
   * @param nonce - The nonce for deactivation (default: 0)
   * @param derivePathParams - Optional BIP44 derive path parameters
   * @returns Stringified deactivate payload
   */
  buildDeactivatePayload({
    stateIdx,
    operatorPubkey,
    pollId,
    nonce = 0,
    derivePathParams
  }: {
    stateIdx: number;
    operatorPubkey: bigint | string | PubKey;
    /** When omitted the legacy message format (no `pollId` in packed element) is used. */
    pollId?: number;
    nonce?: number;
    derivePathParams?: DerivePathParams;
  }) {
    const genMessage =
      pollId !== undefined
        ? this.genMessageFactory(stateIdx, operatorPubkey, pollId, derivePathParams)
        : this.legacyGenMessageFactory(stateIdx, operatorPubkey, derivePathParams);
    const encAccount = genKeypair();
    const msg = genMessage(BigInt(encAccount.privKey), nonce, 0, 0, true);

    return stringizing({
      msg,
      encPubkeys: encAccount.pubKey
    }) as {
      msg: string[];
      encPubkeys: string[];
    };
  }

  // ==================== Legacy Methods (backward-compat, no pollId) ====================

  private legacyGenMessageFactory(
    stateIdx: number,
    operatorPubkey: bigint | string | PubKey,
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
      if (salt === undefined) {
        // uint56 random salt, same as old packElement default behavior
        salt = BigInt(`0x${CryptoJS.lib.WordArray.random(7).toString(CryptoJS.enc.Hex)}`);
      }
      const packaged =
        BigInt(nonce) +
        (BigInt(stateIdx) << 32n) +
        (BigInt(voIdx) << 64n) +
        (BigInt(newVotes) << 96n) +
        (BigInt(salt) << 192n);

      const signer = this.getSigner(derivePathParams);

      let newPubKey: PubKey;
      if (isLastCmd) {
        newPubKey = [0n, 0n];
      } else {
        newPubKey = [...signer.getPublicKey().toPoints()];
      }

      const hash = poseidon([packaged, ...newPubKey]);
      const signature = signer.sign(hash);

      const command = [packaged, ...newPubKey, ...signature.R8, signature.S];
      const coordPubkey = this.unpackMaciPubkey(operatorPubkey);

      const message = poseidonEncrypt(command, genEcdhSharedKey(encPriKey, coordPubkey), 0n);
      return message;
    };
  }

  private legacyBatchGenMessage(
    stateIdx: number,
    operatorPubkey: bigint | string | PubKey,
    plan: [number, number][],
    derivePathParams?: DerivePathParams
  ) {
    const genMessage = this.legacyGenMessageFactory(stateIdx, operatorPubkey, derivePathParams);

    const payload = [];
    for (let i = plan.length - 1; i >= 0; i--) {
      const p = plan[i];
      const encAccount = genKeypair();
      const isLastCmd = i === plan.length - 1;
      const msg = genMessage(BigInt(encAccount.privKey), i + 1, p[0], p[1], isLastCmd);

      payload.push({
        msg,
        encPubkeys: encAccount.pubKey
      });
    }

    return payload;
  }

  legacyBuildVotePayload({
    stateIdx,
    operatorPubkey,
    selectedOptions,
    derivePathParams
  }: {
    stateIdx: number;
    operatorPubkey: bigint | string | PubKey;
    selectedOptions: {
      idx: number;
      vc: number;
    }[];
    derivePathParams?: DerivePathParams;
  }) {
    const plan = this.normalizeVoteOptions(selectedOptions);
    const payload = this.legacyBatchGenMessage(stateIdx, operatorPubkey, plan, derivePathParams);
    return stringizing(payload) as {
      msg: string[];
      encPubkeys: string[];
    }[];
  }

  legacyBuildDeactivatePayload({
    stateIdx,
    operatorPubkey,
    nonce = 0,
    derivePathParams
  }: {
    stateIdx: number;
    operatorPubkey: bigint | string | PubKey;
    nonce?: number;
    derivePathParams?: DerivePathParams;
  }) {
    const genMessage = this.legacyGenMessageFactory(stateIdx, operatorPubkey, derivePathParams);
    const encAccount = genKeypair();
    const msg = genMessage(BigInt(encAccount.privKey), nonce, 0, 0, true);

    return stringizing({
      msg,
      encPubkeys: encAccount.pubKey
    }) as {
      msg: string[];
      encPubkeys: string[];
    };
  }

  async legacyGenAddKeyInput(
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

    const inputHash = computeInputHash([
      deactivateRoot,
      poseidon(coordPubKey),
      nullifier,
      d1[0],
      d1[1],
      d2[0],
      d2[1]
    ]);

    return {
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
  }

  async legacyGenPreAddKeyInput(
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

    const inputHash = computeInputHash([
      deactivateRoot,
      poseidon(coordPubKey),
      nullifier,
      d1[0],
      d1[1],
      d2[0],
      d2[1]
    ]);

    return {
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
  }

  /**
   * Legacy `buildAddNewKeyPayload` — old deactivate+addNewKey flow without `pollId` / `newPubKey`
   * in the ZK circuit.  Use when interacting with contracts that predate the poll-ID upgrade.
   */
  async legacyBuildAddNewKeyPayload({
    stateTreeDepth,
    operatorPubkey,
    deactivates,
    wasmFile,
    zkeyFile,
    derivePathParams
  }: {
    stateTreeDepth: number;
    operatorPubkey: bigint | string | PubKey;
    deactivates: DeactivateMessage[] | bigint[][] | string[][];
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
    const addKeyInput = await this.legacyGenAddKeyInput(stateTreeDepth + 2, {
      coordPubKey: [coordPubkeyX, coordPubkeyY],
      deactivates: deactivates.map((d: any) => d.map(BigInt)),
      derivePathParams
    });

    if (addKeyInput === null) {
      throw Error('legacyGenAddKeyInput failed, cannot find deactivate idx');
    }

    const { proof } = await groth16.fullProve(addKeyInput, wasmFile, zkeyFile);
    const proofHex = await adaptToUncompressed(proof);

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

  async legacyBuildPreAddNewKeyPayload({
    stateTreeDepth,
    coordinatorPubkey,
    deactivates,
    wasmFile,
    zkeyFile,
    derivePathParams
  }: {
    stateTreeDepth: number;
    coordinatorPubkey: bigint | string | PubKey;
    deactivates: bigint[][] | string[][];
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
    const addKeyInput = await this.legacyGenPreAddKeyInput(stateTreeDepth + 2, {
      coordPubKey: [coordPubkeyX, coordPubkeyY],
      deactivates: deactivates.map((d: any) => d.map(BigInt)),
      derivePathParams
    });

    if (addKeyInput === null) {
      throw Error('legacyGenPreAddKeyInput failed, cannot find deactivate idx');
    }

    const { proof } = await groth16.fullProve(addKeyInput, wasmFile, zkeyFile);
    const proofHex = await adaptToUncompressed(proof);

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

  // ==================== SaaS API Client Methods ====================

  /**
   * Create a MACI round via SaaS API
   * @param params - Round creation parameters
   * @returns Response with transaction details and ticket
   */
  async saasCreateRound(
    params: operations['createRound']['requestBody']['content']['application/json']
  ) {
    if (!this.saasApiClient) {
      throw new Error('SaaS API client not initialized');
    }
    return await this.saasApiClient.createRound(params);
  }

  /**
   * Create an AMACI round via SaaS API
   * @param params - AMACI round creation parameters
   * @returns Response with transaction details and ticket
   */
  async saasCreateAmaciRound(
    params: operations['createAmaciRound']['requestBody']['content']['application/json']
  ) {
    if (!this.saasApiClient) {
      throw new Error('SaaS API client not initialized');
    }
    return await this.saasApiClient.createAmaciRound(params);
  }

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
   * Signup via SaaS API
   * @param params - Signup parameters (including ticket)
   * @returns Response with transaction details
   */
  async saasSignup(params: operations['signup']['requestBody']['content']['application/json']) {
    if (!this.saasApiClient) {
      throw new Error('SaaS API client not initialized');
    }
    return await this.saasApiClient.signup(params);
  }

  /**
   * Vote via SaaS API
   * @param params - Vote parameters (including ticket)
   * @returns Response with transaction details
   */
  async saasSubmitVote(params: operations['vote']['requestBody']['content']['application/json']) {
    if (!this.saasApiClient) {
      throw new Error('SaaS API client not initialized');
    }
    return await this.saasApiClient.vote(params);
  }

  /**
   * Deactivate via SaaS API
   * @param params - Deactivate parameters (including ticket)
   * @returns Response with transaction details
   */
  async saasDeactivate(
    params: operations['deactivate']['requestBody']['content']['application/json']
  ) {
    if (!this.saasApiClient) {
      throw new Error('SaaS API client not initialized');
    }
    return await this.saasApiClient.deactivate(params);
  }

  /**
   * Add new key via SaaS API
   * @param params - Add new key parameters (including ticket)
   * @returns Response with transaction details
   */
  async saasAddNewKey(
    params: operations['addNewKey']['requestBody']['content']['application/json']
  ) {
    if (!this.saasApiClient) {
      throw new Error('SaaS API client not initialized');
    }
    return await this.saasApiClient.addNewKey(params);
  }

  /**
   * Pre add new key via SaaS API
   * @param params - Pre add new key parameters (including ticket)
   * @returns Response with transaction details
   */
  async saasSubmitPreAddNewKey(
    params: operations['preAddNewKey']['requestBody']['content']['application/json']
  ) {
    if (!this.saasApiClient) {
      throw new Error('SaaS API client not initialized');
    }
    return await this.saasApiClient.preAddNewKey(params);
  }

  // ==================== Transaction Utilities ====================

  /**
   * Poll the chain REST endpoint until the given transaction is committed on-chain,
   * then return its `tx_response` object with an added `status` field.
   *
   * @param txHash - On-chain transaction hash to wait for.
   * @param options.timeout  - Max wait time in milliseconds (default: 60 000 ms).
   * @param options.interval - Polling interval in milliseconds (default: 2 000 ms).
   * @returns The Cosmos `tx_response` record plus `status`: `'success'` when `code === 0`, `'failed'` otherwise.
   * @throws If the transaction is not found within the timeout period.
   */
  async waitForTransaction(
    txHash: string,
    options: { timeout?: number; interval?: number } = {}
  ) {
    const timeout = options.timeout ?? 60_000;
    const interval = options.interval ?? 2_000;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      try {
        const data = await this.http.fetchRest(`/cosmos/tx/v1beta1/txs/${txHash}`);
        if (data?.tx_response) {
          const txResponse = data.tx_response as {
            height: string;
            txhash: string;
            code: number;
            raw_log: string;
            gas_wanted: string;
            gas_used: string;
            timestamp: string;
            events: { type: string; attributes: { key: string; value: string }[] }[];
          };
          return {
            ...txResponse,
            status: txResponse.code === 0 ? ('success' as const) : ('failed' as const)
          };
        }
      } catch {
        // Transaction not yet on chain (404), keep polling
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error(
      `waitForTransaction: transaction ${txHash} not found on chain within ${timeout}ms`
    );
  }

  // ==================== Maci Voter Methods ====================
  /**
   * Pre-create a new account for AMACI voting (pre-deactivate mode).
   *
   * Two modes are supported:
   * - **Local mode**: pass `deactivates` to build the Merkle tree locally (original behaviour).
   * - **API mode**: omit `deactivates` and the proof will be fetched from the SaaS API using
   *   `contractAddress` (K-anonymous request).
   *
   * @param params - Parameters including contract address, optional deactivates, circuit files, and ticket
   * @returns Result with transaction details and new voter account
   */
  async saasPreCreateNewAccount({
    contractAddress,
    stateTreeDepth,
    coordinatorPubkey,
    deactivates,
    deactivateIdx,
    voterScale,
    preComputedProof,
    pollId,
    wasmFile,
    zkeyFile,
    ticket,
    derivePathParams
  }: {
    contractAddress: string;
    stateTreeDepth: number;
    coordinatorPubkey: bigint | string | PubKey;
    /** Raw deactivate leaf data for local Merkle tree construction. Omit when using `preComputedProof` or the K-anonymous API path. */
    deactivates?: bigint[][] | string[][];
    /**
     * Leaf index of this account in the deactivate tree.
     * Required when `preComputedProof` is provided; optional for other paths.
     */
    deactivateIdx?: number;
    /**
     * Pre-deactivate tree capacity (`preDeactivateScale` from the create-round response).
     * Only required for the K-anonymous API path. Ignored when `preComputedProof` is provided.
     */
    voterScale?: number;
    /**
     * Pre-computed Merkle proof supplied by the caller (e.g. from `claimMaciKey` response).
     * When provided, skips both local tree construction and the SaaS API proof request.
     * Must be accompanied by `deactivateIdx`.
     */
    preComputedProof?: {
      root: string;
      pathElements: string[][];
      deactivateLeaf: string[];
    };
    /** When omitted the legacy circuit input (no `pollId` / `newPubKey` in ZK inputs) is used. */
    pollId?: bigint | number;
    wasmFile: ZKArtifact;
    zkeyFile: ZKArtifact;
    ticket: string;
    derivePathParams?: DerivePathParams;
  }) {
    const newVoterClient = new VoterClient({
      network: this.network,
      restEndpoint: this.restEndpoint,
      apiEndpoint: this.apiEndpoint,
      saasApiEndpoint: this.saasApiEndpoint,
      registryAddress: this.registryAddress
    });

    const newPubkey = newVoterClient.getPubkey().toPoints() as [bigint, bigint];

    const addNewKeyPayload = await this.buildPreAddNewKeyPayload({
      stateTreeDepth,
      coordinatorPubkey,
      deactivates,
      contractAddress,
      deactivateIdx,
      voterScale,
      preComputedProof,
      newPubkey,
      pollId: pollId !== undefined ? BigInt(pollId) : undefined,
      wasmFile,
      zkeyFile,
      derivePathParams
    });

    const addNewKeyResult = await newVoterClient.saasSubmitPreAddNewKey({
      contractAddress: contractAddress,
      proof: addNewKeyPayload.proof,
      d: addNewKeyPayload.d,
      nullifier: addNewKeyPayload.nullifier,
      newPubkey: newPubkey.map((p) => p.toString()),
      ticket
    });

    return {
      result: addNewKeyResult,
      account: newVoterClient
    };
  }

  /**
   * Claim the next available pre-generated MACI key pair for an AMACI round via SaaS API.
   * The key is assigned on a first-come-first-served basis.
   * Requires an AMACI claim key passed via the X-Amaci-Claim-Key header.
   * WARNING: secretKey is returned only once — save it immediately, it cannot be retrieved again.
   * @param params - Parameters including contractAddress and amaciClaimKey
   * @returns Claimed key pair with full deactivate Merkle proof
   */
  async saasClaimKey(params: operations['claimMaciKey']['parameters']['path'] & { amaciClaimKey: string }) {
    if (!this.saasApiClient) {
      throw new Error('SaaS API client not initialized');
    }
    return await this.saasApiClient.claimMaciKey(params);
  }

  /**
   * Vote via SaaS API with automatic payload building
   * @param params - Parameters including contract address, operator pubkey, vote options, and ticket
   * @returns Response with transaction details
   */
  async saasVote({
    contractAddress,
    operatorPubkey,
    selectedOptions,
    ticket,
    pollId,
    stateIdx,
    derivePathParams
  }: {
    contractAddress: string;
    operatorPubkey: bigint | string | PubKey;
    selectedOptions: {
      idx: number;
      vc: number;
    }[];
    ticket: string;
    /** When omitted the legacy message format (no `pollId` in packed element, no salt in command) is used. */
    pollId?: bigint | number;
    stateIdx?: number;
    derivePathParams?: DerivePathParams;
  }) {
    const resolvedStateIdx =
      stateIdx !== undefined
        ? stateIdx
        : await this.getStateIdx({ contractAddress, derivePathParams });

    if (resolvedStateIdx === -1) {
      throw new Error('State index is not set, Please signup or addNewKey first');
    }

    const payload = this.buildVotePayload({
      stateIdx: resolvedStateIdx,
      operatorPubkey,
      selectedOptions,
      pollId,
      derivePathParams
    });

    const voteResult = await this.saasSubmitVote({
      contractAddress,
      payload,
      ticket
    });

    return voteResult;
  }
}
