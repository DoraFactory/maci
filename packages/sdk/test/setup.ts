/**
 * Global test setup
 * Loaded before every test suite via vitest setupFiles.
 */
import { vi } from 'vitest';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env.test if present, fall back to .env
dotenv.config({ path: resolve(process.cwd(), '.env.test') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

// Suppress console.warn output in tests (retry log noise) unless TEST_VERBOSE is set
if (!process.env.TEST_VERBOSE) {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
}
