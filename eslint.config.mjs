import nx from '@nx/eslint-plugin';

// core, sanitizer e theme não podem depender de Angular (spec 01, R4).
// Exportado para ser aplicado nas configs desses pacotes: o ESLint resolve
// `files` relativo ao diretório da config em uso (a do pacote, via `nx lint`).
export const noAngularImports = {
  files: ['**/*.ts'],
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
        ],
      },
    ],
  },
};

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/vitest.config.*.timestamp*',
      // O demo é um consumidor externo (spec 07b): fora do grafo do Nx e do lint do repositório.
      'apps/demo/src/**',
      'apps/demo/*.mjs',
      // O site de documentação também (spec 07c, X1).
      'apps/docs/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            { sourceTag: 'scope:theme', onlyDependOnLibsWithTags: [] },
            { sourceTag: 'scope:core', onlyDependOnLibsWithTags: [] },
            {
              sourceTag: 'scope:sanitizer',
              onlyDependOnLibsWithTags: ['scope:core'],
            },
            {
              sourceTag: 'scope:angular',
              onlyDependOnLibsWithTags: ['scope:core', 'scope:theme'],
            },
            {
              sourceTag: 'scope:render',
              onlyDependOnLibsWithTags: ['scope:core', 'scope:sanitizer'],
            },
            {
              sourceTag: 'scope:e2e',
              onlyDependOnLibsWithTags: [
                'scope:angular',
                'scope:core',
                'scope:render',
                'scope:sanitizer',
                'scope:theme',
              ],
            },
          ],
        },
      ],
    },
  },
];
