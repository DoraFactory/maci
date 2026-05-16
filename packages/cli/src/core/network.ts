/**
 * Network configuration for aMACI CLI.
 *
 * This CLI intentionally does NOT depend on @dorafactory/maci-sdk:
 *   - vkey data is sourced directly from the aMACI contract (circuit_params.rs),
 *     not from SDK's CIRCUIT_INFO (which targets a different circuit version).
 *   - The CLI is a read-only public verifier; it needs none of the SDK's
 *     signing, keypair, or voter/operator functionality.
 *
 * MAINTENANCE NOTE: When RPC or indexer endpoints change, update both here
 * and in maci/packages/sdk/src/libs/const.ts (getDefaultParams).
 */

export type NetworkName = 'mainnet' | 'testnet';

export type NetworkEndpoints = {
  rpc: string;
  indexer: string;
};

export const NETWORK_DEFAULTS: Record<NetworkName, NetworkEndpoints> = {
  mainnet: {
    rpc: 'https://vota-rpc.dorafactory.org',
    indexer: 'https://maci-graphql.dorafactory.org',
  },
  testnet: {
    rpc: 'https://vota-testnet-rpc.dorafactory.org',
    indexer: 'https://maci-testnet-graphql.dorafactory.org',
  },
};

/**
 * Resolve final RPC and indexer endpoints.
 * Explicit overrides take priority; network defaults are used as fallback.
 */
export function resolveEndpoints(
  network: NetworkName,
  overrides: { rpc?: string; indexer?: string }
): NetworkEndpoints {
  const defaults = NETWORK_DEFAULTS[network];
  return {
    rpc: overrides.rpc ?? defaults.rpc,
    indexer: overrides.indexer ?? defaults.indexer,
  };
}

export const NETWORK_CHOICES = ['mainnet', 'testnet'] as const;
