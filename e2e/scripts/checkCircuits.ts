import fs from 'fs';
import path from 'path';

const CIRCUITS_DIR = path.join(__dirname, '../circuits');
const CIRCUIT_CONFIG = '2-1-1-5';
const CIRCUIT_PATH = path.join(CIRCUITS_DIR, CIRCUIT_CONFIG);

const REQUIRED_FILES = [
  path.join(CIRCUIT_PATH, 'processMessages.wasm'),
  path.join(CIRCUIT_PATH, 'processMessages.zkey'),
  path.join(CIRCUIT_PATH, 'tallyVotes.wasm'),
  path.join(CIRCUIT_PATH, 'tallyVotes.zkey'),
  path.join(CIRCUITS_DIR, `vkeys-${CIRCUIT_CONFIG}.json`)
];

/**
 * Check if all required circuit files exist
 */
function checkCircuits(): void {
  console.log('🔍 Checking circuit files...');

  const missingFiles: string[] = [];

  for (const file of REQUIRED_FILES) {
    if (!fs.existsSync(file)) {
      missingFiles.push(path.relative(path.join(__dirname, '..'), file));
    }
  }

  if (missingFiles.length > 0) {
    console.error('\n❌ Missing required circuit files:');
    missingFiles.forEach((file) => console.error(`   - ${file}`));
    console.error('\n💡 Please run the following command to set up circuits:');
    console.error('   pnpm setup-circuits');
    console.error('\n   Or run them separately:');
    console.error('   1. pnpm download-zkeys   # Download zkey files (~50-100MB)');
    console.error('   2. pnpm extract-vkeys    # Extract verification keys\n');
    process.exit(1);
  }

  console.log('✅ All circuit files are present');
  console.log(`   Configuration: ${CIRCUIT_CONFIG}`);
  console.log('   - Max voters: 25 (5^2)');
  console.log('   - Max options: 5 (5^1)');
  console.log('   - Batch size: 5\n');
}

// Run the check
checkCircuits();
