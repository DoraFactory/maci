import fs from 'fs';
import path from 'path';
import { WasmBytecodeCache } from '../types';

/**
 * Contract bytecode loader
 * Loads compiled WASM files from the artifacts directory
 */
export class ContractLoader {
  private artifactsDir: string;
  private cache: WasmBytecodeCache;
  private architecture: string;

  constructor(artifactsDir?: string) {
    // Default to ../artifacts from e2e directory
    this.artifactsDir = artifactsDir || path.resolve(__dirname, '..', '..', '..', 'artifacts');
    this.cache = {};
    // Detect architecture: aarch64 for ARM64 (macOS M1/M2), x86_64 for Intel/AMD
    this.architecture = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  }

  /**
   * Load AMACI contract bytecode
   */
  async loadAmaciContract(): Promise<Uint8Array> {
    if (this.cache.amaci) {
      return this.cache.amaci;
    }

    const wasmPath = path.join(this.artifactsDir, `cw_amaci-${this.architecture}.wasm`);
    this.cache.amaci = await this.loadWasmFile(wasmPath);
    return this.cache.amaci;
  }

  /**
   * Load API-MACI contract bytecode
   */
  async loadApiMaciContract(): Promise<Uint8Array> {
    if (this.cache.apiMaci) {
      return this.cache.apiMaci;
    }

    const wasmPath = path.join(this.artifactsDir, `cw_api_maci-${this.architecture}.wasm`);
    this.cache.apiMaci = await this.loadWasmFile(wasmPath);
    return this.cache.apiMaci;
  }

  /**
   * Load Registry contract bytecode
   */
  async loadRegistryContract(): Promise<Uint8Array> {
    if (this.cache.registry) {
      return this.cache.registry;
    }

    const wasmPath = path.join(this.artifactsDir, `cw_amaci_registry-${this.architecture}.wasm`);
    this.cache.registry = await this.loadWasmFile(wasmPath);
    return this.cache.registry;
  }

  /**
   * Load API-SaaS contract bytecode
   */
  async loadApiSaasContract(): Promise<Uint8Array> {
    if (this.cache.apiSaas) {
      return this.cache.apiSaas;
    }

    const wasmPath = path.join(this.artifactsDir, `cw_api_saas-${this.architecture}.wasm`);
    this.cache.apiSaas = await this.loadWasmFile(wasmPath);
    return this.cache.apiSaas;
  }

  /**
   * Load all contract bytecodes
   */
  async loadAllContracts(): Promise<WasmBytecodeCache> {
    await Promise.all([
      this.loadAmaciContract(),
      this.loadApiMaciContract(),
      this.loadRegistryContract(),
      this.loadApiSaasContract()
    ]);

    return this.cache;
  }

  /**
   * Helper function to load a WASM file
   */
  private async loadWasmFile(filePath: string): Promise<Uint8Array> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`WASM file not found: ${filePath}`);
    }

    const buffer = fs.readFileSync(filePath);
    return new Uint8Array(buffer);
  }

  /**
   * Get cache
   */
  getCache(): WasmBytecodeCache {
    return this.cache;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache = {};
  }
}

// Singleton instance
let loaderInstance: ContractLoader | null = null;

/**
 * Get the global contract loader instance
 */
export function getContractLoader(artifactsDir?: string): ContractLoader {
  if (!loaderInstance) {
    loaderInstance = new ContractLoader(artifactsDir);
  }
  return loaderInstance;
}
