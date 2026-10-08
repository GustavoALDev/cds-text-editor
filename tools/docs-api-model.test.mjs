import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  checkPairedVersions,
  entrySpecifier,
  listModelEntries,
  modelVersions,
  runApiDocumenter,
  syntheticName,
} from './docs/api-model.mjs';

const CORE = {
  name: '@cds/rte-core',
  exports: {
    '.': { types: './dist/index.d.ts' },
    './html': { types: './dist/html/index.d.ts' },
    './code-languages': { types: './dist/code-languages/index.d.ts' },
    './styles/content.css': './styles/content.css',
    './package.json': { default: './package.json' },
  },
};

test('syntheticName: nome do relatório e do pacote viram o nome sintético', () => {
  assert.equal(
    syntheticName({ report: 'rte-core-html.api.md' }, '@cds/rte-core'),
    'rte-core-html',
  );
  assert.equal(
    syntheticName({ report: 'core.html.api.md' }, '@cds/rte-core'),
    'rte-core-html',
  );
  assert.equal(
    syntheticName({ report: 'rte-core.api.md' }, '@cds/rte-core'),
    'rte-core',
  );
});

test('listModelEntries e entrySpecifier: a lista vem dos exports, não de regex', () => {
  assert.deepEqual(listModelEntries(CORE), [
    { synthetic: 'rte-core', specifier: '@cds/rte-core' },
    { synthetic: 'rte-core-html', specifier: '@cds/rte-core/html' },
    {
      synthetic: 'rte-core-code-languages',
      specifier: '@cds/rte-core/code-languages',
    },
  ]);
  assert.equal(entrySpecifier('rte-core-html', [CORE]), '@cds/rte-core/html');
  assert.equal(
    entrySpecifier('rte-core-code-languages', [CORE]),
    '@cds/rte-core/code-languages',
  );
  assert.throws(() => entrySpecifier('rte-core-nada', [CORE]), /sem entry/);
});

test('versões pareadas: api-documenter e api-extractor resolvem o mesmo api-extractor-model', () => {
  const v = modelVersions();
  assert.deepEqual(checkPairedVersions(v), [], JSON.stringify(v));
  const errs = checkPairedVersions({
    extractor: '7.33.15',
    documenter: '7.33.14',
  });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /desencontradas.*7\.33\.15.*7\.33\.14/);
});

test('runApiDocumenter: sem .api.json falha em pt-BR; com modelo chama o api-documenter', () => {
  const dir = mkdtempSync(join(tmpdir(), 'api-model-'));
  try {
    assert.throws(
      () => runApiDocumenter({ modelDir: dir, outDir: 'x', exec: () => {} }),
      /nenhum \.api\.json/,
    );
    writeFileSync(join(dir, 'a.api.json'), '{}');
    const calls = [];
    runApiDocumenter({
      modelDir: dir,
      outDir: 'out',
      exec: (c, a) => calls.push([c, ...a]),
    });
    assert.deepEqual(calls[0].slice(0, 3), [
      'npx',
      'api-documenter',
      'markdown',
    ]);
    assert.ok(calls[0].includes('out'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
