import https from 'https';
import fs from 'fs';
import path from 'path';
import * as tar from 'tar';

const ZKEY_URL = 'https://vota-zkey.s3.ap-southeast-1.amazonaws.com/qv1p1v_2-1-1-5_zkeys.tar.gz';
const CIRCUITS_DIR = path.join(__dirname, '../circuits');
const TAR_FILE = path.join(CIRCUITS_DIR, 'zkeys.tar.gz');
const TARGET_DIR = path.join(CIRCUITS_DIR, '2-1-1-5');

/**
 * Download zkey files for circuit configuration 2-1-1-5
 * - state_tree_depth: 2 (max 25 voters)
 * - int_state_tree_depth: 1
 * - vote_option_tree_depth: 1 (max 5 options)
 * - message_batch_size: 5
 */
async function downloadZkeys(): Promise<void> {
  console.log('🔍 Checking circuit files...');

  // Create circuits directory if it doesn't exist
  if (!fs.existsSync(CIRCUITS_DIR)) {
    fs.mkdirSync(CIRCUITS_DIR, { recursive: true });
  }

  // Check if files already exist
  const requiredFiles = [
    path.join(TARGET_DIR, 'processMessages.wasm'),
    path.join(TARGET_DIR, 'processMessages.zkey'),
    path.join(TARGET_DIR, 'tallyVotes.wasm'),
    path.join(TARGET_DIR, 'tallyVotes.zkey')
  ];

  const allFilesExist = requiredFiles.every((file) => fs.existsSync(file));

  if (allFilesExist) {
    console.log('✅ Circuit files already exist, skipping download');
    return;
  }

  console.log('📥 Downloading zkey files from S3...');
  console.log(`   URL: ${ZKEY_URL}`);
  console.log(`   This may take a few minutes...`);

  // Download the tar.gz file
  await downloadFile(ZKEY_URL, TAR_FILE);

  console.log('📦 Extracting files...');

  // Extract the tar.gz file
  await tar.extract({
    file: TAR_FILE,
    cwd: CIRCUITS_DIR
  });

  console.log('📦 Organizing files...');

  // Create target directory
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  // Copy files from extracted structure to target structure
  const zkeysSrcDir = path.join(CIRCUITS_DIR, 'zkeys');

  // Copy WASM files
  const msgWasmSrc = path.join(zkeysSrcDir, 'r1cs', 'msg_js', 'msg.wasm');
  const msgWasmDst = path.join(TARGET_DIR, 'processMessages.wasm');
  if (fs.existsSync(msgWasmSrc)) {
    fs.copyFileSync(msgWasmSrc, msgWasmDst);
  }

  const tallyWasmSrc = path.join(zkeysSrcDir, 'r1cs', 'tally_js', 'tally.wasm');
  const tallyWasmDst = path.join(TARGET_DIR, 'tallyVotes.wasm');
  if (fs.existsSync(tallyWasmSrc)) {
    fs.copyFileSync(tallyWasmSrc, tallyWasmDst);
  }

  // Copy zkey files (using _1.zkey as they are the final keys after ceremony)
  const msgZkeySrc = path.join(zkeysSrcDir, 'zkey', 'msg_1.zkey');
  const msgZkeyDst = path.join(TARGET_DIR, 'processMessages.zkey');
  if (fs.existsSync(msgZkeySrc)) {
    fs.copyFileSync(msgZkeySrc, msgZkeyDst);
  }

  const tallyZkeySrc = path.join(zkeysSrcDir, 'zkey', 'tally_1.zkey');
  const tallyZkeyDst = path.join(TARGET_DIR, 'tallyVotes.zkey');
  if (fs.existsSync(tallyZkeySrc)) {
    fs.copyFileSync(tallyZkeySrc, tallyZkeyDst);
  }

  console.log('✅ Zkey files downloaded and extracted successfully');

  // Clean up
  if (fs.existsSync(TAR_FILE)) {
    fs.unlinkSync(TAR_FILE);
  }
  if (fs.existsSync(zkeysSrcDir)) {
    fs.rmSync(zkeysSrcDir, { recursive: true, force: true });
  }

  // Remove macOS metadata files (._* files)
  const removeAppleDoubleFiles = (dir: string) => {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const filePath = path.join(dir, file.name);
      if (file.name.startsWith('._')) {
        fs.unlinkSync(filePath);
      } else if (file.isDirectory()) {
        removeAppleDoubleFiles(filePath);
      }
    }
  };

  removeAppleDoubleFiles(CIRCUITS_DIR);

  console.log('🧹 Cleaned up temporary files');

  // Verify extracted files
  console.log('\n📋 Verifying extracted files:');
  for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
      const stats = fs.statSync(file);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`   ✓ ${path.basename(file)} (${sizeMB} MB)`);
    } else {
      console.error(`   ✗ ${path.basename(file)} - NOT FOUND`);
      throw new Error(`Required file not found: ${file}`);
    }
  }
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
            process.stdout.write(`\r   Progress: ${progress}% (${downloadedMB}/${totalMB} MB)`);
            lastProgress = progress;
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log('\n   ✓ Download complete');
          resolve();
        });
      })
      .on('error', (err) => {
        fs.unlinkSync(outputPath);
        reject(err);
      });

    file.on('error', (err) => {
      fs.unlinkSync(outputPath);
      reject(err);
    });
  });
}

// Run the download
downloadZkeys()
  .then(() => {
    console.log('\n✨ Setup complete! Run "pnpm extract-vkeys" to extract verification keys.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error downloading zkeys:', error.message);
    process.exit(1);
  });
