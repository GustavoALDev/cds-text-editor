import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  dts: {
    tsconfig: 'tsconfig.lib.json',
    // tsup injeta baseUrl; TS 6 o marca como obsoleto (TS5101)
    compilerOptions: { ignoreDeprecations: '6.0' },
  },
  clean: true,
  outDir: 'dist',
});
