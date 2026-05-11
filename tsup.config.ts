import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  sourcemap: true,
  dts: false,
  clean: true,
  outDir: 'dist',
  banner: { js: '#!/usr/bin/env node' },
});
