/**
 * Generate Crypto Test Vectors
 *
 * This script runs the Rust binary to generate crypto test vectors
 * and saves them to a JSON file for cross-language consistency testing.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT_DIR = path.resolve(__dirname, '../..');
const MACI_CRYPTO_DIR = path.join(ROOT_DIR, 'crates/maci-crypto');
const OUTPUT_FILE = path.join(__dirname, 'test-vectors-rust.json');

interface CryptoTestVector {
  name: string;
  description: string;
  test_type: string;
  data: any;
}

/**
 * Generate test vectors by running the Rust binary
 */
async function generateVectors(): Promise<CryptoTestVector[]> {
  console.log('🔧 Generating crypto test vectors from Rust...');
  console.log(`   Working directory: ${MACI_CRYPTO_DIR}`);

  try {
    // Run the main crypto test vectors binary
    console.log('\n1️⃣  Generating main crypto test vectors...');
    execSync('cargo run --quiet --bin generate_crypto_test_vectors 2>&1', {
      cwd: MACI_CRYPTO_DIR,
      encoding: 'utf-8',
      stdio: 'inherit' // Show output directly
    });

    // The Rust binary writes to ../../e2e/crypto-test/test-vectors-rust.json
    // Read from that location
    if (!fs.existsSync(OUTPUT_FILE)) {
      throw new Error(`Expected output file not found: ${OUTPUT_FILE}`);
    }

    const jsonContent = fs.readFileSync(OUTPUT_FILE, 'utf-8');
    const vectors: CryptoTestVector[] = JSON.parse(jsonContent);

    console.log(`✅ Generated ${vectors.length} main test vectors`);

    // Run the AMACI crypto test vectors binary
    console.log('\n2️⃣  Generating AMACI crypto test vectors...');
    const amaciOutput = execSync('cargo run --quiet --bin generate_amaci_crypto_vectors 2>&1', {
      cwd: MACI_CRYPTO_DIR,
      encoding: 'utf-8'
    });

    // Parse JSON output from stdout
    const amaciJsonMatch = amaciOutput.match(/^\[[\s\S]*\]$/m);
    if (amaciJsonMatch) {
      const amaciVectors: CryptoTestVector[] = JSON.parse(amaciJsonMatch[0]);
      vectors.push(...amaciVectors);
      console.log(`✅ Generated ${amaciVectors.length} AMACI test vectors`);
    } else {
      console.warn('⚠️  Could not parse AMACI vectors from output');
    }

    // Write combined vectors back to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(vectors, null, 2), 'utf-8');
    console.log(`\n💾 Saved combined vectors to ${path.basename(OUTPUT_FILE)}`);

    return vectors;
  } catch (error) {
    console.error('❌ Failed to generate test vectors:', error);
    throw error;
  }
}

/**
 * Validate vectors
 */
function validateVectors(vectors: CryptoTestVector[]): void {
  console.log('\n🔍 Validating test vectors...');

  const errors: string[] = [];

  vectors.forEach((vector, index) => {
    if (!vector.name) {
      errors.push(`Vector ${index}: missing name`);
    }
    if (
      !vector.test_type ||
      ![
        'keypair',
        'keypair_comparison',
        'ecdh',
        'pack',
        'tree',
        'rerandomize',
        'amaci_static_random_key',
        'amaci_encrypt',
        'amaci_rerandomize'
      ].includes(vector.test_type)
    ) {
      errors.push(`Vector ${index}: invalid test_type "${vector.test_type}"`);
    }
    if (!vector.data) {
      errors.push(`Vector ${index}: missing data`);
    }
  });

  if (errors.length > 0) {
    console.error('❌ Validation failed:');
    errors.forEach((err) => console.error(`   - ${err}`));
    throw new Error(`Validation failed with ${errors.length} error(s)`);
  }

  console.log('✅ All vectors valid');
}

/**
 * Print summary
 */
function printSummary(vectors: CryptoTestVector[]): void {
  console.log('\n📊 Summary:');

  const keypairCount = vectors.filter((v) => v.test_type === 'keypair').length;
  const keypairComparisonCount = vectors.filter((v) => v.test_type === 'keypair_comparison').length;
  const ecdhCount = vectors.filter((v) => v.test_type === 'ecdh').length;
  const packCount = vectors.filter((v) => v.test_type === 'pack').length;
  const treeCount = vectors.filter((v) => v.test_type === 'tree').length;
  const rerandomizeCount = vectors.filter((v) => v.test_type === 'rerandomize').length;
  const amaciStaticKeyCount = vectors.filter(
    (v) => v.test_type === 'amaci_static_random_key'
  ).length;
  const amaciEncryptCount = vectors.filter((v) => v.test_type === 'amaci_encrypt').length;
  const amaciRerandomizeCount = vectors.filter((v) => v.test_type === 'amaci_rerandomize').length;

  console.log(`   Total vectors: ${vectors.length}`);
  console.log(`   - keypair: ${keypairCount}`);
  console.log(`   - keypair_comparison: ${keypairComparisonCount}`);
  console.log(`   - ecdh: ${ecdhCount}`);
  console.log(`   - pack: ${packCount}`);
  console.log(`   - tree: ${treeCount}`);
  console.log(`   - rerandomize: ${rerandomizeCount}`);
  console.log(`   - amaci_static_random_key: ${amaciStaticKeyCount}`);
  console.log(`   - amaci_encrypt: ${amaciEncryptCount}`);
  console.log(`   - amaci_rerandomize: ${amaciRerandomizeCount}`);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Rust Crypto Test Vector Generator');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Generate vectors
    const vectors = await generateVectors();

    // Validate
    validateVectors(vectors);

    // Print summary
    printSummary(vectors);

    console.log('\n✅ Test vectors generated successfully!');
    console.log('\nNext steps:');
    console.log('  cd e2e');
    console.log('  pnpm test:crypto');
    console.log('');
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { generateVectors, validateVectors };
