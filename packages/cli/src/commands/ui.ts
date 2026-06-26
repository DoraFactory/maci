import { spawn } from 'node:child_process';
import type { CommandModule, Argv, ArgumentsCamelCase } from 'yargs';
import chalk from 'chalk';
import { startUiServer } from '../ui/server.js';
import { printError } from '../core/report.js';

const DEFAULT_PORT = 7766;

/** Open a URL in the default browser without extra dependencies. */
function openBrowser(url: string) {
  const platform = process.platform;
  let cmd: string;
  let args: string[];

  if (platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else if (platform === 'win32') {
    // `start` is a cmd built-in; empty title arg required when URL is quoted
    cmd = 'cmd';
    args = ['/c', 'start', '', url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }

  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {
    // Non-fatal: user can open the printed URL manually
  });
  child.unref();
}

async function handleUi(args: ArgumentsCamelCase<{ port: number; open: boolean }>) {
  try {
    const { port, url } = await startUiServer(args.port);

    console.log('');
    console.log(`  ${chalk.bold('maci ui')} — local verification dashboard`);
    console.log('');
    console.log(`  Serving on ${chalk.cyan(url)}`);
    if (port !== args.port) {
      console.log(chalk.dim(`  (port ${args.port} was busy, using ${port})`));
    }
    console.log(chalk.dim('  Read-only: no keys, no signing. Press Ctrl+C to stop.'));
    console.log('');

    if (args.open) {
      openBrowser(url);
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

export const uiCommand: CommandModule = {
  command: 'ui',
  describe: 'Start a local web UI for round verification and registry browsing',
  builder: (yargs: Argv) =>
    yargs
      .option('port', {
        alias: 'p',
        type: 'number',
        description: 'Port to listen on (auto-increments if busy)',
        default: DEFAULT_PORT,
      })
      .option('open', {
        type: 'boolean',
        description: 'Open the browser automatically (use --no-open to disable)',
        default: true,
      }),
  handler: (args) => handleUi(args as ArgumentsCamelCase<{ port: number; open: boolean }>),
};
