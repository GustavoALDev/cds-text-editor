import baseConfig, { noAngularImports } from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  noAngularImports,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredDependencies: ['@tiptap/core', '@tiptap/pm'], // peers ainda sem uso (hello); remover quando houver código Tiptap
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
            '{projectRoot}/tsup.config.ts',
            '{projectRoot}/src/**/*.spec.ts',
            '{projectRoot}/src/**/testing/**',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
