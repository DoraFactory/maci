import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { maci: 'src/maci.ts' },
  format: ['esm'],
  target: 'node18',
  clean: true,
  sourcemap: false,
  // Inject shebang so the output file is directly executable
  banner: {
    js: '#!/usr/bin/env node',
  },
  outDir: 'dist',
  // Keep heavy ZK libraries external (installed as runtime deps, not bundled)
  external: ['snarkjs', 'ffjavascript', '@zk-kit/poseidon-cipher'],
});
