import type { CommandModule, Argv, ArgumentsCamelCase } from 'yargs';
import {
  createStep,
  printRoundSummary,
  printVerificationReport,
  printError,
} from '../core/report.js';
import { NETWORK_CHOICES, type NetworkName } from '../core/network.js';
import { runRoundVerification, type PipelineEvent } from '../core/pipeline.js';

// ─── Main handler ─────────────────────────────────────────────────────────────

async function handleRound(
  args: ArgumentsCamelCase<{
    contract: string;
    network: NetworkName;
    rpc?: string;
    indexer?: string;
    recheck: boolean;
  }>
) {
  const { contract, network, recheck } = args;

  // Print header before fetching starts
  const shortAddr = `${contract.slice(0, 16)}…${contract.slice(-6)}`;
  console.log('');
  console.log(`Verifying ${shortAddr}  [${network}]${recheck ? '  --recheck (Layer 2)' : ''}`);
  console.log('');

  const totalSteps = recheck ? 9 : 5;
  const step = createStep(totalSteps);

  // Map pipeline events onto the terminal renderer
  const onEvent = (event: PipelineEvent) => {
    switch (event.type) {
      case 'step:start':
        step.start(event.label);
        break;
      case 'step:update':
        step.update?.(event.detail);
        break;
      case 'step:done':
        step.done(event.detail);
        break;
      case 'step:fail':
        step.fail(event.detail);
        break;
      case 'summary':
        printRoundSummary(event.summary);
        break;
      case 'report':
        printVerificationReport(event.report);
        break;
    }
  };

  const result = await runRoundVerification(
    { contract, network, rpc: args.rpc, indexer: args.indexer, recheck },
    onEvent
  );

  if (result.status === 'error') {
    printError(result.message);
    process.exit(1);
  }

  process.exit(result.overallPassed ? 0 : 1);
}

// ─── CommandModule ───────────────────────────────────────────────────────────

export const roundCommand: CommandModule = {
  command: 'round <contract>',
  describe: 'Verify all proofs and commitments for an aMACI round',
  builder: (yargs: Argv) =>
    yargs
      .positional('contract', {
        type: 'string',
        description: 'Contract address of the aMACI round to verify',
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
        description:
          'CosmWasm RPC endpoint (overrides network default)',
      })
      .option('indexer', {
        type: 'string',
        description:
          'world-maci-indexer GraphQL endpoint (overrides network default)',
      })
      .option('recheck', {
        type: 'boolean',
        description:
          'Layer 2: re-verify ZK proofs locally using snarkjs',
        default: false,
      }),
  handler: (args) =>
    handleRound(
      args as ArgumentsCamelCase<{
        contract: string;
        network: NetworkName;
        rpc?: string;
        indexer?: string;
        recheck: boolean;
      }>
    ),
};
