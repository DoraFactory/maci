import fs from 'fs';
import path from 'path';
// @ts-ignore - snarkjs doesn't have official type definitions
import * as snarkjs from 'snarkjs';
import { ContractProofType } from '../types';

/**
 * Circuit integration utilities
 * Handles circuit loading, proof generation using snarkjs, and format conversion
 *
 * Circuit configuration: 2-1-1-5
 * - state_tree_depth: 2 (max 25 voters)
 * - int_state_tree_depth: 1
 * - vote_option_tree_depth: 1 (max 5 options)
 * - message_batch_size: 5
 */

const CIRCUIT_CONFIG = '2-1-1-5';
const CIRCUITS_DIR = path.join(__dirname, '..', '..', 'circuits', CIRCUIT_CONFIG);

interface CircuitPaths {
  wasm: string;
  zkey: string;
}

/**
 * Get paths to circuit artifacts
 */
function getCircuitPaths(circuitName: 'processMessages' | 'tallyVotes'): CircuitPaths {
  const wasm = path.join(CIRCUITS_DIR, `${circuitName}.wasm`);
  const zkey = path.join(CIRCUITS_DIR, `${circuitName}.zkey`);

  if (!fs.existsSync(wasm)) {
    throw new Error(`Circuit WASM file not found: ${wasm}\n` + 'Please run: pnpm setup-circuits');
  }

  if (!fs.existsSync(zkey)) {
    throw new Error(`Circuit zkey file not found: ${zkey}\n` + 'Please run: pnpm setup-circuits');
  }

  return { wasm, zkey };
}

/**
 * Convert snarkjs proof to contract Groth16ProofType format
 * Encodes proof points as hex strings for contract verification
 */
export function convertProofToContractFormat(proof: any): ContractProofType {
  // Helper to encode G1 point (2 coordinates) to hex
  const encodeG1 = (point: string[]): string => {
    const x = BigInt(point[0]).toString(16).padStart(64, '0');
    const y = BigInt(point[1]).toString(16).padStart(64, '0');
    return '0x' + x + y;
  };

  // Helper to encode G2 point (4 coordinates in 2x2 array) to hex
  const encodeG2 = (point: string[][]): string => {
    const x1 = BigInt(point[0][0]).toString(16).padStart(64, '0');
    const x2 = BigInt(point[0][1]).toString(16).padStart(64, '0');
    const y1 = BigInt(point[1][0]).toString(16).padStart(64, '0');
    const y2 = BigInt(point[1][1]).toString(16).padStart(64, '0');
    return '0x' + x1 + x2 + y1 + y2;
  };

  return {
    a: encodeG1(proof.pi_a),
    b: encodeG2(proof.pi_b),
    c: encodeG1(proof.pi_c)
  };
}

/**
 * Generate proof for ProcessMessages circuit
 *
 * @param input Circuit input (from operator.processMessages())
 * @param stateTreeDepth Must be 2 (matching zkey)
 * @param voteOptionTreeDepth Must be 1 (matching zkey)
 * @param batchSize Must be 5 (matching zkey)
 * @returns Contract-compatible proof
 */
export async function generateProcessMessagesProof(
  input: any,
  stateTreeDepth: number,
  voteOptionTreeDepth: number,
  batchSize: number
): Promise<ContractProofType> {
  // Validate parameters match zkey configuration
  if (stateTreeDepth !== 2 || voteOptionTreeDepth !== 1 || batchSize !== 5) {
    throw new Error(
      `Invalid circuit parameters. Expected: 2-1-5, Got: ${stateTreeDepth}-${voteOptionTreeDepth}-${batchSize}\n` +
        'Please update test parameters to match zkey configuration'
    );
  }

  console.log('🔄 Generating ProcessMessages proof (this may take 10-30 seconds)...');

  const { wasm, zkey } = getCircuitPaths('processMessages');

  // Debug: Check for undefined/null fields
  const requiredFields = [
    'inputHash',
    'packedVals',
    'batchStartHash',
    'batchEndHash',
    'msgs',
    'coordPrivKey',
    'coordPubKey',
    'encPubKeys',
    'currentStateRoot',
    'currentStateLeaves',
    'currentStateLeavesPathElements',
    'currentStateCommitment',
    'currentStateSalt',
    'newStateCommitment',
    'newStateSalt',
    'currentVoteWeights',
    'currentVoteWeightsPathElements'
  ];

  for (const field of requiredFields) {
    if (input[field] === undefined || input[field] === null) {
      console.error(`❌ Missing required field: ${field}`);
    }
  }

  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);

    console.log('✅ ProcessMessages proof generated');
    console.log(`   Public signals: ${publicSignals.length}`);

    return convertProofToContractFormat(proof);
  } catch (error: any) {
    console.error('❌ Failed to generate ProcessMessages proof:', error.message);
    throw error;
  }
}

/**
 * Generate proof for TallyVotes circuit
 *
 * @param input Circuit input (from operator.tallyVotes())
 * @param stateTreeDepth Must be 2 (matching zkey)
 * @param intStateTreeDepth Must be 1 (matching zkey)
 * @param voteOptionTreeDepth Must be 1 (matching zkey)
 * @returns Contract-compatible proof
 */
export async function generateTallyProof(
  input: any,
  stateTreeDepth: number,
  intStateTreeDepth: number,
  voteOptionTreeDepth: number
): Promise<ContractProofType> {
  // Validate parameters match zkey configuration
  if (stateTreeDepth !== 2 || intStateTreeDepth !== 1 || voteOptionTreeDepth !== 1) {
    throw new Error(
      `Invalid circuit parameters. Expected: 2-1-1, Got: ${stateTreeDepth}-${intStateTreeDepth}-${voteOptionTreeDepth}\n` +
        'Please update test parameters to match zkey configuration'
    );
  }

  console.log('🔄 Generating TallyVotes proof (this may take 10-30 seconds)...');

  const { wasm, zkey } = getCircuitPaths('tallyVotes');

  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);

    console.log('✅ TallyVotes proof generated');
    console.log(`   Public signals: ${publicSignals.length}`);

    return convertProofToContractFormat(proof);
  } catch (error: any) {
    console.error('❌ Failed to generate TallyVotes proof:', error.message);
    throw error;
  }
}

/**
 * Generate proof for ProcessDeactivateMessages circuit (AMACI only)
 * Note: Currently using ProcessMessages zkey as fallback
 */
export async function generateDeactivateProof(
  input: any,
  stateTreeDepth: number,
  batchSize: number
): Promise<ContractProofType> {
  console.log('⚠️  Deactivate proof generation not yet implemented');
  console.log('   Using mock proof for testing');

  // Mock proof for now
  const mockProof = {
    pi_a: ['1', '2', '1'],
    pi_b: [
      ['1', '2'],
      ['3', '4'],
      ['1', '0']
    ],
    pi_c: ['1', '2', '1']
  };

  return convertProofToContractFormat(mockProof);
}

/**
 * Generate proof for AddNewKey circuit (AMACI only)
 * Note: Using separate zkey if available
 */
export async function generateAddNewKeyProof(
  input: any,
  stateTreeDepth: number
): Promise<ContractProofType> {
  console.log('⚠️  AddNewKey proof generation not yet implemented');
  console.log('   Using mock proof for testing');

  // Mock proof for now
  const mockProof = {
    pi_a: ['1', '2', '1'],
    pi_b: [
      ['1', '2'],
      ['3', '4'],
      ['1', '0']
    ],
    pi_c: ['1', '2', '1']
  };

  return convertProofToContractFormat(mockProof);
}

/**
 * Helper to format proof for logging (truncated)
 */
export function formatProofForLogging(proof: ContractProofType): any {
  return {
    a: proof.a.substring(0, 20) + '...' + proof.a.substring(proof.a.length - 10),
    b: proof.b.substring(0, 20) + '...' + proof.b.substring(proof.b.length - 10),
    c: proof.c.substring(0, 20) + '...' + proof.c.substring(proof.c.length - 10)
  };
}

/**
 * Validate proof format
 */
export function validateProofFormat(proof: ContractProofType): boolean {
  return !!(
    proof &&
    typeof proof.a === 'string' &&
    typeof proof.b === 'string' &&
    typeof proof.c === 'string' &&
    proof.a.startsWith('0x') &&
    proof.b.startsWith('0x') &&
    proof.c.startsWith('0x') &&
    proof.a.length === 130 && // 0x + 64 + 64
    proof.b.length === 258 && // 0x + 64*4
    proof.c.length === 130 // 0x + 64 + 64
  );
}
