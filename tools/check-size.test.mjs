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
  measureScenario,
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
