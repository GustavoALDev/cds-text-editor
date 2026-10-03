import baseConfig, { noAngularImports } from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  noAngularImports,
  {
    // Tiptap e realce só no entry /extensions e no catálogo /code-languages (spec 03b, B1).
    // No flat config a última ocorrência da regra substitui a anterior: o grupo de
    // @angular/* do noAngularImports precisa ser repetido aqui.
    files: ['src/**/*.ts', 'embeds/src/**/*.ts', 'html/src/**/*.ts'],
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
              group: [
                '@tiptap/*',
                'lowlight',
                'highlight.js',
                'highlight.js/*',
              ],
              message:
                'Tiptap/realce só em extensions/src e code-languages/src (spec 03b, B1)',
            },
          ],
        },
      ],
      // `import()` dinâmico escapa do no-restricted-imports: mesma regra (B1).
      // O esquery não aceita `/` dentro do regex do seletor: `\x2F` é a barra.
      'no-restricted-syntax': [
        'error',
        {
          selector: String.raw`ImportExpression[source.value=/^(@tiptap\x2F|lowlight$|highlight\.js(\x2F|$))/]`,
          message:
            'Tiptap/realce só em extensions/src e code-languages/src (spec 03b, B1), nem por import().',
        },
      ],
    },
  },
  {
    // Nenhum innerHTML/insertAdjacentHTML nas extensões (spec 03b, R14).
    files: ['extensions/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='innerHTML']",
          message: 'innerHTML é proibido em extensions/src (spec 03b, R14).',
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message:
            'insertAdjacentHTML é proibido em extensions/src (spec 03b, R14).',
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
            '{projectRoot}/html/src/**/*.spec.ts',
            '{projectRoot}/src/**/testing/**',
            '{projectRoot}/extensions/src/**/*.spec.ts',
            '{projectRoot}/extensions/src/testing/**',
            '{projectRoot}/code-languages/src/**/*.spec.ts',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
