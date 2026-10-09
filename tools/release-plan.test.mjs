import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkReleasePlan } from './release-plan.mjs';

const PACKAGES = [
  '@cds/rte-core',
  '@cds/rte-sanitizer',
  '@cds/rte-theme',
  '@cds/rte-angular',
  '@cds/rte-render',
];
const config = { fixed: [PACKAGES] };
const release = (name, newVersion = '0.1.0') => ({
  name,
  type: 'minor',
  oldVersion: '0.0.0',
  newVersion,
});
const status = (versions = {}) => ({
  releases: PACKAGES.map((n) => release(n, versions[n] ?? '0.1.0')),
});
const run = (over = {}) =>
  checkReleasePlan({
    status: status(),
    config,
    packages: PACKAGES,
    env: {},
    ...over,
  });

test('os 5 pacotes em 0.1.0 com fixed completo passam', () => {
  assert.deepEqual(run(), []);
});

test('fixed vazio reprova citando o grupo fixed', () => {
  const errors = run({ config: { fixed: [] } });
  assert.ok(errors.some((e) => e.includes('grupo fixed')));
});

test('fixed com 4 pacotes reprova citando o ausente', () => {
  const errors = run({
    config: { fixed: [PACKAGES.filter((p) => p !== '@cds/rte-render')] },
  });
  assert.ok(errors.some((e) => e.includes('@cds/rte-render')));
});

test('fixed em dois grupos reprova (deve ser um grupo único)', () => {
  const errors = run({
    config: { fixed: [PACKAGES.slice(0, 2), PACKAGES.slice(2)] },
  });
  assert.ok(errors.some((e) => e.includes('grupo fixed')));
});

test('versão 1.0.0 reprova sem RTE_ALLOW_1_0 e passa com ele', () => {
  const s = status({ '@cds/rte-core': '1.0.0' });
  const errors = run({ status: s });
  assert.ok(errors.some((e) => e.includes('1.0.0')));
  assert.deepEqual(run({ status: s, env: { RTE_ALLOW_1_0: '1' } }), []);
});

test('versão 2.3.4 também reprova (>= 1.0.0)', () => {
  const errors = run({ status: status({ '@cds/rte-theme': '2.3.4' }) });
  assert.ok(errors.length >= 1);
});

test('theme em 0.0.1 passa na checagem de fixed (o config real é que exige fixed)', () => {
  const errors = run({ status: status({ '@cds/rte-theme': '0.0.1' }) });
  assert.deepEqual(errors, []);
});

test('pacote fora do plano reprova', () => {
  const s = status();
  s.releases.push(release('@cds/outro'));
  const errors = run({ status: s });
  assert.ok(errors.some((e) => e.includes('@cds/outro')));
});

test('o .changeset/config.json real tem fixed com os 5 pacotes de packages/*', () => {
  const root = resolve(import.meta.dirname, '..');
  const cfg = JSON.parse(
    readFileSync(join(root, '.changeset/config.json'), 'utf8'),
  );
  const names = readdirSync(join(root, 'packages'))
    .map(
      (d) =>
        JSON.parse(
          readFileSync(join(root, 'packages', d, 'package.json'), 'utf8'),
        ).name,
    )
    .sort();
  assert.equal(names.length, 5);
  assert.equal(cfg.fixed.length, 1);
  assert.deepEqual([...cfg.fixed[0]].sort(), names);
});

test('CLI com --status sai 0 e 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'relplan-'));
  const tool = resolve(import.meta.dirname, 'release-plan.mjs');
  const ok = join(dir, 'ok.json');
  const bad = join(dir, 'bad.json');
  writeFileSync(ok, JSON.stringify(status()));
  writeFileSync(bad, JSON.stringify(status({ '@cds/rte-core': '1.0.0' })));
  const cwd = resolve(import.meta.dirname, '..');
  const env = { ...process.env, RTE_ALLOW_1_0: '' };
  const r0 = spawnSync(process.execPath, [tool, '--status', ok], { cwd, env });
  assert.equal(r0.status, 0, String(r0.stderr));
  const r1 = spawnSync(process.execPath, [tool, '--status', bad], { cwd, env });
  assert.equal(r1.status, 1);
});
