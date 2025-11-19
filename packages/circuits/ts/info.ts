// eslint-disable-next-line import/no-extraneous-dependencies
import { glob } from 'glob';

import childProcess from 'child_process';
import fs from 'fs';
import path from 'path';

import type { CircuitConfig } from 'circomkit';

export async function info(zkeysPath: string): Promise<void> {
  // Validate zkeys path
  if (!zkeysPath) {
    throw new Error('zkeysPath is required. Please provide a valid path using --zkeys argument.');
  }

  const resolvedPath = path.resolve(zkeysPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Path does not exist: ${resolvedPath}`);
  }

  const files = await glob('**/*.r1cs', { cwd: zkeysPath });

  if (files.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`No .r1cs files found in ${resolvedPath}`);
    return;
  }

  const circuitsConfigPath = path.resolve(__dirname, '..', 'circom', 'circuits.json');
  if (!fs.existsSync(circuitsConfigPath)) {
    throw new Error(`circuits.json not found at ${circuitsConfigPath}`);
  }

  const circuitsConfig = JSON.parse(
    await fs.promises.readFile(circuitsConfigPath, 'utf-8')
  ) as unknown as Record<string, CircuitConfig>;

  const params = files
    .map((file) => ({ config: circuitsConfig[file.split('/')[0]], file }))
    .reduce<Record<string, string>>((acc, { config, file }) => {
      if (!config) {
        // eslint-disable-next-line no-console
        console.warn(`Warning: No config found for ${file.split('/')[0]}`);
        acc[file] = 'Unknown circuit';
      } else {
        acc[file] = `${config.template} [${config.params?.toString()}]`;
      }

      return acc;
    }, {});

  const { promisify } = await import('util');
  const execFile = promisify(childProcess.execFile);

  const data: { stdout: string; stderr: string }[] = [];

  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let index = 0; index < files.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await execFile('snarkjs', [
      'r1cs',
      'info',
      path.resolve(zkeysPath, files[index])
    ]);
    data.push(result);
  }

  // eslint-disable-next-line no-console
  console.log(
    data
      .map(({ stdout }, index) => `${files[index]}\n${params[files[index]]}\n${stdout}`)
      .join('\n')
  );
}

if (require.main === module) {
  (async () => {
    const zkeyIndex = process.argv.indexOf('--zkeys');

    if (zkeyIndex === -1 || zkeyIndex === process.argv.length - 1) {
      // eslint-disable-next-line no-console
      console.error('Error: --zkeys argument is required');
      // eslint-disable-next-line no-console
      console.error('Usage: ts-node info.ts --zkeys <path>');
      // eslint-disable-next-line no-console
      console.error('Example: ts-node info.ts --zkeys build');
      process.exit(1);
    }

    const zkeysPath = process.argv[zkeyIndex + 1];

    try {
      await info(zkeysPath);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  })();
}
