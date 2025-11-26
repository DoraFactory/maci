import { Secp256k1HdWallet } from '@cosmjs/launchpad';
import { OfflineSigner } from '@cosmjs/proto-signing';
import { GasPrice, SigningStargateClient, SigningStargateClientOptions } from '@cosmjs/stargate';
import { CosmWasmClient, SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { MaciClient } from './ts/Maci.client';
import { AMaciClient, AMaciQueryClient } from './ts/AMaci.client';
import { RegistryClient } from './ts/Registry.client';
import { OracleMaciClient } from './ts/OracleMaci.client';
import { SaasClient } from './ts/Saas.client';
import { ApiMaciClient } from './ts/ApiMaci.client';
import { ApiSaasClient } from './ts/ApiSaas.client';

const defaultSigningClientOptions: SigningStargateClientOptions = {
  broadcastPollIntervalMs: 8_000,
  broadcastTimeoutMs: 150_000, // 2min30s for the tx to be confirmed
  gasPrice: GasPrice.fromString('10000000000peaka')
};

export async function createMaciClientBy({
  rpcEndpoint,
  wallet,
  contractAddress
}: {
  rpcEndpoint: string;
  wallet: OfflineSigner;
  contractAddress: string;
}) {
  const signingCosmWasmClient = await createContractClientByWallet(rpcEndpoint, wallet);
  const [{ address }] = await wallet.getAccounts();
  return new MaciClient(signingCosmWasmClient, address, contractAddress);
}

export async function createAMaciClientBy({
  rpcEndpoint,
  wallet,
  contractAddress
}: {
  rpcEndpoint: string;
  wallet: OfflineSigner;
  contractAddress: string;
}) {
  const signingCosmWasmClient = await createContractClientByWallet(rpcEndpoint, wallet);
  const [{ address }] = await wallet.getAccounts();
  return new AMaciClient(signingCosmWasmClient, address, contractAddress);
}

export async function createAMaciQueryClientBy({
  rpcEndpoint,
  contractAddress
}: {
  rpcEndpoint: string;
  contractAddress: string;
}) {
  const cosmWasmClient = await CosmWasmClient.connect(rpcEndpoint);
  return new AMaciQueryClient(cosmWasmClient, contractAddress);
}

export async function createApiMaciClientBy({
  rpcEndpoint,
  wallet,
  contractAddress
}: {
  rpcEndpoint: string;
  wallet: OfflineSigner;
  contractAddress: string;
}) {
  const signingCosmWasmClient = await createContractClientByWallet(rpcEndpoint, wallet);
  const [{ address }] = await wallet.getAccounts();
  return new ApiMaciClient(signingCosmWasmClient, address, contractAddress);
}

export async function createRegistryClientBy({
  rpcEndpoint,
  wallet,
  contractAddress
}: {
  rpcEndpoint: string;
  wallet: OfflineSigner;
  contractAddress: string;
}) {
  const signingCosmWasmClient = await createContractClientByWallet(rpcEndpoint, wallet);
  const [{ address }] = await wallet.getAccounts();
  return new RegistryClient(signingCosmWasmClient, address, contractAddress);
}

export async function createSaasClientBy({
  rpcEndpoint,
  wallet,
  contractAddress
}: {
  rpcEndpoint: string;
  wallet: OfflineSigner;
  contractAddress: string;
}) {
  const signingCosmWasmClient = await createContractClientByWallet(rpcEndpoint, wallet);
  const [{ address }] = await wallet.getAccounts();
  return new SaasClient(signingCosmWasmClient, address, contractAddress);
}

export async function createApiSaasClientBy({
  rpcEndpoint,
  wallet,
  contractAddress
}: {
  rpcEndpoint: string;
  wallet: OfflineSigner;
  contractAddress: string;
}) {
  const signingCosmWasmClient = await createContractClientByWallet(rpcEndpoint, wallet);
  const [{ address }] = await wallet.getAccounts();
  return new ApiSaasClient(signingCosmWasmClient, address, contractAddress);
}

export async function createOracleMaciClientBy({
  rpcEndpoint,
  wallet,
  contractAddress
}: {
  rpcEndpoint: string;
  wallet: OfflineSigner;
  contractAddress: string;
}) {
  const signingCosmWasmClient = await createContractClientByWallet(rpcEndpoint, wallet);
  const [{ address }] = await wallet.getAccounts();
  return new OracleMaciClient(signingCosmWasmClient, address, contractAddress);
}

export async function createContractClientByWallet(rpcEndpoint: string, wallet: OfflineSigner) {
  console.log('rpcEndpoint', rpcEndpoint);
  const client = await SigningCosmWasmClient.connectWithSigner(rpcEndpoint, wallet, {
    ...defaultSigningClientOptions
  });
  return client;
}

export async function getSignerClientByWallet(rpcEndpoint: string, wallet: OfflineSigner) {
  const signingStargateClient = await SigningStargateClient.connectWithSigner(rpcEndpoint, wallet, {
    ...defaultSigningClientOptions
  });
  return signingStargateClient;
}
