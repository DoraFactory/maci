import fs from 'fs';
import path from 'path';
// @ts-ignore - snarkjs doesn't have official type definitions
import * as snarkjs from 'snarkjs';

const CIRCUITS_DIR = path.join(__dirname, '../circuits');
const CIRCUIT_CONFIG = '2-1-1-5';
const CIRCUIT_PATH = path.join(CIRCUITS_DIR, CIRCUIT_CONFIG);
const OUTPUT_FILE = path.join(CIRCUITS_DIR, `vkeys-${CIRCUIT_CONFIG}.json`);

interface G1Point {
  x: string;
  y: string;
}

interface G2Point {
  x: [string, string];
  y: [string, string];
}

interface SnarkjsVKey {
  protocol: string;
  curve: string;
  nPublic: number;
  vk_alpha_1: string[];
  vk_beta_2: string[][];
  vk_gamma_2: string[][];
  vk_delta_2: string[][];
  vk_alphabeta_12: string[][][];
  IC: string[][];
}

interface Groth16VKeyType {
  vk_alpha1: string;
  vk_beta_2: string;
  vk_gamma_2: string;
  vk_delta_2: string;
  vk_ic0: string;
  vk_ic1: string;
}

/**
 * Extract verification keys from zkey files
 * Converts snarkjs vkey format to contract Groth16VKeyType format
 */
async function extractVkeys(): Promise<void> {
  console.log('🔑 Extracting verification keys from zkey files...');

  // Check if zkey files exist
  const processZkeyPath = path.join(CIRCUIT_PATH, 'processMessages.zkey');
  const tallyZkeyPath = path.join(CIRCUIT_PATH, 'tallyVotes.zkey');

  if (!fs.existsSync(processZkeyPath)) {
    throw new Error(
      `ProcessMessages zkey not found: ${processZkeyPath}\nRun "pnpm download-zkeys" first.`
    );
  }

  if (!fs.existsSync(tallyZkeyPath)) {
    throw new Error(
      `TallyVotes zkey not found: ${tallyZkeyPath}\nRun "pnpm download-zkeys" first.`
    );
  }

  console.log('\n📄 Reading processMessages.zkey...');
  const processVkey = (await snarkjs.zKey.exportVerificationKey(processZkeyPath)) as SnarkjsVKey;

  console.log('📄 Reading tallyVotes.zkey...');
  const tallyVkey = (await snarkjs.zKey.exportVerificationKey(tallyZkeyPath)) as SnarkjsVKey;

  console.log('\n🔄 Converting to contract format...');

  const processVkeyContract = convertVkeyToContractFormat(processVkey);
  const tallyVkeyContract = convertVkeyToContractFormat(tallyVkey);

  const output = {
    circuit_config: CIRCUIT_CONFIG,
    description: {
      state_tree_depth: 2,
      int_state_tree_depth: 1,
      vote_option_tree_depth: 1,
      message_batch_size: 5,
      max_voters: 25,
      max_options: 5
    },
    process_vkey: processVkeyContract,
    tally_vkey: tallyVkeyContract
  };

  // Write to file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log(`\n✅ Verification keys extracted successfully!`);
  console.log(`   Output: ${OUTPUT_FILE}`);
  console.log('\n📊 Verification Key Info:');
  console.log(`   Process VKey: ${processVkey.nPublic} public inputs`);
  console.log(`   Tally VKey: ${tallyVkey.nPublic} public inputs`);
  console.log(`   Protocol: ${processVkey.protocol}`);
  console.log(`   Curve: ${processVkey.curve}`);
}

/**
 * Convert snarkjs verification key to contract Groth16VKeyType format
 */
function convertVkeyToContractFormat(vkey: SnarkjsVKey): Groth16VKeyType {
  // Convert G1 point to hex string (concatenate x and y)
  const encodeG1 = (point: string[]): string => {
    // point is [x, y, z] in affine coordinates
    // We need to convert to hex and concatenate
    const x = BigInt(point[0]).toString(16).padStart(64, '0');
    const y = BigInt(point[1]).toString(16).padStart(64, '0');
    return '0x' + x + y;
  };

  // Convert G2 point to hex string (concatenate all coordinates)
  const encodeG2 = (point: string[][]): string => {
    // point is [[x1, x2], [y1, y2], [z1, z2]] in affine coordinates
    // We need to convert to hex and concatenate
    const x1 = BigInt(point[0][0]).toString(16).padStart(64, '0');
    const x2 = BigInt(point[0][1]).toString(16).padStart(64, '0');
    const y1 = BigInt(point[1][0]).toString(16).padStart(64, '0');
    const y2 = BigInt(point[1][1]).toString(16).padStart(64, '0');
    return '0x' + x1 + x2 + y1 + y2;
  };

  return {
    vk_alpha1: encodeG1(vkey.vk_alpha_1),
    vk_beta_2: encodeG2(vkey.vk_beta_2),
    vk_gamma_2: encodeG2(vkey.vk_gamma_2),
    vk_delta_2: encodeG2(vkey.vk_delta_2),
    vk_ic0: encodeG1(vkey.IC[0]),
    vk_ic1: encodeG1(vkey.IC[1])
  };
}

// Run the extraction
extractVkeys()
  .then(() => {
    console.log('\n✨ Setup complete! You can now run tests with "pnpm test"');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error extracting vkeys:', error.message);
    process.exit(1);
  });
