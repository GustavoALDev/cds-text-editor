import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  buildSummary,
  flakyWarnings,
  loadCoverage,
  loadPerf,
  loadSizes,
} from './quality-summary.mjs';

const FX = 'tools/fixtures/quality';
const json = (p) => JSON.parse(readFileSync(join(FX, p), 'utf8'));
const load = () => ({
  sizes: loadSizes(join(FX, 'size')),
  coverage: loadCoverage(join(FX, 'coverage')),
  playwrightReport: json('report.json'),
  perf: loadPerf(join(FX, 'perf')),
});

test('loaders: leem as fixtures e ordenam por pacote/motor', () => {
  const l = load();
  assert.deepEqual(
    l.sizes.map((s) => s.package),
    ['core', 'theme'],
  );
  assert.deepEqual(Object.keys(l.coverage), ['angular', 'core']);
  assert.equal(l.coverage.core.lines.pct, 90);
  assert.deepEqual(
    l.perf.map((p) => p.browser),
    ['chromium'],
  );
});

test('loaders: pasta ausente devolve vazio', () => {
  assert.deepEqual(loadSizes('/nao/existe'), []);
  assert.deepEqual(loadCoverage('/nao/existe'), {});
  assert.deepEqual(loadPerf('/nao/existe'), []);
});

test('buildSummary: as 4 tabelas com os números das fixtures', () => {
  const md = buildSummary(load());
  assert.match(md, /### Tamanho/);
  assert.match(md, /\| core \| whole \| 9000 \| 10000 \| 1000 \|/);
  assert.match(md, /\| core \| schema \| 1500 \| 1600 \| 100 \|/);
  assert.match(md, /\| theme \| parse \| 700 \| 1024 \| 324 \|/);
  assert.match(md, /### Cobertura/);
  assert.match(md, /\| core \| 90\.0 \| 90\.0 \| 75\.0 \| 75\.5 \|/);
  assert.match(md, /\| angular \| 50\.0 \| 50\.0 \| 50\.0 \| 100\.0 \|/);
  assert.match(md, /### Testes instáveis/);
  assert.match(
    md,
    /\| angular\/editor-a\.spec\.ts \| instável \| firefox \| 2 \|/,
  );
  assert.doesNotMatch(md, /estável \|/);
  assert.match(md, /### N45/);
  assert.match(
    md,
    /\| chromium \| 20\.5 \| 15\.0 \| 120\.0 \| 9\.0 \| 48\.0 \| 2\.5 \|/,
  );
});

test('buildSummary: relatório ausente vira "sem dados" sem quebrar, cada um isolado', () => {
  const full = load();
  for (const key of ['sizes', 'coverage', 'playwrightReport', 'perf']) {
    const md = buildSummary({ ...full, [key]: undefined });
    assert.match(md, /sem dados/, key);
    assert.match(md, /### Tamanho/);
    assert.match(md, /### N45/);
  }
  const none = buildSummary({});
  assert.equal(none.match(/sem dados/g).length, 4);
});

test('buildSummary: sem flakes diz que nenhum teste foi instável', () => {
  const md = buildSummary({
    ...load(),
    playwrightReport: { suites: [] },
  });
  assert.match(md, /nenhum teste instável/);
});

test('buildSummary: versões resolvidas listadas quando passadas', () => {
  const md = buildSummary({
    ...load(),
    versions: { '@angular/core': '22.3.0', '@tiptap/core': '3.9.1' },
  });
  assert.match(md, /### Versões resolvidas/);
  assert.match(md, /\| @angular\/core \| 22\.3\.0 \|/);
  assert.doesNotMatch(buildSummary(load()), /Versões resolvidas/);
});

test('flakyWarnings: ::warning por teste flaky, sem falhar', () => {
  const w = flakyWarnings(json('report.json'));
  assert.equal(w.length, 1);
  assert.match(
    w[0],
    /^::warning file=e2e\/angular\/editor-a\.spec\.ts,line=20::.*instável.*firefox/,
  );
  assert.deepEqual(flakyWarnings(undefined), []);
  assert.deepEqual(flakyWarnings({}), []);
});

test('CLI: escreve no arquivo do resumo, imprime avisos e sai com 0 mesmo com flake', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'qsum-')), 'summary.md');
  const r = spawnSync(
    'node',
    [
      'tools/quality-summary.mjs',
      '--sizes',
      join(FX, 'size'),
      '--coverage',
      join(FX, 'coverage'),
      '--playwright',
      join(FX, 'report.json'),
      '--perf',
      join(FX, 'perf'),
    ],
    { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: out } },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /::warning file=e2e\/angular\/editor-a\.spec\.ts/);
  const md = readFileSync(out, 'utf8');
  assert.match(md, /### Tamanho/);
  assert.match(md, /### N45/);
});

test('CLI: sem nenhum artefato e sem GITHUB_STEP_SUMMARY escreve no stdout e sai com 0', () => {
  const env = { ...process.env };
  delete env.GITHUB_STEP_SUMMARY;
  const r = spawnSync(
    'node',
    [
      'tools/quality-summary.mjs',
      '--sizes',
      '/nao/existe',
      '--coverage',
      '/nao/existe',
      '--playwright',
      '/nao/existe.json',
      '--perf',
      '/nao/existe',
    ],
    { encoding: 'utf8', env },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /sem dados/);
});
