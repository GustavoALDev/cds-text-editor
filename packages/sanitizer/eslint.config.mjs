import baseConfig, { noAngularImports } from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  noAngularImports,
  {
    // O sanitizador importa só o entry `.` do core e o htmlparser2 (spec 04,
    // R12). No flat config a última ocorrência da regra substitui a anterior:
    // o grupo de @angular/* do noAngularImports precisa ser repetido aqui.
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.spec.ts', 'src/testing/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@angular/*'],
              message:
                'core, sanitizer e theme não podem importar @angular/* (spec 01, R4).',
            },
            {
              group: ['@tiptap/*', '@comodeviaser/rte-core/*'],
              message:
                'O sanitizador importa só @comodeviaser/rte-core (entry .) e htmlparser2 (spec 04, R12).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
            '{projectRoot}/tsup.config.ts',
            '{projectRoot}/src/**/*.spec.ts',
            '{projectRoot}/src/testing/**',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
