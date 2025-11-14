import fs from 'fs';
import path from 'path';

const CIRCUITS_DIR = path.join(__dirname, '../circuits');

interface CircuitCheck {
  name: string;
  configName: string;
  required: boolean;
  files: string[];
}

const CIRCUIT_CHECKS: CircuitCheck[] = [
  {
    name: 'MACI 1P1V',
    configName: 'maci-2-1-1-5',
    required: true,
    files: [
      path.join(CIRCUITS_DIR, 'maci-2-1-1-5', 'processMessages.wasm'),
      path.join(CIRCUITS_DIR, 'maci-2-1-1-5', 'processMessages.zkey'),
      path.join(CIRCUITS_DIR, 'maci-2-1-1-5', 'tallyVotes.wasm'),
      path.join(CIRCUITS_DIR, 'maci-2-1-1-5', 'tallyVotes.zkey'),
      path.join(CIRCUITS_DIR, 'vkeys-maci-2-1-1-5.json')
    ]
  },
  {
    name: 'AMACI',
    configName: 'amaci-2-1-1-5',
    required: true,
    files: [
      path.join(CIRCUITS_DIR, 'amaci-2-1-1-5', 'processMessages.wasm'),
      path.join(CIRCUITS_DIR, 'amaci-2-1-1-5', 'processMessages.zkey'),
      path.join(CIRCUITS_DIR, 'amaci-2-1-1-5', 'tallyVotes.wasm'),
      path.join(CIRCUITS_DIR, 'amaci-2-1-1-5', 'tallyVotes.zkey'),
      path.join(CIRCUITS_DIR, 'amaci-2-1-1-5', 'deactivate.wasm'),
      path.join(CIRCUITS_DIR, 'amaci-2-1-1-5', 'deactivate.zkey'),
      path.join(CIRCUITS_DIR, 'amaci-2-1-1-5', 'addNewKey.wasm'),
      path.join(CIRCUITS_DIR, 'amaci-2-1-1-5', 'addNewKey.zkey'),
      path.join(CIRCUITS_DIR, 'vkeys-amaci-2-1-1-5.json')
    ]
  }
];

/**
 * Check if all required circuit files exist
 */
function checkCircuits(): void {
  console.log('🔍 Checking circuit files...\n');

  let allPresent = true;
  const missingConfigs: string[] = [];

  for (const check of CIRCUIT_CHECKS) {
    const missingFiles: string[] = [];

    for (const file of check.files) {
      if (!fs.existsSync(file)) {
        missingFiles.push(path.relative(path.join(__dirname, '..'), file));
      }
    }

    if (missingFiles.length > 0) {
      console.log(`❌ ${check.name} (${check.configName}):`);
      missingFiles.forEach((file) => console.log(`   - ${file}`));
      console.log('');
      allPresent = false;
      if (check.required) {
        missingConfigs.push(check.name);
      }
    } else {
      console.log(`✅ ${check.name} (${check.configName})`);
      // Show file sizes
      const wasmSize = fs.statSync(check.files[0]).size / 1024 / 1024;
      const zkeySize = fs.statSync(check.files[1]).size / 1024 / 1024;
      console.log(`   - WASM: ${wasmSize.toFixed(2)} MB`);
      console.log(`   - Zkey: ${zkeySize.toFixed(2)} MB`);
      console.log('');
    }
  }

  if (!allPresent) {
    console.log('━'.repeat(60));
    console.error('❌ Missing required circuit files!');
    console.error('\n💡 Please run the following command to set up circuits:');
    console.error('   pnpm setup-circuits');
    console.error('\n   Or run them separately:');
    console.error('   1. pnpm download-zkeys   # Download zkey files');
    console.error('   2. pnpm extract-vkeys    # Extract verification keys\n');
    process.exit(1);
  }

  console.log('━'.repeat(60));
  console.log('✅ All circuit files are present');
  console.log('\nCircuit configurations:');
  console.log('  - State tree depth: 2 (max 25 voters)');
  console.log('  - Int state tree depth: 1');
  console.log('  - Vote option tree depth: 1 (max 5 options)');
  console.log('  - Message batch size: 5\n');
}

// Run the check
checkCircuits();
