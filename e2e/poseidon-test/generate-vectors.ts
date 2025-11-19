/**
 * Generate Rust Test Vectors
 *
 * This script runs the Rust binary to generate Poseidon hash test vectors
 * and saves them to a JSON file for cross-language consistency testing.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT_DIR = path.resolve(__dirname, '../..');
const MACI_UTILS_DIR = path.join(ROOT_DIR, 'crates/maci-utils');
const OUTPUT_FILE = path.join(__dirname, 'test-vectors-rust.json');

interface TestVector {
  name: string;
  description: string;
  hash_type: string;
  inputs: string[];
  rust_result: string;
}

/**
 * Generate test vectors by running the Rust binary
 * The Rust binary writes directly to the JSON file
 */
async function generateVectors(): Promise<TestVector[]> {
  console.log('🔧 Generating Poseidon hash test vectors from Rust...');
  console.log(`   Working directory: ${MACI_UTILS_DIR}`);

  try {
    // Run the Rust binary (it writes directly to the file)
    execSync('cargo run --quiet --bin generate_test_vectors 2>&1', {
      cwd: MACI_UTILS_DIR,
      encoding: 'utf-8',
      stdio: 'inherit' // Show output directly
    });

    // Read the generated file
    if (!fs.existsSync(OUTPUT_FILE)) {
      throw new Error(`Expected output file not found: ${OUTPUT_FILE}`);
    }

    const jsonContent = fs.readFileSync(OUTPUT_FILE, 'utf-8');
    const vectors: TestVector[] = JSON.parse(jsonContent);

    console.log(`✅ Generated ${vectors.length} test vectors`);

    return vectors;
  } catch (error) {
    console.error('❌ Failed to generate test vectors:', error);
    throw error;
  }
}

/**
 * Save vectors to JSON file
 */
function saveVectors(vectors: TestVector[], outputPath: string): void {
  const jsonContent = JSON.stringify(vectors, null, 2);
  fs.writeFileSync(outputPath, jsonContent, 'utf-8');
  console.log(`💾 Saved to: ${path.relative(ROOT_DIR, outputPath)}`);
}

/**
 * Validate vectors
 */
function validateVectors(vectors: TestVector[]): void {
  console.log('\n🔍 Validating test vectors...');

  const errors: string[] = [];

  vectors.forEach((vector, index) => {
    if (!vector.name) {
      errors.push(`Vector ${index}: missing name`);
    }
    if (!vector.hash_type || !['hash2', 'hash5'].includes(vector.hash_type)) {
      errors.push(`Vector ${index}: invalid hash_type "${vector.hash_type}"`);
    }
    if (!vector.inputs || !Array.isArray(vector.inputs)) {
      errors.push(`Vector ${index}: missing or invalid inputs`);
    }
    if (vector.hash_type === 'hash2' && vector.inputs.length !== 2) {
      errors.push(`Vector ${index}: hash2 requires 2 inputs, got ${vector.inputs.length}`);
    }
    if (vector.hash_type === 'hash5' && vector.inputs.length !== 5) {
      errors.push(`Vector ${index}: hash5 requires 5 inputs, got ${vector.inputs.length}`);
    }
    if (!vector.rust_result || !vector.rust_result.startsWith('0x')) {
      errors.push(`Vector ${index}: invalid rust_result format`);
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
function printSummary(vectors: TestVector[]): void {
  console.log('\n📊 Summary:');

  const hash2Count = vectors.filter((v) => v.hash_type === 'hash2').length;
  const hash5Count = vectors.filter((v) => v.hash_type === 'hash5').length;

  console.log(`   Total vectors: ${vectors.length}`);
  console.log(`   - hash2: ${hash2Count}`);
  console.log(`   - hash5: ${hash5Count}`);

  console.log('\n📝 Test vectors:');
  vectors.forEach((v) => {
    console.log(`   - ${v.name} (${v.hash_type})`);
  });
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Rust Test Vector Generator');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Generate vectors
    const vectors = await generateVectors();

    // Validate
    validateVectors(vectors);

    // Save to file
    saveVectors(vectors, OUTPUT_FILE);

    // Print summary
    printSummary(vectors);

    console.log('\n✅ Test vectors generated successfully!');
    console.log('\nNext steps:');
    console.log('  cd e2e');
    console.log('  pnpm test:poseidon');
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

export { generateVectors, saveVectors, validateVectors };
