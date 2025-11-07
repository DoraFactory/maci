import {
  VoterClient,
  OperatorClient,
  poseidonEncrypt,
  poseidon,
  poseidonDecrypt
} from '@dorafactory/maci-sdk';
import { expect } from 'chai';
import { type WitnessTester } from 'circomkit';

import { getSignal, circomkitInstance } from './utils/utils';

/**
 * MessageToCommand Circuit Tests
 *
 * Circuit Location: packages/circuits/circom/utils/messageToCommand.circom
 *
 * ============================================================================
 * CIRCUIT FUNCTIONALITY
 * ============================================================================
 *
 * The MessageToCommand circuit is the bridge between encrypted messages and
 * decrypted commands in the MACI/aMACI voting system. It performs the following:
 *
 * 1. ECDH Key Exchange: Derives shared key from coordinator's private key
 *    and message's ephemeral public key
 *
 * 2. Poseidon Decryption: Decrypts the message using the shared key
 *
 * 3. Data Unpacking: Extracts individual command fields from packed format
 *
 * ============================================================================
 * DATA FLOW
 * ============================================================================
 *
 * Voter Side (Off-chain):
 *   command = {
 *     nonce: 1,
 *     stateIdx: 5,
 *     voIdx: 2,
 *     newVotes: 100,
 *     newPubKey: [x, y],
 *     signature: [R8[0], R8[1], S]
 *   }
 *   ↓
 *   packed = nonce + (stateIdx << 32) + (voIdx << 64) + (newVotes << 96) + (salt << 192)
 *   ↓
 *   plaintext = [packed, pubKey[0], pubKey[1], R8[0], R8[1], S]
 *   ↓
 *   message = poseidonEncrypt(plaintext, sharedKey, nonce=0)
 *   → 7 elements [c0, c1, c2, c3, c4, c5, c6]
 *
 * Circuit Side (On-chain verification):
 *   message[7] → MessageToCommand → {
 *     stateIndex,
 *     voteOptionIndex,
 *     newVoteWeight,
 *     nonce,
 *     newPubKey[2],
 *     sigR8[2],
 *     sigS,
 *     sharedKey[2]
 *   }
 *
 * ============================================================================
 * CIRCUIT INPUTS & OUTPUTS
 * ============================================================================
 *
 * Inputs:
 *   - message[7]: Encrypted message (7 field elements)
 *   - encPrivKey: Coordinator's private key (for ECDH)
 *   - encPubKey[2]: Message's ephemeral public key
 *
 * Outputs:
 *   - stateIndex: Voter's index in state tree
 *   - voteOptionIndex: Which option being voted for
 *   - newVoteWeight: Amount of votes (can be multi-precision)
 *   - nonce: Message nonce (anti-replay)
 *   - newPubKey[2]: Voter's new public key
 *   - sigR8[2]: EdDSA signature R8 point
 *   - sigS: EdDSA signature S scalar
 *   - sharedKey[2]: ECDH shared key (for verification)
 *
 * ============================================================================
 * SECURITY PROPERTIES
 * ============================================================================
 *
 * 1. Confidentiality: Messages encrypted with ECDH + Poseidon
 * 2. Authenticity: EdDSA signature included in command
 * 3. Anti-Replay: Nonce prevents message replay
 * 4. Integrity: Decryption verifies data hasn't been tampered
 *
 * ============================================================================
 * TECHNICAL DETAILS
 * ============================================================================
 *
 * Message Format (7 elements):
 *   [c0, c1, c2, c3, c4, c5, c6] = poseidonEncrypt([
 *     packaged,    // nonce + stateIdx + voIdx + votes + salt
 *     pubKey[0],   // New public key X
 *     pubKey[1],   // New public key Y
 *     sigR8[0],    // Signature R8 X
 *     sigR8[1],    // Signature R8 Y
 *     sigS         // Signature S
 *   ], sharedKey, 0)
 *
 * Packed Command Format (packaged element):
 *   Bits [0-31]:    nonce (32 bits)
 *   Bits [32-63]:   stateIdx (32 bits)
 *   Bits [64-95]:   voIdx (32 bits)
 *   Bits [96-191]:  newVotes (96 bits - supports very large vote weights)
 *   Bits [192+]:    salt (random value for privacy)
 *
 * ============================================================================
 */
describe('MessageToCommand circuit', function test() {
  this.timeout(300000);

  let circuit: WitnessTester<
    ['message', 'encPrivKey', 'encPubKey'],
    [
      'stateIndex',
      'voteOptionIndex',
      'newVoteWeight',
      'nonce',
      'newPubKey',
      'sigR8',
      'sigS',
      'packedCommandOut',
      'sharedKey'
    ]
  >;

  let voterClient: VoterClient;
  let coordinatorClient: OperatorClient;

  before(async () => {
    // Load the circuit
    circuit = await circomkitInstance.WitnessTester('MessageToCommand', {
      file: 'utils/messageToCommand',
      template: 'MessageToCommand'
    });

    // Initialize voter client (the one who sends encrypted messages)
    voterClient = new VoterClient({
      network: 'testnet',
      secretKey: 12345n
    });

    // Initialize coordinator client (the one who decrypts messages)
    coordinatorClient = new OperatorClient({
      network: 'testnet',
      secretKey: 67890n
    });
  });

  it('should correctly decrypt and unpack a simple vote message', async () => {
    /**
     * Test Case: Basic message decryption
     *
     * This test verifies the complete encryption → decryption flow:
     *
     * 1. Voter creates a vote command
     * 2. Voter encrypts it with coordinator's public key
     * 3. Circuit decrypts using coordinator's private key
     * 4. Circuit extracts all command fields correctly
     *
     * Vote Details:
     *   - stateIdx: 5 (voter is #5 in the state tree)
     *   - voIdx: 2 (voting for option #2)
     *   - votes: 100 (casting 100 votes)
     *   - nonce: 1 (first message)
     */
    const stateIdx = 5;
    const voIdx = 2;
    const votes = 100;
    const nonce = 1;
    const salt = 12345678n;

    // Get coordinator's public key
    const coordPubKey = coordinatorClient.getSigner().getPublicKey().toPoints();

    // Voter creates the packed command
    const packaged =
      BigInt(nonce) +
      (BigInt(stateIdx) << 32n) +
      (BigInt(voIdx) << 64n) +
      (BigInt(votes) << 96n) +
      (BigInt(salt) << 192n);

    // Voter's key pair
    const voterSigner = voterClient.getSigner();
    const voterPubKey = voterSigner.getPublicKey().toPoints();

    // Create message hash and sign it
    const msgHash = poseidon([packaged, voterPubKey[0], voterPubKey[1]]);
    const signature = voterSigner.sign(msgHash);

    // Construct the command (plaintext)
    const command = [
      packaged,
      voterPubKey[0],
      voterPubKey[1],
      signature.R8[0],
      signature.R8[1],
      signature.S
    ];

    // Generate ephemeral key pair for this message
    const ephemeralKeypair = voterClient.getSigner();
    const ephemeralPubKey = ephemeralKeypair.getPublicKey().toPoints();

    // Compute shared key and encrypt
    const sharedKey = ephemeralKeypair.genEcdhSharedKey(coordPubKey);
    const encryptedMessage = poseidonEncrypt(command, sharedKey, 0n);

    // Prepare circuit inputs
    const circuitInputs = {
      message: encryptedMessage,
      encPrivKey: coordinatorClient.getSigner().getFormatedPrivKey(),
      encPubKey: ephemeralPubKey
    };

    // Calculate witness
    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    // Extract outputs
    const outputStateIdx = await getSignal(circuit, witness, 'stateIndex');
    const outputVoIdx = await getSignal(circuit, witness, 'voteOptionIndex');
    const outputVotes = await getSignal(circuit, witness, 'newVoteWeight');
    const outputNonce = await getSignal(circuit, witness, 'nonce');

    const outputPubKey0 = await getSignal(circuit, witness, 'newPubKey[0]');
    const outputPubKey1 = await getSignal(circuit, witness, 'newPubKey[1]');

    const outputSigR8_0 = await getSignal(circuit, witness, 'sigR8[0]');
    const outputSigR8_1 = await getSignal(circuit, witness, 'sigR8[1]');
    const outputSigS = await getSignal(circuit, witness, 'sigS');

    const outputSharedKey0 = await getSignal(circuit, witness, 'sharedKey[0]');
    const outputSharedKey1 = await getSignal(circuit, witness, 'sharedKey[1]');

    // Verify all fields match
    expect(outputStateIdx).to.equal(BigInt(stateIdx));
    expect(outputVoIdx).to.equal(BigInt(voIdx));
    expect(outputVotes).to.equal(BigInt(votes));
    expect(outputNonce).to.equal(BigInt(nonce));

    expect(outputPubKey0).to.equal(voterPubKey[0]);
    expect(outputPubKey1).to.equal(voterPubKey[1]);

    expect(outputSigR8_0).to.equal(signature.R8[0]);
    expect(outputSigR8_1).to.equal(signature.R8[1]);
    expect(outputSigS).to.equal(signature.S);

    expect(outputSharedKey0).to.equal(sharedKey[0]);
    expect(outputSharedKey1).to.equal(sharedKey[1]);
  });

  it('should correctly handle large vote weights (96-bit)', async () => {
    /**
     * Test Case: Large vote weight handling
     *
     * The circuit supports vote weights up to 96 bits (very large numbers).
     * This is achieved using the Uint32to96 template which reconstructs
     * the 96-bit value from three 32-bit chunks.
     *
     * Test value: 2^60 (requires more than 32 bits)
     * Binary: 0x0001000000000000 (61 bits)
     *
     * This tests:
     * - Correct unpacking of large values
     * - Proper reconstruction using Uint32to96
     * - No overflow or precision loss
     */
    const stateIdx = 10;
    const voIdx = 3;
    const votes = 2n ** 60n; // Large vote weight (1,152,921,504,606,846,976)
    const nonce = 2;
    const salt = 98765432n;

    const coordPubKey = coordinatorClient.getSigner().getPublicKey().toPoints();

    const packaged =
      BigInt(nonce) +
      (BigInt(stateIdx) << 32n) +
      (BigInt(voIdx) << 64n) +
      (votes << 96n) +
      (BigInt(salt) << 192n);

    const voterSigner = voterClient.getSigner();
    const voterPubKey = voterSigner.getPublicKey().toPoints();

    const msgHash = poseidon([packaged, voterPubKey[0], voterPubKey[1]]);
    const signature = voterSigner.sign(msgHash);

    const command = [
      packaged,
      voterPubKey[0],
      voterPubKey[1],
      signature.R8[0],
      signature.R8[1],
      signature.S
    ];

    const ephemeralKeypair = voterClient.getSigner();
    const ephemeralPubKey = ephemeralKeypair.getPublicKey().toPoints();

    const sharedKey = ephemeralKeypair.genEcdhSharedKey(coordPubKey);
    const encryptedMessage = poseidonEncrypt(command, sharedKey, 0n);

    const circuitInputs = {
      message: encryptedMessage,
      encPrivKey: coordinatorClient.getSigner().getFormatedPrivKey(),
      encPubKey: ephemeralPubKey
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const outputVotes = await getSignal(circuit, witness, 'newVoteWeight');

    // Verify large vote weight is correctly reconstructed
    expect(outputVotes).to.equal(votes);
  });

  it('should handle maximum 32-bit values for indices', async () => {
    /**
     * Test Case: Maximum index values
     *
     * Both stateIndex and voteOptionIndex are 32-bit fields.
     * This test verifies the circuit can handle the maximum values
     * without overflow or wrapping.
     *
     * Max 32-bit value: 2^32 - 1 = 4,294,967,295
     *
     * This is important for systems with:
     * - Large number of voters (high stateIdx)
     * - Many vote options (high voIdx)
     */
    const stateIdx = 0xffffffff; // Max 32-bit: 4,294,967,295
    const voIdx = 0xffffffff;
    const votes = 50;
    const nonce = 3;
    const salt = 11111111n;

    const coordPubKey = coordinatorClient.getSigner().getPublicKey().toPoints();

    const packaged =
      BigInt(nonce) +
      (BigInt(stateIdx) << 32n) +
      (BigInt(voIdx) << 64n) +
      (BigInt(votes) << 96n) +
      (BigInt(salt) << 192n);

    const voterSigner = voterClient.getSigner();
    const voterPubKey = voterSigner.getPublicKey().toPoints();

    const msgHash = poseidon([packaged, voterPubKey[0], voterPubKey[1]]);
    const signature = voterSigner.sign(msgHash);

    const command = [
      packaged,
      voterPubKey[0],
      voterPubKey[1],
      signature.R8[0],
      signature.R8[1],
      signature.S
    ];

    const ephemeralKeypair = voterClient.getSigner();
    const ephemeralPubKey = ephemeralKeypair.getPublicKey().toPoints();
    const sharedKey = ephemeralKeypair.genEcdhSharedKey(coordPubKey);
    const encryptedMessage = poseidonEncrypt(command, sharedKey, 0n);

    const circuitInputs = {
      message: encryptedMessage,
      encPrivKey: coordinatorClient.getSigner().getFormatedPrivKey(),
      encPubKey: ephemeralPubKey
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const outputStateIdx = await getSignal(circuit, witness, 'stateIndex');
    const outputVoIdx = await getSignal(circuit, witness, 'voteOptionIndex');

    expect(outputStateIdx).to.equal(BigInt(stateIdx));
    expect(outputVoIdx).to.equal(BigInt(voIdx));
  });

  it('should correctly extract packedCommandOut', async () => {
    /**
     * Test Case: Packed command output verification
     *
     * The circuit outputs packedCommandOut[3], which contains the first
     * 3 elements of the decrypted command:
     *   [0]: packaged (nonce + stateIdx + voIdx + votes + salt)
     *   [1]: newPubKey[0]
     *   [2]: newPubKey[1]
     *
     * These packed values are used later in signature verification
     * (MessageValidator circuit).
     *
     * This test ensures the packed output matches the original plaintext.
     */
    const stateIdx = 7;
    const voIdx = 4;
    const votes = 200;
    const nonce = 4;
    const salt = 55555555n;

    const coordPubKey = coordinatorClient.getSigner().getPublicKey().toPoints();

    const packaged =
      BigInt(nonce) +
      (BigInt(stateIdx) << 32n) +
      (BigInt(voIdx) << 64n) +
      (BigInt(votes) << 96n) +
      (BigInt(salt) << 192n);

    const voterSigner = voterClient.getSigner();
    const voterPubKey = voterSigner.getPublicKey().toPoints();

    const msgHash = poseidon([packaged, voterPubKey[0], voterPubKey[1]]);
    const signature = voterSigner.sign(msgHash);

    const command = [
      packaged,
      voterPubKey[0],
      voterPubKey[1],
      signature.R8[0],
      signature.R8[1],
      signature.S
    ];

    const ephemeralKeypair = voterClient.getSigner();
    const ephemeralPubKey = ephemeralKeypair.getPublicKey().toPoints();
    const sharedKey = ephemeralKeypair.genEcdhSharedKey(coordPubKey);
    const encryptedMessage = poseidonEncrypt(command, sharedKey, 0n);

    const circuitInputs = {
      message: encryptedMessage,
      encPrivKey: coordinatorClient.getSigner().getFormatedPrivKey(),
      encPubKey: ephemeralPubKey
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    // Extract packed command output
    const packed0 = await getSignal(circuit, witness, 'packedCommandOut[0]');
    const packed1 = await getSignal(circuit, witness, 'packedCommandOut[1]');
    const packed2 = await getSignal(circuit, witness, 'packedCommandOut[2]');

    // Verify packed output matches original command
    expect(packed0).to.equal(packaged);
    expect(packed1).to.equal(voterPubKey[0]);
    expect(packed2).to.equal(voterPubKey[1]);
  });

  it('should produce correct shared key through ECDH', async () => {
    /**
     * Test Case: ECDH shared key verification
     *
     * This verifies the ECDH key exchange inside the circuit:
     *
     * 1. Voter generates ephemeral keypair
     * 2. Voter computes: sharedKey = ephemeralPrivKey * coordPubKey
     * 3. Circuit computes: sharedKey = coordPrivKey * ephemeralPubKey
     * 4. Both should produce the SAME shared key
     *
     * Mathematical property:
     *   ephemeralPrivKey * coordPubKey = ephemeralPrivKey * (coordPrivKey * G)
     *                                   = (ephemeralPrivKey * coordPrivKey) * G
     *                                   = coordPrivKey * (ephemeralPrivKey * G)
     *                                   = coordPrivKey * ephemeralPubKey
     *
     * This is the foundation of encrypted messaging in MACI.
     */
    const stateIdx = 1;
    const voIdx = 0;
    const votes = 10;
    const nonce = 5;

    const coordPubKey = coordinatorClient.getSigner().getPublicKey().toPoints();

    const packaged =
      BigInt(nonce) + (BigInt(stateIdx) << 32n) + (BigInt(voIdx) << 64n) + (BigInt(votes) << 96n);

    const voterSigner = voterClient.getSigner();
    const voterPubKey = voterSigner.getPublicKey().toPoints();

    const msgHash = poseidon([packaged, voterPubKey[0], voterPubKey[1]]);
    const signature = voterSigner.sign(msgHash);

    const command = [
      packaged,
      voterPubKey[0],
      voterPubKey[1],
      signature.R8[0],
      signature.R8[1],
      signature.S
    ];

    const ephemeralKeypair = voterClient.getSigner();
    const ephemeralPubKey = ephemeralKeypair.getPublicKey().toPoints();

    // Voter side: compute shared key
    const voterSharedKey = ephemeralKeypair.genEcdhSharedKey(coordPubKey);

    const encryptedMessage = poseidonEncrypt(command, voterSharedKey, 0n);

    const circuitInputs = {
      message: encryptedMessage,
      encPrivKey: coordinatorClient.getSigner().getFormatedPrivKey(),
      encPubKey: ephemeralPubKey
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    // Circuit side: extract computed shared key
    const circuitSharedKey0 = await getSignal(circuit, witness, 'sharedKey[0]');
    const circuitSharedKey1 = await getSignal(circuit, witness, 'sharedKey[1]');

    // Both parties should compute the SAME shared key
    expect(circuitSharedKey0).to.equal(voterSharedKey[0]);
    expect(circuitSharedKey1).to.equal(voterSharedKey[1]);
  });

  it('should handle zero vote weight', async () => {
    /**
     * Test Case: Zero vote edge case
     *
     * In some scenarios, voters might want to change their public key
     * or update their state without casting votes. This requires
     * handling newVotes = 0 correctly.
     *
     * This test ensures:
     * - Zero is correctly packed and unpacked
     * - No division by zero or special case errors
     * - Circuit handles empty votes gracefully
     */
    const stateIdx = 15;
    const voIdx = 5;
    const votes = 0; // Zero votes
    const nonce = 6;
    const salt = 99999999n;

    const coordPubKey = coordinatorClient.getSigner().getPublicKey().toPoints();

    const packaged =
      BigInt(nonce) +
      (BigInt(stateIdx) << 32n) +
      (BigInt(voIdx) << 64n) +
      (BigInt(votes) << 96n) +
      (BigInt(salt) << 192n);

    const voterSigner = voterClient.getSigner();
    const voterPubKey = voterSigner.getPublicKey().toPoints();

    const msgHash = poseidon([packaged, voterPubKey[0], voterPubKey[1]]);
    const signature = voterSigner.sign(msgHash);

    const command = [
      packaged,
      voterPubKey[0],
      voterPubKey[1],
      signature.R8[0],
      signature.R8[1],
      signature.S
    ];

    const ephemeralKeypair = voterClient.getSigner();
    const ephemeralPubKey = ephemeralKeypair.getPublicKey().toPoints();
    const sharedKey = ephemeralKeypair.genEcdhSharedKey(coordPubKey);
    const encryptedMessage = poseidonEncrypt(command, sharedKey, 0n);

    const circuitInputs = {
      message: encryptedMessage,
      encPrivKey: coordinatorClient.getSigner().getFormatedPrivKey(),
      encPubKey: ephemeralPubKey
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const outputVotes = await getSignal(circuit, witness, 'newVoteWeight');

    expect(outputVotes).to.equal(0n);
  });

  it('should work with different voter and coordinator keypairs', async () => {
    /**
     * Test Case: Multiple party interaction
     *
     * This test verifies the circuit works correctly when:
     * - Different voters send messages
     * - Same coordinator decrypts all of them
     *
     * This simulates a real MACI scenario where one coordinator
     * processes messages from many different voters.
     */
    // Create a different voter
    const voter2 = new VoterClient({
      network: 'testnet',
      secretKey: 99999n // Different secret key
    });

    const stateIdx = 20;
    const voIdx = 1;
    const votes = 500;
    const nonce = 7;

    const coordPubKey = coordinatorClient.getSigner().getPublicKey().toPoints();

    const packaged =
      BigInt(nonce) + (BigInt(stateIdx) << 32n) + (BigInt(voIdx) << 64n) + (BigInt(votes) << 96n);

    const voter2Signer = voter2.getSigner();
    const voter2PubKey = voter2Signer.getPublicKey().toPoints();

    const msgHash = poseidon([packaged, voter2PubKey[0], voter2PubKey[1]]);
    const signature = voter2Signer.sign(msgHash);

    const command = [
      packaged,
      voter2PubKey[0],
      voter2PubKey[1],
      signature.R8[0],
      signature.R8[1],
      signature.S
    ];

    const ephemeralKeypair = voter2.getSigner();
    const ephemeralPubKey = ephemeralKeypair.getPublicKey().toPoints();
    const sharedKey = ephemeralKeypair.genEcdhSharedKey(coordPubKey);
    const encryptedMessage = poseidonEncrypt(command, sharedKey, 0n);

    const circuitInputs = {
      message: encryptedMessage,
      encPrivKey: coordinatorClient.getSigner().getFormatedPrivKey(),
      encPubKey: ephemeralPubKey
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const outputStateIdx = await getSignal(circuit, witness, 'stateIndex');
    const outputVoIdx = await getSignal(circuit, witness, 'voteOptionIndex');
    const outputVotes = await getSignal(circuit, witness, 'newVoteWeight');
    const outputPubKey0 = await getSignal(circuit, witness, 'newPubKey[0]');
    const outputPubKey1 = await getSignal(circuit, witness, 'newPubKey[1]');

    // Verify voter2's data is correctly decrypted
    expect(outputStateIdx).to.equal(BigInt(stateIdx));
    expect(outputVoIdx).to.equal(BigInt(voIdx));
    expect(outputVotes).to.equal(BigInt(votes));
    expect(outputPubKey0).to.equal(voter2PubKey[0]);
    expect(outputPubKey1).to.equal(voter2PubKey[1]);
  });

  it('should match OperatorClient.pushMessage results with circuit outputs', async () => {
    /**
     * Test Case: OperatorClient Integration Test
     *
     * This test uses OperatorClient's full state management to verify:
     * 1. VoterClient creates encrypted messages
     * 2. OperatorClient.pushMessage() processes and decrypts messages
     * 3. Circuit processes the same messages
     * 4. All results match perfectly
     *
     * This validates the complete SDK workflow that operators actually use.
     */
    const stateIdx = 15;
    const voIdx = 3;
    const votes = 200;

    // Initialize OperatorClient with full state
    const operatorWithState = new OperatorClient({
      network: 'testnet',
      secretKey: 77777n
    });

    // Initialize basic MACI state (minimal setup for testing)
    operatorWithState.stateTreeDepth = 4;
    operatorWithState.intStateTreeDepth = 1;
    operatorWithState.voteOptionTreeDepth = 2;
    operatorWithState.batchSize = 5;
    operatorWithState.maxVoteOptions = 25;
    operatorWithState.numSignUps = 20;
    operatorWithState.states = 0; // MACI_STATES.FILLING

    const coordPubKey = operatorWithState.getSigner().getPublicKey().toPoints();

    // Voter creates message using SDK
    const votePayload = voterClient.buildVotePayload({
      stateIdx,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: voIdx, vc: votes }]
    });

    expect(votePayload).to.have.lengthOf(1);

    const message = votePayload[0].msg.map((m) => BigInt(m));
    const encPubKey = votePayload[0].encPubkeys.map((p) => BigInt(p)) as [bigint, bigint];

    // ========================================================================
    // Use OperatorClient.pushMessage() to process the message
    // ========================================================================
    const { message: operatorMessage, command: operatorCommand } = operatorWithState.pushMessage(
      message,
      encPubKey
    );

    // Verify the returned message structure
    expect(operatorMessage).to.exist;
    expect(operatorMessage.ciphertext).to.deep.equal(message);
    expect(operatorMessage.encPubKey).to.deep.equal(encPubKey);
    expect(operatorMessage.hash).to.be.a('bigint');
    expect(operatorMessage.prevHash).to.equal(0n); // First message, prevHash = 0

    // Verify the returned command
    expect(operatorCommand).to.not.be.null;
    if (!operatorCommand) {
      throw new Error('operatorCommand should not be null');
    }
    expect(operatorCommand.stateIdx).to.equal(BigInt(stateIdx));
    expect(operatorCommand.voIdx).to.equal(BigInt(voIdx));
    expect(operatorCommand.newVotes).to.equal(BigInt(votes));
    expect(operatorCommand.nonce).to.be.a('bigint');

    // Verify arrays were also updated correctly
    expect(operatorWithState.messages).to.have.lengthOf(1);
    expect(operatorWithState.commands).to.have.lengthOf(1);
    expect(operatorWithState.messages[0]).to.deep.equal(operatorMessage);
    expect(operatorWithState.commands[0]).to.deep.equal(operatorCommand);

    // ========================================================================
    // Process the same message in the circuit
    // ========================================================================
    const circuitInputs = {
      message,
      encPrivKey: operatorWithState.getSigner().getFormatedPrivKey(),
      encPubKey
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const circuitStateIdx = await getSignal(circuit, witness, 'stateIndex');
    const circuitVoIdx = await getSignal(circuit, witness, 'voteOptionIndex');
    const circuitVotes = await getSignal(circuit, witness, 'newVoteWeight');
    const circuitNonce = await getSignal(circuit, witness, 'nonce');
    const circuitPubKey0 = await getSignal(circuit, witness, 'newPubKey[0]');
    const circuitPubKey1 = await getSignal(circuit, witness, 'newPubKey[1]');
    const circuitSigR8_0 = await getSignal(circuit, witness, 'sigR8[0]');
    const circuitSigR8_1 = await getSignal(circuit, witness, 'sigR8[1]');
    const circuitSigS = await getSignal(circuit, witness, 'sigS');

    // ========================================================================
    // Verify OperatorClient results match circuit results EXACTLY
    // ========================================================================
    expect(circuitStateIdx).to.equal(
      operatorCommand!.stateIdx,
      'stateIndex: OperatorClient vs Circuit mismatch'
    );
    expect(circuitVoIdx).to.equal(
      operatorCommand!.voIdx,
      'voIdx: OperatorClient vs Circuit mismatch'
    );
    expect(circuitVotes).to.equal(
      operatorCommand!.newVotes,
      'newVotes: OperatorClient vs Circuit mismatch'
    );
    expect(circuitNonce).to.equal(
      operatorCommand!.nonce,
      'nonce: OperatorClient vs Circuit mismatch'
    );
    expect(circuitPubKey0).to.equal(
      operatorCommand!.newPubKey[0],
      'newPubKey[0]: OperatorClient vs Circuit mismatch'
    );
    expect(circuitPubKey1).to.equal(
      operatorCommand!.newPubKey[1],
      'newPubKey[1]: OperatorClient vs Circuit mismatch'
    );
    expect(circuitSigR8_0).to.equal(
      operatorCommand!.signature.R8[0],
      'sigR8[0]: OperatorClient vs Circuit mismatch'
    );
    expect(circuitSigR8_1).to.equal(
      operatorCommand!.signature.R8[1],
      'sigR8[1]: OperatorClient vs Circuit mismatch'
    );
    expect(circuitSigS).to.equal(
      operatorCommand!.signature.S,
      'sigS: OperatorClient vs Circuit mismatch'
    );

    // ========================================================================
    // Test batch processing: push multiple messages
    // ========================================================================
    const batchPayload = voterClient.buildVotePayload({
      stateIdx,
      operatorPubkey: coordPubKey,
      selectedOptions: [
        { idx: 0, vc: 30 },
        { idx: 5, vc: 70 }
      ]
    });

    expect(batchPayload).to.have.lengthOf(2);

    // Push all messages to OperatorClient and collect results
    const batchResults = [];
    for (const payload of batchPayload) {
      const msg = payload.msg.map((m) => BigInt(m));
      const pubKey = payload.encPubkeys.map((p) => BigInt(p)) as [bigint, bigint];
      const result = operatorWithState.pushMessage(msg, pubKey);
      batchResults.push(result);
    }

    // Verify we now have 3 messages total
    expect(operatorWithState.messages).to.have.lengthOf(3);
    expect(operatorWithState.commands).to.have.lengthOf(3);

    // Verify each batch result
    for (let i = 0; i < batchResults.length; i++) {
      const { message: batchMsg, command: batchCmd } = batchResults[i];
      const msgIndex = i + 1; // Index in total messages (0 was the first message)

      // Verify command is not null
      expect(batchCmd).to.not.be.null;
      if (!batchCmd) {
        throw new Error(`Batch command ${i} should not be null`);
      }

      // Verify returned data matches arrays
      expect(batchMsg).to.deep.equal(operatorWithState.messages[msgIndex]);
      expect(batchCmd).to.deep.equal(operatorWithState.commands[msgIndex]);

      // Verify message hash chain
      if (msgIndex > 0) {
        expect(batchMsg.prevHash).to.equal(operatorWithState.messages[msgIndex - 1].hash);
      }

      // Verify against circuit
      const inputs = {
        message: batchMsg.ciphertext,
        encPrivKey: operatorWithState.getSigner().getFormatedPrivKey(),
        encPubKey: batchMsg.encPubKey
      };

      const w = await circuit.calculateWitness(inputs);
      await circuit.expectConstraintPass(w);

      const cVoIdx = await getSignal(circuit, w, 'voteOptionIndex');
      const cVotes = await getSignal(circuit, w, 'newVoteWeight');
      const cStateIdx = await getSignal(circuit, w, 'stateIndex');

      expect(cStateIdx).to.equal(batchCmd.stateIdx, `Batch message ${i}: stateIdx mismatch`);
      expect(cVoIdx).to.equal(batchCmd.voIdx, `Batch message ${i}: voIdx mismatch`);
      expect(cVotes).to.equal(batchCmd.newVotes, `Batch message ${i}: votes mismatch`);
    }
  });

  it('should match SDK-processed results with circuit outputs (integration test)', async () => {
    /**
     * Test Case: SDK Integration Test
     *
     * This is a comprehensive integration test that verifies the entire workflow
     * using SDK's high-level APIs:
     *
     * 1. Voter uses VoterClient.buildVotePayload() to create encrypted messages
     * 2. Operator uses OperatorClient to decrypt messages (off-chain)
     * 3. Circuit decrypts the same messages (on-chain proof)
     * 4. Compare: SDK results == Circuit results
     *
     * This ensures SDK and circuits are perfectly aligned.
     *
     * Test Scenario: Voter casts a single vote
     *   - Vote for option 2: 150 credits
     *   - stateIdx: 10 (voter #10)
     */
    const stateIdx = 10;
    const selectedOptions = [
      { idx: 2, vc: 150 } // Vote 150 for option 2
    ];

    // Get coordinator's public key
    const coordPubKey = coordinatorClient.getSigner().getPublicKey().toPoints();

    // ========================================================================
    // Step 1: Voter creates vote payload using SDK
    // ========================================================================
    const votePayload = voterClient.buildVotePayload({
      stateIdx,
      operatorPubkey: coordPubKey,
      selectedOptions
    });

    // The payload contains 1 message for 1 vote
    expect(votePayload).to.be.an('array');
    expect(votePayload.length).to.equal(1); // 1 vote = 1 message

    const voteMessage = votePayload[0];

    // Convert string array back to bigint array
    const message = voteMessage.msg.map((m) => BigInt(m));
    const encPubKey = voteMessage.encPubkeys.map((p) => BigInt(p)) as [bigint, bigint];

    expect(message).to.have.lengthOf(7); // Poseidon encrypted message
    expect(encPubKey).to.have.lengthOf(2); // Ephemeral public key

    // ========================================================================
    // Step 2: Operator decrypts using SDK (off-chain)
    // ========================================================================
    const operatorSigner = coordinatorClient.getSigner();
    const sharedKey = operatorSigner.genEcdhSharedKey(encPubKey);

    // Import poseidonDecrypt from SDK
    const plaintext = poseidonDecrypt(message, sharedKey, 0n, 6);

    // Extract command fields (same as SDK's msgToCmd logic)
    const UINT32 = 1n << 32n;
    const UINT96 = 1n << 96n;

    const packaged = plaintext[0];
    const sdkNonce = packaged % UINT32;
    const sdkStateIdx = (packaged >> 32n) % UINT32;
    const sdkVoIdx = (packaged >> 64n) % UINT32;
    const sdkNewVotes = (packaged >> 96n) % UINT96;
    const sdkNewPubKey = [plaintext[1], plaintext[2]];
    const sdkSigR8 = [plaintext[3], plaintext[4]];
    const sdkSigS = plaintext[5];

    // Verify SDK decryption results match expected values
    expect(sdkStateIdx).to.equal(BigInt(stateIdx), 'SDK: stateIdx should match');
    expect(sdkVoIdx).to.equal(2n, 'SDK: vote option should be 2');
    expect(sdkNewVotes).to.equal(150n, 'SDK: votes should be 150');
    expect(sdkNonce).to.equal(1n, 'SDK: nonce should be 1 (first message)');

    // ========================================================================
    // Step 3: Circuit decrypts the same message (on-chain proof)
    // ========================================================================
    const circuitInputs = {
      message,
      encPrivKey: coordinatorClient.getSigner().getFormatedPrivKey(),
      encPubKey
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    // Extract circuit outputs
    const circuitStateIdx = await getSignal(circuit, witness, 'stateIndex');
    const circuitVoIdx = await getSignal(circuit, witness, 'voteOptionIndex');
    const circuitVotes = await getSignal(circuit, witness, 'newVoteWeight');
    const circuitNonce = await getSignal(circuit, witness, 'nonce');
    const circuitPubKey0 = await getSignal(circuit, witness, 'newPubKey[0]');
    const circuitPubKey1 = await getSignal(circuit, witness, 'newPubKey[1]');
    const circuitSigR8_0 = await getSignal(circuit, witness, 'sigR8[0]');
    const circuitSigR8_1 = await getSignal(circuit, witness, 'sigR8[1]');
    const circuitSigS = await getSignal(circuit, witness, 'sigS');
    const circuitSharedKey0 = await getSignal(circuit, witness, 'sharedKey[0]');
    const circuitSharedKey1 = await getSignal(circuit, witness, 'sharedKey[1]');

    // ========================================================================
    // Step 4: Verify SDK results EXACTLY match circuit results
    // ========================================================================
    expect(circuitStateIdx).to.equal(sdkStateIdx, 'stateIndex mismatch: SDK vs Circuit');
    expect(circuitVoIdx).to.equal(sdkVoIdx, 'voteOptionIndex mismatch: SDK vs Circuit');
    expect(circuitVotes).to.equal(sdkNewVotes, 'newVoteWeight mismatch: SDK vs Circuit');
    expect(circuitNonce).to.equal(sdkNonce, 'nonce mismatch: SDK vs Circuit');
    expect(circuitPubKey0).to.equal(sdkNewPubKey[0], 'newPubKey[0] mismatch: SDK vs Circuit');
    expect(circuitPubKey1).to.equal(sdkNewPubKey[1], 'newPubKey[1] mismatch: SDK vs Circuit');
    expect(circuitSigR8_0).to.equal(sdkSigR8[0], 'sigR8[0] mismatch: SDK vs Circuit');
    expect(circuitSigR8_1).to.equal(sdkSigR8[1], 'sigR8[1] mismatch: SDK vs Circuit');
    expect(circuitSigS).to.equal(sdkSigS, 'sigS mismatch: SDK vs Circuit');
    expect(circuitSharedKey0).to.equal(sharedKey[0], 'sharedKey[0] mismatch: SDK vs Circuit');
    expect(circuitSharedKey1).to.equal(sharedKey[1], 'sharedKey[1] mismatch: SDK vs Circuit');

    // ========================================================================
    // Step 5: Test with multiple votes to ensure batch processing works
    // ========================================================================
    const multiVoteOptions = [
      { idx: 0, vc: 25 },
      { idx: 4, vc: 75 }
    ];

    const multiVotePayload = voterClient.buildVotePayload({
      stateIdx,
      operatorPubkey: coordPubKey,
      selectedOptions: multiVoteOptions
    });

    expect(multiVotePayload).to.have.lengthOf(2);

    // Test each message in the batch
    for (let i = 0; i < multiVotePayload.length; i++) {
      const msg = multiVotePayload[i].msg.map((m) => BigInt(m));
      const pubKey = multiVotePayload[i].encPubkeys.map((p) => BigInt(p)) as [bigint, bigint];

      // SDK decrypt
      const sk = operatorSigner.genEcdhSharedKey(pubKey);
      const pt = poseidonDecrypt(msg, sk, 0n, 6);
      const pkg = pt[0];
      const sdkVo = (pkg >> 64n) % UINT32;
      const sdkVc = (pkg >> 96n) % UINT96;

      // Circuit decrypt
      const inputs = {
        message: msg,
        encPrivKey: coordinatorClient.getSigner().getFormatedPrivKey(),
        encPubKey: pubKey
      };
      const w = await circuit.calculateWitness(inputs);
      await circuit.expectConstraintPass(w);

      const cVo = await getSignal(circuit, w, 'voteOptionIndex');
      const cVc = await getSignal(circuit, w, 'newVoteWeight');

      // Verify
      expect(cVo).to.equal(sdkVo, `Message ${i}: voteOptionIndex mismatch`);
      expect(cVc).to.equal(sdkVc, `Message ${i}: newVoteWeight mismatch`);
    }
  });
});
