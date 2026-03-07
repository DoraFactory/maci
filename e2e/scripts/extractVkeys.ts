import fs from 'fs';
import path from 'path';
// @ts-ignore - snarkjs doesn't have official type definitions
import * as snarkjs from 'snarkjs';

const CIRCUITS_DIR = path.join(__dirname, '../circuits');

interface CircuitConfig {
  name: string;
  configName: string;
  circuitPath: string;
  outputFile: string;
  processZkeyFile?: string;
  tallyZkeyFile?: string;
  deactivateZkeyFile?: string;
  addNewKeyZkeyFile?: string;
  description: {
    state_tree_depth: number;
    int_state_tree_depth: number;
    vote_option_tree_depth: number;
    message_batch_size: number;
    max_voters: number;
    max_options: number;
  };
  hasDeactivate?: boolean; // AMACI only
  hasAddNewKey?: boolean; // AMACI only
}

const CIRCUIT_CONFIGS: CircuitConfig[] = [
  {
    name: 'MACI 1P1V',
    configName: 'maci-2-1-1-5',
    circuitPath: path.join(CIRCUITS_DIR, 'maci-2-1-1-5'),
    outputFile: path.join(CIRCUITS_DIR, 'vkeys-maci-2-1-1-5.json'),
    description: {
      state_tree_depth: 2,
      int_state_tree_depth: 1,
      vote_option_tree_depth: 1,
      message_batch_size: 5,
      max_voters: 25,
      max_options: 5
    }
  },
  {
    name: 'AMACI',
    configName: 'amaci-2-1-1-5',
    circuitPath: path.join(CIRCUITS_DIR, 'amaci-2-1-1-5'),
    outputFile: path.join(CIRCUITS_DIR, 'vkeys-amaci-2-1-1-5.json'),
    description: {
      state_tree_depth: 2,
      int_state_tree_depth: 1,
      vote_option_tree_depth: 1,
      message_batch_size: 5,
      max_voters: 25,
      max_options: 5
    },
    hasDeactivate: true,
    hasAddNewKey: true
  },
  {
    name: 'AMACI',
    configName: 'amaci-4-2-2-25',
    circuitPath: path.join(CIRCUITS_DIR, 'amaci-4-2-2-25'),
    outputFile: path.join(CIRCUITS_DIR, 'vkeys-amaci-4-2-2-25.json'),
    description: {
      state_tree_depth: 4,
      int_state_tree_depth: 2,
      vote_option_tree_depth: 2,
      message_batch_size: 25,
      max_voters: 625,
      max_options: 25
    },
    hasDeactivate: true,
    hasAddNewKey: true
  },
  {
    name: 'AMACI',
    configName: 'amaci-6-3-3-125',
    circuitPath: path.join(CIRCUITS_DIR, 'amaci-6-3-3-125'),
    outputFile: path.join(CIRCUITS_DIR, 'vkeys-amaci-6-3-3-125.json'),
    description: {
      state_tree_depth: 6,
      int_state_tree_depth: 3,
      vote_option_tree_depth: 3,
      message_batch_size: 125,
      max_voters: 15625,
      max_options: 125
    },
    hasDeactivate: true,
    hasAddNewKey: true
  },
  {
    name: 'AMACI',
    configName: 'amaci-9-4-3-125',
    circuitPath: path.join(CIRCUITS_DIR, 'amaci-9-4-3-125'),
    outputFile: path.join(CIRCUITS_DIR, 'vkeys-amaci-9-4-3-125.json'),
    description: {
      state_tree_depth: 9,
      int_state_tree_depth: 4,
      vote_option_tree_depth: 3,
      message_batch_size: 125,
      max_voters: 1953125,
      max_options: 125
    },
    hasDeactivate: true,
    hasAddNewKey: true
  }
];

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
 * Convert snarkjs vkey format to contract Groth16VKeyType format
 */
function convertVkeyToContractFormat(vkey: SnarkjsVKey): Groth16VKeyType {
  // Convert G1 point (2 elements) to hex string
  const vk_alpha1 = `0x${BigInt(vkey.vk_alpha_1[0]).toString(16).padStart(64, '0')}${BigInt(vkey.vk_alpha_1[1]).toString(16).padStart(64, '0')}`;

  // bellman_ce expects BN254 G2 points as c0.x, c1.x, c0.y, c1.y in uncompressed form.
  const formatG2 = (point: string[][]): string =>
    `0x${BigInt(point[0][1]).toString(16).padStart(64, '0')}${BigInt(point[0][0]).toString(16).padStart(64, '0')}${BigInt(point[1][1]).toString(16).padStart(64, '0')}${BigInt(point[1][0]).toString(16).padStart(64, '0')}`;

  const vk_beta_2 = formatG2(vkey.vk_beta_2);
  const vk_gamma_2 = formatG2(vkey.vk_gamma_2);
  const vk_delta_2 = formatG2(vkey.vk_delta_2);

  // Convert IC points
  const vk_ic0 = `0x${BigInt(vkey.IC[0][0]).toString(16).padStart(64, '0')}${BigInt(vkey.IC[0][1]).toString(16).padStart(64, '0')}`;
  const vk_ic1 = `0x${BigInt(vkey.IC[1][0]).toString(16).padStart(64, '0')}${BigInt(vkey.IC[1][1]).toString(16).padStart(64, '0')}`;

  return {
    vk_alpha1,
    vk_beta_2,
    vk_gamma_2,
    vk_delta_2,
    vk_ic0,
    vk_ic1
  };
}

/**
 * Extract verification keys for a specific circuit configuration
 */
async function extractConfigVkeys(config: CircuitConfig): Promise<void> {
  console.log(`\n📦 Processing ${config.name}`);

  const processZkeyPath = path.join(config.circuitPath, config.processZkeyFile || 'processMessages.zkey');
  const tallyZkeyPath = path.join(config.circuitPath, config.tallyZkeyFile || 'tallyVotes.zkey');

  // Check if zkey files exist
  if (!fs.existsSync(processZkeyPath)) {
    console.log(`   ⚠️  processMessages.zkey not found, skipping`);
    return;
  }

  if (!fs.existsSync(tallyZkeyPath)) {
    console.log(`   ⚠️  tallyVotes.zkey not found, skipping`);
    return;
  }

  console.log(`   📄 Reading processMessages.zkey...`);
  const processVkey = (await snarkjs.zKey.exportVerificationKey(processZkeyPath)) as SnarkjsVKey;

  console.log(`   📄 Reading tallyVotes.zkey...`);
  const tallyVkey = (await snarkjs.zKey.exportVerificationKey(tallyZkeyPath)) as SnarkjsVKey;

  console.log(`   🔄 Converting to contract format...`);
  const processVkeyContract = convertVkeyToContractFormat(processVkey);
  const tallyVkeyContract = convertVkeyToContractFormat(tallyVkey);

  const outputData: any = {
    circuit_type: config.name,
    circuit_config: config.configName,
    description: config.description,
    process_vkey: processVkeyContract,
    tally_vkey: tallyVkeyContract
  };

  // Extract AMACI-specific vkeys if configured
  if (config.hasDeactivate) {
    const deactivateZkeyPath = path.join(config.circuitPath, config.deactivateZkeyFile || 'deactivate.zkey');
    if (fs.existsSync(deactivateZkeyPath)) {
      console.log(`   📄 Reading deactivate.zkey...`);
      const deactivateVkey = (await snarkjs.zKey.exportVerificationKey(
        deactivateZkeyPath
      )) as SnarkjsVKey;
      const deactivateVkeyContract = convertVkeyToContractFormat(deactivateVkey);
      outputData.deactivate_vkey = deactivateVkeyContract;

      console.log(`   📋 Deactivate vkey info:`);
      console.log(`      - Protocol: ${deactivateVkey.protocol}`);
      console.log(`      - Curve: ${deactivateVkey.curve}`);
      console.log(`      - Public inputs: ${deactivateVkey.nPublic}`);
      console.log(`      - IC points: ${deactivateVkey.IC.length}`);
    } else {
      console.log(`   ⚠️  deactivate.zkey not found, skipping`);
    }
  }

  if (config.hasAddNewKey) {
    const addNewKeyZkeyPath = path.join(config.circuitPath, config.addNewKeyZkeyFile || 'addNewKey.zkey');
    if (fs.existsSync(addNewKeyZkeyPath)) {
      console.log(`   📄 Reading addNewKey.zkey...`);
      const addNewKeyVkey = (await snarkjs.zKey.exportVerificationKey(
        addNewKeyZkeyPath
      )) as SnarkjsVKey;
      const addNewKeyVkeyContract = convertVkeyToContractFormat(addNewKeyVkey);
      outputData.add_new_key_vkey = addNewKeyVkeyContract;

      console.log(`   📋 AddNewKey vkey info:`);
      console.log(`      - Protocol: ${addNewKeyVkey.protocol}`);
      console.log(`      - Curve: ${addNewKeyVkey.curve}`);
      console.log(`      - Public inputs: ${addNewKeyVkey.nPublic}`);
      console.log(`      - IC points: ${addNewKeyVkey.IC.length}`);
    } else {
      console.log(`   ⚠️  addNewKey.zkey not found, skipping`);
    }
  }

  fs.writeFileSync(config.outputFile, JSON.stringify(outputData, null, 2));
  console.log(`   ✅ Verification keys extracted successfully!`);
  console.log(`   📝 Output: ${path.basename(config.outputFile)}`);

  // Log key info for debugging
  console.log(`   📋 ProcessMessages vkey info:`);
  console.log(`      - Protocol: ${processVkey.protocol}`);
  console.log(`      - Curve: ${processVkey.curve}`);
  console.log(`      - Public inputs: ${processVkey.nPublic}`);
  console.log(`      - IC points: ${processVkey.IC.length}`);
  console.log(`      - vk_ic0 (first 20 chars): ${processVkeyContract.vk_ic0.substring(0, 20)}...`);

  console.log(`   📋 TallyVotes vkey info:`);
  console.log(`      - Protocol: ${tallyVkey.protocol}`);
  console.log(`      - Curve: ${tallyVkey.curve}`);
  console.log(`      - Public inputs: ${tallyVkey.nPublic}`);
  console.log(`      - IC points: ${tallyVkey.IC.length}`);
}

/**
 * Main function to extract vkeys from all circuit configurations
 */
async function extractAllVkeys(): Promise<void> {
  console.log('🔑 Extracting Verification Keys');
  console.log('━'.repeat(60));

  let successCount = 0;
  let skipCount = 0;

  for (const config of CIRCUIT_CONFIGS) {
    try {
      await extractConfigVkeys(config);
      if (fs.existsSync(config.outputFile)) {
        successCount++;
      } else {
        skipCount++;
      }
    } catch (error: any) {
      console.error(`\n   ❌ Error processing ${config.name}:`, error.message);
      skipCount++;
    }
  }

  console.log('\n' + '━'.repeat(60));
  console.log(`✨ Extraction complete!`);
  console.log(`   ✓ Successful: ${successCount}`);
  if (skipCount > 0) {
    console.log(`   ⚠️  Skipped: ${skipCount}`);
  }
}

// Run the extraction
extractAllVkeys()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Extraction failed:', error.message);
    process.exit(1);
  });
