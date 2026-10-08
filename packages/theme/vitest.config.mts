import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/theme',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    name: 'theme',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/theme',
      provider: 'v8' as const,
      include: ['src/**/*.ts'],
      exclude: ['**/*.{test,spec}.ts', 'src/testing/**'],
    },
  },
}));
