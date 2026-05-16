import chalk from 'chalk';

// ─── Step progress ───────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY;

// Braille spinner frames — smooth 10-frame rotation
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;

/**
 * Creates a step progress tracker with a spinner animation on TTY.
 * On non-TTY (pipes, CI), prints plain sequential lines without animation.
 *
 * Usage:
 *   const step = createStep(total);
 *   step.start('Fetching round info');
 *   const data = await fetchRoundInfo();
 *   step.done('aMACI · 9-4-3-125');
 */
export function createStep(total: number) {
  let current = 0;
  let spinnerTimer: ReturnType<typeof setInterval> | null = null;
  let frameIndex = 0;
  let currentLabel = '';

  function prefix(n: number) {
    return chalk.dim(`[${n}/${total}]`);
  }

  function stopSpinner() {
    if (spinnerTimer !== null) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }
  }

  function startSpinner(label: string) {
    frameIndex = 0;
    spinnerTimer = setInterval(() => {
      const frame = chalk.cyan(SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length]);
      process.stdout.write(`\r  ${frame} ${prefix(current)} ${label}\x1b[K`);
      frameIndex++;
    }, SPINNER_INTERVAL_MS);
  }

  return {
    start(label: string) {
      current += 1;
      currentLabel = label;
      if (isTTY) {
        // Print first frame immediately so there's no blank gap
        const frame = chalk.cyan(SPINNER_FRAMES[0]);
        process.stdout.write(`  ${frame} ${prefix(current)} ${label}\x1b[K`);
        startSpinner(label);
      } else {
        process.stdout.write(`  → ${prefix(current)} ${label}\n`);
      }
    },
    /** Update the spinner label in-place (e.g. for download progress). TTY only. */
    update(detail: string) {
      if (!isTTY) return;
      stopSpinner();
      const label = `${currentLabel}  ${chalk.dim(detail)}`;
      startSpinner(label);
    },
    done(detail?: string) {
      stopSpinner();
      const suffix = detail ? chalk.dim(`  ${detail}`) : '';
      if (isTTY) {
        process.stdout.write(
          `\r  ${chalk.green('✓')} ${prefix(current)}${suffix}\x1b[K\n`
        );
      } else {
        process.stdout.write(`  ${chalk.green('✓')}${suffix}\n`);
      }
    },
    fail(detail?: string) {
      stopSpinner();
      const suffix = detail ? `  ${detail}` : '';
      if (isTTY) {
        process.stdout.write(
          `\r  ${chalk.red('✗')} ${prefix(current)}${chalk.dim(suffix)}\x1b[K\n`
        );
      } else {
        process.stdout.write(`  ${chalk.red('✗')}${chalk.dim(suffix)}\n`);
      }
    },
  };
}

export type CheckResult = {
  label: string;
  passed: boolean;
  detail?: string;
};

export type VerificationReport = {
  contractAddress: string;
  circuitPower: string;
  maciType: string;
  status: string;
  checks: CheckResult[];
  overallPassed: boolean;
};

const PASS = chalk.green('PASS');
const FAIL = chalk.red('FAIL');
const MATCH = chalk.green('MATCH');
const MISMATCH = chalk.red('MISMATCH');
const UNKNOWN = chalk.yellow('UNKNOWN');

export function printDivider() {
  console.log(chalk.dim('─'.repeat(56)));
}

export function printHeader(title: string) {
  console.log('');
  console.log(chalk.bold(title));
  printDivider();
}

export function printCheckResult(result: CheckResult) {
  const status = result.passed ? PASS : FAIL;
  const label = result.label.padEnd(40);
  console.log(`  ${label} ${status}`);
  if (result.detail) {
    console.log(`    ${chalk.dim(result.detail)}`);
  }
}

export type RoundSummary = {
  contractAddress: string;
  network: string;
  circuitPower: string;
  circuitName: string;
  status: string;
  operatorAddress: string;
  votingStart: string;
  votingEnd: string;
  signUpsOnChain: string;
  signUpsIndexed: string;
  messagesOnChain: string;
  messagesIndexed: string;
};

export function printRoundSummary(s: RoundSummary) {
  printHeader('Round Summary');
  console.log(`  Contract:    ${chalk.cyan(s.contractAddress)}`);
  console.log(`  Network:     ${chalk.cyan(s.network)}`);
  console.log(`  Circuit:     ${chalk.cyan(s.circuitPower)}  ${chalk.dim('(' + s.circuitName + ')')}`);
  console.log(`  Status:      ${chalk.cyan(s.status)}`);
  console.log(`  Operator:    ${chalk.dim(s.operatorAddress)}`);
  console.log(`  Voting:      ${chalk.dim(s.votingStart)}  →  ${chalk.dim(s.votingEnd)}`);
  console.log('');
  console.log(`  Sign-ups:    on-chain ${chalk.cyan(s.signUpsOnChain)}  /  indexed ${chalk.cyan(s.signUpsIndexed)}`);
  console.log(`  Messages:    on-chain ${chalk.cyan(s.messagesOnChain)}  /  indexed ${chalk.cyan(s.messagesIndexed)}`);
}

export function printVerificationReport(report: VerificationReport) {
  printHeader('Verification Checks');

  for (const check of report.checks) {
    printCheckResult(check);
  }

  printDivider();

  if (report.overallPassed) {
    console.log(chalk.bold.green('  Result: VERIFIED ✓'));
  } else {
    console.log(chalk.bold.red('  Result: FAILED ✗'));
  }
  console.log('');
}

export type VkeyCheckOpts = {
  power: string;
  source: string;
  production: boolean;
  processMatch: boolean | null;
  tallyMatch: boolean | null;
  /** null = not in registry (legacy circuit or unknown) */
  deactivateMatch: boolean | null;
  /** null = not in registry (legacy circuit or unknown) */
  addNewKeyMatch: boolean | null;
};

export function printVkeyCheckResult(opts: VkeyCheckOpts) {
  const { power, source, production, processMatch, tallyMatch, deactivateMatch, addNewKeyMatch } = opts;

  printHeader(`aMACI Registry Check: ${power}`);

  const matchStr = (v: boolean | null) =>
    v === null ? chalk.dim('N/A (not in registry)') : v ? MATCH : MISMATCH;

  const productionBadge = production
    ? chalk.green('[production]')
    : chalk.yellow('[test/legacy]');

  console.log(`  Circuit power:     ${chalk.cyan(power)} ${productionBadge}`);
  console.log(`  Source:            ${chalk.dim(source)}`);
  console.log(`  Process vkey:      ${matchStr(processMatch)}`);
  console.log(`  Tally vkey:        ${matchStr(tallyMatch)}`);
  console.log(`  Deactivate vkey:   ${matchStr(deactivateMatch)}`);
  console.log(`  AddNewKey vkey:    ${matchStr(addNewKeyMatch)}`);

  if (processMatch === null && tallyMatch === null) {
    console.log('');
    console.log(
      chalk.yellow(
        '  Warning: No matching circuit found in aMACI registry.\n' +
          '  This contract may use an unregistered or custom circuit.'
      )
    );
  }
  console.log('');
}

export type CircuitListItem = {
  label: string;
  production: boolean;
  source: string;
  params: {
    stateTreeDepth: number;
    intStateTreeDepth: number;
    voteOptionTreeDepth: number;
    messageBatchSize: number;
  };
};

export function printRegistryList(circuits: CircuitListItem[]) {
  printHeader('Known aMACI Circuits');
  for (const c of circuits) {
    const badge = c.production ? chalk.green('[production]') : chalk.yellow('[test-only]');
    console.log(`  ${chalk.cyan(c.label.padEnd(14))} ${badge}`);
    console.log(
      `    ${chalk.dim(
        `stateDepth=${c.params.stateTreeDepth} ` +
          `intDepth=${c.params.intStateTreeDepth} ` +
          `voteDepth=${c.params.voteOptionTreeDepth} ` +
          `batch=${c.params.messageBatchSize}`
      )}`
    );
    console.log(`    ${chalk.dim('source: ' + c.source)}`);
  }
  console.log('');
}

type AmaciVkeySet = { vk_delta_2: string; vk_ic0: string; vk_ic1: string };

export function printCircuitDetail(entry: {
  label: string;
  production: boolean;
  source: string;
  zkeyUrl: string;
  zkeyTarSha256: string;
  params: {
    stateTreeDepth: number;
    intStateTreeDepth: number;
    voteOptionTreeDepth: number;
    messageBatchSize: number;
  };
  vkeys: {
    process: AmaciVkeySet;
    tally: AmaciVkeySet;
    deactivate: AmaciVkeySet;
    addNewKey: AmaciVkeySet;
  };
}) {
  const badge = entry.production ? chalk.green('[production]') : chalk.yellow('[test-only]');
  printHeader(`Circuit Detail: ${entry.label}`);
  console.log(`  Status:                 ${badge}`);
  console.log(`  Source:                 ${chalk.dim(entry.source)}`);
  console.log(`  Zkey URL:               ${chalk.cyan(entry.zkeyUrl)}`);
  console.log(`  Zkey SHA-256:           ${chalk.cyan(entry.zkeyTarSha256)}`);
  console.log(`  state_tree_depth:       ${chalk.cyan(entry.params.stateTreeDepth)}`);
  console.log(`  int_state_tree_depth:   ${chalk.cyan(entry.params.intStateTreeDepth)}`);
  console.log(`  vote_option_tree_depth: ${chalk.cyan(entry.params.voteOptionTreeDepth)}`);
  console.log(`  message_batch_size:     ${chalk.cyan(entry.params.messageBatchSize)}`);

  function printVkey(label: string, vk: AmaciVkeySet) {
    console.log(`\n  ${label}:`);
    for (const [k, val] of Object.entries(vk)) {
      console.log(`    ${k}: ${chalk.dim(val.slice(0, 24) + '...')}`);
    }
  }

  printVkey('Process vkey (Groth16)', entry.vkeys.process);
  printVkey('Tally vkey (Groth16)', entry.vkeys.tally);
  printVkey('Deactivate vkey (Groth16)', entry.vkeys.deactivate);
  printVkey('AddNewKey vkey (Groth16)', entry.vkeys.addNewKey);
  console.log('');
}

export function printError(message: string) {
  console.error(chalk.red(`Error: ${message}`));
}
