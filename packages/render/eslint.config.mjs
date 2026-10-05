import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

// Guardas da spec 06 (H19, R13) valem para o código publicado, não para as
// specs nem para os ajudantes de teste. Os padrões começam com `**/` porque o
// ESLint resolve `files` relativo à config (via `nx lint`) ou ao `cwd` (com
// `overrideConfigFile`, como em `src/lint-guards.spec.ts`).
const NOT_PUBLISHED = ['**/*.spec.ts', '**/src/testing-support/**'];

const ZONE_IMPORT = {
  group: ['zone.js', 'zone.js/*'],
  message:
    'O pacote não importa zone.js: funciona com e sem Zone (spec 06, H19).',
};

const SANITIZER_PATH = {
  name: '@cds/rte-sanitizer',
  allowTypeImports: true,
  message:
    'O código publicado do render não importa o @cds/rte-sanitizer: o sanitizador chega por provideRteRender (spec 06, H4/H5).',
};

const CORE_HTML_PATH = {
  name: '@cds/rte-core/html',
  message:
    'Só src/toc/** importa @cds/rte-core/html; o RteContent fica sem htmlparser2 (spec 06, R1).',
};

const D25_SELECTORS = [
  {
    selector:
      'Decorator[expression.callee.name=/^(Input|Output|HostListener|HostBinding)$/]',
    message:
      'Use input()/output()/model() e a chave `host` do decorador, não @Input/@Output/@HostListener/@HostBinding (spec 06, H19).',
  },
  {
    selector: "MethodDefinition[key.name='ngOnChanges']",
    message:
      'ngOnChanges é proibido: derive com computed() ou reaja com effect() (spec 06, H19).',
  },
  {
    selector: "CallExpression[callee.property.name='detectChanges']",
    message:
      'detectChanges() é proibido: o estado sai por signals (spec 06, H19).',
  },
  {
    selector:
      'CallExpression[callee.name=/^(setTimeout|requestAnimationFrame)$/]',
    message:
      'setTimeout/requestAnimationFrame não servem para forçar detecção de mudanças (spec 06, H19).',
  },
  {
    selector:
      'CallExpression[callee.object.name=/^(window|globalThis)$/][callee.property.name=/^(setTimeout|requestAnimationFrame)$/]',
    message:
      'setTimeout/requestAnimationFrame não servem para forçar detecção de mudanças (spec 06, H19).',
  },
];

// Nenhum caminho de HTML bruto no código publicado (spec 06, H19).
const RAW_HTML_SELECTORS = [
  {
    selector: 'MemberExpression[property.name=/^(innerHTML|outerHTML)$/]',
    message:
      'innerHTML/outerHTML são proibidos: o HTML entra só pelo [innerHTML] do RteContent (spec 06, H19).',
  },
  {
    selector:
      'CallExpression[callee.property.name=/^(insertAdjacentHTML|write|writeln)$/]',
    message:
      'insertAdjacentHTML/write/writeln são proibidos no código publicado (spec 06, H19).',
  },
];

// Só o `src/content/rte-content.ts` pode usar estes dois (spec 06, H19).
const CONTENT_ONLY_SELECTORS = [
  {
    selector: 'MemberExpression[property.name=/^bypassSecurityTrust/]',
    message:
      'bypassSecurityTrust* só em src/content/rte-content.ts (spec 06, H19).',
  },
  {
    selector: 'Property[key.value=/innerHTML/]',
    message:
      "A chave de host '[innerHTML]' só em src/content/rte-content.ts (spec 06, H19).",
  },
];

const GLOBALS = [
  {
    name: 'document',
    message:
      'Use inject(DOCUMENT) ou o DOM dentro de afterNextRender (spec 06, H19).',
  },
  {
    name: 'window',
    message:
      'Use inject(DOCUMENT).defaultView dentro de afterNextRender (spec 06, H19).',
  },
  {
    name: 'self',
    message:
      'Use inject(DOCUMENT).defaultView dentro de afterNextRender (spec 06, H19).',
  },
];

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
            '{projectRoot}/vitest-base.config.mts',
            '{projectRoot}/size-page.mjs',
          ],
          ignoredDependencies: [
            // `@angular/common` e `@angular/platform-browser` são peers por
            // H17 (a faixa de versão do Angular; `DomSanitizer` vive no
            // segundo) e `@cds/rte-core` entra com o `src/toc/`: declarados
            // antes de serem importados.
            '@angular/common',
            '@angular/platform-browser',
            '@cds/rte-core',
            // Peer opcional sem import algum (pré-voo 3): documenta o
            // acoplamento de versão com o sanitizador que o consumidor passa
            // a `provideRteRender`.
            '@cds/rte-sanitizer',
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
    // H19: OnPush, entradas/saídas por signals, nada de forçar detecção, de
    // tocar o DOM global nem de abrir caminho para HTML bruto.
    files: ['**/*.ts'],
    ignores: NOT_PUBLISHED,
    rules: {
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      'no-restricted-syntax': [
        'error',
        ...D25_SELECTORS,
        ...RAW_HTML_SELECTORS,
        ...CONTENT_ONLY_SELECTORS,
      ],
      'no-restricted-globals': ['error', ...GLOBALS],
      'no-restricted-properties': [
        'error',
        {
          object: 'globalThis',
          property: 'document',
          message:
            'Use inject(DOCUMENT) ou o DOM dentro de afterNextRender (spec 06, H19).',
        },
        {
          object: 'globalThis',
          property: 'window',
          message:
            'Use inject(DOCUMENT).defaultView dentro de afterNextRender (spec 06, H19).',
        },
      ],
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [SANITIZER_PATH, CORE_HTML_PATH],
          patterns: [ZONE_IMPORT],
        },
      ],
    },
  },
  {
    // `rte-content.ts` repete tudo, menos `bypassSecurityTrust*` e a chave de
    // host `[innerHTML]` (no flat config a última ocorrência da regra vence).
    files: ['**/src/content/rte-content.ts'],
    ignores: NOT_PUBLISHED,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...D25_SELECTORS,
        ...RAW_HTML_SELECTORS,
      ],
    },
  },
  {
    // R1: só `src/toc/**` importa `@cds/rte-core/html`.
    files: ['**/src/toc/**/*.ts'],
    ignores: NOT_PUBLISHED,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [SANITIZER_PATH],
          patterns: [ZONE_IMPORT],
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
