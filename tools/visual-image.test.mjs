import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkImageTags,
  checkRepoImageTags,
  imageTags,
  playwrightLockVersion,
} from './visual-image.mjs';

const lock = JSON.stringify({
  packages: { 'node_modules/@playwright/test': { version: '1.63.1' } },
});

const ci = (v) =>
  `container:\n  image: mcr.microsoft.com/playwright:v${v}-noble\n`;

test('playwrightLockVersion lê a versão do lockfile', () => {
  assert.equal(playwrightLockVersion(lock), '1.63.1');
});

test('playwrightLockVersion falha sem o pacote', () => {
  assert.throws(() => playwrightLockVersion('{"packages":{}}'), /ausente/);
});

test('imageTags extrai as tags', () => {
  assert.deepEqual(
    imageTags('a playwright:v1.63.0-noble b playwright:v1.62.0-noble'),
    ['1.63.0', '1.62.0'],
  );
});

test('faixa não exata reprova', () => {
  const errors = checkImageTags({
    lockVersion: '1.63.1',
    pkgSpec: '^1.63.0',
    files: { '.github/workflows/ci.yml': ci('1.63.1') },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /exata/);
  assert.match(errors[0], /\^1\.63\.0/);
});

test('versão exata e tags iguais passam', () => {
  assert.deepEqual(
    checkImageTags({
      lockVersion: '1.63.1',
      pkgSpec: '1.63.1',
      files: {
        '.github/workflows/ci.yml': ci('1.63.1'),
        '.github/workflows/visual-update.yml': ci('1.63.1'),
      },
      requireTagIn: ['.github/workflows/ci.yml'],
    }),
    [],
  );
});

test('tag divergente reprova com os dois números e o arquivo', () => {
  const errors = checkImageTags({
    lockVersion: '1.63.1',
    pkgSpec: '1.63.1',
    files: { '.github/workflows/visual-update.yml': ci('1.62.0') },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /visual-update\.yml/);
  assert.match(errors[0], /v1\.62\.0/);
  assert.match(errors[0], /1\.63\.1/);
});

test('workflow com RTE_VISUAL_DRYRUN reprova', () => {
  const errors = checkImageTags({
    lockVersion: '1.63.1',
    pkgSpec: '1.63.1',
    files: {
      '.github/workflows/ci.yml': `${ci('1.63.1')}env:\n  RTE_VISUAL_DRYRUN: '1'\n`,
    },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /RTE_VISUAL_DRYRUN/);
});

test('tag ausente no arquivo exigido reprova', () => {
  const errors = checkImageTags({
    lockVersion: '1.63.1',
    pkgSpec: '1.63.1',
    files: { '.github/workflows/ci.yml': 'jobs: {}' },
    requireTagIn: ['.github/workflows/ci.yml'],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /nenhuma tag/);
});

test('o repositório real está consistente', () => {
  assert.deepEqual(checkRepoImageTags(), []);
});
