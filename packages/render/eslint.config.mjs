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
  name: '@comodeviaser/rte-sanitizer',
  allowTypeImports: true,
  message:
    'O código publicado do render não importa o @comodeviaser/rte-sanitizer: o sanitizador chega por provideRteRender (spec 06, H4/H5).',
};

const CORE_HTML_PATH = {
  name: '@comodeviaser/rte-core/html',
  message:
    'Só o entry /toc (toc/src/**) importa @comodeviaser/rte-core/html; o RteContent fica sem htmlparser2 (spec 06, R1, Ruling 11).',
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

// `import()` dinâmico escapa do no-restricted-imports: mesma regra por sintaxe
// (revisão final). O esquery não aceita `/` dentro do regex: `\x2F` é a barra.
const SANITIZER_DYNAMIC_IMPORT = {
  selector: String.raw`ImportExpression[source.value=/^@comodeviaser\x2Frte-sanitizer(\x2F|$)/]`,
  message: `${SANITIZER_PATH.message} Nem por import().`,
};

const CORE_HTML_DYNAMIC_IMPORT = {
  selector: String.raw`ImportExpression[source.value=/^@comodeviaser\x2Frte-core\x2Fhtml$/]`,
  message: `${CORE_HTML_PATH.message} Nem por import().`,
};

const RAW_HTML_MESSAGE =
  'innerHTML/outerHTML são proibidos: o HTML entra só pelo [innerHTML] do RteContent (spec 06, H19).';
const RAW_HTML_NAME = '/^(innerHTML|outerHTML)$/';

// Nenhum caminho de HTML bruto no código publicado (spec 06, H19).
const RAW_HTML_SELECTORS = [
  {
    selector: `MemberExpression[property.name=${RAW_HTML_NAME}]`,
    message: RAW_HTML_MESSAGE,
  },
  {
    // `el['innerHTML']`.
    selector: `MemberExpression[computed=true][property.value=${RAW_HTML_NAME}]`,
    message: RAW_HTML_MESSAGE,
  },
  {
    // `` el[`outerHTML`] `` (template sem expressões).
    selector: `MemberExpression[computed=true] > TemplateLiteral.property[expressions.length=0][quasis.0.value.cooked=${RAW_HTML_NAME}]`,
    message: RAW_HTML_MESSAGE,
  },
  {
    // `renderer.setProperty(el, 'innerHTML', v)`.
    selector: `CallExpression[callee.property.name='setProperty'] > Literal.arguments[value=${RAW_HTML_NAME}]`,
    message: RAW_HTML_MESSAGE,
  },
  {
    // `Reflect.set(el, 'outerHTML', v)`.
    selector: `CallExpression[callee.object.name='Reflect'][callee.property.name='set'] > Literal.arguments[value=${RAW_HTML_NAME}]`,
    message: RAW_HTML_MESSAGE,
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
        SANITIZER_DYNAMIC_IMPORT,
        CORE_HTML_DYNAMIC_IMPORT,
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
        SANITIZER_DYNAMIC_IMPORT,
        CORE_HTML_DYNAMIC_IMPORT,
      ],
    },
  },
  {
    // R1: só o entry `/toc` (`toc/src/**`) importa `@comodeviaser/rte-core/html`.
    files: ['**/toc/src/**/*.ts'],
    ignores: NOT_PUBLISHED,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...D25_SELECTORS,
        ...RAW_HTML_SELECTORS,
        ...CONTENT_ONLY_SELECTORS,
        SANITIZER_DYNAMIC_IMPORT,
      ],
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
