import CryptoJS from 'crypto-js';
import { solidityPackedSha256 } from 'ethers';
import { groth16, ZKArtifact } from 'snarkjs';

import { MaciAccount } from './libs/account';
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
  unpackElement,
  packElement
} from './libs/crypto';
import { encryptOdevity, decrypt } from './libs/crypto/rerandomize';
import { poseidon } from './libs/crypto/hashing';
import { poseidonEncrypt, poseidonDecrypt } from '@zk-kit/poseidon-cipher';
import { verifySignature } from '@zk-kit/eddsa-poseidon';
import {
  OperatorClientParams,
  DerivePathParams,
  PubKey,
  PrivKey,
  DeactivateMessage
} from './types';
import { Indexer, Http } from './libs';
import { getDefaultParams } from './libs/const';
import { isErrorResponse } from './libs/maci/maci';

const UINT96 = 2n ** 96n;
const UINT32 = 2n ** 32n;

const MACI_STATES = {
  FILLING: 0, // sign up & publish message
  PROCESSING: 1, // batch process message
  TALLYING: 2, // tally votes
  ENDED: 3 // ended
};

type Message = {
  ciphertext: bigint[];
  encPubKey: PubKey;
  prevHash: bigint;
  hash: bigint;
};

type Command = {
  nonce: bigint;
  stateIdx: bigint;
  voIdx: bigint;
  newVotes: bigint;
  newPubKey: PubKey;
  signature: {
    R8: PubKey;
    S: bigint;
  };
  msgHash: bigint;
};

type StateLeaf = {
  pubKey: PubKey;
  balance: bigint;
  voTree: Tree;
  nonce: bigint;
  voted: boolean;
  d1: PubKey;
  d2: PubKey;
};

type LogEntry = {
  type: string;
  data: LogData;
  inputs?: unknown[];
};

type LogData = {
  leafIdx?: number;
  pubKey?: PubKey | string[];
  balance?: number | bigint | string;
  message?: bigint[] | string[];
  encPubKey?: PubKey | string[];
  proof?: ProofData;
  size?: number;
  newDeactivateCommitment?: bigint | string;
  newDeactivateRoot?: bigint | string;
  newStateCommitment?: bigint | string;
  newTallyCommitment?: bigint | string;
  d?: string[];
  nullifier?: bigint | string;
  results?: bigint[] | string[];
  salt?: bigint | string;
};

type ProofData = {
  a: string;
  b: string;
  c: string;
};

interface ProcessDeactivateResult {
  input: DeactivateProcessInput;
  newDeactivate: bigint[][];
  proof?: ProofData;
}

interface DeactivateProcessInput {
  inputHash: bigint;
  currentActiveStateRoot: bigint;
  currentDeactivateRoot: bigint;
  batchStartHash: bigint;
  batchEndHash: bigint;
  msgs: bigint[][];
  coordPrivKey: bigint;
  coordPubKey: PubKey;
  encPubKeys: PubKey[];
  c1: PubKey[];
  c2: PubKey[];
  currentActiveState: (bigint | number)[];
  newActiveState: bigint[];
  deactivateIndex0: number;
  currentStateRoot: bigint;
  currentStateLeaves: (bigint | number)[][];
  currentStateLeavesPathElements: bigint[][][];
  activeStateLeavesPathElements: bigint[][][];
  deactivateLeavesPathElements: bigint[][][];
  currentDeactivateCommitment: bigint;
  newDeactivateRoot: bigint;
  newDeactivateCommitment: bigint;
}

interface ProcessMessageResult {
  input: MessageProcessInput;
  proof?: ProofData;
}

interface MessageProcessInput {
  inputHash: bigint;
  packedVals: bigint;
  batchStartHash: bigint;
  batchEndHash: bigint;
  msgs: bigint[][];
  coordPrivKey: bigint;
  coordPubKey: PubKey;
  encPubKeys: PubKey[];
  currentStateRoot: bigint;
  currentStateLeaves: (bigint | number)[][];
  currentStateLeavesPathElements: bigint[][][];
  currentStateCommitment: bigint;
  currentStateSalt: bigint;
  newStateCommitment: bigint;
  newStateSalt: bigint;
  currentVoteWeights: bigint[];
  currentVoteWeightsPathElements: bigint[][][];
  activeStateRoot: bigint;
  deactivateRoot: bigint;
  deactivateCommitment: bigint;
  activeStateLeaves: (bigint | number)[];
  activeStateLeavesPathElements: bigint[][][];
}

interface ProcessTallyResult {
  input: TallyProcessInput;
  proof?: ProofData;
}

interface TallyProcessInput {
  stateRoot: bigint;
  stateSalt: bigint;
  packedVals: bigint;
  stateCommitment: bigint;
  currentTallyCommitment: bigint;
  newTallyCommitment: bigint;
  inputHash: bigint;
  stateLeaf: (bigint | number)[][];
  statePathElements: bigint[][];
  votes: bigint[][];
  currentResults: bigint[];
  currentResultsRootSalt: bigint;
  newResultsRootSalt: bigint;
}

/**
 * @class Maci Operator Client
 * @description This class is used to interact with Maci Operator/Coordinator functionalities.
 */
export class OperatorClient {
  public network: 'mainnet' | 'testnet';

  public accountManager: MaciAccount;

  public http: Http;
  public indexer: Indexer;

  public restEndpoint: string;
  public apiEndpoint: string;
  public registryAddress: string;

  // MACI State Management
  public pubKeyHasher?: bigint;
  public stateTreeDepth?: number;
  public deactivateTreeDepth?: number;
  public intStateTreeDepth?: number;
  public voteOptionTreeDepth?: number;
  public batchSize?: number;
  public maxVoteOptions?: number;
  public voSize?: number;
  public numSignUps?: number;
  public isQuadraticCost?: boolean;

  // Trees
  public voTreeZeroRoot?: bigint;
  public stateTree?: Tree;
  public activeStateTree?: Tree;
  public deactivateTree?: Tree;
  public tallyResults?: Tree;

  // State
  public deactivateSize: number = 0;
  public dCommands: (Command | null)[] = [];
  public dMessages: Message[] = [];
  public processedDMsgCount: number = 0;
  public stateLeaves: Map<number, StateLeaf> = new Map();
  public commands: (Command | null)[] = [];
  public messages: Message[] = [];
  public states: number = MACI_STATES.FILLING;
  public logs: LogEntry[] = [];

  // Processing state
  public msgEndIdx: number = 0;
  public stateSalt: bigint = 0n;
  public stateCommitment: bigint = 0n;
  public batchNum: number = 0;
  public tallySalt: bigint = 0n;
  public tallyCommitment: bigint = 0n;

  /**
   * @constructor
   * @param {OperatorClientParams} params - The parameters for the Maci Operator Client instance.
   */
  constructor({
    network,
    mnemonic,
    secretKey,
    apiEndpoint,
    restEndpoint,
    registryAddress,
    customFetch,
    defaultOptions
  }: OperatorClientParams) {
    this.network = network;
    this.accountManager = new MaciAccount({ mnemonic, secretKey });

    const defaultParams = getDefaultParams(network);

    this.restEndpoint = restEndpoint || defaultParams.restEndpoint;
    this.apiEndpoint = apiEndpoint || defaultParams.apiEndpoint; // Indexer GraphQL API
    this.registryAddress = registryAddress || defaultParams.registryAddress;

    this.http = new Http(this.apiEndpoint, this.restEndpoint, customFetch, defaultOptions);
    this.indexer = new Indexer({
      restEndpoint: this.restEndpoint,
      apiEndpoint: this.apiEndpoint, // Indexer GraphQL API
      registryAddress: this.registryAddress,
      http: this.http
    });
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

  buildVotePayload({
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
    operatorPubkey: bigint | string | PubKey,
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
    operatorPubkey: bigint | string | PubKey,
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
      // if (!salt) {
      //   // uint56
      //   salt = BigInt(`0x${CryptoJS.lib.WordArray.random(7).toString(CryptoJS.enc.Hex)}`);
      // }

      // const packaged =
      //   BigInt(nonce) +
      //   (BigInt(stateIdx) << 32n) +
      //   (BigInt(voIdx) << 64n) +
      //   (BigInt(newVotes) << 96n) +
      //   (BigInt(salt) << 192n);
      const packaged = packElement({ nonce, stateIdx, voIdx, newVotes, salt });

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

  async getStateIdx({
    contractAddress,
    pubkey
  }: {
    contractAddress: string;
    pubkey?: PubKey | string | bigint;
  }) {
    pubkey = this.unpackMaciPubkey(pubkey || this.accountManager.currentPubkey.toPoints());

    const response = await this.indexer.getSignUpEventByPubKey(contractAddress, pubkey);

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
    operatorPubkey: bigint | string | PubKey;
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
    operatorPubkey: bigint | string | PubKey;
    derivePathParams?: DerivePathParams;
  }) {
    const payload = this.batchGenMessage(stateIdx, operatorPubkey, [[0, 0]], derivePathParams);
    return stringizing(payload[0]) as {
      msg: string[];
      encPubkeys: string[];
    };
  }

  // ==================== MACI Coordinator Methods ====================

  /**
   * Initialize MACI coordinator state
   */
  initMaci({
    stateTreeDepth,
    intStateTreeDepth,
    voteOptionTreeDepth,
    batchSize,
    maxVoteOptions,
    numSignUps,
    isQuadraticCost = false,
    derivePathParams
  }: {
    stateTreeDepth: number;
    intStateTreeDepth: number;
    voteOptionTreeDepth: number;
    batchSize: number;
    maxVoteOptions: number;
    numSignUps: number;
    isQuadraticCost?: boolean;
    derivePathParams?: DerivePathParams;
  }) {
    this.stateTreeDepth = stateTreeDepth;
    this.deactivateTreeDepth = stateTreeDepth + 2;
    this.intStateTreeDepth = intStateTreeDepth;
    this.voteOptionTreeDepth = voteOptionTreeDepth;
    this.batchSize = batchSize;
    this.maxVoteOptions = maxVoteOptions;
    this.voSize = 5 ** voteOptionTreeDepth;
    this.numSignUps = numSignUps;
    this.isQuadraticCost = isQuadraticCost;

    const signer = this.getSigner(derivePathParams);
    this.pubKeyHasher = poseidon(signer.getPublicKey().toPoints());

    const zeroHash5 = poseidon([0n, 0n, 0n, 0n, 0n]);
    const zeroHash10 = poseidon([zeroHash5, zeroHash5]);

    const emptyVOTree = new Tree(5, voteOptionTreeDepth, 0n);
    const stateTree = new Tree(5, stateTreeDepth, zeroHash10);

    console.log('Init MACI Coordinator:');
    console.log('- Vote option tree root:', emptyVOTree.root);
    console.log('- State tree root:', stateTree.root);

    this.voTreeZeroRoot = emptyVOTree.root;
    this.stateTree = stateTree;
    this.activeStateTree = new Tree(5, stateTreeDepth, 0n);
    this.deactivateTree = new Tree(5, this.deactivateTreeDepth, 0n);
    this.deactivateSize = 0;
    this.dCommands = [];
    this.dMessages = [];
    this.processedDMsgCount = 0;
    this.stateLeaves = new Map();
    this.commands = [];
    this.messages = [];
    this.states = MACI_STATES.FILLING;
    this.logs = [];
  }

  /**
   * Get empty message
   */
  private emptyMessage(): Message {
    return {
      ciphertext: [0n, 0n, 0n, 0n, 0n, 0n, 0n],
      encPubKey: [0n, 0n],
      prevHash: 0n,
      hash: 0n
    };
  }

  /**
   * Get empty state
   */
  private emptyState(): StateLeaf {
    if (!this.voteOptionTreeDepth) {
      throw new Error('MACI not initialized. Call initMaci first.');
    }
    return {
      pubKey: [0n, 0n],
      balance: 0n,
      voTree: new Tree(5, this.voteOptionTreeDepth, 0n),
      nonce: 0n,
      voted: false,
      d1: [0n, 0n],
      d2: [0n, 0n]
    };
  }

  /**
   * Decrypt message to command
   */
  private msgToCmd(
    ciphertext: bigint[],
    encPubKey: PubKey,
    derivePathParams?: DerivePathParams
  ): Command | null {
    const signer = this.getSigner(derivePathParams);
    const sharedKey = signer.genEcdhSharedKey(encPubKey);
    // const sharedKey = genEcdhSharedKey(this.coordinator.privKey, encPubKey);
    try {
      const plaintext = poseidonDecrypt(ciphertext, sharedKey, 0n, 6);
      const packaged = plaintext[0];

      // const nonce = packaged % UINT32;
      // const stateIdx = (packaged >> 32n) % UINT32;
      // const voIdx = (packaged >> 64n) % UINT32;
      // const newVotes = (packaged >> 96n) % UINT96;
      const { nonce, stateIdx, voIdx, newVotes } = unpackElement(packaged);

      const cmd: Command = {
        nonce,
        stateIdx,
        voIdx,
        newVotes,
        newPubKey: [plaintext[1], plaintext[2]],
        signature: {
          R8: [plaintext[3], plaintext[4]],
          S: plaintext[5]
        },
        msgHash: poseidon(plaintext.slice(0, 3))
      };
      return cmd;
    } catch (e) {
      console.log('[dev] msg decrypt error');
      return null;
    }
  }

  /**
   * Initialize state tree leaf
   */
  initStateTree(
    leafIdx: number,
    pubKey: PubKey,
    balance: number | bigint,
    c: [bigint, bigint, bigint, bigint] = [0n, 0n, 0n, 0n]
  ) {
    if (this.states !== MACI_STATES.FILLING) {
      throw new Error('Vote period ended');
    }
    if (!this.stateTree) {
      throw new Error('MACI not initialized. Call initMaci first.');
    }

    const s = this.stateLeaves.get(leafIdx) || this.emptyState();
    s.pubKey = [...pubKey];
    s.balance = BigInt(balance);
    s.d1 = [c[0], c[1]];
    s.d2 = [c[2], c[3]];

    this.stateLeaves.set(leafIdx, s);

    const zeroHash5 = poseidon([0n, 0n, 0n, 0n, 0n]);
    const hash = poseidon([
      poseidon([...s.pubKey, s.balance, s.voted ? s.voTree.root : 0n, s.nonce]),
      c ? poseidon([...c, 0n]) : zeroHash5
    ]);
    this.stateTree.updateLeaf(leafIdx, hash);

    console.log(`Set State Leaf ${leafIdx}:`);
    console.log('- Leaf hash:', hash.toString());
    console.log('- New tree root:', this.stateTree.root.toString());

    this.logs.push({
      type: 'setStateLeaf',
      data: {
        leafIdx,
        pubKey: stringizing(pubKey) as string[],
        balance: typeof balance === 'bigint' ? balance.toString() : balance.toString()
      }
    });
  }

  /**
   * Push deactivate message
   */
  pushDeactivateMessage(ciphertext: bigint[], encPubKey: PubKey) {
    if (this.states !== MACI_STATES.FILLING) {
      throw new Error('Vote period ended');
    }

    const msgIdx = this.dMessages.length;
    const prevHash = msgIdx > 0 ? this.dMessages[msgIdx - 1].hash : 0n;

    const hash = poseidon([
      poseidon(ciphertext.slice(0, 5)),
      poseidon([...ciphertext.slice(5), ...encPubKey, prevHash])
    ]);

    this.dMessages.push({
      ciphertext: [...ciphertext],
      encPubKey: [...encPubKey],
      prevHash,
      hash
    });

    this.dCommands.push(this.msgToCmd(ciphertext, encPubKey));

    console.log(`Push Deactivate Message ${msgIdx}:`);
    console.log('- Old msg hash:', prevHash.toString());
    console.log('- New msg hash:', hash.toString());

    this.logs.push({
      type: 'publishDeactivateMessage',
      data: {
        message: stringizing(ciphertext) as string[],
        encPubKey: stringizing(encPubKey) as string[]
      }
    });
  }

  /**
   * Push vote message
   */
  pushMessage(
    ciphertext: bigint[],
    encPubKey: PubKey
  ): {
    message: Message;
    command: Command | null;
  } {
    if (this.states !== MACI_STATES.FILLING) {
      throw new Error('Vote period ended');
    }

    const msgIdx = this.messages.length;
    const prevHash = msgIdx > 0 ? this.messages[msgIdx - 1].hash : 0n;

    const hash = poseidon([
      poseidon(ciphertext.slice(0, 5)),
      poseidon([...ciphertext.slice(5), ...encPubKey, prevHash])
    ]);

    this.messages.push({
      ciphertext: [...ciphertext],
      encPubKey: [...encPubKey],
      prevHash,
      hash
    });

    this.commands.push(this.msgToCmd(ciphertext, encPubKey));

    console.log(`Push Message ${msgIdx}:`);
    console.log('- Old msg hash:', prevHash.toString());
    console.log('- New msg hash:', hash.toString());

    this.logs.push({
      type: 'publishMessage',
      data: {
        message: stringizing(ciphertext) as string[],
        encPubKey: stringizing(encPubKey) as string[]
      }
    });

    return {
      message: {
        ciphertext: [...ciphertext],
        encPubKey: [...encPubKey],
        prevHash,
        hash
      },
      command: this.commands[msgIdx]
    };
  }

  /**
   * End vote period and transition to processing state
   */
  endVotePeriod() {
    if (this.states !== MACI_STATES.FILLING) {
      throw new Error('Vote period already ended');
    }
    if (!this.stateTree) {
      throw new Error('MACI not initialized. Call initMaci first.');
    }

    this.states = MACI_STATES.PROCESSING;
    this.msgEndIdx = this.messages.length;
    this.stateSalt = 0n;
    this.stateCommitment = poseidon([this.stateTree.root, 0n]);

    console.log('Vote Period Ended');
    console.log('- Total messages:', this.messages.length);
  }

  /**
   * Process deactivate messages and generate proof input
   */
  async processDeactivateMessages({
    inputSize,
    subStateTreeLength,
    wasmFile,
    zkeyFile,
    derivePathParams
  }: {
    inputSize: number;
    subStateTreeLength: number;
    wasmFile?: ZKArtifact;
    zkeyFile?: ZKArtifact;
    derivePathParams?: DerivePathParams;
  }): Promise<ProcessDeactivateResult> {
    const signer = this.getSigner(derivePathParams);

    if (!this.batchSize || !this.stateTree || !this.activeStateTree || !this.deactivateTree) {
      throw new Error('MACI not initialized. Call initMaci first.');
    }

    const batchSize = this.batchSize;
    const batchStartIdx = this.processedDMsgCount;
    const size = Math.min(inputSize, this.dMessages.length - batchStartIdx);
    const batchEndIdx = batchStartIdx + size;

    console.log(`Process deactivate messages [${batchStartIdx}, ${batchEndIdx})`);

    const messages = this.dMessages.slice(batchStartIdx, batchEndIdx);
    const commands = this.dCommands.slice(batchStartIdx, batchEndIdx);

    while (messages.length < batchSize) {
      messages.push(this.emptyMessage());
      commands.push(null);
    }

    const subStateTree = this.stateTree.subTree(subStateTreeLength);
    const currentStateRoot = subStateTree.root;
    const deactivateIndex0 = this.processedDMsgCount;

    const currentActiveStateRoot = this.activeStateTree.root;
    const currentDeactivateRoot = this.deactivateTree.root;
    const currentDeactivateCommitment = poseidon([currentActiveStateRoot, currentDeactivateRoot]);

    // Process
    const currentActiveState = new Array(batchSize);
    const newActiveState = new Array(batchSize);
    const currentStateLeaves = new Array(batchSize);
    const currentStateLeavesPathElements = new Array(batchSize);
    const activeStateLeavesPathElements = new Array(batchSize);
    const deactivateLeavesPathElements = new Array(batchSize);

    for (let i = 0; i < batchSize; i++) {
      newActiveState[i] = BigInt(this.processedDMsgCount + i + 1);
    }

    const newDeactivate: bigint[][] = [];
    const c1: PubKey[] = [];
    const c2: PubKey[] = [];

    for (let i = 0; i < batchSize; i++) {
      const cmd = commands[i];
      const error = this.checkDeactivateCommand(cmd, subStateTreeLength);

      let stateIdx = 5 ** this.stateTreeDepth! - 1;
      if (!error) {
        stateIdx = Number(cmd!.stateIdx);
      }

      const s = this.stateLeaves.get(stateIdx) || this.emptyState();
      currentStateLeaves[i] = [
        ...s.pubKey,
        s.balance,
        s.voted ? s.voTree.root : 0n,
        s.nonce,
        s.d1[0],
        s.d1[1],
        s.d2[0],
        s.d2[1],
        0n
      ];
      currentStateLeavesPathElements[i] = subStateTree.pathElementOf(stateIdx);
      activeStateLeavesPathElements[i] = this.activeStateTree.pathElementOf(stateIdx);
      deactivateLeavesPathElements[i] = this.deactivateTree.pathElementOf(deactivateIndex0 + i);
      currentActiveState[i] = this.activeStateTree.leaf(stateIdx);

      const sharedKey = signer.genEcdhSharedKey(s.pubKey);

      // Generate rerandomized deactivate flag
      const deactivate = this.encryptOdevity(
        !!error,
        signer.getPublicKey().toPoints(),
        this.genStaticRandomKey(signer.getPrivateKey(), 20040n, newActiveState[i])
      );
      const dLeaf = [
        deactivate.c1[0],
        deactivate.c1[1],
        deactivate.c2[0],
        deactivate.c2[1],
        poseidon(sharedKey)
      ];
      c1.push([deactivate.c1[0], deactivate.c1[1]]);
      c2.push([deactivate.c2[0], deactivate.c2[1]]);

      if (!error) {
        this.activeStateTree.updateLeaf(stateIdx, newActiveState[i]);
        this.deactivateTree.updateLeaf(deactivateIndex0 + i, poseidon(dLeaf));
        newDeactivate.push(dLeaf);
      } else if (messages[i].ciphertext[0] !== 0n) {
        this.deactivateTree.updateLeaf(deactivateIndex0 + i, poseidon(dLeaf));
        newDeactivate.push(dLeaf);
      }

      console.log(`- Message <${i}> ${error || '✓'}`);
    }

    const newDeactivateRoot = this.deactivateTree.root;
    const newDeactivateCommitment = poseidon([this.activeStateTree.root, newDeactivateRoot]);

    // Generate input
    const batchStartHash = this.dMessages[batchStartIdx].prevHash;
    const batchEndHash = this.dMessages[batchEndIdx - 1].hash;

    const inputHash =
      BigInt(
        solidityPackedSha256(
          new Array(7).fill('uint256'),
          stringizing([
            newDeactivateRoot,
            this.pubKeyHasher!,
            batchStartHash,
            batchEndHash,
            currentDeactivateCommitment,
            newDeactivateCommitment,
            subStateTree.root
          ]) as string[]
        )
      ) % SNARK_FIELD_SIZE;

    const msgs = messages.map((msg) => msg.ciphertext);
    const encPubKeys = messages.map((msg) => msg.encPubKey);
    const input = {
      inputHash,
      currentActiveStateRoot,
      currentDeactivateRoot,
      batchStartHash,
      batchEndHash,
      msgs,
      coordPrivKey: signer.getFormatedPrivKey(),
      coordPubKey: signer.getPublicKey().toPoints(),
      encPubKeys,
      c1,
      c2,
      currentActiveState,
      newActiveState,
      deactivateIndex0,
      currentStateRoot,
      currentStateLeaves,
      currentStateLeavesPathElements,
      activeStateLeavesPathElements,
      deactivateLeavesPathElements,
      currentDeactivateCommitment,
      newDeactivateRoot,
      newDeactivateCommitment
    };

    this.processedDMsgCount = batchEndIdx;

    // Generate proof if wasm and zkey files provided
    let proof;
    if (wasmFile && zkeyFile) {
      const res = await groth16.fullProve(input, wasmFile, zkeyFile);
      proof = await adaptToUncompressed(res.proof);

      this.logs.push({
        type: 'proofDeactivate',
        data: {
          proof,
          size,
          newDeactivateCommitment: stringizing(input.newDeactivateCommitment) as string,
          newDeactivateRoot: stringizing(input.newDeactivateRoot) as string
        }
      });
    }

    return { input, newDeactivate, proof };
  }

  /**
   * Check deactivate command validity
   */
  private checkDeactivateCommand(
    cmd: Command | null,
    subStateTreeLength: number
  ): string | undefined {
    if (!cmd) {
      return 'empty command';
    }
    if (cmd.stateIdx >= BigInt(subStateTreeLength)) {
      return 'state leaf index overflow';
    }
    const stateIdx = Number(cmd.stateIdx);
    const s = this.stateLeaves.get(stateIdx) || this.emptyState();

    // Check if already deactivated
    const deactivate = this.decryptDeactivate({
      c1: { x: s.d1[0], y: s.d1[1] },
      c2: { x: s.d2[0], y: s.d2[1] },
      xIncrement: 0n
    });
    if (deactivate % 2n === 1n) {
      return 'deactivated';
    }

    const verified = verifySignature(cmd.msgHash, cmd.signature, s.pubKey);
    if (!verified) {
      return 'signature error';
    }
  }

  /**
   * Helper: Generate static random key
   */
  private genStaticRandomKey(privKey: PrivKey, salt: bigint, index: bigint): PrivKey {
    return poseidon([privKey, salt, index]);
  }

  /**
   * Helper: Encrypt oddity (for deactivate flag)
   */
  private encryptOdevity(
    isOdd: boolean,
    pubKey: PubKey,
    randomKey: PrivKey
  ): { c1: PubKey; c2: PubKey } {
    const result = encryptOdevity(isOdd, pubKey, randomKey);
    return { c1: [result.c1.x, result.c1.y], c2: [result.c2.x, result.c2.y] };
  }

  /**
   * Helper: Decrypt deactivate flag
   */
  private decryptDeactivate(
    encrypted: {
      c1: { x: bigint; y: bigint };
      c2: { x: bigint; y: bigint };
      xIncrement: bigint;
    },
    derivePathParams?: DerivePathParams
  ): bigint {
    const signer = this.getSigner(derivePathParams);
    return decrypt(signer.getFormatedPrivKey(), encrypted);
  }

  /**
   * Process messages and generate proof input
   */
  async processMessages({
    newStateSalt = 0n,
    wasmFile,
    zkeyFile,
    derivePathParams
  }: {
    newStateSalt?: bigint;
    wasmFile?: ZKArtifact;
    zkeyFile?: ZKArtifact;
    derivePathParams?: DerivePathParams;
  } = {}): Promise<ProcessMessageResult> {
    const signer = this.getSigner(derivePathParams);

    if (this.states !== MACI_STATES.PROCESSING) {
      throw new Error('Period error - not in processing state');
    }
    if (!this.batchSize || !this.stateTree || !this.activeStateTree || !this.deactivateTree) {
      throw new Error('MACI not initialized. Call initMaci first.');
    }

    const batchSize = this.batchSize;
    const batchStartIdx = Math.floor((this.msgEndIdx - 1) / batchSize) * batchSize;
    const batchEndIdx = Math.min(batchStartIdx + batchSize, this.msgEndIdx);

    console.log(`Process messages [${batchStartIdx}, ${batchEndIdx})`);

    const messages = this.messages.slice(batchStartIdx, batchEndIdx);
    const commands = this.commands.slice(batchStartIdx, batchEndIdx);

    while (messages.length < batchSize) {
      messages.push(this.emptyMessage());
      commands.push(null);
    }

    const currentStateRoot = this.stateTree.root;

    // Process
    const currentStateLeaves = new Array(batchSize);
    const currentStateLeavesPathElements = new Array(batchSize);
    const currentVoteWeights = new Array(batchSize);
    const currentVoteWeightsPathElements = new Array(batchSize);
    const activeStateLeaves = new Array(batchSize);
    const activeStateLeavesPathElements = new Array(batchSize);

    for (let i = batchSize - 1; i >= 0; i--) {
      const cmd = commands[i];
      const error = this.checkCommandNow(cmd);

      let stateIdx = 5 ** this.stateTreeDepth! - 1;
      let voIdx = 0;
      if (!error) {
        stateIdx = Number(cmd!.stateIdx);
        voIdx = Number(cmd!.voIdx);
      }

      const s = this.stateLeaves.get(stateIdx) || this.emptyState();
      const currVotes = s.voTree.leaf(voIdx);
      currentStateLeaves[i] = [
        ...s.pubKey,
        s.balance,
        s.voted ? s.voTree.root : 0n,
        s.nonce,
        ...s.d1,
        ...s.d2,
        0n
      ];
      currentStateLeavesPathElements[i] = this.stateTree.pathElementOf(stateIdx);
      currentVoteWeights[i] = currVotes;
      currentVoteWeightsPathElements[i] = s.voTree.pathElementOf(voIdx);

      activeStateLeaves[i] = this.activeStateTree.leaf(stateIdx);
      activeStateLeavesPathElements[i] = this.activeStateTree.pathElementOf(stateIdx);

      if (!error) {
        // Update state
        s.pubKey = [...cmd!.newPubKey];
        if (this.isQuadraticCost) {
          s.balance = s.balance + currVotes * currVotes - cmd!.newVotes * cmd!.newVotes;
        } else {
          s.balance = s.balance + currVotes - cmd!.newVotes;
        }
        s.voTree.updateLeaf(voIdx, cmd!.newVotes);
        s.nonce = cmd!.nonce;
        s.voted = true;

        this.stateLeaves.set(stateIdx, s);

        const zeroHash5 = poseidon([0n, 0n, 0n, 0n, 0n]);
        const hash = poseidon([
          poseidon([...s.pubKey, s.balance, s.voTree.root, s.nonce]),
          poseidon([...s.d1, ...s.d2, 0n])
        ]);
        this.stateTree.updateLeaf(stateIdx, hash);
      }

      console.log(`- Message <${i}> ${error || '✓'}`);
    }

    const newStateRoot = this.stateTree.root;
    const newStateCommitment = poseidon([newStateRoot, newStateSalt]);

    // Generate input
    const packedVals =
      BigInt(this.maxVoteOptions!) +
      (BigInt(this.numSignUps!) << 32n) +
      (this.isQuadraticCost ? 1n << 64n : 0n);
    const batchStartHash = this.messages[batchStartIdx].prevHash;
    const batchEndHash = this.messages[batchEndIdx - 1].hash;

    const activeStateRoot = this.activeStateTree.root;
    const deactivateRoot = this.deactivateTree.root;
    const deactivateCommitment = poseidon([activeStateRoot, deactivateRoot]);

    const inputHash =
      BigInt(
        solidityPackedSha256(
          new Array(7).fill('uint256'),
          stringizing([
            packedVals,
            this.pubKeyHasher!,
            batchStartHash,
            batchEndHash,
            this.stateCommitment,
            newStateCommitment,
            deactivateCommitment
          ]) as string[]
        )
      ) % SNARK_FIELD_SIZE;

    const msgs = messages.map((msg) => msg.ciphertext);
    const encPubKeys = messages.map((msg) => msg.encPubKey);
    const input = {
      inputHash,
      packedVals,
      batchStartHash,
      batchEndHash,
      msgs,
      coordPrivKey: signer.getFormatedPrivKey(),
      coordPubKey: signer.getPublicKey().toPoints(),
      encPubKeys,
      currentStateRoot,
      currentStateLeaves,
      currentStateLeavesPathElements,
      currentStateCommitment: this.stateCommitment,
      currentStateSalt: this.stateSalt,
      newStateCommitment,
      newStateSalt,
      currentVoteWeights,
      currentVoteWeightsPathElements,
      activeStateRoot,
      deactivateRoot,
      deactivateCommitment,
      activeStateLeaves,
      activeStateLeavesPathElements
    };

    this.msgEndIdx = batchStartIdx;
    this.stateCommitment = newStateCommitment;
    this.stateSalt = newStateSalt;

    console.log('New state root:', newStateRoot.toString());

    if (batchStartIdx === 0) {
      this.endProcessingPeriod();
    }

    // Generate proof if wasm and zkey files provided
    let proof;
    if (wasmFile && zkeyFile) {
      const res = await groth16.fullProve(input, wasmFile, zkeyFile);
      proof = await adaptToUncompressed(res.proof);

      this.logs.push({
        type: 'processMessage',
        data: {
          proof,
          newStateCommitment: stringizing(input.newStateCommitment) as string
        }
      });
    }

    return { input, proof };
  }

  /**
   * Check command validity
   */
  private checkCommandNow(
    cmd: Command | null,
    derivePathParams?: DerivePathParams
  ): string | undefined {
    const signer = this.getSigner(derivePathParams);

    if (!cmd) {
      return 'empty command';
    }
    if (cmd.stateIdx > BigInt(this.numSignUps!)) {
      return 'state leaf index overflow';
    }
    if (cmd.voIdx > BigInt(this.maxVoteOptions!)) {
      return 'vote option index overflow';
    }
    const stateIdx = Number(cmd.stateIdx);
    const voIdx = Number(cmd.voIdx);
    const s = this.stateLeaves.get(stateIdx) || this.emptyState();

    const as = this.activeStateTree!.leaf(stateIdx) || 0n;
    if (as !== 0n) {
      return 'inactive';
    }

    const deactivate = decrypt(signer.getFormatedPrivKey(), {
      c1: { x: s.d1[0], y: s.d1[1] },
      c2: { x: s.d2[0], y: s.d2[1] },
      xIncrement: 0n
    });
    if (deactivate % 2n === 1n) {
      return 'deactivated';
    }

    if (s.nonce + 1n !== cmd.nonce) {
      return 'nonce error';
    }
    const verified = verifySignature(cmd.msgHash, cmd.signature, s.pubKey);
    if (!verified) {
      return 'signature error';
    }
    const currVotes = s.voTree.leaf(voIdx);
    if (this.isQuadraticCost) {
      if (s.balance + currVotes * currVotes < cmd.newVotes * cmd.newVotes) {
        return 'insufficient balance';
      }
    } else {
      if (s.balance + currVotes < cmd.newVotes) {
        return 'insufficient balance';
      }
    }
  }

  /**
   * End processing period and transition to tallying state
   */
  private endProcessingPeriod() {
    if (this.states !== MACI_STATES.PROCESSING) {
      throw new Error('Not in processing state');
    }
    this.states = MACI_STATES.TALLYING;
    this.batchNum = 0;
    this.tallySalt = 0n;
    this.tallyCommitment = 0n;
    this.tallyResults = new Tree(5, this.voteOptionTreeDepth!, 0n);

    console.log('Processing Period Ended');
  }

  /**
   * Process tally and generate proof input
   */
  async processTally({
    tallySalt = 0n,
    wasmFile,
    zkeyFile
  }: {
    tallySalt?: bigint;
    wasmFile?: ZKArtifact;
    zkeyFile?: ZKArtifact;
  } = {}): Promise<ProcessTallyResult> {
    if (this.states !== MACI_STATES.TALLYING) {
      throw new Error('Period error - not in tallying state');
    }
    if (!this.stateTree || !this.tallyResults || !this.intStateTreeDepth) {
      throw new Error('MACI not initialized. Call initMaci first.');
    }

    const batchSize = 5 ** this.intStateTreeDepth;
    const batchStartIdx = this.batchNum * batchSize;
    const batchEndIdx = batchStartIdx + batchSize;

    console.log(`Process tally [${batchStartIdx}, ${batchEndIdx})`);

    const statePathElements = this.stateTree
      .pathElementOf(batchStartIdx)
      .slice(this.intStateTreeDepth);

    // Process
    const currentResults = this.tallyResults.leaves();
    const stateLeaf = new Array(batchSize);
    const votes = new Array(batchSize);

    const MAX_VOTES = 10n ** 24n;

    for (let i = 0; i < batchSize; i++) {
      const stateIdx = batchStartIdx + i;
      const s = this.stateLeaves.get(stateIdx) || this.emptyState();

      stateLeaf[i] = [
        ...s.pubKey,
        s.balance,
        s.voted ? s.voTree.root : 0n,
        s.nonce,
        ...s.d1,
        ...s.d2,
        0n
      ];
      votes[i] = s.voTree.leaves();

      if (!s.voted) continue;

      for (let j = 0; j < this.voSize!; j++) {
        const v = s.voTree.leaf(j);
        this.tallyResults.updateLeaf(j, this.tallyResults.leaf(j) + v * (v + MAX_VOTES));
      }
    }

    const newTallyCommitment = poseidon([this.tallyResults.root, tallySalt]);

    // Generate input
    const packedVals = BigInt(this.batchNum) + (BigInt(this.numSignUps!) << 32n);

    const inputHash =
      BigInt(
        solidityPackedSha256(
          new Array(4).fill('uint256'),
          stringizing([
            packedVals,
            this.stateCommitment,
            this.tallyCommitment,
            newTallyCommitment
          ]) as string[]
        )
      ) % SNARK_FIELD_SIZE;

    const input = {
      stateRoot: this.stateTree.root,
      stateSalt: this.stateSalt,
      packedVals,
      stateCommitment: this.stateCommitment,
      currentTallyCommitment: this.tallyCommitment,
      newTallyCommitment,
      inputHash,
      stateLeaf,
      statePathElements,
      votes,
      currentResults,
      currentResultsRootSalt: this.tallySalt,
      newResultsRootSalt: tallySalt
    };

    this.batchNum++;
    this.tallyCommitment = newTallyCommitment;
    this.tallySalt = tallySalt;

    console.log('New tally commitment:', newTallyCommitment.toString());

    if (batchEndIdx >= this.numSignUps!) {
      this.states = MACI_STATES.ENDED;
      console.log('Tallying Finished');
    }

    // Generate proof if wasm and zkey files provided
    let proof;
    if (wasmFile && zkeyFile) {
      const res = await groth16.fullProve(input, wasmFile, zkeyFile);
      proof = await adaptToUncompressed(res.proof);

      this.logs.push({
        type: 'processTally',
        data: {
          proof,
          newTallyCommitment: stringizing(input.newTallyCommitment) as string
        }
      });
    }

    return { input, proof };
  }

  /**
   * Get final tally results
   */
  getTallyResults(): bigint[] {
    if (!this.tallyResults || !this.maxVoteOptions) {
      throw new Error('MACI not initialized or tallying not completed');
    }
    return this.tallyResults.leaves().slice(0, this.maxVoteOptions);
  }

  /**
   * Get all logs
   */
  getLogs(): LogEntry[] {
    return this.logs;
  }
}
