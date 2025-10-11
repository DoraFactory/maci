/**
 * MaciApiClient Usage Example
 *
 * This script demonstrates how to use MaciApiClient to call MACI API
 */

import { MaciApiClient } from '../src/libs/api';

async function main() {
  // 1. Create API client instance
  const apiClient = new MaciApiClient({
    baseUrl: 'https://api.example.com', // Replace with actual API URL
    apiKey: 'your-api-key-here', // Replace with actual API Key
    timeout: 30000 // Optional: request timeout in milliseconds
  });

  console.log('=== MaciApiClient Usage Example ===\n');

  try {
    // 2. Health check
    console.log('1. Health check...');
    const health = await apiClient.health();
    console.log('Health status:', health);
    console.log();

    // 3. Get usage
    console.log('2. Get usage...');
    const usage = await apiClient.getUsage({
      page: 1,
      pageSize: 10
    });
    console.log('Usage:', usage);
    console.log();

    // 4. Create AMaci Round
    console.log('3. Create AMaci Round...');
    const roundResult = await apiClient.createAmaciRound({
      title: 'Test Round',
      description: 'This is a test round',
      link: 'https://example.com',
      startVoting: new Date().toISOString(),
      endVoting: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      operator: 'dora1...',
      maxVoter: 100,
      voteOptionMap: ['Option 1', 'Option 2', 'Option 3'],
      voiceCreditAmount: 10,
      allowlistId: 'allowlist-id'
    });
    console.log('Round creation result:', roundResult);
    console.log();

    // 5. User registration (Signup)
    console.log('4. User registration...');
    const signupResult = await apiClient.signup({
      pubkey: '0x1234...', // MACI public key
      contractAddress: 'contract-address',
      certificate: 'certificate-data',
      amount: '1'
    });
    console.log('Registration result:', signupResult);
    console.log();

    // 6. Vote
    console.log('5. Vote...');
    const voteResult = await apiClient.vote({
      contractAddress: 'contract-address',
      payload: [
        {
          msg: ['1', '2', '3', '4', '5', '6', '7'], // 7 elements
          encPubkeys: ['pubkey1', 'pubkey2'] // 2 elements
        }
      ]
    });
    console.log('Vote result:', voteResult);
    console.log();

    // 7. Get allowlist list
    console.log('6. Get allowlist list...');
    const allowlists = await apiClient.getAllowlists({
      page: 1,
      limit: 10,
      activeOnly: true
    });
    console.log('Allowlist list:', allowlists);
    console.log();

    // 8. Create allowlist
    console.log('7. Create allowlist...');
    const newAllowlist = await apiClient.createAllowlist({
      name: 'Test Allowlist',
      description: 'This is a test allowlist',
      pubkeys: ['0x1234...', '0x5678...']
    });
    console.log('New allowlist:', newAllowlist);
    console.log();

    // 9. Get allowlist details
    console.log('8. Get allowlist details...');
    const allowlistDetail = await apiClient.getAllowlistDetail({
      id: newAllowlist.id
    });
    console.log('Allowlist details:', allowlistDetail);
    console.log();

    // 10. Update allowlist
    console.log('9. Update allowlist...');
    const updatedAllowlist = await apiClient.updateAllowlist(
      { id: newAllowlist.id },
      {
        name: 'Updated Allowlist',
        pubkeysToAdd: ['0x9abc...'],
        isActive: true
      }
    );
    console.log('Updated allowlist:', updatedAllowlist);
    console.log();

    // 11. Get Round allowlist snapshot
    console.log('10. Get Round allowlist snapshot...');
    const snapshot = await apiClient.getRoundAllowlistSnapshot({
      contractAddress: 'contract-address'
    });
    console.log('Allowlist snapshot:', snapshot);
    console.log();

    // 12. Request certificate
    console.log('11. Request certificate...');
    const certificate = await apiClient.requestCertificate({
      pubkey: '0x1234...',
      contractAddress: 'contract-address',
      signature: 'signature-data'
    });
    console.log('Certificate:', certificate);
    console.log();

    // 13. Get Pre-deactivate data
    console.log('12. Get Pre-deactivate data...');
    const preDeactivate = await apiClient.getPreDeactivate({
      contractAddress: 'contract-address'
    });
    console.log('Pre-deactivate data:', preDeactivate);
    console.log();

    // 14. Dynamically update configuration
    console.log('13. Dynamically update API Key and Base URL...');
    apiClient.setApiKey('new-api-key');
    apiClient.setBaseUrl('https://new-api.example.com');
    console.log('Configuration updated');
    console.log();
  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.statusCode) {
      console.error('Status code:', error.statusCode);
    }
  }

  console.log('=== Example completed ===');
}

// Run example
main().catch(console.error);
