import { Secp256k1HdWallet } from '@cosmjs/launchpad';
import { OfflineSigner } from '@cosmjs/proto-signing';
import {
  GasPrice,
  SigningStargateClient,
  SigningStargateClientOptions,
} from '@cosmjs/stargate';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { MaciClient } from './ts/Maci.client';
import { AMaciClient } from './ts/AMaci.client';
import { RegistryClient } from './ts/Registry.client';
import { OracleMaciClient } from './ts/OracleMaci.client';

const defaultSigningClientOptions: SigningStargateClientOptions = {
  broadcastPollIntervalMs: 8_000,
  broadcastTimeoutMs: 64_000,
  gasPrice: GasPrice.fromString('100000000000peaka'),
};

export async function createMaciClientBy({
  rpcEndpoint,
  wallet,
  contractAddress,
}: {
  rpcEndpoint: string;
  wallet: OfflineSigner;
  contractAddress: string;
}) {
  const signingCosmWasmClient = await createContractClientByWallet(
    rpcEndpoint,
    wallet
  );
  const [{ address }] = await wallet.getAccounts();
  return new MaciClient(signingCosmWasmClient, address, contractAddress);
}

export async function createAMaciClientBy({
  rpcEndpoint,
  wallet,
  contractAddress,
}: {
  rpcEndpoint: string;
  wallet: OfflineSigner;
  contractAddress: string;
}) {
  const signingCosmWasmClient = await createContractClientByWallet(
    rpcEndpoint,
    wallet
  );
  const [{ address }] = await wallet.getAccounts();
  return new AMaciClient(signingCosmWasmClient, address, contractAddress);
}

export async function createRegistryClientBy({
  rpcEndpoint,
  wallet,
  contractAddress,
}: {
  rpcEndpoint: string;
  wallet: OfflineSigner;
  contractAddress: string;
}) {
  const signingCosmWasmClient = await createContractClientByWallet(
    rpcEndpoint,
    wallet
  );
  const [{ address }] = await wallet.getAccounts();
  return new RegistryClient(signingCosmWasmClient, address, contractAddress);
}

export async function createOracleMaciClientBy({
  rpcEndpoint,
  wallet,
  contractAddress,
}: {
  rpcEndpoint: string;
  wallet: OfflineSigner;
  contractAddress: string;
}) {
  const signingCosmWasmClient = await createContractClientByWallet(
    rpcEndpoint,
    wallet
  );
  const [{ address }] = await wallet.getAccounts();
  return new OracleMaciClient(signingCosmWasmClient, address, contractAddress);
}

export async function createContractClientByWallet(
  rpcEndpoint: string,
  wallet: OfflineSigner
) {
  const client = await SigningCosmWasmClient.connectWithSigner(
    rpcEndpoint,
    wallet,
    {
      ...defaultSigningClientOptions,
    }
  );
  return client;
}

export async function getSignerClientByWallet(
  rpcEndpoint: string,
  wallet: OfflineSigner
) {
  const signingStargateClient = await SigningStargateClient.connectWithSigner(
    rpcEndpoint,
    wallet,
    {
      ...defaultSigningClientOptions,
    }
  );
  return signingStargateClient;
}
