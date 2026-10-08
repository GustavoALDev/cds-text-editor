import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkReadme, fillReadme } from './docs/readme-markers.mjs';

const resolve = (kind, arg) =>
  kind === 'example'
    ? { code: `// de ${arg}\nconst a = 1;`, lang: 'ts' }
    : { code: `npm install ${arg}`, lang: 'bash' };

const SRC = [
  '# Título',
  '',
  'Texto fora.',
  '',
  '<!-- readme: example examples/a.ts#r -->',
  'lixo antigo',
  '<!-- /readme -->',
  '',
  '<!-- readme: generated install-command -->',
  '<!-- /readme -->',
  '',
  'Rodapé.',
].join('\n');

test('fillReadme: preenche o miolo e não toca no texto fora dos marcadores', () => {
  const out = fillReadme(SRC, resolve);
  assert.equal(
    out,
    [
      '# Título',
      '',
      'Texto fora.',
      '',
      '<!-- readme: example examples/a.ts#r -->',
      '```ts',
      '// de examples/a.ts#r',
      'const a = 1;',
      '```',
      '<!-- /readme -->',
      '',
      '<!-- readme: generated install-command -->',
      '```bash',
      'npm install install-command',
      '```',
      '<!-- /readme -->',
      '',
      'Rodapé.',
    ].join('\n'),
  );
});

test('fillReadme: idempotente e preserva CRLF', () => {
  const once = fillReadme(SRC, resolve);
  assert.equal(fillReadme(once, resolve), once);
  const crlf = fillReadme(SRC.replace(/\n/g, '\r\n'), resolve);
  assert.equal(crlf, once.replace(/\n/g, '\r\n'));
});

test('fillReadme: cerca maior quando o código contém ```', () => {
  const out = fillReadme(
    '<!-- readme: example x.md -->\n<!-- /readme -->',
    () => ({ code: '```ts\nx\n```', lang: 'md' }),
  );
  assert.match(out, /^<!-- readme: example x\.md -->\n````md\n```ts\nx\n```\n````\n/);
});

test('checkReadme: igual dá ok; diferente devolve a diferença em pt-BR', () => {
  const filled = fillReadme(SRC, resolve);
  assert.deepEqual(checkReadme(filled, resolve), {
    ok: true,
    filled,
    diff: null,
  });
  const r = checkReadme(SRC, resolve, 'README.md');
  assert.equal(r.ok, false);
  assert.equal(r.filled, filled);
  assert.match(r.diff, /README\.md:6: o conteúdo gerado difere do arquivo/);
  assert.match(r.diff, /esperado: "```ts"/);
  assert.match(r.diff, /atual:\s+"lixo antigo"/);
  assert.match(r.diff, /UPDATE_README=1/);
});

test('fillReadme: marcador sem fim, sem início, aninhado ou inválido falha', () => {
  assert.throws(
    () => fillReadme('a\n<!-- readme: example x.ts#r -->\nb', resolve),
    /README\.md:2: .*não foi fechado com <!-- \/readme -->/,
  );
  assert.throws(
    () => fillReadme('a\n<!-- /readme -->', resolve),
    /README\.md:2: <!-- \/readme --> sem/,
  );
  assert.throws(
    () =>
      fillReadme(
        '<!-- readme: example a#r -->\n<!-- readme: example b#r -->\n<!-- /readme -->\n<!-- /readme -->',
        resolve,
      ),
    /README\.md:2: marcador aninhado/,
  );
  assert.throws(
    () => fillReadme('<!-- readme: nada x -->\n<!-- /readme -->', resolve),
    /README\.md:1: marcador inválido/,
  );
});

test('fillReadme: erro do resolvedor (região ou arquivo ausente) cita a linha', () => {
  const falha = () => {
    throw new Error('região "r" não encontrada');
  };
  assert.throws(
    () => fillReadme('x\n<!-- readme: example a.ts#r -->\n<!-- /readme -->', falha),
    /README\.md:2: região "r" não encontrada/,
  );
});
