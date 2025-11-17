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

    this.cache.amaci = await this.loadWasmFileWithFallback('cw_amaci');
    return this.cache.amaci;
  }

  /**
   * Load API-MACI contract bytecode
   */
  async loadApiMaciContract(): Promise<Uint8Array> {
    if (this.cache.apiMaci) {
      return this.cache.apiMaci;
    }

    this.cache.apiMaci = await this.loadWasmFileWithFallback('cw_api_maci');
    return this.cache.apiMaci;
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
      this.loadApiMaciContract(),
      this.loadRegistryContract(),
      this.loadApiSaasContract()
    ]);

    return this.cache;
  }

  /**
   * Helper function to load a WASM file with architecture fallback
   * First tries with architecture suffix (e.g., cw_amaci-aarch64.wasm)
   * Falls back to without suffix (e.g., cw_amaci.wasm) if not found
   */
  private async loadWasmFileWithFallback(baseName: string): Promise<Uint8Array> {
    // Try with architecture suffix first
    const wasmPathWithArch = path.join(this.artifactsDir, `${baseName}-${this.architecture}.wasm`);
    if (fs.existsSync(wasmPathWithArch)) {
      return this.loadWasmFile(wasmPathWithArch);
    }

    // Fallback to without architecture suffix
    const wasmPathWithoutArch = path.join(this.artifactsDir, `${baseName}.wasm`);
    if (fs.existsSync(wasmPathWithoutArch)) {
      console.log(`[ContractLoader] Using architecture-independent WASM: ${baseName}.wasm`);
      return this.loadWasmFile(wasmPathWithoutArch);
    }

    // Neither found, throw error
    throw new Error(
      `WASM file not found: tried both ${wasmPathWithArch} and ${wasmPathWithoutArch}`
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
