import { Circomkit, CircomkitConfig } from 'circomkit';
import fs from 'fs';
import path from 'path';
import { Groth16Proof, ContractProofType } from '../types';

/**
 * Circuit integration utilities
 * Handles circuit loading, proof generation, and format conversion
 */

/**
 * Get Circomkit instance
 */
export function getCircomkitInstance(): Circomkit {
  const configFilePath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'packages',
    'circuits',
    'circomkit.json'
  );

  if (!fs.existsSync(configFilePath)) {
    throw new Error(`Circomkit config not found: ${configFilePath}`);
  }

  const config = JSON.parse(fs.readFileSync(configFilePath, 'utf-8')) as CircomkitConfig;

  return new Circomkit({
    ...config,
    verbose: false
  });
}

/**
 * Convert snarkjs proof format to contract proof format
 */
export function convertProofToContractFormat(proof: Groth16Proof): ContractProofType {
  // Flatten pi_a
  const a = JSON.stringify(proof.pi_a);

  // Flatten pi_b
  const b = JSON.stringify(proof.pi_b);

  // Flatten pi_c
  const c = JSON.stringify(proof.pi_c);

  return { a, b, c };
}

/**
 * Generate proof for ProcessDeactivateMessages circuit
 */
export async function generateDeactivateProof(
  input: any,
  stateTreeDepth: number,
  batchSize: number
): Promise<ContractProofType> {
  const circomkit = getCircomkitInstance();

  const circuit = await circomkit.WitnessTester('ProcessDeactivateMessages', {
    file: 'amaci/power/processDeactivate',
    template: 'ProcessDeactivateMessages',
    params: [stateTreeDepth, batchSize]
  });

  // Calculate witness
  const witness = await circuit.calculateWitness(input);

  // Verify constraints pass
  await circuit.expectConstraintPass(witness);

  // Generate proof (simplified - in real implementation would use actual zkey)
  // For testing, we can create a mock proof or use actual proof generation
  const mockProof: Groth16Proof = {
    pi_a: ['0', '0', '1'],
    pi_b: [
      ['0', '0'],
      ['0', '0'],
      ['1', '0']
    ],
    pi_c: ['0', '0', '1'],
    protocol: 'groth16',
    curve: 'bn128'
  };

  return convertProofToContractFormat(mockProof);
}

/**
 * Generate proof for ProcessMessages circuit
 */
export async function generateProcessMessagesProof(
  input: any,
  stateTreeDepth: number,
  voteOptionTreeDepth: number,
  batchSize: number
): Promise<ContractProofType> {
  const circomkit = getCircomkitInstance();

  const circuit = await circomkit.WitnessTester('ProcessMessages', {
    file: 'amaci/power/processMessages',
    template: 'ProcessMessages',
    params: [stateTreeDepth, voteOptionTreeDepth, batchSize]
  });

  const witness = await circuit.calculateWitness(input);
  await circuit.expectConstraintPass(witness);

  const mockProof: Groth16Proof = {
    pi_a: ['0', '0', '1'],
    pi_b: [
      ['0', '0'],
      ['0', '0'],
      ['1', '0']
    ],
    pi_c: ['0', '0', '1'],
    protocol: 'groth16',
    curve: 'bn128'
  };

  return convertProofToContractFormat(mockProof);
}

/**
 * Generate proof for TallyVotes circuit
 */
export async function generateTallyProof(
  input: any,
  stateTreeDepth: number,
  intStateTreeDepth: number,
  voteOptionTreeDepth: number
): Promise<ContractProofType> {
  const circomkit = getCircomkitInstance();

  const circuit = await circomkit.WitnessTester('TallyVotes', {
    file: 'amaci/power/tallyVotes',
    template: 'TallyVotes',
    params: [stateTreeDepth, intStateTreeDepth, voteOptionTreeDepth]
  });

  const witness = await circuit.calculateWitness(input);
  await circuit.expectConstraintPass(witness);

  const mockProof: Groth16Proof = {
    pi_a: ['0', '0', '1'],
    pi_b: [
      ['0', '0'],
      ['0', '0'],
      ['1', '0']
    ],
    pi_c: ['0', '0', '1'],
    protocol: 'groth16',
    curve: 'bn128'
  };

  return convertProofToContractFormat(mockProof);
}

/**
 * Generate proof for AddNewKey circuit
 */
export async function generateAddNewKeyProof(
  input: any,
  stateTreeDepth: number
): Promise<ContractProofType> {
  const circomkit = getCircomkitInstance();

  const circuit = await circomkit.WitnessTester('AddNewKey', {
    file: 'amaci/addNewKey',
    template: 'AddNewKey',
    params: [stateTreeDepth]
  });

  const witness = await circuit.calculateWitness(input);
  await circuit.expectConstraintPass(witness);

  const mockProof: Groth16Proof = {
    pi_a: ['0', '0', '1'],
    pi_b: [
      ['0', '0'],
      ['0', '0'],
      ['1', '0']
    ],
    pi_c: ['0', '0', '1'],
    protocol: 'groth16',
    curve: 'bn128'
  };

  return convertProofToContractFormat(mockProof);
}

/**
 * Verify circuit witness calculation
 */
export async function verifyCircuitWitness(
  circuitName: string,
  circuitFile: string,
  template: string,
  params: number[],
  input: any
): Promise<boolean> {
  const circomkit = getCircomkitInstance();

  const circuit = await circomkit.WitnessTester(circuitName, {
    file: circuitFile,
    template: template,
    params: params
  });

  try {
    const witness = await circuit.calculateWitness(input);
    await circuit.expectConstraintPass(witness);
    return true;
  } catch (error) {
    console.error(`Circuit witness verification failed: ${error}`);
    return false;
  }
}

/**
 * Helper to format proof for logging
 */
export function formatProofForLogging(proof: ContractProofType): any {
  return {
    a: proof.a.substring(0, 50) + '...',
    b: proof.b.substring(0, 50) + '...',
    c: proof.c.substring(0, 50) + '...'
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
    proof.a.length > 0 &&
    proof.b.length > 0 &&
    proof.c.length > 0
  );
}
