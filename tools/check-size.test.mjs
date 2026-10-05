import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  SCENARIOS,
  bundleScenario,
  checkSizes,
  measureMinGzip,
  measureConfig,
  measureScenario,
  resolveEntry,
} from './check-size.mjs';

const dist = resolve('packages/theme/dist/index.js');
const hasDist = existsSync(dist);
const skip = hasDist ? false : 'dist ausente (rode nx build theme)';

test('measureMinGzip: número finito, positivo e menor que o bruto', async () => {
  const code = Array.from(
    { length: 500 },
    (_, i) => `export const a${i} = ${i};\n`,
  ).join('');
  const n = await measureMinGzip(code);
  assert.ok(Number.isFinite(n) && n > 0 && n < code.length);
});

test('checkSizes: dentro do orçamento não dá erro', () => {
  const m = { parse: { min: 2000, gzip: 900 } };
  assert.deepEqual(checkSizes(m, { parse: 1024 }), []);
});

test('checkSizes: estouro gera mensagem em pt-BR por cenário', () => {
  const m = {
    parse: { min: 4000, gzip: 1100 },
    create: { min: 9000, gzip: 500 },
  };
  const errors = checkSizes(m, { parse: 1024, create: 1024 });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /parse/);
  assert.match(errors[0], /1100/);
  assert.match(errors[0], /1024/);
  assert.match(errors[0], /orçamento/);
});

test('checkSizes: cenário sem orçamento ou desconhecido é erro', () => {
  const m = { parse: { min: 1, gzip: 1 } };
  assert.match(checkSizes(m, {})[0], /sem orçamento/);
  assert.match(checkSizes(m, { parse: 10, fantasma: 5 })[0], /fantasma/);
});

test('cenários definidos', () => {
  assert.deepEqual(Object.keys(SCENARIOS).sort(), [
    'apply',
    'check',
    'create',
    'parse',
    'presets',
    'whole',
  ]);
});

test('bundleScenario: dist inexistente dá erro claro', async () => {
  await assert.rejects(
    bundleScenario('/nao/existe/index.js', ['parseColor']),
    /não encontrado/,
  );
});

test('measureScenario: cenário desconhecido dá erro claro', async () => {
  await assert.rejects(measureScenario(dist, 'xyz'), /cenário desconhecido/);
});

test('medição determinística e coerente', { skip }, async () => {
  const a = await measureScenario(dist, 'parse');
  const b = await measureScenario(dist, 'parse');
  assert.deepEqual(a, b);
  assert.ok(a.gzip > 0 && a.gzip < a.min);
  const whole = await measureScenario(dist, 'whole');
  assert.ok(whole.gzip > a.gzip);
});

test(
  'tree-shaking: parseColor sozinho não arrasta presets, tokens nem avisos',
  { skip },
  async () => {
    const code = await bundleScenario(dist, ['parseColor'], { minify: false });
    assert.ok(!code.includes('monochrome'), 'presets vazaram');
    assert.ok(!code.includes('#b3261e'), 'STATIC_TOKENS vazaram');
    assert.ok(!/warnIfPoorTheme|checkRteTheme|createRteTheme/.test(code));
    assert.ok(!code.includes('contraste insuficiente'), 'avisos vazaram');
    assert.ok(!code.includes('[rte-theme]'), 'mensagens vazaram');
    assert.ok(code.includes('parseHsl'), 'sanidade: parser presente');
  },
);

test(
  'tree-shaking: presets sozinhos não arrastam parser nem OKLab',
  { skip },
  async () => {
    const code = await bundleScenario(dist, ['RTE_THEME_PRESETS'], {
      minify: false,
    });
    assert.ok(code.includes('monochrome'));
    assert.ok(!/oklab|oklch|parseColor|parseHex|getContext/i.test(code));
  },
);

test(
  'CLI: orçamento violado sai com 1 e mensagem; respeitado sai com 0',
  { skip },
  () => {
    const run = (...args) =>
      spawnSync('node', ['tools/check-size.mjs', dist, ...args], {
        encoding: 'utf8',
      });
    const bad = run('--budget', 'presets=10');
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /presets/);
    const ok = run(
      ...['whole', 'apply', 'create', 'parse', 'presets', 'check'].flatMap(
        (s) => ['--budget', `${s}=100000`],
      ),
    );
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /min\+gzip/);
  },
);

test('CLI: arquivo ausente sai com 2 e mensagem clara', () => {
  const r = spawnSync('node', ['tools/check-size.mjs', '/nao/existe.js'], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /não encontrado/);
});

test('--config: mede cada cenário e reporta estouro de orçamento', () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-size-'));
  const entry = join(dir, 'lib.js');
  writeFileSync(
    entry,
    [
      `export const a = "${'x'.repeat(50)}";`,
      `export function big() { return [${Array.from({ length: 300 }, (_, i) => `"s${i * 7919}"`).join(',')}]; }`,
      '',
    ].join('\n'),
  );
  const run = (budgets) => {
    const cfg = join(dir, 'cfg.json');
    writeFileSync(
      cfg,
      JSON.stringify({
        scenarios: {
          whole: { entry, exports: ['*'] },
          small: { entry, exports: ['a'] },
        },
        budgets,
      }),
    );
    return spawnSync('node', ['tools/check-size.mjs', '--config', cfg], {
      encoding: 'utf8',
    });
  };
  const ok = run({ whole: 100000, small: 100000 });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /whole/);
  assert.match(ok.stdout, /small/);
  const bad = run({ whole: 100000, small: 1 });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /small/);
  assert.match(bad.stderr, /orçamento/);
  assert.doesNotMatch(bad.stderr, /cenário "whole" estourou/);
});

test('--config: arquivo de configuração ausente sai com 2', () => {
  const r = spawnSync(
    'node',
    ['tools/check-size.mjs', '--config', '/nao/existe.json'],
    {
      encoding: 'utf8',
    },
  );
  assert.equal(r.status, 2);
});

const FAKE_EXT_SOURCE = [
  "import x from 'fake-ext';",
  'export default x;',
  '',
].join(String.fromCharCode(10));

test('bundleScenario: external mantém o pacote como import', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-size-ext-'));
  const entry = join(dir, 'lib.js');
  writeFileSync(entry, FAKE_EXT_SOURCE);
  await assert.rejects(() => bundleScenario(entry, ['*']));
  const code = await bundleScenario(entry, ['*'], { external: ['fake-ext'] });
  assert.match(code, /fake-ext/);
});

test('--config: cenário com external mede', () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-size-cfg-ext-'));
  const entry = join(dir, 'lib.js');
  writeFileSync(entry, FAKE_EXT_SOURCE);
  const cfg = join(dir, 'cfg.json');
  const run = (external) => {
    writeFileSync(
      cfg,
      JSON.stringify({
        scenarios: { ext: { entry, exports: ['*'], external } },
        budgets: { ext: 100000 },
      }),
    );
    return spawnSync('node', ['tools/check-size.mjs', '--config', cfg], {
      encoding: 'utf8',
    });
  };
  assert.equal(run(['fake-ext']).status, 0);
  assert.equal(run(undefined).status, 2);
});

// Spec 05b2a (pré-voo 4): o chunk do `@defer` fica fora da medida do entry.
const CHUNK_MARK = 'conteudo-do-chunk-'.repeat(20);

function chunkFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'check-size-chunk-'));
  writeFileSync(
    join(dir, 'a.mjs'),
    "export const a = () => import('./b-x.mjs');\n",
  );
  writeFileSync(join(dir, 'b-x.mjs'), `export const b = '${CHUNK_MARK}';\n`);
  return dir;
}

test('bundleScenario: externalChunks deixa o import() relativo fora da medida', async () => {
  const entry = join(chunkFixture(), 'a.mjs');
  const inlined = await bundleScenario(entry, ['*']);
  assert.match(inlined, new RegExp(CHUNK_MARK));
  const external = await bundleScenario(entry, ['*'], {
    externalChunks: true,
  });
  assert.doesNotMatch(external, new RegExp(CHUNK_MARK));
  assert.match(external, /b-x\.mjs/);
});

test('measureConfig: externalChunks mede menos que sem a opção', async () => {
  const entry = join(chunkFixture(), 'a.mjs');
  const m = await measureConfig({
    scenarios: {
      inlined: { entry, exports: ['*'] },
      external: { entry, exports: ['*'], externalChunks: true },
    },
  });
  assert.ok(m.external.min < m.inlined.min);
});

test('resolveEntry: sem curinga devolve o caminho como está', () => {
  assert.equal(resolveEntry('dist/x/a.mjs'), 'dist/x/a.mjs');
});

test('resolveEntry: curinga com exatamente um casamento', () => {
  const dir = chunkFixture();
  writeFileSync(join(dir, 'b-x.mjs.map'), '{}');
  writeFileSync(join(dir, 'c.mjs'), '');
  assert.equal(
    resolve(resolveEntry(join(dir, 'b-*.mjs'))),
    resolve(join(dir, 'b-x.mjs')),
  );
});

test('resolveEntry: curinga com 0 ou 2 casamentos é erro em pt-BR', () => {
  const dir = chunkFixture();
  writeFileSync(join(dir, 'b-y.mjs'), '');
  assert.throws(() => resolveEntry(join(dir, 'z-*.mjs')), /nenhum arquivo/);
  assert.throws(
    () => resolveEntry(join(dir, 'b-*.mjs')),
    /2 arquivos.*exatamente um/,
  );
});

test('--config: entry com curinga mede o único arquivo casado', () => {
  const dir = chunkFixture();
  const cfg = join(dir, 'cfg.json');
  writeFileSync(
    cfg,
    JSON.stringify({
      scenarios: {
        chunk: { entry: join(dir, 'b-*.mjs'), exports: ['*'] },
      },
      budgets: { chunk: 100000 },
    }),
  );
  const r = spawnSync('node', ['tools/check-size.mjs', '--config', cfg], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /chunk/);
});
