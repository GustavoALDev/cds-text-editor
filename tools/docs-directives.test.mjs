import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  expandDirectives as expandMarked,
  OK_MARK,
  extractRegion,
  generateInstallCommand,
  generateStylesOrder,
  liveIdsOf,
} from './docs/directives.mjs';

// Os blocos autorizados saem com a marca (info string); os testes comparam sem ela.
const expandDirectives = (body, c) =>
  expandMarked(body, c).split(` ${OK_MARK}`).join('');

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'docs');
const readFixture = (name) => readFileSync(join(FIX, name), 'utf8');
const ctx = (extra = {}) => ({
  page: 'guia/x',
  appRoot: FIX,
  packages: {},
  liveIds: ['demo'],
  ...extra,
});

const angular = (peers = {}, meta = {}) => ({
  name: '@comodeviaser/rte-angular',
  peerDependencies: {
    '@angular/core': '>=22.2.1 <23',
    '@comodeviaser/rte-core': '0.0.0',
    '@comodeviaser/rte-theme': '0.0.0',
    '@tiptap/core': '^3.31.4',
    lowlight: '^3.3.0',
    ...peers,
  },
  peerDependenciesMeta: meta,
  exports: { './styles/editor.css': './styles/editor.css' },
});

test('extractRegion: região, marcadores removidos do resto e dedent', () => {
  const text = readFixture('exemplo.ts');
  assert.equal(
    extractRegion(text, 'uso', 'exemplo.ts'),
    [
      'export function resumo(html: string): string {',
      '  const texto = htmlToText(html);',
      '  return texto.trim();',
      '}',
    ].join('\n'),
  );
  assert.equal(
    extractRegion(text, 'interno', 'e.ts'),
    'const texto = htmlToText(html);',
  );
  const all = extractRegion(text, undefined, 'e.ts');
  assert.ok(!/#region|#endregion/.test(all));
  assert.match(all, /import \{ htmlToText \}/);
  assert.equal(
    extractRegion(readFixture('exemplo.html'), 'barra', 'e.html'),
    '<rte-editor [(value)]="html" />',
  );
});

test('extractRegion: região ausente ou sem fim falha em pt-BR', () => {
  assert.throws(
    () => extractRegion('a', 'x', 'e.ts'),
    /e\.ts: região "x" não encontrada/,
  );
  assert.throws(
    () => extractRegion('// #region a\nx', 'a', 'e.ts'),
    /não foi fechada/,
  );
  assert.throws(
    () => extractRegion('x\n// #endregion', 'a', 'e.ts'),
    /sem #region/,
  );
});

test('example: insere a região como bloco cercado com a linguagem do arquivo', () => {
  const out = expandDirectives(
    'Antes\n\n<!-- example: exemplo.ts#interno -->\n\nDepois',
    ctx(),
  );
  assert.equal(
    out,
    'Antes\n\n```ts\nconst texto = htmlToText(html);\n```\n\nDepois',
  );
  const html = expandDirectives('<!-- example: exemplo.html#barra -->', ctx());
  assert.match(html, /^```html\n<rte-editor/);
});

test('example: caminho ou região ausente, ou fora de apps/docs, falha', () => {
  assert.throws(
    () => expandDirectives('<!-- example: nao-existe.ts#a -->', ctx()),
    /guia\/x:1: exemplo "nao-existe\.ts" não existe/,
  );
  assert.throws(
    () => expandDirectives('<!-- example: exemplo.ts#nada -->', ctx()),
    /região "nada" não encontrada/,
  );
  assert.throws(
    () => expandDirectives('<!-- example: ../../package.json -->', ctx()),
    /sai de apps\/docs/,
  );
});

test('live: vira o marcador; id fora do registro falha', () => {
  assert.match(
    expandDirectives('<!-- live: demo -->', ctx()),
    /<!--@@live:demo@@-->/,
  );
  assert.throws(
    () => expandDirectives('<!-- live: outro -->', ctx()),
    /exemplo vivo "outro" não existe em examples\/registry\.ts/,
  );
});

test('liveIdsOf: lê as chaves do registro', () => {
  const src =
    "export const EXAMPLES: Record<string, () => Promise<unknown>> = {\n  'a-b': () => import('./a'),\n  c: () => import('./c'),\n};";
  assert.deepEqual(liveIdsOf(src), ['a-b', 'c']);
});

test('no-compile: exige motivo e um bloco cercado logo depois', () => {
  const ok = expandDirectives(
    '<!-- no-compile: saída do terminal -->\n```text\nok\n```\n',
    ctx(),
  );
  assert.ok(!ok.includes('no-compile'));
  assert.match(ok, /```text\nok\n```/);
  assert.throws(
    () => expandDirectives('<!-- no-compile:  -->\n```\nx\n```', ctx()),
    /exige um motivo/,
  );
  assert.throws(
    () => expandDirectives('<!-- no-compile: x -->\ntexto', ctx()),
    /não foi seguida de um bloco cercado/,
  );
});

test('bloco cercado sem diretiva falha; diretivas dentro de um bloco são texto', () => {
  assert.throws(
    () => expandDirectives('```ts\nx\n```', ctx()),
    /guia\/x:1: bloco de código sem diretiva/,
  );
  const out = expandDirectives(
    '<!-- no-compile: doc da sintaxe -->\n```md\n<!-- live: nada -->\n```',
    ctx(),
  );
  assert.match(out, /live: nada/);
});

test('example seguido de bloco cercado manual falha', () => {
  assert.throws(
    () =>
      expandDirectives(
        '<!-- example: exemplo.ts#uso -->\n```ts\nx\n```',
        ctx(),
      ),
    /seria substituído/,
  );
});

test('generated: install-command usa os peers obrigatórios do package.json publicado', () => {
  assert.equal(
    generateInstallCommand({ angular: angular() }),
    'npm install @comodeviaser/rte-angular @comodeviaser/rte-core @comodeviaser/rte-theme \\\n  @tiptap/core@^3.31.4 \\\n  lowlight@^3.3.0',
  );
});

test('generated: mudar um peer na fixture muda a saída; peer opcional some', () => {
  const a = generateInstallCommand({ angular: angular() });
  const b = generateInstallCommand({
    angular: angular({ '@tiptap/core': '^4.0.0' }),
  });
  assert.notEqual(a, b);
  assert.match(b, /@tiptap\/core@\^4\.0\.0/);
  const c = generateInstallCommand({
    angular: angular({}, { lowlight: { optional: true } }),
  });
  assert.ok(!c.includes('lowlight'));
});

test('generated: styles-order segue os exports e exige o export', () => {
  const pk = {
    theme: { name: '@comodeviaser/rte-theme', exports: { './theme.css': 'x' } },
    core: { name: '@comodeviaser/rte-core', exports: { './styles/content.css': 'x' } },
    angular: angular(),
    render: {
      name: '@comodeviaser/rte-render',
      exports: { './styles/render.css': 'x' },
    },
  };
  assert.equal(
    generateStylesOrder(pk),
    '"styles": [\n  "@comodeviaser/rte-theme/theme.css",\n  "@comodeviaser/rte-core/styles/content.css",\n  "@comodeviaser/rte-angular/styles/editor.css"\n]',
  );
  assert.match(
    generateStylesOrder(pk, { render: true }),
    /rte-render\/styles\/render\.css"\n\]$/,
  );
  delete pk.theme.exports['./theme.css'];
  assert.throws(() => generateStylesOrder(pk), /não exporta "\.\/theme\.css"/);
  const md = expandDirectives(
    '<!-- generated: install-command -->',
    ctx({ packages: { angular: angular() } }),
  );
  assert.match(md, /^```bash\nnpm install @comodeviaser\/rte-angular/);
  assert.throws(
    () => expandDirectives('<!-- generated: outra -->', ctx()),
    /"outra" desconhecido/,
  );
});

test('blocos autorizados por diretiva saem marcados', () => {
  const marked = expandMarked(
    [
      '<!-- no-compile: x -->',
      '```ts',
      'x',
      '```',
      '',
      '<!-- example: exemplo.ts#interno -->',
    ].join('\n'),
    ctx(),
  );
  assert.equal(marked.split(OK_MARK).length - 1, 2);
});

test('extractRegion: regiões de CSS (/* #region */) só em arquivos .css', () => {
  const css = readFixture('exemplo.css');
  assert.equal(
    extractRegion(css, 'tema', 'exemplo.css'),
    '.meu-tema {\n  --rte-primary: #0b57d0;\n}',
  );
  const nivel = extractRegion(css, 'nivel-2', 'exemplo.css');
  assert.match(nivel, /--rte-radius: 2px; \/\* texto \/\/ #region x \*\//);
  const all = extractRegion(css, undefined, 'exemplo.css');
  assert.ok(!/\/\* #(end)?region/.test(all));
  assert.match(all, /\.meu-tema \.rte-root/);
  // em outra linguagem o marcador de CSS é texto comum
  assert.throws(
    () => extractRegion(css, 'tema', 'exemplo.ts'),
    /região "tema" não encontrada/,
  );
});

test('extractRegion: região de CSS ausente ou sem #endregion falha citando o arquivo', () => {
  assert.throws(
    () => extractRegion('.a{}', 'x', 'tema.css'),
    /tema\.css: região "x" não encontrada/,
  );
  assert.throws(
    () => extractRegion('/* #region a */\n.a{}', 'a', 'tema.css'),
    /tema\.css: a região "a" não foi fechada com #endregion/,
  );
  assert.throws(
    () => extractRegion('.a{}\n/* #endregion */', 'a', 'tema.css'),
    /tema\.css: #endregion sem #region correspondente/,
  );
});

test('example: região de um .css vira bloco css', () => {
  const out = expandDirectives('<!-- example: exemplo.css#tema -->', ctx());
  assert.equal(
    out,
    '```css\n.meu-tema {\n  --rte-primary: #0b57d0;\n}\n```',
  );
});
