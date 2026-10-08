import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  checkExternal,
  checkMarkdown,
  checkSite,
  externalReport,
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

// ---------- links externos (links.yml): consulta com fetch falso, nunca falha ----------

/** fetch falso: mapa url -> resposta { status, url?,? } ou função/erro. */
function fakeFetch(table, calls = []) {
  return async (url, init = {}) => {
    calls.push({ url, method: init.method });
    const entry = table[url];
    if (typeof entry === 'function') return entry(init);
    if (!entry) throw new Error('rede indisponível');
    if (init.method === 'HEAD' && entry.headStatus)
      return { status: entry.headStatus, url };
    return { status: entry.status, url: entry.url ?? url };
  };
}

test('checkExternal: 200 ok, 404 quebrado, redirecionamento anotado', async () => {
  const calls = [];
  const results = await checkExternal(
    ['https://ok.test/', 'https://sumiu.test/', 'https://velho.test/'],
    fakeFetch(
      {
        'https://ok.test/': { status: 200 },
        'https://sumiu.test/': { status: 404 },
        'https://velho.test/': { status: 200, url: 'https://novo.test/' },
      },
      calls,
    ),
  );
  const by = Object.fromEntries(results.map((r) => [r.url, r]));
  assert.equal(by['https://ok.test/'].state, 'ok');
  assert.equal(by['https://sumiu.test/'].state, 'quebrado');
  assert.equal(by['https://sumiu.test/'].status, 404);
  assert.equal(by['https://velho.test/'].state, 'redirecionado');
  assert.equal(by['https://velho.test/'].to, 'https://novo.test/');
  assert.ok(calls.every((c) => c.method === 'HEAD' || c.method === 'GET'));
});

test('checkExternal: HEAD recusado (405) cai para GET', async () => {
  const calls = [];
  const results = await checkExternal(
    ['https://so-get.test/'],
    fakeFetch(
      { 'https://so-get.test/': { headStatus: 405, status: 200 } },
      calls,
    ),
  );
  assert.equal(results[0].state, 'ok');
  assert.deepEqual(
    calls.map((c) => c.method),
    ['HEAD', 'GET'],
  );
});

test('checkExternal: timeout vira erro, sem lançar e sem travar os demais', async () => {
  const hang = (init) =>
    new Promise((_, reject) => {
      init.signal.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      );
    });
  const results = await checkExternal(
    ['https://lento.test/', 'https://ok.test/'],
    fakeFetch({
      'https://lento.test/': hang,
      'https://ok.test/': { status: 200 },
    }),
    { timeoutMs: 20 },
  );
  assert.equal(results[0].state, 'erro');
  assert.match(results[0].detail, /tempo|timeout/i);
  assert.equal(results[1].state, 'ok');
});

test('checkExternal: erro de rede vira erro anotado', async () => {
  const results = await checkExternal(['https://fora.test/'], fakeFetch({}));
  assert.equal(results[0].state, 'erro');
  assert.match(results[0].detail, /rede indisponível/);
});

test('externalReport: resumo em Markdown só com o que merece atenção', () => {
  const md = externalReport([
    { url: 'https://ok.test/', state: 'ok', status: 200 },
    { url: 'https://sumiu.test/', state: 'quebrado', status: 404 },
    {
      url: 'https://velho.test/',
      state: 'redirecionado',
      status: 200,
      to: 'https://novo.test/',
    },
    { url: 'https://fora.test/', state: 'erro', detail: 'tempo esgotado' },
  ]);
  assert.match(md, /4 link\(s\) externo\(s\)/);
  assert.match(md, /1 ok/);
  assert.match(md, /https:\/\/sumiu\.test\/ \| HTTP 404/);
  assert.match(md, /redirecionado para https:\/\/novo\.test\//);
  assert.match(md, /tempo esgotado/);
  assert.doesNotMatch(md, /https:\/\/ok\.test\//);
});

test('main --consultar: lê a lista, escreve o resumo e nunca falha', async () => {
  const root = tree({ 'externos.txt': 'https://a.test/\nhttps://b.test/\n' });
  const logs = [];
  const log = { log: (m) => logs.push(m), error: (m) => logs.push(m) };
  const code = await main(['--consultar', 'externos.txt'], {
    cwd: root,
    log,
    fetchImpl: fakeFetch({ 'https://a.test/': { status: 200 } }),
  });
  assert.equal(code, 0);
  assert.ok(logs.join('\n').includes('https://b.test/'));
});

test('checkExternal: a URL sem barra final que o fetch normaliza não vira redirecionamento', async () => {
  const results = await checkExternal(
    ['https://ok.test', 'https://ok.test/a b'],
    async (url) => ({ status: 200, url: new URL(url).href }),
  );
  assert.deepEqual(
    results.map((r) => r.state),
    ['ok', 'ok'],
  );
});

test('checkExternal: só consulta http(s); outros esquemas viram erro sem rede', async () => {
  const calls = [];
  const results = await checkExternal(
    ['file:///etc/passwd', 'ftp://x.test/a', 'http://127.0.0.1:1/'],
    fakeFetch({ 'http://127.0.0.1:1/': { status: 200 } }, calls),
  );
  assert.deepEqual(
    results.map((r) => r.state),
    ['erro', 'erro', 'ok'],
  );
  assert.match(results[0].detail, /http\(s\)/);
  assert.ok(calls.every((c) => c.url.startsWith('http://')));
});
