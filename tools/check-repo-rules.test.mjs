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
