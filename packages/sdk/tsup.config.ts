import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: 'dist',
    platform: 'node',
  },
  {
    entry: {
      browser: 'src/browser.ts',
    },
    format: ['esm', 'cjs'],
    dts: {
      compilerOptions: {
        moduleResolution: 'node',
        declarationDir: './dist',
        declaration: true,
      },
    },
    sourcemap: true,
    clean: false,
    outDir: 'dist',
    platform: 'browser',
    env: {
      BROWSER: 'true',
    },
    esbuildOptions(options) {
      options.alias = {
        http: 'stream-http',
        https: 'https-browserify',
        crypto: 'crypto-browserify',
        stream: 'stream-browserify',
        events: 'events',
        buffer: 'buffer',
        process: 'process/browser',
        zlib: 'browserify-zlib',
      };
      options.define = {
        'process.env.NODE_ENV': '"production"',
        'process.env.BROWSER': 'true',
        global: 'window',
      };
      options.external = [
        '@cosmjs/amino',
        '@cosmjs/cosmwasm-stargate',
        '@cosmjs/proto-signing',
        '@cosmjs/stargate',
      ];
      options.inject = ['./src/polyfills/browser-polyfills.ts'];
    },
    noExternal: [
      'events',
      'buffer',
      'process',
      'stream-browserify',
      'https-browserify',
      'stream-http',
      'crypto-browserify',
      'browserify-zlib',
    ],
  },
]);
