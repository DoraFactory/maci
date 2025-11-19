// import { expect } from 'chai';
// import { SimulateCosmWasmClient } from '@oraichain/cw-simulate';
// import {
//   createTestEnvironment,
//   ContractLoader,
//   DeployManager,
//   RegistryContractClient,
//   assertExecuteSuccess,
//   log
// } from '../src';

// /**
//  * Registry End-to-End Test
//  *
//  * This test demonstrates the Registry contract managing multiple voting rounds:
//  * 1. Deploy Registry contract
//  * 2. Create multiple rounds
//  * 3. Query rounds
//  * 4. Test round lifecycle management
//  */

// describe('Registry End-to-End Test', function () {
//   this.timeout(300000); // 5 minutes

//   let client: SimulateCosmWasmClient;
//   let registryContract: RegistryContractClient;

//   const adminAddress = 'dora1admin000000000000000000000000000000';
//   const operatorAddress = 'dora1operator000000000000000000000000';

//   before(async () => {
//     log('=== Setting up Registry test environment ===');

//     // Create test environment
//     const env = await createTestEnvironment({
//       chainId: 'registry-test',
//       bech32Prefix: 'dora'
//     });

//     client = env.client;
//     log('Test environment created');

//     // Deploy Registry contract
//     const contractLoader = new ContractLoader();
//     const deployManager = new DeployManager(client, contractLoader);

//     log('Deploying Registry contract...');

//     // First, upload AMACI contract to get code_id
//     const amaciCodeId = await deployManager.uploadContract(adminAddress, 'amaci');
//     log(`AMACI contract uploaded with code_id: ${amaciCodeId}`);

//     const instantiateMsg = {
//       admin: adminAddress,
//       operator: operatorAddress,
//       amaci_code_id: amaciCodeId
//     };

//     const contractInfo = await deployManager.deployRegistryContract(adminAddress, instantiateMsg);

//     registryContract = new RegistryContractClient(
//       client,
//       contractInfo.contractAddress,
//       operatorAddress
//     );

//     log(`Registry contract deployed at: ${contractInfo.contractAddress}`);
//   });

//   it('should create and manage multiple rounds', async () => {
//     log('\n=== Step 1: Create Round 1 (AMACI QV) ===\n');

//     registryContract.setSender(adminAddress);

//     const round1Info = {
//       title: 'AMACI QV Round 1',
//       description: 'Quadratic voting with anonymous key changes',
//       link: 'https://round1.example.com',
//       voting_start: Math.floor(Date.now() / 1000).toString(),
//       voting_end: (Math.floor(Date.now() / 1000) + 86400).toString(),
//       contract_type: 'amaci',
//       voting_mode: 'qv'
//     };

//     await assertExecuteSuccess(
//       () => registryContract.createRound('round-1', round1Info),
//       'Create round 1 failed'
//     );

//     log('Round 1 created successfully');

//     log('\n=== Step 2: Create Round 2 (MACI 1P1V) ===\n');

//     const round2Info = {
//       title: 'MACI 1P1V Round 2',
//       description: 'One person one vote',
//       link: 'https://round2.example.com',
//       voting_start: Math.floor(Date.now() / 1000).toString(),
//       voting_end: (Math.floor(Date.now() / 1000) + 172800).toString(),
//       contract_type: 'api_maci',
//       voting_mode: '1p1v'
//     };

//     await assertExecuteSuccess(
//       () => registryContract.createRound('round-2', round2Info),
//       'Create round 2 failed'
//     );

//     log('Round 2 created successfully');

//     log('\n=== Step 3: Create Round 3 (AMACI QV) ===\n');

//     const round3Info = {
//       title: 'AMACI QV Round 3',
//       description: 'Another quadratic voting round',
//       link: 'https://round3.example.com',
//       voting_start: (Math.floor(Date.now() / 1000) + 86400).toString(),
//       voting_end: (Math.floor(Date.now() / 1000) + 259200).toString(),
//       contract_type: 'amaci',
//       voting_mode: 'qv'
//     };

//     await assertExecuteSuccess(
//       () => registryContract.createRound('round-3', round3Info),
//       'Create round 3 failed'
//     );

//     log('Round 3 created successfully');

//     log('\n=== Step 4: Query Individual Rounds ===\n');

//     // Query round 1
//     const round1 = await registryContract.getRound('round-1');
//     log('Round 1 details:');
//     log(JSON.stringify(round1, null, 2));

//     expect(round1).to.have.property('title');
//     expect(round1.title).to.equal('AMACI QV Round 1');

//     // Query round 2
//     const round2 = await registryContract.getRound('round-2');
//     log('Round 2 details:');
//     log(JSON.stringify(round2, null, 2));

//     expect(round2).to.have.property('title');
//     expect(round2.title).to.equal('MACI 1P1V Round 2');

//     // Query round 3
//     const round3 = await registryContract.getRound('round-3');
//     log('Round 3 details:');
//     log(JSON.stringify(round3, null, 2));

//     expect(round3).to.have.property('title');
//     expect(round3.title).to.equal('AMACI QV Round 3');

//     log('\n=== Step 5: List All Rounds ===\n');

//     const allRounds = await registryContract.listRounds(10);
//     log('All rounds:');
//     log(JSON.stringify(allRounds, null, 2));

//     expect(allRounds).to.be.an('array');
//     expect(allRounds.length).to.be.at.least(3);

//     log('\n=== Step 6: List Rounds with Pagination ===\n');

//     // Get first 2 rounds
//     const firstPage = await registryContract.listRounds(2);
//     log('First page (limit 2):');
//     log(JSON.stringify(firstPage, null, 2));

//     expect(firstPage.length).to.be.at.most(2);

//     // Get next rounds
//     if (firstPage.length === 2) {
//       const lastRoundId = firstPage[firstPage.length - 1].round_id;
//       const secondPage = await registryContract.listRounds(2, lastRoundId);
//       log('Second page (after first 2):');
//       log(JSON.stringify(secondPage, null, 2));

//       expect(secondPage).to.be.an('array');
//     }

//     log('\n=== Test Completed Successfully ===\n');
//     log('Registry end-to-end test passed!');
//   });

//   it('should handle round queries correctly', async () => {
//     log('\n=== Testing Round Query Edge Cases ===\n');

//     // Query non-existent round
//     try {
//       await registryContract.getRound('non-existent-round');
//       throw new Error('Should have thrown error for non-existent round');
//     } catch (error: any) {
//       log('Correctly failed to query non-existent round');
//       expect(error).to.not.be.undefined;
//     }

//     // List with zero limit
//     try {
//       const rounds = await registryContract.listRounds(0);
//       log('Empty list query result:');
//       log(JSON.stringify(rounds, null, 2));
//     } catch (error) {
//       log('Zero limit query handled');
//     }
//   });

//   it('should support filtering rounds by type', async () => {
//     log('\n=== Testing Round Filtering ===\n');

//     const allRounds = await registryContract.listRounds(10);

//     // Filter AMACI rounds
//     const amaciRounds = allRounds.filter((r: any) => r.contract_type === 'amaci');
//     log(`Found ${amaciRounds.length} AMACI rounds`);
//     expect(amaciRounds.length).to.be.at.least(2); // round-1 and round-3

//     // Filter API-MACI rounds
//     const apiMaciRounds = allRounds.filter((r: any) => r.contract_type === 'api_maci');
//     log(`Found ${apiMaciRounds.length} API-MACI rounds`);
//     expect(apiMaciRounds.length).to.be.at.least(1); // round-2

//     // Filter QV rounds
//     const qvRounds = allRounds.filter((r: any) => r.voting_mode === 'qv');
//     log(`Found ${qvRounds.length} QV rounds`);
//     expect(qvRounds.length).to.be.at.least(2);

//     // Filter 1P1V rounds
//     const onePOneVRounds = allRounds.filter((r: any) => r.voting_mode === '1p1v');
//     log(`Found ${onePOneVRounds.length} 1P1V rounds`);
//     expect(onePOneVRounds.length).to.be.at.least(1);
//   });
// });
