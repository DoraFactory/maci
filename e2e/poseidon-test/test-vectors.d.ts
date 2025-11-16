/**
 * TypeScript types for Rust-generated test vectors
 */

export interface RustTestVector {
  name: string;
  description: string;
  hash_type: 'hash2' | 'hash5';
  inputs: string[];
  rust_result: string;
}

export type RustTestVectors = RustTestVector[];
