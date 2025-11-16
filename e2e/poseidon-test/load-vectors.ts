/**
 * Load Rust Test Vectors
 *
 * Utility to load and parse Rust-generated test vectors
 */

import * as fs from 'fs';
import * as path from 'path';
import type { RustTestVector } from './test-vectors';

const VECTORS_FILE = path.join(__dirname, 'test-vectors-rust.json');

/**
 * Load test vectors from JSON file
 */
export function loadRustTestVectors(): RustTestVector[] {
  if (!fs.existsSync(VECTORS_FILE)) {
    throw new Error(`Test vectors not found at: ${VECTORS_FILE}\n` + 'Run: pnpm generate:vectors');
  }

  const content = fs.readFileSync(VECTORS_FILE, 'utf-8');
  const vectors: RustTestVector[] = JSON.parse(content);

  return vectors;
}

/**
 * Check if test vectors exist
 */
export function vectorsExist(): boolean {
  return fs.existsSync(VECTORS_FILE);
}

/**
 * Find a specific test vector by name
 */
export function findVector(vectors: RustTestVector[], name: string): RustTestVector | undefined {
  return vectors.find((v) => v.name === name);
}

/**
 * Get all vectors of a specific type
 */
export function getVectorsByType(
  vectors: RustTestVector[],
  type: 'hash2' | 'hash5'
): RustTestVector[] {
  return vectors.filter((v) => v.hash_type === type);
}
