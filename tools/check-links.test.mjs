import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  checkMarkdown,
  checkSite,
  githubSlug,
  main,
  parseHtml,
} from './check-links.mjs';

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-links-'));
  for (const [p, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), content);
  }
  return root;
}

const page = (body, base = '/cds-text-editor/') =>
  `<!doctype html><html><head><base href="${base}"></head><body>${body}</body></html>`;

test('parseHtml: ids, name, base e referências; ignora comentário e script inline', () => {
  const r = parseHtml(
    `<base href='/x/'><h2 id="a">A</h2><a name="b" href="c#d">c</a><img src="i.png"><!-- <a href="no"> --><script>var a="<a href='no2'>"</script>`,
  );
  assert.equal(r.base, '/x/');
  assert.deepEqual([...r.ids].sort(), ['a', 'b']);
  assert.deepEqual(
    r.refs.map((x) => x.url),
    ['c#d', 'i.png'],
  );
});

test('site: links, arquivos e âncoras válidos; externos só listados (deduplicados)', () => {
  const root = tree({
    'index.html': page(
      '<a href="guia/a">a</a> <a href="guia/a#sec">s</a> <a href="https://x.test/y">e</a> <a href="https://x.test/y">e2</a> <a href="mailto:a@b.c">m</a> <img src="img/p.png"> <a href="#topo">t</a><h1 id="topo">T</h1>',
    ),
    'guia/a/index.html': page('<h2 id="sec">S</h2><a href="">v</a>'),
    'img/p.png': 'x',
  });
  const r = checkSite({ siteDir: root, base: '/cds-text-editor/' });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.externals, ['https://x.test/y']);
});

test('site: href quebrado, âncora ausente e imagem ausente reprovam com o arquivo de origem', () => {
  const root = tree({
    'index.html': page(
      '<a href="guia/nao-existe">1</a><a href="guia/a#fantasma">2</a><img src="img/falta.png">',
    ),
    'guia/a/index.html': page('<h2 id="sec">S</h2>'),
  });
  const r = checkSite({ siteDir: root, base: '/cds-text-editor/' });
  assert.equal(r.errors.length, 3);
  assert.match(
    r.errors[0],
    /^index\.html: href="guia\/nao-existe" não existe no build/,
  );
  assert.match(
    r.errors[1],
    /a âncora "#fantasma" não existe em guia\/a\/index\.html/,
  );
  assert.match(r.errors[2], /src="img\/falta\.png" não existe/);
});

test('site: com <base>, "#x" resolve para a raiz, não para a página (armadilha do X7)', () => {
  const root = tree({
    'index.html': page('<h2 id="x">X</h2>'),
    'guia/a/index.html': page('<a href="#x">x</a>'),
  });
  assert.deepEqual(
    checkSite({ siteDir: root, base: '/cds-text-editor/' }).errors,
    [],
  );
  const root2 = tree({
    'index.html': page('<p>sem x</p>'),
    'guia/a/index.html': page('<h2 id="x">X</h2><a href="#x">x</a>'),
  });
  const r = checkSite({ siteDir: root2, base: '/cds-text-editor/' });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /^guia\/a\/index\.html: href="#x"/);
});

test('site: href absoluto com a base resolve; fora da base reprova; demo só com --demo-root', () => {
  const root = tree({
    'index.html': page(
      '<a href="/cds-text-editor/guia/a">ok</a><a href="/fora/x">fora</a><a href="/cds-text-editor/demo/">demo</a><a href="demo/pagina">demo2</a>',
    ),
    'guia/a/index.html': page(''),
  });
  const sem = checkSite({ siteDir: root, base: '/cds-text-editor/' });
  assert.equal(sem.errors.length, 1);
  assert.match(sem.errors[0], /href="\/fora\/x" aponta para fora da base/);
  const demo = tree({ 'index.html': page('<h1 id="d">d</h1>') });
  const com = checkSite({
    siteDir: root,
    base: '/cds-text-editor/',
    demoRoot: demo,
  });
  assert.equal(com.errors.length, 2);
  assert.match(com.errors[1], /href="demo\/pagina" não existe/);
});

test('githubSlug: acentos mantidos, pontuação removida', () => {
  assert.equal(githubSlug('Configuração e opções'), 'configuração-e-opções');
  assert.equal(
    githubSlug('`provideRichText()` — API (v2)'),
    'providerichtext--api-v2',
  );
  assert.equal(githubSlug('Início rápido!'), 'início-rápido');
});

test('markdown: relativos, âncoras do slug do GitHub (com repetição), código ignorado', () => {
  const root = tree({
    'README.md': [
      '# Projeto',
      '[a](docs/a.md#configuração-e-opções) [b](docs/a.md#opções-1) [c](packages/p/README.md)',
      '[ext](https://x.test/z) ![i](docs/img.png) [self](#projeto)',
      '```',
      '[ignorado](nao/existe.md)',
      '```',
      'Inline `[x](nao/existe2.md)` ok.',
      '[ref]: docs/a.md',
    ].join('\n'),
    'docs/a.md': '# A\n## Configuração e opções\n## Opções\n## Opções\n',
    'docs/img.png': 'x',
    'packages/p/README.md': '# P\n',
  });
  const r = checkMarkdown({ repoRoot: root });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.externals, ['https://x.test/z']);
});

test('markdown: arquivo ausente e âncora ausente reprovam com arquivo:linha', () => {
  const root = tree({
    'README.md':
      '# R\n[a](docs/falta.md)\n[b](docs/a.md#fantasma)\n[c](#nada)\n',
    'docs/a.md': '# A\n',
  });
  const r = checkMarkdown({ repoRoot: root });
  assert.equal(r.errors.length, 3);
  assert.match(
    r.errors[0],
    /^README\.md:2: link "docs\/falta\.md" aponta para um arquivo que não existe/,
  );
  assert.match(
    r.errors[1],
    /^README\.md:3: .*"#fantasma", que não existe em docs\/a\.md/,
  );
  assert.match(r.errors[2], /^README\.md:4: .*"#nada"/);
});

test('CLI: sai com 1 e imprime em pt-BR; grava a lista de externos', () => {
  const root = tree({
    'site/index.html': page(
      '<a href="x/quebrado">q</a><a href="https://e.test/">e</a>',
    ),
  });
  const logs = [];
  const log = { log: (m) => logs.push(m), error: (m) => logs.push(m) };
  const code = main(
    ['site', '--base', '/cds-text-editor/', '--externos', 'links-externos.txt'],
    { cwd: root, log },
  );
  assert.equal(code, 1);
  assert.ok(logs.some((l) => /1 link\(s\) interno\(s\) quebrado\(s\)/.test(l)));
  assert.equal(
    readFileSync(join(root, 'links-externos.txt'), 'utf8'),
    'https://e.test/\n',
  );
  assert.equal(main([], { cwd: root, log }), 2);
});

test('site: diretório inexistente ou sem HTML falha em vez de passar em silêncio', () => {
  assert.throws(
    () => checkSite({ siteDir: join(tmpdir(), 'nao-existe-xyz') }),
    /nenhum arquivo \.html/,
  );
});
