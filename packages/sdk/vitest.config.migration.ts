import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      src: resolve(__dirname, 'src')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/migration/**/*.test.ts'],
    testTimeout: 30000,
    server: {
      deps: {
        inline: ['blakejs', 'ffjavascript', 'snarkjs']
      }
    }
  }
});
