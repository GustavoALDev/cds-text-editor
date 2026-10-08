import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertSafeHtml, checkHtml } from './docs/safety.mjs';

const bad = [
  ['<script>alert(1)</script>', /script/],
  ['<p>x</p><SCRIPT src="a.js"></SCRIPT>', /script/],
  ['<style>p{}</style>', /style/],
  ['<iframe src="https://x.test"></iframe>', /iframe/],
  ['<button onclick="x()">a</button>', /onclick/],
  ['<img src="a.png" onerror=x>', /onerror/],
  ['<p style="color:red">a</p>', /style/],
  ['<a href="javascript:alert(1)">a</a>', /javascript:/],
  ['<a href="  JaVa&#x73;cript:alert(1)">a</a>', /javascript:/],
  ['<img src="data:image/png;base64,AAAA">', /data:/],
  ['<a href="https://x.test">a</a>', /noopener noreferrer/],
  ['<a href="https://x.test" rel="noopener">a</a>', /noopener noreferrer/],
  ['<a href="//x.test">a</a>', /noopener noreferrer/],
  ['<img/src=x/onerror=alert(1)>', /onerror/],
  ['<img src="x"onerror=alert(1)>', /onerror/],
  ['<img/src="x"/onerror="alert(1)">', /onerror/],
  ['<a href="javascript:alert(1)"/title=x>a</a>', /javascript:/],
  ['<meta/http-equiv=refresh content="0;url=https://x.test">', /meta/],
  ['<form/action=https://x.test><input/type=submit></form>', /form/],
  ['<base/href=https://x.test/>', /base/],
  ['<link/rel=stylesheet href=https://x.test/a.css>', /link/],
  ['<!--><img src=x>-->', /comentário/],
  ['<!---><img src=x>', /comentário/],
  ['<!-- a --!><img src=x>', /comentário/],
  ['<!-- example: examples/a.ts#x -->', /comentário/],
  ['<!--@@live:demo@@--><!-- x -->', /comentário/],
];

for (const [html, re] of bad) {
  test(`safety: reprova ${html.slice(0, 40)}`, () => {
    const errors = checkHtml(html);
    assert.ok(errors.length > 0, `deveria reprovar: ${html}`);
    assert.match(errors.join('\n'), re);
  });
}

test('safety: HTML permitido passa', () => {
  const ok = [
    '<p>Use <kbd>Ctrl</kbd>+<kbd>B</kbd><br>e <code>a &lt; b</code></p>',
    '<!--@@live:demo@@-->',
    '<a href="guia/instalacao#peers">x</a>',
    '<a href="https://x.test" rel="noopener noreferrer">x</a>',
    '<pre><code class="hljs language-ts"><span class="hljs-keyword">const</span> a = &quot;onclick=1&quot;;</code></pre>',
    '<table><thead><tr><th>A</th></tr></thead></table>',
  ];
  for (const html of ok) assert.deepEqual(checkHtml(html), [], html);
});

test('safety: assertSafeHtml cita a página e o trecho', () => {
  assert.throws(
    () => assertSafeHtml('<p onclick="x()">a</p>', 'guia/x'),
    /guia\/x: HTML não permitido[\s\S]*onclick/,
  );
});

test('safety: external:false pula só a regra do rel', () => {
  assert.deepEqual(
    checkHtml('<a href="https://x.test">a</a>', { external: false }),
    [],
  );
  assert.ok(
    checkHtml('<a href="javascript:x">a</a>', { external: false }).length,
  );
});
