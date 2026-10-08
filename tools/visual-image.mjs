// Contêiner da regressão visual (spec 08b, O1): a tag da imagem oficial do Playwright precisa ser
// a versão exata do `@playwright/test` instalado. Funções puras, sem rede nem Docker.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = /playwright:v(\d+\.\d+\.\d+)-noble/g;

/** Versão de `node_modules/@playwright/test` no texto do package-lock.json. */
export function playwrightLockVersion(lockText) {
  const lock = JSON.parse(lockText);
  const version = lock.packages?.['node_modules/@playwright/test']?.version;
  if (!version) {
    throw new Error(
      'package-lock.json: node_modules/@playwright/test ausente (rode npm ci)',
    );
  }
  return version;
}

/** Versões `x.y.z` citadas em tags `playwright:v<x.y.z>-noble` do texto. */
export function imageTags(text) {
  return [...text.matchAll(TAG)].map((m) => m[1]);
}

/**
 * Confere faixa exata, tags dos workflows (e de `tools/visual.mjs`) e ausência de
 * `RTE_VISUAL_DRYRUN` nos workflows. `files` mapeia caminho -> texto.
 * `requireTagIn` lista os arquivos que precisam ter ao menos uma tag.
 */
export function checkImageTags({
  lockVersion,
  pkgSpec,
  files,
  requireTagIn = [],
}) {
  const errors = [];
  if (pkgSpec !== lockVersion) {
    errors.push(
      `package.json: a versão do @playwright/test deve ser exata e igual à do lockfile (${lockVersion}); está "${pkgSpec}"`,
    );
  }
  for (const [path, text] of Object.entries(files)) {
    for (const tag of imageTags(text)) {
      if (tag !== lockVersion) {
        errors.push(
          `${path}: a tag da imagem do Playwright é v${tag}, mas o lockfile tem ${lockVersion}`,
        );
      }
    }
    if (path.endsWith('.yml') && text.includes('RTE_VISUAL_DRYRUN')) {
      errors.push(
        `${path}: RTE_VISUAL_DRYRUN nunca pode aparecer em workflow (só confere estados, não captura)`,
      );
    }
  }
  for (const path of requireTagIn) {
    if (!(path in files)) {
      errors.push(`${path}: arquivo ausente`);
    } else if (imageTags(files[path]).length === 0) {
      errors.push(
        `${path}: nenhuma tag mcr.microsoft.com/playwright:v${lockVersion}-noble`,
      );
    }
  }
  return errors;
}

/** Lê os arquivos reais do repositório e confere (usado por `check:rules` e pelo teste). */
export function checkRepoImageTags(root = ROOT) {
  const read = (p) => readFileSync(join(root, p), 'utf8');
  const wfDir = join(root, '.github/workflows');
  const files = {};
  for (const name of readdirSync(wfDir)) {
    if (name.endsWith('.yml')) {
      files[`.github/workflows/${name}`] = read(`.github/workflows/${name}`);
    }
  }
  files['tools/visual.mjs'] = read('tools/visual.mjs');
  const pkgSpec = JSON.parse(read('package.json')).devDependencies[
    '@playwright/test'
  ];
  return checkImageTags({
    lockVersion: playwrightLockVersion(read('package-lock.json')),
    pkgSpec,
    files,
    requireTagIn: ['.github/workflows/ci.yml'],
  });
}
