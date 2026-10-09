import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractCssApi,
  renderCssReport,
  checkCssApi,
  extractReadmeThemeVars,
  extractGuideTokens,
  runCssApi,
} from './css-api.mjs';

const CSS = `/* .rte-comentario --rte-comentario */
@layer rte.reset, rte.base;
@property --rte-x {
  syntax: '<length>';
  inherits: true;
  initial-value: 1px;
}
@layer rte.theme {
  .rte-root {
    --rte-primary: red;
    color: var(--rte-y);
  }
  .rte-root .rte-toolbar__button:hover,
  .rt-callout.rt-callout--info { color: var(--rte-primary); }
}
`;

test('extrai classes, variáveis declaradas, camadas e propriedades', () => {
  const api = extractCssApi(CSS);
  assert.deepEqual(api.classes, [
    'rt-callout',
    'rt-callout--info',
    'rte-root',
    'rte-toolbar__button',
  ]);
  assert.deepEqual(api.variables, ['--rte-primary']);
  assert.deepEqual(api.layers, ['rte.base', 'rte.reset', 'rte.theme']);
  assert.deepEqual(api.properties, ['--rte-x']);
  // lida por var() e nunca declarada: quem define é o consumidor
  assert.deepEqual(api.consumed, ['--rte-y']);
});

test('variável apenas usada (var) e comentário não entram', () => {
  const api = extractCssApi(CSS);
  assert.ok(!api.variables.includes('--rte-y'));
  assert.ok(!api.classes.includes('rte-comentario'));
});

test('CRLF dá o mesmo resultado que LF', () => {
  assert.deepEqual(
    extractCssApi(CSS.replace(/\n/g, '\r\n')),
    extractCssApi(CSS),
  );
});

test('relatório marca public e internal e é estável', () => {
  const api = extractCssApi(CSS);
  const publicList = {
    classes: ['rte-root'],
    variables: ['--rte-primary'],
    layers: [],
    properties: [],
  };
  const text = renderCssReport({ file: 'theme.css', api, publicList });
  assert.match(text, /`\.rte-root` — public/);
  assert.match(text, /`\.rt-callout` — internal/);
  assert.match(text, /`--rte-primary` — public/);
  assert.match(text, /`--rte-x` — internal/);
  assert.ok(!text.includes('\r'));
  assert.equal(renderCssReport({ file: 'theme.css', api, publicList }), text);
});

const emptyList = { classes: [], variables: [], layers: [], properties: [] };

test('item público ausente do CSS falha', () => {
  const api = extractCssApi(CSS);
  const errors = checkCssApi({
    api,
    publicList: { ...emptyList, classes: ['rte-root', 'rte-sumiu'] },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /rte-sumiu/);
});

test('variável da tabela do README fora da lista falha; curinga expande', () => {
  const api = extractCssApi(CSS);
  const publicList = { ...emptyList, variables: ['--rte-primary'] };
  assert.deepEqual(
    checkCssApi({ api, publicList, readmeThemeVars: ['--rte-primary'] }),
    [],
  );
  const errors = checkCssApi({
    api,
    publicList,
    readmeThemeVars: ['--rte-primary', '--rte-radius'],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /--rte-radius/);
  const wide = extractCssApi('.rte-root{--rte-code-bg:1;--rte-code-fg:2}');
  assert.deepEqual(
    checkCssApi({
      api: wide,
      publicList: { ...emptyList, variables: ['--rte-code-bg'] },
      readmeThemeVars: ['--rte-code-*'],
    }).length,
    1,
  );
});

test('guia citando classe fora da lista falha', () => {
  const api = extractCssApi('.rte-root{} .rte-interna{}');
  const publicList = { ...emptyList, classes: ['rte-root'] };
  assert.deepEqual(
    checkCssApi({ api, publicList, guideTokens: ['.rte-root'] }),
    [],
  );
  const errors = checkCssApi({
    api,
    publicList,
    guideTokens: ['.rte-root', '.rte-interna'],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /rte-interna/);
});

test('extrai variáveis da tabela do README e tokens do guia', () => {
  const readme = [
    '| Nível | O que | Variáveis |',
    '| --- | --- | --- |',
    '| 1 | Sementes | `--rte-primary`, `--rte-secondary` |',
    '| 3 | Tokens | `--rte-code-*`, `--rte-focus` |',
    '| 4 | CSS | Classes `rte-*` |',
    '',
    'Fora da tabela: `--rte-solta`.',
  ].join('\n');
  assert.deepEqual(extractReadmeThemeVars(readme), [
    '--rte-code-*',
    '--rte-focus',
    '--rte-primary',
    '--rte-secondary',
  ]);
  const guide =
    'Mire `.rte-root` e `--rte-primary`; `rte-editor` não conta; `.rt-callout`.';
  assert.deepEqual(extractGuideTokens(guide), [
    '--rte-primary',
    '.rt-callout',
    '.rte-root',
  ]);
});

function fixture(cssText, list) {
  const root = mkdtempSync(join(tmpdir(), 'css-api-'));
  const pkg = join(root, 'packages', 'demo');
  mkdirSync(join(pkg, 'styles'), { recursive: true });
  mkdirSync(join(pkg, 'api'), { recursive: true });
  writeFileSync(join(pkg, 'styles', 'x.css'), cssText);
  writeFileSync(join(pkg, 'api', 'css-public.json'), JSON.stringify(list));
  return { root, pkg };
}

test('UPDATE_API regrava; sem ele a divergência falha', () => {
  const { root, pkg } = fixture('.rte-root{--rte-a:1}', {
    ...emptyList,
    classes: ['rte-root'],
  });
  try {
    const first = runCssApi(pkg, { root, update: false });
    assert.ok(first.errors.some((e) => /x\.css-api\.md/.test(e)));
    const upd = runCssApi(pkg, { root, update: true });
    assert.deepEqual(upd.errors, []);
    assert.ok(existsSync(join(pkg, 'api', 'x.css-api.md')));
    assert.deepEqual(runCssApi(pkg, { root, update: false }).errors, []);
    // relatório regravado com CRLF ainda confere (EOL normalizado)
    const p = join(pkg, 'api', 'x.css-api.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace(/\n/g, '\r\n'));
    assert.deepEqual(runCssApi(pkg, { root, update: false }).errors, []);
    writeFileSync(
      join(pkg, 'styles', 'x.css'),
      '.rte-root{--rte-a:1}.rte-novo{}',
    );
    assert.ok(runCssApi(pkg, { root, update: false }).errors.length > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('lista pública ausente falha', () => {
  const { root, pkg } = fixture('.rte-root{}', emptyList);
  try {
    rmSync(join(pkg, 'api', 'css-public.json'));
    const r = runCssApi(pkg, { root, update: true });
    assert.ok(r.errors.some((e) => /css-public\.json/.test(e)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
