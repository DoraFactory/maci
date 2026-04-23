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
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 30000,
    deps: {
      interopDefault: true
    },
    server: {
      deps: {
        inline: [/blakejs/, /@zk-kit\/eddsa-poseidon/, /ffjavascript/, /snarkjs/]
      }
    }
  }
});
