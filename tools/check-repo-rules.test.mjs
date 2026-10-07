import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRepoRules } from './check-repo-rules.mjs';

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'rules-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

test('accepts a clean repo', () => {
  const root = fixture({
    'packages/core/package.json': JSON.stringify({
      name: '@cds/rte-core',
      peerDependencies: { '@tiptap/core': '^3.0.0' },
    }),
    'packages/core/tsconfig.spec.json': JSON.stringify({
      compilerOptions: { composite: false },
    }),
  });
  assert.deepEqual(checkRepoRules(root), []);
});

test('rejects @angular/* in core peerDependencies', () => {
  const root = fixture({
    'packages/core/package.json': JSON.stringify({
      name: '@cds/rte-core',
      peerDependencies: { '@angular/core': '>=22' },
    }),
  });
  assert.equal(checkRepoRules(root).length, 1);
});

test('rejects composite true in tsconfig.spec.json', () => {
  const root = fixture({
    'packages/angular/tsconfig.spec.json': JSON.stringify({
      compilerOptions: { composite: true },
    }),
  });
  assert.equal(checkRepoRules(root).length, 1);
});

test('parses tsconfig.spec.json containing comments', () => {
  const root = fixture({
    'packages/angular/tsconfig.spec.json':
      '// linha\n{\n  /* bloco */\n  "compilerOptions": {\n    // c\n    "composite": true\n  }\n}\n',
  });
  assert.equal(checkRepoRules(root).length, 1);
});

test('tolerates a package dir without package.json', () => {
  const root = fixture({ 'packages/core/src/index.ts': '' });
  assert.deepEqual(checkRepoRules(root), []);
});

test('accepts a repo without packages dir', () => {
  assert.deepEqual(checkRepoRules(fixture({ 'README.md': '' })), []);
});

test('globs with /* inside strings do not hide composite true', () => {
  const root = fixture({
    'packages/angular/tsconfig.spec.json':
      '{\n  "include": ["src/**/*.spec.ts", "**/*.test.ts"],\n  "compilerOptions": { "composite": true },\n  "exclude": ["dist/*/x", "src/**/*.d.ts"]\n}\n',
  });
  assert.equal(checkRepoRules(root).length, 1);
});

test('comments plus URL string still detect composite true', () => {
  const root = fixture({
    'packages/angular/tsconfig.spec.json':
      '// linha\n{\n  /* bloco */\n  "$schema": "https://example.com/x.json",\n  "compilerOptions": { "composite": true }\n}\n',
  });
  assert.equal(checkRepoRules(root).length, 1);
});

test('comments only with composite false is clean', () => {
  const root = fixture({
    'packages/angular/tsconfig.spec.json':
      '// linha\n{\n  /* bloco */\n  "include": ["src/**/*.spec.ts"],\n  "compilerOptions": { "composite": false }\n}\n',
  });
  assert.deepEqual(checkRepoRules(root), []);
});

test('unparseable tsconfig is reported as a violation, not a crash', () => {
  const root = fixture({ 'packages/angular/tsconfig.spec.json': '{ "a": ' });
  assert.equal(checkRepoRules(root).length, 1);
});

test('rejects Angular peers outside >=22.x.y <23', () => {
  const root = fixture({
    'packages/render/package.json': JSON.stringify({
      name: '@cds/rte-render',
      peerDependencies: { '@angular/core': '>=21.0.0 <23' },
    }),
  });
  assert.equal(checkRepoRules(root).length, 1);
});

test('accepts Angular peers >=22.2.1 <23', () => {
  const root = fixture({
    'packages/angular/package.json': JSON.stringify({
      name: '@cds/rte-angular',
      peerDependencies: { '@angular/core': '>=22.2.1 <23' },
    }),
  });
  assert.deepEqual(checkRepoRules(root), []);
});

test('requires governance files in the real repo (root package.json)', () => {
  const errors = checkRepoRules(
    fixture({ 'package.json': '{}', 'packages/core/src/index.ts': '' }),
  );
  assert.ok(errors.some((e) => e.startsWith('SECURITY.md:')));
  assert.ok(errors.some((e) => e.startsWith('docs/open-core.md:')));
});
