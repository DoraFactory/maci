import type { CommandModule, Argv, ArgumentsCamelCase } from 'yargs';
import { NETWORK_CHOICES, type NetworkName } from '../core/network.js';
import { AMACI_CIRCUITS } from '../core/circuits.js';
import { runRegistryCheck } from '../core/pipeline.js';
import {
  printRegistryList,
  printCircuitDetail,
  printVkeyCheckResult,
  printError,
} from '../core/report.js';

// ─── Subcommand handlers ─────────────────────────────────────────────────────

function handleList() {
  const circuits = Object.values(AMACI_CIRCUITS).map((entry) => ({
    label: entry.label,
    production: entry.production,
    source: entry.source,
    params: entry.params,
  }));
  printRegistryList(circuits);
}

function handleShow(args: ArgumentsCamelCase<{ power: string }>) {
  const entry = AMACI_CIRCUITS[args.power];
  if (!entry) {
    printError(
      `Circuit power "${args.power}" not found in aMACI registry.\n` +
        `Run "maci registry list" to see available circuits.`
    );
    process.exit(1);
  }
  printCircuitDetail(entry);
}

async function handleCheck(
  args: ArgumentsCamelCase<{ contract: string; network: NetworkName; rpc?: string }>
) {
  try {
    const result = await runRegistryCheck(args.contract, args.network, args.rpc);

    printVkeyCheckResult({
      power: result.power,
      source: result.source,
      production: result.production,
      processMatch: result.processMatch,
      tallyMatch: result.tallyMatch,
      deactivateMatch: result.deactivateMatch,
      addNewKeyMatch: result.addNewKeyMatch,
    });

    if (!result.passed) {
      process.exit(1);
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// ─── CommandModule ───────────────────────────────────────────────────────────

export const registryCommand: CommandModule = {
  command: 'registry <subcommand>',
  describe: 'aMACI circuit registry commands',
  builder: (yargs: Argv) =>
    yargs
      .command(
        'list',
        'List all aMACI circuits known to this CLI',
        () => {},
        () => handleList()
      )
      .command(
        'show <power>',
        'Show detailed info for an aMACI circuit power (e.g. 9-4-3-125)',
        (y: Argv) =>
          y.positional('power', {
            type: 'string',
            description: 'Circuit power string (e.g. 9-4-3-125)',
            demandOption: true,
          }),
        (args) => handleShow(args as ArgumentsCamelCase<{ power: string }>)
      )
      .command(
        'check <contract>',
        'Compare on-chain vkeys against the aMACI registry',
        (y: Argv) =>
          y
            .positional('contract', {
              type: 'string',
              description: 'Contract address of the aMACI round',
              demandOption: true,
            })
            .option('network', {
              alias: 'n',
              type: 'string',
              choices: NETWORK_CHOICES,
              description: 'Target network (mainnet or testnet)',
              default: 'mainnet' as NetworkName,
            })
            .option('rpc', {
              type: 'string',
              description: 'CosmWasm RPC endpoint (overrides network default)',
            }),
        (args) =>
          handleCheck(
            args as ArgumentsCamelCase<{
              contract: string;
              network: NetworkName;
              rpc?: string;
            }>
          )
      )
      .demandCommand(1, 'Please specify a registry subcommand'),
  handler: () => {},
};
