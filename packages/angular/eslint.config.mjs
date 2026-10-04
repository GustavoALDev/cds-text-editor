import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

// Guardas da spec 05a (D25, R1) valem para o código publicado, não para as
// specs nem para os ajudantes de teste. Os padrões começam com `**/` porque o
// ESLint resolve `files` relativo à config (via `nx lint`) ou ao `cwd` (com
// `overrideConfigFile`, como em `src/lint-guards.spec.ts`).
const NOT_PUBLISHED = ['**/*.spec.ts', '**/src/testing-support/**'];

const ZONE_IMPORT = {
  group: ['zone.js', 'zone.js/*'],
  message:
    'O pacote não importa zone.js: funciona com e sem Zone (spec 05a, D25).',
};

export default [
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            // ajudantes de teste, fora do build (usam @angular/compiler e node:*)
            '{projectRoot}/src/testing-support/**',
          ],
          // Peers exigidos por D24 sem import direto no pacote: as extensões
          // do Tiptap, o lowlight e o highlight.js chegam pelo
          // `@cds/rte-core/extensions`
          // (uma cópia só do ProseMirror); o `@cds/rte-theme` é dependência
          // só de CSS (o tema nunca é importado em TypeScript).
          ignoredDependencies: [
            // Peers de D24 ainda sem código que os importe (fundação da spec
            // 05a, Tarefa 1): sair desta lista quando o componente, os
            // rótulos e os formulários chegarem (Tarefas 2–7).
            '@angular/common',
            // Permanentes:
            '@cds/rte-theme',
            '@tiptap/extension-blockquote',
            '@tiptap/extension-bold',
            '@tiptap/extension-code',
            '@tiptap/extension-code-block',
            '@tiptap/extension-document',
            '@tiptap/extension-hard-break',
            '@tiptap/extension-heading',
            '@tiptap/extension-horizontal-rule',
            '@tiptap/extension-italic',
            '@tiptap/extension-link',
            '@tiptap/extension-list',
            '@tiptap/extension-paragraph',
            '@tiptap/extension-strike',
            '@tiptap/extension-subscript',
            '@tiptap/extension-superscript',
            '@tiptap/extension-table',
            '@tiptap/extension-text',
            '@tiptap/extension-text-align',
            '@tiptap/extension-underline',
            '@tiptap/extensions',
            'highlight.js',
            'lowlight',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'rte',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'rte',
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    // D25: OnPush, entradas/saídas por signals, nada de forçar detecção nem
    // de tocar o DOM global fora de `inject(DOCUMENT)`/`afterNextRender`.
    files: ['**/*.ts'],
    ignores: NOT_PUBLISHED,
    rules: {
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Decorator[expression.callee.name=/^(Input|Output|HostListener|HostBinding)$/]',
          message:
            'Use input()/output()/model() e a chave `host` do decorador, não @Input/@Output/@HostListener/@HostBinding (spec 05a, D25).',
        },
        {
          selector: "MethodDefinition[key.name='ngOnChanges']",
          message:
            'ngOnChanges é proibido: derive com computed() ou reaja com effect() (spec 05a, D25).',
        },
        {
          selector: "CallExpression[callee.property.name='detectChanges']",
          message:
            'detectChanges() é proibido: o estado sai por signals (spec 05a, D25).',
        },
        {
          selector:
            'CallExpression[callee.name=/^(setTimeout|requestAnimationFrame)$/]',
          message:
            'setTimeout/requestAnimationFrame não servem para forçar detecção de mudanças (spec 05a, D25).',
        },
        {
          selector:
            'CallExpression[callee.object.name=/^(window|globalThis)$/][callee.property.name=/^(setTimeout|requestAnimationFrame)$/]',
          message:
            'setTimeout/requestAnimationFrame não servem para forçar detecção de mudanças (spec 05a, D25).',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'document',
          message:
            'Use inject(DOCUMENT) ou o DOM dentro de afterNextRender (spec 05a, D25).',
        },
        {
          name: 'window',
          message:
            'Use inject(DOCUMENT).defaultView dentro de afterNextRender (spec 05a, D25).',
        },
        {
          name: 'self',
          message:
            'Use inject(DOCUMENT).defaultView dentro de afterNextRender (spec 05a, D25).',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'globalThis',
          property: 'document',
          message:
            'Use inject(DOCUMENT) ou o DOM dentro de afterNextRender (spec 05a, D25).',
        },
        {
          object: 'globalThis',
          property: 'window',
          message:
            'Use inject(DOCUMENT).defaultView dentro de afterNextRender (spec 05a, D25).',
        },
      ],
      'no-restricted-imports': ['error', { patterns: [ZONE_IMPORT] }],
    },
  },
  {
    // R1: só o entry /validators mede texto com `@cds/rte-core/html`; o `.`,
    // o /i18n e o /testing não o importam. No flat config a última ocorrência da regra substitui a
    // anterior: o grupo do zone.js é repetido aqui.
    files: ['**/*.ts'],
    ignores: [...NOT_PUBLISHED, '**/validators/src/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ZONE_IMPORT,
            {
              group: ['@cds/rte-core/html'],
              message:
                'O entry . não importa @cds/rte-core/html; medir texto é do /validators (spec 05a, R1).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {},
  },
];
