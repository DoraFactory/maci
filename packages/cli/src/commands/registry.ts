import type { CommandModule, Argv, ArgumentsCamelCase } from 'yargs';
import { getOnChainVkeys, type Groth16VkeyOnChain } from '../core/chain.js';
import {
  resolveEndpoints,
  NETWORK_CHOICES,
  type NetworkName,
} from '../core/network.js';
import {
  AMACI_CIRCUITS,
  type AmaciCircuitEntry,
  type AmaciVkeySet,
} from '../core/circuits.js';
import {
  printRegistryList,
  printCircuitDetail,
  printVkeyCheckResult,
  printError,
} from '../core/report.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function vkeysMatch(onChain: Groth16VkeyOnChain, registered: AmaciVkeySet): boolean {
  const fields = [
    'vk_alpha1',
    'vk_beta_2',
    'vk_gamma_2',
    'vk_delta_2',
    'vk_ic0',
    'vk_ic1',
  ] as const;
  return fields.every((f) => onChain[f] === registered[f]);
}

type VkeyMatchResult = {
  power: string;
  entry: AmaciCircuitEntry;
  processMatch: boolean;
  tallyMatch: boolean;
  deactivateMatch: boolean | null;
  addNewKeyMatch: boolean | null;
};

/**
 * Scan all known aMACI circuits to find one whose vkeys match the on-chain values.
 */
function findMatchingCircuit(
  processVkey: Groth16VkeyOnChain,
  tallyVkey: Groth16VkeyOnChain,
  deactivateVkey: Groth16VkeyOnChain | undefined,
  addNewKeyVkey: Groth16VkeyOnChain | undefined
): VkeyMatchResult | null {
  for (const [power, entry] of Object.entries(AMACI_CIRCUITS)) {
    const pm = vkeysMatch(processVkey, entry.vkeys.process);
    const tm = vkeysMatch(tallyVkey, entry.vkeys.tally);
    if (pm || tm) {
      const dm = deactivateVkey !== undefined
        ? vkeysMatch(deactivateVkey, entry.vkeys.deactivate)
        : null;
      const am = addNewKeyVkey !== undefined
        ? vkeysMatch(addNewKeyVkey, entry.vkeys.addNewKey)
        : null;
      return { power, entry, processMatch: pm, tallyMatch: tm, deactivateMatch: dm, addNewKeyMatch: am };
    }
  }
  return null;
}

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
  const { rpc } = resolveEndpoints(args.network, { rpc: args.rpc });
  try {
    const vkeys = await getOnChainVkeys(rpc, args.contract);
    const match = findMatchingCircuit(
      vkeys.processVkey,
      vkeys.tallyVkey,
      vkeys.deactivateVkey,
      vkeys.addNewKeyVkey
    );

    if (!match) {
      printVkeyCheckResult({
        power: 'UNKNOWN',
        source: 'not found in registry',
        production: false,
        processMatch: null,
        tallyMatch: null,
        deactivateMatch: null,
        addNewKeyMatch: null,
      });
      process.exit(1);
    }

    printVkeyCheckResult({
      power: match.power,
      source: match.entry.source,
      production: match.entry.production,
      processMatch: match.processMatch,
      tallyMatch: match.tallyMatch,
      deactivateMatch: match.deactivateMatch,
      addNewKeyMatch: match.addNewKeyMatch,
    });

    if (!match.processMatch || !match.tallyMatch) {
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
