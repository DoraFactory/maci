#!/usr/bin/env ts-node

/**
 * Copy Latest Circuit Artifacts to E2E
 * 
 * This script copies the latest compiled circuit artifacts from packages/circuits/build
 * to the e2e/circuits directory with proper naming conventions.
 * 
 * Source: packages/circuits/build/{CircuitName}/
 * Target: e2e/circuits/{config}/
 * 
 * Mappings:
 * - ProcessMessages_amaci_2-1-5 -> amaci-2-1-1-5/processMessages.*
 * - TallyVotes_amaci_2-1-1 -> amaci-2-1-1-5/tallyVotes.*
 * - ProcessDeactivateMessages_amaci_2-5 -> amaci-2-1-1-5/deactivate.*
 * - AddNewKey_amaci_2 -> amaci-2-1-1-5/addNewKey.*
 */

import * as fs from 'fs';
import * as path from 'path';

interface CircuitMapping {
  sourceDir: string;
  sourceBaseName: string;
  targetDir: string;
  targetBaseName: string;
  description: string;
}

const CIRCUITS_BUILD_DIR = path.join(__dirname, '../../packages/circuits/build');
const E2E_CIRCUITS_DIR = path.join(__dirname, '../circuits');

// Define circuit mappings
const CIRCUIT_MAPPINGS: CircuitMapping[] = [
  // AMACI 2-1-1-5
  {
    sourceDir: 'ProcessMessages_amaci_2-1-5',
    sourceBaseName: 'ProcessMessages_amaci_2-1-5',
    targetDir: 'amaci-2-1-1-5',
    targetBaseName: 'processMessages',
    description: 'AMACI ProcessMessages (2-1-1-5)'
  },
  {
    sourceDir: 'TallyVotes_amaci_2-1-1',
    sourceBaseName: 'TallyVotes_amaci_2-1-1',
    targetDir: 'amaci-2-1-1-5',
    targetBaseName: 'tallyVotes',
    description: 'AMACI TallyVotes (2-1-1-5)'
  },
  {
    sourceDir: 'ProcessDeactivateMessages_amaci_2-5',
    sourceBaseName: 'ProcessDeactivateMessages_amaci_2-5',
    targetDir: 'amaci-2-1-1-5',
    targetBaseName: 'deactivate',
    description: 'AMACI ProcessDeactivate (2-1-1-5)'
  },
  {
    sourceDir: 'AddNewKey_amaci_2',
    sourceBaseName: 'AddNewKey_amaci_2',
    targetDir: 'amaci-2-1-1-5',
    targetBaseName: 'addNewKey',
    description: 'AMACI AddNewKey (2-1-1-5)'
  }
];

/**
 * Get file size in MB
 */
function getFileSizeMB(filePath: string): string {
  const stats = fs.statSync(filePath);
  return (stats.size / (1024 * 1024)).toFixed(2);
}

/**
 * Copy a file and log the operation
 */
function copyFile(src: string, dest: string, description: string): boolean {
  try {
    if (!fs.existsSync(src)) {
      console.log(`   ⚠️  Source not found: ${path.basename(src)}`);
      return false;
    }

    // Ensure target directory exists
    const targetDir = path.dirname(dest);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy file
    fs.copyFileSync(src, dest);
    const sizeMB = getFileSizeMB(dest);
    console.log(`   ✓ ${description}: ${path.basename(dest)} (${sizeMB} MB)`);
    return true;
  } catch (error) {
    console.log(`   ✗ Failed to copy ${description}: ${error}`);
    return false;
  }
}

/**
 * Copy circuit artifacts (zkey and wasm)
 */
function copyCircuitArtifacts(mapping: CircuitMapping): void {
  console.log(`\n📦 ${mapping.description}`);
  
  const sourceDir = path.join(CIRCUITS_BUILD_DIR, mapping.sourceDir);
  const targetDir = path.join(E2E_CIRCUITS_DIR, mapping.targetDir);

  // Copy .zkey file (use .0.zkey as it's the final zkey after setup)
  const zkeySource = path.join(sourceDir, `${mapping.sourceBaseName}.0.zkey`);
  const zkeyTarget = path.join(targetDir, `${mapping.targetBaseName}.zkey`);
  copyFile(zkeySource, zkeyTarget, 'zkey');

  // Copy .wasm file (from _js directory)
  const wasmJsDir = path.join(sourceDir, `${mapping.sourceBaseName}_js`);
  const wasmSource = path.join(wasmJsDir, `${mapping.sourceBaseName}.wasm`);
  const wasmTarget = path.join(targetDir, `${mapping.targetBaseName}.wasm`);
  copyFile(wasmSource, wasmTarget, 'wasm');
}

/**
 * Main execution
 */
function main() {
  console.log('🔄 Copying Latest Circuit Artifacts to E2E');
  console.log('='.repeat(60));
  console.log(`Source: ${CIRCUITS_BUILD_DIR}`);
  console.log(`Target: ${E2E_CIRCUITS_DIR}`);

  // Check if source directory exists
  if (!fs.existsSync(CIRCUITS_BUILD_DIR)) {
    console.error(`\n❌ Error: Build directory not found: ${CIRCUITS_BUILD_DIR}`);
    console.error('Please run "pnpm generate-zkeys" in packages/circuits first.');
    process.exit(1);
  }

  // Check if target directory exists
  if (!fs.existsSync(E2E_CIRCUITS_DIR)) {
    console.error(`\n❌ Error: E2E circuits directory not found: ${E2E_CIRCUITS_DIR}`);
    process.exit(1);
  }

  // Copy each circuit
  let successCount = 0;
  let totalFiles = 0;

  CIRCUIT_MAPPINGS.forEach(mapping => {
    copyCircuitArtifacts(mapping);
    totalFiles += 2; // zkey + wasm
  });

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Circuit copy complete!`);
  console.log(`\nNext steps:`);
  console.log(`  1. Verify files in e2e/circuits/`);
  console.log(`  2. Run e2e tests: cd e2e && pnpm test`);
  console.log(`     - pnpm test:maci`);
  console.log(`     - pnpm test:amaci`);
  console.log(`     - pnpm test:add-new-key`);
}

// Run the script
main();
