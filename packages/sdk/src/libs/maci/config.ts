// Fee denomination used for all MACI contract fees
export const FEE_DENOM = 'peaka';

// Default/fallback fee values. These are used when the round contract cannot be fetched.
// Actual values in production are stored in each round contract's config.

// ── Default Fees ────────────────────────────────────────────────────────────
// CreateRound base fee: 30 DORA
export const DEFAULT_BASE_FEE = '30000000000000000000';
// Per-message fee for PublishMessage: 0.06 DORA = 6 * 10^16 peaka
export const DEFAULT_MESSAGE_FEE = '60000000000000000';
// Per-message fee for PublishDeactivateMessage: 10 DORA = 10 * 10^18 peaka
export const DEFAULT_DEACTIVATE_FEE = '10000000000000000000';
// Registration fee (signup / addNewKey / preAddNewKey): 0.03 DORA = 3 * 10^16 peaka
export const DEFAULT_SIGNUP_FEE = '30000000000000000';

// ── Default Delays (seconds) ─────────────────────────────────────────────────
// Tally base delay: covers first 5^4=625-slot tally batch
export const DEFAULT_BASE_DELAY = 200;
// Per-message increment to tally window
export const DEFAULT_MESSAGE_DELAY = 2;
// Per-registered-user increment to tally window
export const DEFAULT_SIGNUP_DELAY = 1;
// Operator window to process deactivate messages
export const DEFAULT_DEACTIVATE_DELAY = 600;

// Legacy aliases kept for backward compatibility
export const DEACTIVATE_FEE = DEFAULT_DEACTIVATE_FEE;
export const MESSAGE_FEE = DEFAULT_MESSAGE_FEE;

/** Runtime fee config, overridden by fetchFeeConfig({ contractAddress }) when querying a live round contract. */
export interface FeeConfig {
  baseFee: string;
  messageFee: string;
  deactivateFee: string;
  signupFee: string;
}

export const DEFAULT_FEE_CONFIG: FeeConfig = {
  baseFee: DEFAULT_BASE_FEE,
  messageFee: DEFAULT_MESSAGE_FEE,
  deactivateFee: DEFAULT_DEACTIVATE_FEE,
  signupFee: DEFAULT_SIGNUP_FEE,
};

/** Runtime delay config (seconds), overridden by fetchDelayConfig({ contractAddress }) when querying a live round contract. */
export interface DelayConfig {
  baseDelay: number;
  messageDelay: number;
  signupDelay: number;
  deactivateDelay: number;
}

export const DEFAULT_DELAY_CONFIG: DelayConfig = {
  baseDelay: DEFAULT_BASE_DELAY,
  messageDelay: DEFAULT_MESSAGE_DELAY,
  signupDelay: DEFAULT_SIGNUP_DELAY,
  deactivateDelay: DEFAULT_DEACTIVATE_DELAY,
};
