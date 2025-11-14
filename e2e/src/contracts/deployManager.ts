import { SimulateCosmWasmClient } from '@oraichain/cw-simulate';
import { ContractInfo, DeployedContracts } from '../types';
import { ContractLoader } from '../setup/contractLoader';

/**
 * Contract deployment manager
 * Handles uploading and instantiating contracts
 */
export class DeployManager {
  private client: SimulateCosmWasmClient;
  private contractLoader: ContractLoader;
  private deployedContracts: DeployedContracts;

  constructor(client: SimulateCosmWasmClient, contractLoader?: ContractLoader) {
    this.client = client;
    this.contractLoader = contractLoader || new ContractLoader();
    this.deployedContracts = {};
  }

  /**
   * Upload and instantiate AMACI contract
   */
  async deployAmaciContract(sender: string, initMsg: any): Promise<ContractInfo> {
    const bytecode = await this.contractLoader.loadAmaciContract();
    
    // Upload contract
    const { codeId } = await this.client.upload(sender, bytecode, 'auto');
    
    // Instantiate contract
    const { contractAddress } = await this.client.instantiate(
      sender,
      codeId,
      initMsg,
      'AMACI Contract',
      'auto'
    );

    const contractInfo: ContractInfo = { codeId, contractAddress };
    this.deployedContracts.amaci = contractInfo;

    return contractInfo;
  }

  /**
   * Upload and instantiate API-MACI contract
   */
  async deployApiMaciContract(sender: string, initMsg: any): Promise<ContractInfo> {
    const bytecode = await this.contractLoader.loadApiMaciContract();
    
    // Upload contract
    const { codeId } = await this.client.upload(sender, bytecode, 'auto');
    
    // Instantiate contract
    const { contractAddress } = await this.client.instantiate(
      sender,
      codeId,
      initMsg,
      'API-MACI Contract',
      'auto'
    );

    const contractInfo: ContractInfo = { codeId, contractAddress };
    this.deployedContracts.apiMaci = contractInfo;

    return contractInfo;
  }

  /**
   * Upload and instantiate Registry contract
   */
  async deployRegistryContract(sender: string, initMsg: any): Promise<ContractInfo> {
    const bytecode = await this.contractLoader.loadRegistryContract();
    
    // Upload contract
    const { codeId } = await this.client.upload(sender, bytecode, 'auto');
    
    // Instantiate contract
    const { contractAddress } = await this.client.instantiate(
      sender,
      codeId,
      initMsg,
      'Registry Contract',
      'auto'
    );

    const contractInfo: ContractInfo = { codeId, contractAddress };
    this.deployedContracts.registry = contractInfo;

    return contractInfo;
  }

  /**
   * Upload and instantiate API-SaaS contract
   */
  async deployApiSaasContract(sender: string, initMsg: any): Promise<ContractInfo> {
    const bytecode = await this.contractLoader.loadApiSaasContract();
    
    // Upload contract
    const { codeId } = await this.client.upload(sender, bytecode, 'auto');
    
    // Instantiate contract
    const { contractAddress } = await this.client.instantiate(
      sender,
      codeId,
      initMsg,
      'API-SaaS Contract',
      'auto'
    );

    const contractInfo: ContractInfo = { codeId, contractAddress };
    this.deployedContracts.apiSaas = contractInfo;

    return contractInfo;
  }

  /**
   * Upload contract code without instantiation
   */
  async uploadContract(sender: string, contractType: 'amaci' | 'apiMaci' | 'registry' | 'apiSaas'): Promise<number> {
    let bytecode: Uint8Array;

    switch (contractType) {
      case 'amaci':
        bytecode = await this.contractLoader.loadAmaciContract();
        break;
      case 'apiMaci':
        bytecode = await this.contractLoader.loadApiMaciContract();
        break;
      case 'registry':
        bytecode = await this.contractLoader.loadRegistryContract();
        break;
      case 'apiSaas':
        bytecode = await this.contractLoader.loadApiSaasContract();
        break;
      default:
        throw new Error(`Unknown contract type: ${contractType}`);
    }

    const { codeId } = await this.client.upload(sender, bytecode, 'auto');
    return codeId;
  }

  /**
   * Instantiate a previously uploaded contract
   */
  async instantiateContract(
    sender: string,
    codeId: number,
    initMsg: any,
    label: string
  ): Promise<string> {
    const { contractAddress } = await this.client.instantiate(
      sender,
      codeId,
      initMsg,
      label,
      'auto'
    );

    return contractAddress;
  }

  /**
   * Get deployed contracts
   */
  getDeployedContracts(): DeployedContracts {
    return this.deployedContracts;
  }

  /**
   * Get specific contract info
   */
  getContractInfo(contractType: keyof DeployedContracts): ContractInfo | undefined {
    return this.deployedContracts[contractType];
  }

  /**
   * Clear deployed contracts registry
   */
  clearDeployedContracts(): void {
    this.deployedContracts = {};
  }
}

