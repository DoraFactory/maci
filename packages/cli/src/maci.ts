import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { registryCommand } from './commands/registry.js';
import { roundCommand } from './commands/verify.js';

yargs(hideBin(process.argv))
  .scriptName('maci')
  .usage('$0 <command> [options]\n\nPublic CLI for aMACI circuit registry and round verification.')
  .strict()
  .demandCommand(1, 'Please specify a command. Run "maci --help" for usage.')
  .command(registryCommand)
  .command(roundCommand)
  .help()
  .version()
  .wrap(Math.min(100, process.stdout.columns ?? 80))
  .parse();
