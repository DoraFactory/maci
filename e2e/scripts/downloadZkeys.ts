import https from 'https';
import fs from 'fs';
import path from 'path';
import * as tar from 'tar';

// Circuit configurations
interface CircuitConfig {
  name: string;
  url: string;
  targetDir: string;
  description: string;
  fileMapping: {
    processMessagesWasm: string[];
    processMessagesZkey: string[];
    tallyVotesWasm: string[];
    tallyVotesZkey: string[];
    deactivateWasm?: string[];
    deactivateZkey?: string[];
  };
}

const CIRCUITS_DIR = path.join(__dirname, '../circuits');

const CIRCUIT_CONFIGS: CircuitConfig[] = [
  {
    name: 'AMACI',
    url: 'https://vota-zkey.s3.ap-southeast-1.amazonaws.com/amaci_2-1-1-5_v4_zkeys.tar.gz',
    targetDir: path.join(CIRCUITS_DIR, 'amaci-2-1-1-5'),
    description: 'AMACI (state:2, int:1, vote:1, batch:5)',
    fileMapping: {
      processMessagesWasm: ['zkey', '2-1-1-5_v4', 'msg.wasm'],
      processMessagesZkey: ['zkey', '2-1-1-5_v4', 'msg.zkey'],
      tallyVotesWasm: ['zkey', '2-1-1-5_v4', 'tally.wasm'],
      tallyVotesZkey: ['zkey', '2-1-1-5_v4', 'tally.zkey'],
      deactivateWasm: ['zkey', '2-1-1-5_v4', 'deactivate.wasm'],
      deactivateZkey: ['zkey', '2-1-1-5_v4', 'deactivate.zkey']
    }
  }
];

// Skip these when scanning for extracted zkey dir (our target dirs or known non-zkey dirs)
const SKIP_DIRS = new Set(['amaci-2-1-1-5', 'amaci-4-2-2-25', 'maci-2-1-1-5', 'maci-4-2-2-25']);

/**
 * Recursively find the directory that contains circuit artifacts.
 * Tarballs may use msg.wasm/msg.zkey (v3) or processMessages.wasm/processMessages.zkey (v4).
 * Returns path segments from baseDir to that folder, or null.
 */
function findExtractedZkeyDir(baseDir: string, segments: string[] = []): string[] | null {
  if (!fs.existsSync(baseDir)) return null;
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue;
    const dirPath = path.join(baseDir, e.name);
    const hasArtifacts =
      fs.existsSync(path.join(dirPath, 'msg.wasm')) ||
      fs.existsSync(path.join(dirPath, 'msg.zkey')) ||
      fs.existsSync(path.join(dirPath, 'processMessages.wasm')) ||
      fs.existsSync(path.join(dirPath, 'processMessages.zkey'));
    if (hasArtifacts) return [...segments, e.name];
    const found = findExtractedZkeyDir(dirPath, [...segments, e.name]);
    if (found) return found;
  }
  return null;
}

/**
 * Download and extract zkey files for a specific circuit configuration
 */
async function downloadCircuitConfig(config: CircuitConfig): Promise<void> {
  console.log(`\n📦 Processing ${config.name}`);
  console.log(`   ${config.description}`);

  // Check if files already exist
  const requiredFiles = [
    path.join(config.targetDir, 'processMessages.wasm'),
    path.join(config.targetDir, 'processMessages.zkey'),
    path.join(config.targetDir, 'tallyVotes.wasm'),
    path.join(config.targetDir, 'tallyVotes.zkey')
  ];

  const allFilesExist = requiredFiles.every((file) => fs.existsSync(file));

  if (allFilesExist) {
    console.log(`   ✅ Files already exist, skipping download`);
    return;
  }

  const tarFileName = `${path.basename(config.targetDir)}.tar.gz`;
  const tarFilePath = path.join(CIRCUITS_DIR, tarFileName);

  console.log(`   📥 Downloading from S3...`);
  console.log(`   URL: ${config.url}`);

  // Download the tar.gz file (with retry on socket hang up / network errors)
  await downloadFileWithRetry(config.url, tarFilePath);

  console.log(`   📦 Extracting files...`);

  // Extract the tar.gz file
  await tar.extract({
    file: tarFilePath,
    cwd: CIRCUITS_DIR
  });

  console.log(`   📁 Organizing files...`);

  // Detect actual extracted dir (AMACI v4 uses amaci_2-1-1-5_v4_zkeys/ with processMessages.* names)
  const extractedPrefix = findExtractedZkeyDir(CIRCUITS_DIR);
  const pathPrefix = extractedPrefix ?? config.fileMapping.processMessagesWasm.slice(0, -1);
  if (extractedPrefix) {
    console.log(`   📂 Found files in: ${extractedPrefix.join('/')}`);
  }

  // v4 tarball uses processMessages.wasm / tallyVotes.wasm; v3 uses msg.wasm / tally.wasm
  const sourceNameAlternatives: Record<string, string[]> = {
    'processMessages.wasm': ['processMessages.wasm', 'msg.wasm'],
    'processMessages.zkey': ['processMessages.zkey', 'msg.zkey'],
    'tallyVotes.wasm': ['tallyVotes.wasm', 'tally.wasm'],
    'tallyVotes.zkey': ['tallyVotes.zkey', 'tally.zkey']
  };

  // Create target directory
  if (!fs.existsSync(config.targetDir)) {
    fs.mkdirSync(config.targetDir, { recursive: true });
  }

  // Helper: copy from path (v4 tarball uses processMessages.*/tallyVotes.*, v3 uses msg.*/tally.*)
  const copyFile = (srcPathArray: string[], dstFilename: string, label: string): boolean => {
    const dstPath = path.join(config.targetDir, dstFilename);
    const namesToTry = sourceNameAlternatives[dstFilename] ?? [srcPathArray[srcPathArray.length - 1]];
    for (const name of namesToTry) {
      const srcPath = path.join(CIRCUITS_DIR, ...pathPrefix, name);
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, dstPath);
        console.log(`   ✓ Copied ${label}`);
        return true;
      }
    }
    const fallbackPath = path.join(CIRCUITS_DIR, ...srcPathArray);
    if (fs.existsSync(fallbackPath)) {
      fs.copyFileSync(fallbackPath, dstPath);
      console.log(`   ✓ Copied ${label}`);
      return true;
    }
    console.warn(`   ⚠️  Source not found: ${pathPrefix.join('/')}/{${namesToTry.join('|')}}`);
    return false;
  };

  // Copy files using config mapping (filenames: msg -> processMessages, tally -> tallyVotes)
  copyFile(config.fileMapping.processMessagesWasm, 'processMessages.wasm', 'processMessages.wasm');
  copyFile(config.fileMapping.processMessagesZkey, 'processMessages.zkey', 'processMessages.zkey');
  copyFile(config.fileMapping.tallyVotesWasm, 'tallyVotes.wasm', 'tallyVotes.wasm');
  copyFile(config.fileMapping.tallyVotesZkey, 'tallyVotes.zkey', 'tallyVotes.zkey');

  // Copy deactivate files if available (AMACI only)
  if (config.fileMapping.deactivateWasm) {
    copyFile(config.fileMapping.deactivateWasm, 'deactivate.wasm', 'deactivate.wasm');
  }
  if (config.fileMapping.deactivateZkey) {
    copyFile(config.fileMapping.deactivateZkey, 'deactivate.zkey', 'deactivate.zkey');
  }

  // Clean up: remove tar file and extracted directories
  if (fs.existsSync(tarFilePath)) {
    fs.unlinkSync(tarFilePath);
  }

  // Remove extracted dirs (zkeys, zkey, r1cs, or detected top-level)
  const extractedDirs = ['zkeys', 'zkey', 'r1cs', ...(extractedPrefix ? [extractedPrefix[0]] : [])];
  const toRemove = new Set(extractedDirs);
  for (const dir of toRemove) {
    const dirPath = path.join(CIRCUITS_DIR, dir);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }

  // Verify extracted files
  console.log(`   📋 Verifying files:`);
  for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
      const stats = fs.statSync(file);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`      ✓ ${path.basename(file)} (${sizeMB} MB)`);
    } else {
      console.error(`      ✗ ${path.basename(file)} - NOT FOUND`);
      throw new Error(`Required file not found: ${file}`);
    }
  }

  console.log(`   ✅ ${config.name} setup complete`);
}

const DOWNLOAD_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Download a file from a URL with retries (handles socket hang up / transient network errors)
 */
async function downloadFileWithRetry(url: string, outputPath: string): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt++) {
    try {
      await downloadFile(url, outputPath);
      return;
    } catch (err: any) {
      lastError = err;
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      if (attempt < DOWNLOAD_RETRIES) {
        console.log(`\n      ⚠️  Attempt ${attempt} failed: ${err.message}. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  throw lastError;
}

/**
 * Download a file from a URL
 */
function downloadFile(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    let downloadedBytes = 0;
    let totalBytes = 0;
    let lastProgress = 0;

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
          return;
        }

        totalBytes = parseInt(response.headers['content-length'] || '0', 10);

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const progress = Math.floor((downloadedBytes / totalBytes) * 100);

          // Update progress every 5%
          if (progress >= lastProgress + 5 || progress === 100) {
            const downloadedMB = (downloadedBytes / 1024 / 1024).toFixed(2);
            const totalMB = (totalBytes / 1024 / 1024).toFixed(2);
            process.stdout.write(`\r      Progress: ${progress}% (${downloadedMB}/${totalMB} MB)`);
            lastProgress = progress;
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log('\n      ✓ Download complete');
          resolve();
        });
      })
      .on('error', (err) => {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        reject(err);
      });

    file.on('error', (err) => {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      reject(err);
    });
  });
}

/**
 * Remove macOS metadata files (._* files)
 */
function removeAppleDoubleFiles(dir: string) {
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const filePath = path.join(dir, file.name);
    if (file.name.startsWith('._')) {
      fs.unlinkSync(filePath);
    } else if (file.isDirectory()) {
      removeAppleDoubleFiles(filePath);
    }
  }
}

/**
 * Main function to download all circuit configurations
 */
async function downloadAllZkeys(): Promise<void> {
  console.log('🔍 AMACI Circuit Setup');
  console.log('━'.repeat(60));

  // Create circuits directory if it doesn't exist
  if (!fs.existsSync(CIRCUITS_DIR)) {
    fs.mkdirSync(CIRCUITS_DIR, { recursive: true });
  }

  // Download each circuit configuration
  for (const config of CIRCUIT_CONFIGS) {
    try {
      await downloadCircuitConfig(config);
    } catch (error: any) {
      console.error(`\n❌ Error processing ${config.name}:`, error.message);
      throw error;
    }
  }

  // Download AMACI-specific addNewKey files (separate from tarball)
  console.log('\n📦 Downloading AMACI AddNewKey files');
  console.log('   (Separate from main tarball)');

  const amaciDir = path.join(CIRCUITS_DIR, 'amaci-2-1-1-5');
  const addNewKeyWasm = path.join(amaciDir, 'addNewKey.wasm');
  const addNewKeyZkey = path.join(amaciDir, 'addNewKey.zkey');

  // Check if files already exist
  if (fs.existsSync(addNewKeyWasm) && fs.existsSync(addNewKeyZkey)) {
    console.log('   ✅ AddNewKey files already exist, skipping download');
  } else {
    console.log('   📥 Downloading addNewKey.wasm (v4)...');
    await downloadFileWithRetry(
      'https://vota-zkey.s3.ap-southeast-1.amazonaws.com/add-new-key_2-1-1-5_v4.wasm',
      addNewKeyWasm
    );

    console.log('   📥 Downloading addNewKey.zkey (v4)...');
    await downloadFileWithRetry(
      'https://vota-zkey.s3.ap-southeast-1.amazonaws.com/add-new-key_2-1-1-5_v4.zkey',
      addNewKeyZkey
    );

    console.log('   ✅ AddNewKey files downloaded');

    // Verify file sizes
    const wasmSize = (fs.statSync(addNewKeyWasm).size / 1024 / 1024).toFixed(2);
    const zkeySize = (fs.statSync(addNewKeyZkey).size / 1024 / 1024).toFixed(2);
    console.log(`   ✓ addNewKey.wasm (${wasmSize} MB)`);
    console.log(`   ✓ addNewKey.zkey (${zkeySize} MB)`);
  }

  // Clean up macOS metadata files
  console.log('\n🧹 Cleaning up metadata files...');
  removeAppleDoubleFiles(CIRCUITS_DIR);

  console.log('\n✨ All circuit files downloaded successfully!');
  console.log('📝 Next step: Run "pnpm extract-vkeys" to extract verification keys.');
}

// Run the download
downloadAllZkeys()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  });
