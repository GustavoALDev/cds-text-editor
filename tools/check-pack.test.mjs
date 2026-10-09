import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkPackFiles,
  checkRequiredFiles,
  nonCodeEntrypoints,
} from './check-pack.mjs';

test('accepts dist, README, LICENSE and package.json', () => {
  assert.deepEqual(
    checkPackFiles([
      'package.json',
      'README.md',
      'LICENSE',
      'dist/index.js',
      'dist/index.d.ts',
    ]),
    [],
  );
});

test('rejects sources, specs and tsbuildinfo', () => {
  const errors = checkPackFiles([
    'package.json',
    'src/index.ts',
    'dist/index.spec.js',
    'tsconfig.tsbuildinfo',
  ]);
  assert.equal(errors.length, 3);
});

test('rejects tsup output outside dist/', () => {
  assert.equal(checkPackFiles(['package.json', 'index.js'], 'tsup').length, 1);
});

test('ng-packagr: accepts build output at the package root', () => {
  const files = [
    'package.json',
    'README.md',
    'LICENSE',
    'fesm2022/cds-rte-angular.mjs',
    'fesm2022/cds-rte-angular.mjs.map',
    'types/cds-rte-angular.d.ts',
    'i18n/package.json',
    'i18n/types/cds-rte-angular-i18n.d.ts',
  ];
  assert.deepEqual(checkPackFiles(files, 'ng-packagr'), []);
});

test('ng-packagr: rejects sources, specs, tsbuildinfo and dist/', () => {
  const errors = checkPackFiles(
    [
      'package.json',
      'src/index.ts',
      'fesm2022/a.spec.mjs',
      'tsconfig.tsbuildinfo',
      'dist/index.js',
      'ng-package.json',
    ],
    'ng-packagr',
  );
  assert.equal(errors.length, 5);
});

test('ng-packagr: accepts lazy chunks directly under fesm2022/ (spec 05b2a, R1)', () => {
  assert.deepEqual(
    checkPackFiles(
      [
        'fesm2022/cds-rte-angular-rte-dialogs-AbC123.mjs',
        'fesm2022/cds-rte-angular-rte-dialogs-AbC123.mjs.map',
      ],
      'ng-packagr',
    ),
    [],
  );
});

test('ng-packagr: rejects nested paths and non-.mjs files under fesm2022/', () => {
  assert.equal(checkPackFiles(['fesm2022/a/b.mjs'], 'ng-packagr').length, 1);
  assert.equal(checkPackFiles(['fesm2022/x.ts'], 'ng-packagr').length, 1);
});

test('ng-packagr: accepts CSS files under styles/ (spec 05a, D16)', () => {
  assert.deepEqual(checkPackFiles(['styles/editor.css'], 'ng-packagr'), []);
});

test('ng-packagr: rejects non-CSS files and nested paths under styles/', () => {
  assert.equal(checkPackFiles(['styles/x.js'], 'ng-packagr').length, 1);
  assert.equal(checkPackFiles(['styles/a/b.css'], 'ng-packagr').length, 1);
});

test('checkRequiredFiles reports missing package.json, README.md and LICENSE', () => {
  assert.equal(checkRequiredFiles(['dist/index.js']).length, 3);
  assert.deepEqual(
    checkRequiredFiles([
      'package.json',
      'README.md',
      'LICENSE',
      'dist/index.js',
    ]),
    [],
  );
});

test('nonCodeEntrypoints lists only exports that point to non-code files', () => {
  const exportsField = {
    '.': { types: './dist/index.d.ts', default: './dist/index.js' },
    './theme.css': './dist/theme.css',
  };
  assert.deepEqual(nonCodeEntrypoints(exportsField), ['./theme.css']);
  assert.deepEqual(nonCodeEntrypoints(undefined), []);
});

test('tsup: accepts styles/*.css at the package root (CSS exportado, spec 05b1 U16)', () => {
  assert.deepEqual(checkPackFiles(['styles/content.css'], 'tsup'), []);
  assert.equal(checkPackFiles(['styles/x.js'], 'tsup').length, 1);
  assert.equal(checkPackFiles(['styles/a/b.css'], 'tsup').length, 1);
});

test('rejects the temporary .pkgdoc.d.ts copy left by api-report', () => {
  const errors = checkPackFiles([
    'package.json',
    'dist/index.d.ts',
    'dist/index.pkgdoc.d.ts',
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /pkgdoc/);
});
