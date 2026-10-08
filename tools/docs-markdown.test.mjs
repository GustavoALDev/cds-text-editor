import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  convertMarkdown,
  renderApiPage,
  renderGuidePage,
  rewriteHref,
  splitSegments,
} from './docs/markdown.mjs';

const guide = (body, extra = {}) =>
  renderGuidePage(body, {
    pageId: 'guia/pagina',
    appRoot: '.',
    packages: {},
    liveIds: ['demo'],
    ...extra,
  });

test('markdown: h1 some, h2/h3 viram headings com slug ASCII e id no HTML', () => {
  const r = guide(
    '# Título\n\n## Configuração e opções\n\ntexto\n\n### Detalhes\n',
  );
  assert.deepEqual(r.headings, [
    { depth: 2, id: 'configuracao-e-opcoes', text: 'Configuração e opções' },
    { depth: 3, id: 'detalhes', text: 'Detalhes' },
  ]);
  const html = r.segments[0].html;
  assert.match(
    html,
    /<h2 id="configuracao-e-opcoes">Configuração e opções<\/h2>/,
  );
  assert.ok(!/<h1/.test(html));
});

test('markdown: âncora duplicada falha; id explícito {#id} vale', () => {
  assert.throws(() => guide('## A\n\n## Á\n'), /âncora duplicada "a"/);
  const r = guide('## Título qualquer {#meu-id}\n');
  assert.equal(r.headings[0].id, 'meu-id');
  assert.match(r.segments[0].html, /<h2 id="meu-id">Título qualquer<\/h2>/);
});

test('markdown: links relativos à base, sem "/" inicial', () => {
  assert.equal(rewriteHref('#x', 'guia/pagina'), 'guia/pagina#x');
  assert.equal(rewriteHref('./outra.md#y', 'guia/pagina'), 'guia/outra#y');
  assert.equal(rewriteHref('outra.md', 'guia/pagina'), 'guia/outra');
  assert.equal(
    rewriteHref('../api/rte-core.md', 'guia/pagina'),
    'api/rte-core',
  );
  assert.equal(
    rewriteHref('https://x.test/a', 'guia/pagina'),
    'https://x.test/a',
  );
  assert.throws(
    () => rewriteHref('../../x.md', 'guia/pagina'),
    /sai de apps\/docs\/content/,
  );
  const r = guide('Veja [a](#sec), [b](./outra.md#y) e [c](https://x.test).\n');
  const html = r.segments[0].html;
  assert.match(html, /href="guia\/pagina#sec"/);
  assert.match(html, /href="guia\/outra#y"/);
  assert.match(
    html,
    /<a href="https:\/\/x\.test" rel="noopener noreferrer">c<\/a>/,
  );
  assert.ok(!/href="\//.test(html));
  assert.deepEqual(r.links, [
    'guia/pagina#sec',
    'guia/outra#y',
    'https://x.test',
  ]);
});

test('markdown: blocos ganham classes hljs-* e nenhum style', () => {
  const r = guide(
    '<!-- no-compile: sintaxe -->\n```ts\nconst a: number = 1;\n```\n\n<!-- no-compile: markup -->\n```html\n<p class="x">a</p>\n```\n',
  );
  const html = r.segments[0].html;
  assert.match(
    html,
    /<code class="hljs language-ts">.*<span class="hljs-keyword">const<\/span>/,
  );
  assert.match(html, /hljs-/);
  assert.ok(!/style=/.test(html));
  assert.match(html, /&lt;/); // marcação escapada dentro do bloco
});

test('markdown: HTML cru fora da lista é escapado; da lista passa', () => {
  const html = guide('Texto <span>x</span> e <kbd>Ctrl</kbd><br>fim\n')
    .segments[0].html;
  assert.match(html, /&lt;span&gt;x&lt;\/span&gt;/);
  assert.match(html, /<kbd>Ctrl<\/kbd><br>/);
});

test('markdown: HTML cru perigoso falha o build em vez de ser escapado em silêncio', () => {
  assert.throws(
    () => guide('a <script>x()</script> b\n'),
    /guia\/pagina: HTML não permitido[\s\S]*script/,
  );
  assert.throws(() => guide('<p onclick="x()">a</p>\n'), /onclick/);
  assert.throws(() => guide('<span style="color:red">a</span>\n'), /style/);
  assert.throws(() => guide('[x](javascript:alert(1))\n'), /javascript:/);
  assert.throws(() => guide('![x](data:image/png;base64,AAAA)\n'), /data:/);
});

test('markdown: bloco indentado e segundo h1 falham', () => {
  assert.throws(
    () => guide('texto\n\n    codigo\n'),
    /bloco de código indentado/,
  );
  assert.throws(() => guide('# a\n\n# b\n'), /só um "# título"/);
});

test('markdown: live vira segmento entre os trechos de HTML', () => {
  const r = guide('Antes\n\n<!-- live: demo -->\n\nDepois\n');
  assert.equal(r.segments.length, 3);
  assert.match(r.segments[0].html, /Antes/);
  assert.deepEqual(r.segments[1], { live: 'demo' });
  assert.match(r.segments[2].html, /Depois/);
  assert.deepEqual(splitSegments('<p>a</p>'), [{ html: '<p>a</p>' }]);
});

test('markdown (api): tabelas HTML do api-documenter passam; heading com id explícito', () => {
  const md =
    '## Índice {#indice}\n\n<table><thead><tr><th>\n\nFunction\n\n</th></tr></thead>\n<tbody><tr><td>\n\n[f()](api/core-html#f)\n\n</td></tr>\n</tbody></table>\n\n### f() {#f}\n';
  const r = renderApiPage(md, { pageId: 'api/core-html' });
  assert.match(r.segments[0].html, /<table><thead><tr><th>/);
  assert.match(r.segments[0].html, /<h3 id="f">f\(\)<\/h3>/);
  const guideHtml = convertMarkdown('<table><tr><td>x</td></tr></table>', {
    pageId: 'guia/p',
  }).html;
  assert.match(guideHtml, /&lt;table&gt;/);
});

test('markdown: comentário HTML não fura a lista fechada (X4)', () => {
  const ataques = [
    '<!--><img/src=x/onerror=alert(1)>-->',
    '<!---><img/src=x/onerror=alert(1)>',
    '<!-- a --!><img/src=x/onerror=alert(1)>',
    'a <!--><img/src=x/onerror=alert(1)> b',
    '<!-- x --><meta/http-equiv=refresh content="0;url=https://x.test">',
  ];
  for (const a of ataques) {
    let html;
    try {
      html = guide(`${a}\n`)
        .segments.map((s) => s.html ?? '')
        .join('');
    } catch (e) {
      assert.match(e.message, /HTML não permitido/, a);
      continue;
    }
    assert.ok(!/<!--/.test(html), `comentário vazou: ${html}`);
    assert.ok(!/<(img|meta)/i.test(html), `tag vazou: ${html}`);
  }
});

test('markdown: comentário comum é descartado e o marcador de exemplo vivo sobrevive', () => {
  const r = guide('antes\n\n<!-- nota -->\n\n<!-- live: demo -->\n\ndepois\n');
  assert.deepEqual(
    r.segments.map((s) => (s.live ? { live: s.live } : 'html')),
    ['html', { live: 'demo' }, 'html'],
  );
  assert.ok(!r.segments.some((s) => s.html?.includes('nota')));
});

test('markdown: bloco cercado sem diretiva falha em qualquer aninhamento', () => {
  const casos = [
    '- item\n\n    ```ts\n    x\n    ```\n',
    '1. item\n\n   ```ts\n   x\n   ```\n',
    '> ```ts\n> x\n> ```\n',
  ];
  for (const c of casos)
    assert.throws(() => guide(c), /bloco de código sem diretiva/, c);
  // forjar a marca na mão não funciona
  assert.throws(
    () => guide('- item\n\n    ```ts rte-ok\n    x\n    ```\n'),
    /bloco de código sem diretiva/,
  );
  // com diretiva, no nível raiz, passa
  assert.match(
    guide('<!-- no-compile: x -->\n```ts\nx\n```\n').segments[0].html,
    /<pre>/,
  );
});

test('markdown: ids do layout do site são reservados', () => {
  for (const id of ['conteudo', 'docs-search-input', 'docs-search-list']) {
    assert.throws(() => guide(`## Conteúdo {#${id}}\n`), /reservad/, id);
  }
  assert.throws(() => guide('## Conteudo\n'), /reservad/); // slug "conteudo"
});
