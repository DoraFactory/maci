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

  constructor(artifactsDir?: string) {
    this.artifactsDir = artifactsDir || path.resolve(__dirname, '..', '..', 'artifacts');
    this.cache = {};
  }

  /**
   * Load AMACI contract bytecode
   */
  async loadAmaciContract(): Promise<Uint8Array> {
    if (this.cache.amaci) {
      return this.cache.amaci;
    }

    this.cache.amaci = await this.loadWasmFileWithFallback('cw_amaci');
    return this.cache.amaci;
  }

  /**
   * Load MACI contract bytecode
   */
  async loadMaciContract(): Promise<Uint8Array> {
    if (this.cache.maci) {
      return this.cache.maci;
    }

    this.cache.maci = await this.loadWasmFileWithFallback('cw_maci');
    return this.cache.maci;
  }

  /**
   * Load Registry contract bytecode
   */
  async loadRegistryContract(): Promise<Uint8Array> {
    if (this.cache.registry) {
      return this.cache.registry;
    }

    this.cache.registry = await this.loadWasmFileWithFallback('cw_amaci_registry');
    return this.cache.registry;
  }

  /**
   * Load API-SaaS contract bytecode
   */
  async loadApiSaasContract(): Promise<Uint8Array> {
    if (this.cache.apiSaas) {
      return this.cache.apiSaas;
    }

    this.cache.apiSaas = await this.loadWasmFileWithFallback('cw_api_saas');
    return this.cache.apiSaas;
  }

  /**
   * Load all contract bytecodes
   */
  async loadAllContracts(): Promise<WasmBytecodeCache> {
    await Promise.all([
      this.loadAmaciContract(),
      this.loadMaciContract(),
      this.loadRegistryContract(),
      this.loadApiSaasContract()
    ]);

    return this.cache;
  }

  /**
   * Helper function to load a WASM file.
   * Only _test.wasm files (built via `pnpm build:wasm`) are supported.
   * Run `pnpm build:wasm` from the e2e directory to generate them.
   */
  private async loadWasmFileWithFallback(baseName: string): Promise<Uint8Array> {
    const wasmPath = path.join(this.artifactsDir, `${baseName}_test.wasm`);
    if (fs.existsSync(wasmPath)) {
      return this.loadWasmFile(wasmPath);
    }

    throw new Error(
      `WASM file not found: ${wasmPath}\n` +
      `Run "pnpm build:wasm" from the e2e directory to build it.`
    );
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
