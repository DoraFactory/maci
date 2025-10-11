/**
 * MaciApiClient Integration Example
 *
 * Demonstrates how to integrate MaciApiClient in MaciClient and VoterClient
 */

import { MaciApiClient } from '../src/libs/api';

// ============================================================
// Example 1: Integration in MaciClient
// ============================================================

interface MaciClientWithApiConfig {
  // Original MaciClient configuration
  rpcUrl: string;
  chainId: string;
  // New API configuration
  apiBaseUrl?: string;
  apiKey?: string;
}

class MaciClientWithApi {
  public apiClient?: MaciApiClient;

  constructor(config: MaciClientWithApiConfig) {
    // Initialize API client if API configuration is provided
    if (config.apiBaseUrl) {
      this.apiClient = new MaciApiClient({
        baseUrl: config.apiBaseUrl,
        apiKey: config.apiKey
      });
    }
  }

  /**
   * Create AMaci Round (using API)
   */
  async createAmaciRoundViaApi(params: {
    title: string;
    operator: string;
    maxVoter: number;
    voteOptionMap: string[];
    voiceCreditAmount: number;
    startVoting: string;
    endVoting: string;
    allowlistId?: string;
  }) {
    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }

    return this.apiClient.createAmaciRound(params);
  }

  /**
   * User registration (using API)
   */
  async signupViaApi(params: {
    pubkey: string;
    contractAddress: string;
    certificate: string;
    amount?: string;
  }) {
    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }

    return this.apiClient.signup(params);
  }

  /**
   * Vote (using API)
   */
  async voteViaApi(params: {
    contractAddress: string;
    payload: Array<{
      msg: string[];
      encPubkeys: string[];
    }>;
  }) {
    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }

    return this.apiClient.vote(params);
  }
}

// ============================================================
// Example 2: Integration in VoterClient
// ============================================================

interface VoterClientWithApiConfig {
  // Original VoterClient configuration
  mnemonic?: string;
  privateKey?: string;
  // New API configuration
  apiBaseUrl?: string;
  apiKey?: string;
}

class VoterClientWithApi {
  public apiClient?: MaciApiClient;
  private voterPubkey?: string;

  constructor(config: VoterClientWithApiConfig) {
    // Initialize API client if API configuration is provided
    if (config.apiBaseUrl) {
      this.apiClient = new MaciApiClient({
        baseUrl: config.apiBaseUrl,
        apiKey: config.apiKey
      });
    }
  }

  /**
   * Set voter public key
   */
  setVoterPubkey(pubkey: string) {
    this.voterPubkey = pubkey;
  }

  /**
   * Register for voting
   */
  async signup(contractAddress: string, certificate: string, amount = '1') {
    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }

    if (!this.voterPubkey) {
      throw new Error('Voter pubkey not set');
    }

    return this.apiClient.signup({
      pubkey: this.voterPubkey,
      contractAddress,
      certificate,
      amount
    });
  }

  /**
   * Submit vote
   */
  async vote(
    contractAddress: string,
    messages: Array<{
      msg: string[];
      encPubkeys: string[];
    }>
  ) {
    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }

    return this.apiClient.vote({
      contractAddress,
      payload: messages
    });
  }

  /**
   * Request certificate
   */
  async requestCertificate(contractAddress: string, signature: string) {
    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }

    if (!this.voterPubkey) {
      throw new Error('Voter pubkey not set');
    }

    return this.apiClient.requestCertificate({
      pubkey: this.voterPubkey,
      contractAddress,
      signature
    });
  }
}

// ============================================================
// Example 3: Using integrated clients
// ============================================================

async function example() {
  // Create MaciClient instance (with API)
  const maciClient = new MaciClientWithApi({
    rpcUrl: 'https://rpc.example.com',
    chainId: 'dora-1',
    apiBaseUrl: 'https://api.example.com',
    apiKey: 'your-api-key'
  });

  // Create Round
  const round = await maciClient.createAmaciRoundViaApi({
    title: 'Community Vote',
    operator: 'dora1...',
    maxVoter: 1000,
    voteOptionMap: ['Option A', 'Option B', 'Option C'],
    voiceCreditAmount: 10,
    startVoting: new Date().toISOString(),
    endVoting: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });

  console.log('Round created:', round);

  // Create VoterClient instance (with API)
  const voterClient = new VoterClientWithApi({
    mnemonic: 'your mnemonic words...',
    apiBaseUrl: 'https://api.example.com',
    apiKey: 'your-api-key'
  });

  // Set voter public key
  voterClient.setVoterPubkey('0x1234...');

  // Request certificate
  const certificate = await voterClient.requestCertificate(
    round.contractAddress!,
    'signature-data'
  );

  console.log('Certificate:', certificate);

  // Register
  const signupResult = await voterClient.signup(round.contractAddress!, certificate.certificate);

  console.log('Signup result:', signupResult);

  // Vote
  const voteResult = await voterClient.vote(round.contractAddress!, [
    {
      msg: ['1', '2', '3', '4', '5', '6', '7'],
      encPubkeys: ['pubkey1', 'pubkey2']
    }
  ]);

  console.log('Vote result:', voteResult);
}

// ============================================================
// Example 4: Allowlist management
// ============================================================

async function allowlistExample() {
  const apiClient = new MaciApiClient({
    baseUrl: 'https://api.example.com',
    apiKey: 'your-api-key'
  });

  // Create allowlist
  const allowlist = await apiClient.createAllowlist({
    name: 'VIP Members',
    description: 'Whitelist for VIP members',
    pubkeys: ['0x1111...', '0x2222...', '0x3333...']
  });

  console.log('Created allowlist:', allowlist);

  // Get allowlist details
  const detail = await apiClient.getAllowlistDetail({ id: allowlist.id });
  console.log('Allowlist detail:', detail);

  // Update allowlist
  const updated = await apiClient.updateAllowlist(
    { id: allowlist.id },
    {
      pubkeysToAdd: ['0x4444...', '0x5555...'],
      pubkeysToRemove: ['0x1111...']
    }
  );

  console.log('Updated allowlist:', updated);

  // Create Round using this allowlist
  const round = await apiClient.createAmaciRound({
    title: 'VIP Vote',
    operator: 'dora1...',
    maxVoter: 100,
    voteOptionMap: ['Option 1', 'Option 2'],
    voiceCreditAmount: 10,
    startVoting: new Date().toISOString(),
    endVoting: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    allowlistId: allowlist.id // Use allowlist
  });

  console.log('Round with allowlist:', round);

  // Get Round's allowlist snapshot
  const snapshot = await apiClient.getRoundAllowlistSnapshot({
    contractAddress: round.contractAddress!
  });

  console.log('Allowlist snapshot:', snapshot);
}

// ============================================================
// Export examples
// ============================================================

export { MaciClientWithApi, VoterClientWithApi, example, allowlistExample };
