import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  CONSUMER_MARK,
  applyVersions,
  PACKAGES,
  buildManifest,
  commandsFor,
  packDirOf,
  parseNpmCommand,
  prepareConsumer,
  resolveConsumerDir,
  rewriteDependencies,
  runPack,
  verifyOrigin,
} from './consumer.mjs';

const sha = (bytes) =>
  `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

const MANIFEST = {
  packages: [
    {
      name: '@cds/rte-core',
      version: '0.0.0',
      file: 'cds-rte-core-0.0.0.tgz',
      integrity: sha('core'),
    },
    {
      name: '@cds/rte-theme',
      version: '0.0.0',
      file: 'cds-rte-theme-0.0.0.tgz',
      integrity: sha('theme'),
    },
  ],
};

test('rewriteDependencies troca só @cds/* por file: com barras', () => {
  const pkg = {
    name: 'demo',
    dependencies: {
      '@cds/rte-core': '0.0.0',
      '@angular/core': '22.2.1',
    },
    devDependencies: { '@cds/rte-theme': '0.0.0', vitest: '4.1.11' },
  };
  const out = rewriteDependencies(
    pkg,
    MANIFEST,
    'C:\\Users\\x y\\repo\\dist\\tarballs',
  );
  assert.equal(
    out.dependencies['@cds/rte-core'],
    'file:C:/Users/x y/repo/dist/tarballs/cds-rte-core-0.0.0.tgz',
  );
  assert.equal(
    out.devDependencies['@cds/rte-theme'],
    'file:C:/Users/x y/repo/dist/tarballs/cds-rte-theme-0.0.0.tgz',
  );
  assert.equal(out.dependencies['@angular/core'], '22.2.1');
  assert.equal(out.devDependencies.vitest, '4.1.11');
});

test('rewriteDependencies não muta a entrada', () => {
  const pkg = { dependencies: { '@cds/rte-core': '0.0.0' } };
  const copy = structuredClone(pkg);
  rewriteDependencies(pkg, MANIFEST, '/t');
  assert.deepEqual(pkg, copy);
});

test('rewriteDependencies falha se faltar o tarball', () => {
  assert.throws(
    () =>
      rewriteDependencies(
        { dependencies: { '@cds/rte-angular': '0.0.0' } },
        MANIFEST,
        '/t',
      ),
    /tarball.*@cds[/]rte-angular/,
  );
});

test('buildManifest lê nome e versão da entrada, calcula sha512 e ordena', () => {
  const manifest = buildManifest([
    {
      name: '@cds/rte-theme',
      version: '1.2.3',
      file: 'cds-rte-theme-1.2.3.tgz',
      bytes: Buffer.from('theme'),
    },
    {
      name: '@cds/rte-core',
      version: '1.2.3',
      file: 'cds-rte-core-1.2.3.tgz',
      bytes: Buffer.from('core'),
    },
  ]);
  assert.deepEqual(
    manifest.packages.map((p) => p.name),
    ['@cds/rte-core', '@cds/rte-theme'],
  );
  assert.equal(manifest.packages[0].version, '1.2.3');
  assert.equal(manifest.packages[0].file, 'cds-rte-core-1.2.3.tgz');
  assert.equal(manifest.packages[0].integrity, sha('core'));
  assert.equal(manifest.packages[1].integrity, sha('theme'));
});

test('buildManifest recusa entrada sem nome ou versão', () => {
  assert.throws(() =>
    buildManifest([{ file: 'x.tgz', bytes: Buffer.from('x') }]),
  );
});

test('resolveConsumerDir: RTE_CONSUMER_DIR vence', () => {
  const root = tmp('repo-');
  const dir = tmp('out-');
  assert.equal(
    resolveConsumerDir(
      { RTE_CONSUMER_DIR: dir, RUNNER_TEMP: '/r', TMPDIR: '/t' },
      root,
    ),
    resolve(dir),
  );
});

test('resolveConsumerDir: no CI usa RUNNER_TEMP; senão TMPDIR', () => {
  const root = tmp('repo-');
  const out = tmp('out-');
  assert.equal(
    resolveConsumerDir({ CI: 'true', RUNNER_TEMP: out, TMPDIR: '/t' }, root),
    join(resolve(out), 'cds-rte-consumer', 'demo'),
  );
  assert.equal(
    resolveConsumerDir({ TMPDIR: out }, root),
    join(resolve(out), 'cds-rte-consumer', 'demo'),
  );
});

test('resolveConsumerDir recusa diretório dentro do repositório', () => {
  const root = tmp('repo-');
  assert.throws(
    () =>
      resolveConsumerDir({ RTE_CONSUMER_DIR: join(root, 'dist', 'x') }, root),
    /dentro do repositório/,
  );
  assert.throws(
    () => resolveConsumerDir({ RTE_CONSUMER_DIR: root }, root),
    /dentro do repositório/,
  );
  // o repositório dentro do consumidor também é recusado
  assert.throws(
    () => resolveConsumerDir({ RTE_CONSUMER_DIR: join(root, '..') }, root),
    /dentro do repositório|contém o repositório/,
  );
});

test('parseNpmCommand separa o comando em palavras', () => {
  assert.deepEqual(parseNpmCommand(undefined), ['npm']);
  assert.deepEqual(parseNpmCommand('npx -y npm@11'), ['npx', '-y', 'npm@11']);
});

test('packDirOf: tsup em packages/, ng-packagr em dist/packages/', () => {
  const root = '/repo';
  assert.equal(packDirOf(root, 'core'), join(root, 'packages', 'core'));
  assert.equal(
    packDirOf(root, 'angular'),
    join(root, 'dist', 'packages', 'angular'),
  );
  assert.equal(
    packDirOf(root, 'render'),
    join(root, 'dist', 'packages', 'render'),
  );
  assert.deepEqual(
    PACKAGES.map((p) => p.dir),
    ['core', 'sanitizer', 'theme', 'angular', 'render'],
  );
});

test('runPack roda npm pack por pacote com executor injetado e grava o manifest', () => {
  const root = tmp('repo-');
  for (const p of PACKAGES) {
    const d = packDirOf(root, p.dir);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'package.json'), '{}');
  }
  const calls = [];
  const exec = (cmd, args, opts) => {
    calls.push({ cmd, args, cwd: opts.cwd });
    const dest = args[args.indexOf('--pack-destination') + 1];
    const name = opts.cwd.split(/[\\/]/).pop();
    const filename = `cds-rte-${name}-0.0.0.tgz`;
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, filename), `bytes-${name}`);
    return JSON.stringify([
      { name: `@cds/rte-${name}`, version: '0.0.0', filename },
    ]);
  };
  const manifest = runPack({ repoRoot: root, npm: ['npm'], exec, fs });
  assert.equal(calls.length, 5);
  assert.ok(calls.every((c) => c.args[0] === 'pack'));
  assert.ok(calls.every((c) => c.args.includes('--json')));
  assert.equal(manifest.packages.length, 5);
  const written = JSON.parse(
    readFileSync(join(root, 'dist', 'tarballs', 'manifest.json'), 'utf8'),
  );
  assert.deepEqual(written, manifest);
  assert.equal(written.packages[0].integrity, sha('bytes-angular'));
});

test('prepareConsumer copia o demo sem node_modules/dist/.angular e reescreve o package.json', () => {
  const root = tmp('repo-');
  const out = tmp('out-');
  const demo = join(root, 'apps', 'demo');
  mkdirSync(join(demo, 'src'), { recursive: true });
  mkdirSync(join(demo, 'node_modules', 'x'), { recursive: true });
  mkdirSync(join(demo, 'dist'), { recursive: true });
  mkdirSync(join(demo, '.angular'), { recursive: true });
  writeFileSync(join(demo, 'src', 'a.ts'), 'a');
  writeFileSync(join(demo, 'node_modules', 'x', 'i.js'), 'x');
  writeFileSync(
    join(demo, 'package.json'),
    JSON.stringify({ dependencies: { '@cds/rte-core': '0.0.0' } }),
  );
  mkdirSync(join(root, 'dist', 'tarballs'), { recursive: true });
  writeFileSync(
    join(root, 'dist', 'tarballs', 'manifest.json'),
    JSON.stringify(MANIFEST),
  );
  // restos de uma rodada anterior: o que é do demo some, node_modules de terceiros fica
  const consumer = join(out, 'c');
  mkdirSync(join(consumer, 'node_modules', '@cds', 'rte-core'), {
    recursive: true,
  });
  writeFileSync(join(consumer, CONSUMER_MARK), '');
  mkdirSync(join(consumer, 'node_modules', 'rxjs'), { recursive: true });
  writeFileSync(join(consumer, 'node_modules', '.package-lock.json'), '{}');
  writeFileSync(join(consumer, 'velho.txt'), 'velho');
  writeFileSync(join(consumer, 'package-lock.json'), '{}');

  prepareConsumer({ repoRoot: root, consumerDir: consumer, fs });

  assert.ok(existsSync(join(consumer, 'src', 'a.ts')));
  assert.ok(!existsSync(join(consumer, 'velho.txt')));
  assert.ok(!existsSync(join(consumer, 'package-lock.json')));
  assert.ok(!existsSync(join(consumer, 'node_modules', '@cds')));
  assert.ok(!existsSync(join(consumer, 'node_modules', '.package-lock.json')));
  assert.ok(existsSync(join(consumer, 'node_modules', 'rxjs')));
  assert.ok(!existsSync(join(consumer, 'node_modules', 'x')));
  const pkg = JSON.parse(readFileSync(join(consumer, 'package.json'), 'utf8'));
  assert.match(
    pkg.dependencies['@cds/rte-core'],
    /^file:.*cds-rte-core-0\.0\.0\.tgz$/,
  );
  assert.ok(!pkg.dependencies['@cds/rte-core'].includes('\\'));
  assert.ok(existsSync(join(consumer, 'manifest.json')));
});

test('prepareConsumer recusa diretório dentro do repositório', () => {
  const root = tmp('repo-');
  assert.throws(
    () =>
      prepareConsumer({
        repoRoot: root,
        consumerDir: join(root, 'x'),
        fs,
      }),
    /dentro do repositório/,
  );
});

function demoRepo() {
  const root = tmp('repo-');
  const demo = join(root, 'apps', 'demo');
  mkdirSync(demo, { recursive: true });
  writeFileSync(join(demo, 'package.json'), '{}');
  mkdirSync(join(root, 'dist', 'tarballs'), { recursive: true });
  writeFileSync(
    join(root, 'dist', 'tarballs', 'manifest.json'),
    JSON.stringify(MANIFEST),
  );
  return root;
}

test('prepareConsumer recusa diretório não vazio sem a marca e não apaga nada', () => {
  const root = demoRepo();
  const consumer = join(tmp('out-'), 'c');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'meu-trabalho.txt'), 'importante');
  assert.throws(
    () => prepareConsumer({ repoRoot: root, consumerDir: consumer, fs }),
    /não está vazio e não tem a marca/,
  );
  assert.equal(
    readFileSync(join(consumer, 'meu-trabalho.txt'), 'utf8'),
    'importante',
  );
  assert.ok(!existsSync(join(consumer, CONSUMER_MARK)));
});

test('prepareConsumer grava a marca em diretório novo ou vazio e a mantém na segunda rodada', () => {
  const root = demoRepo();
  const out = tmp('out-');
  for (const consumer of [join(out, 'novo'), tmp('vazio-')]) {
    prepareConsumer({ repoRoot: root, consumerDir: consumer, fs });
    assert.ok(existsSync(join(consumer, CONSUMER_MARK)));
    writeFileSync(join(consumer, 'resto.txt'), 'x');
    prepareConsumer({ repoRoot: root, consumerDir: consumer, fs });
    assert.ok(existsSync(join(consumer, CONSUMER_MARK)));
    assert.ok(!existsSync(join(consumer, 'resto.txt')));
  }
});

test('o consumidor sob um link que aponta para dentro do repositório é recusado (realpath)', () => {
  const root = demoRepo();
  const out = tmp('out-');
  const link = join(out, 'link');
  symlinkSync(root, link, 'junction');
  const viaLink = join(link, 'novo');
  assert.throws(
    () => resolveConsumerDir({ RTE_CONSUMER_DIR: viaLink }, root),
    /dentro do repositório/,
  );
  assert.throws(
    () => prepareConsumer({ repoRoot: root, consumerDir: viaLink, fs }),
    /dentro do repositório/,
  );
  // link que aponta para um ancestral do repositório: o consumidor o contém
  const up = join(out, 'up');
  symlinkSync(resolve(root, '..'), up, 'junction');
  assert.throws(
    () => resolveConsumerDir({ RTE_CONSUMER_DIR: up }, root),
    /contém o repositório/,
  );
});

// ---- prova de origem ----

/** Consumidor falso: node_modules/@cds/<pkg> real + lockfile oculto do npm. */
function fakeInstall({ integrity = {}, versions = {}, dir } = {}) {
  const consumer = dir ?? tmp('consumer-');
  mkdirSync(consumer, { recursive: true });
  const lock = { packages: {} };
  for (const p of MANIFEST.packages) {
    const dir = join(consumer, 'node_modules', p.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: p.name, version: versions[p.name] ?? p.version }),
    );
    lock.packages[`node_modules/${p.name}`] = {
      version: p.version,
      integrity: integrity[p.name] ?? p.integrity,
    };
  }
  writeFileSync(
    join(consumer, 'node_modules', '.package-lock.json'),
    JSON.stringify(lock),
  );
  return consumer;
}

test('verifyOrigin aceita diretórios reais com o sha do manifest', () => {
  const consumer = fakeInstall();
  assert.deepEqual(
    verifyOrigin(consumer, MANIFEST, fs, { repoRoot: tmp('repo-') }),
    [],
  );
});

test('verifyOrigin recusa node_modules num ancestral do consumidor', () => {
  const parent = tmp('ancestral-');
  mkdirSync(join(parent, 'node_modules'));
  const consumer = fakeInstall({ dir: join(parent, 'c') });
  const errors = verifyOrigin(consumer, MANIFEST, fs, {
    repoRoot: tmp('repo-'),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /node_modules em .*ancestral/);
});

test('verifyOrigin recusa symlink', () => {
  const consumer = fakeInstall();
  const alvo = tmp('alvo-');
  writeFileSync(
    join(alvo, 'package.json'),
    JSON.stringify({ name: '@cds/rte-core', version: '0.0.0' }),
  );
  const link = join(consumer, 'node_modules', '@cds', 'rte-core');
  rmSync(link, { recursive: true });
  symlinkSync(alvo, link, 'junction');
  const errors = verifyOrigin(consumer, MANIFEST, fs, {
    repoRoot: tmp('repo-'),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /@cds\/rte-core/);
  assert.match(errors[0], /link simbólico/);
});

test('verifyOrigin recusa realpath fora de node_modules do consumidor', () => {
  const consumer = fakeInstall();
  const fora = tmp('fora-');
  // o escopo inteiro vira um link: o pacote em si é um diretório "real" dentro do alvo
  mkdirSync(join(fora, 'rte-core'), { recursive: true });
  writeFileSync(
    join(fora, 'rte-core', 'package.json'),
    JSON.stringify({ name: '@cds/rte-core', version: '0.0.0' }),
  );
  mkdirSync(join(fora, 'rte-theme'), { recursive: true });
  writeFileSync(
    join(fora, 'rte-theme', 'package.json'),
    JSON.stringify({ name: '@cds/rte-theme', version: '0.0.0' }),
  );
  rmSync(join(consumer, 'node_modules', '@cds'), { recursive: true });
  symlinkSync(fora, join(consumer, 'node_modules', '@cds'), 'junction');
  const errors = verifyOrigin(consumer, MANIFEST, fs, {
    repoRoot: tmp('repo-'),
  });
  assert.ok(errors.length >= 1);
  assert.ok(errors.some((e) => /@cds\/rte-core/.test(e) && /fora de/.test(e)));
});

test('verifyOrigin recusa pacote que resolve para dentro do repositório', () => {
  const repo = tmp('repo-');
  mkdirSync(join(repo, 'packages', 'core'), { recursive: true });
  writeFileSync(
    join(repo, 'packages', 'core', 'package.json'),
    JSON.stringify({ name: '@cds/rte-core', version: '0.0.0' }),
  );
  const consumer = fakeInstall();
  const link = join(consumer, 'node_modules', '@cds', 'rte-core');
  rmSync(link, { recursive: true });
  symlinkSync(join(repo, 'packages', 'core'), link, 'junction');
  const errors = verifyOrigin(consumer, MANIFEST, fs, { repoRoot: repo });
  assert.ok(errors.some((e) => /@cds\/rte-core/.test(e)));
});

test('verifyOrigin recusa consumidor dentro do repositório', () => {
  const repo = tmp('repo-');
  const consumer = join(repo, 'consumer');
  mkdirSync(join(consumer, 'node_modules', '@cds', 'rte-core'), {
    recursive: true,
  });
  const errors = verifyOrigin(consumer, MANIFEST, fs, { repoRoot: repo });
  assert.ok(errors.some((e) => /dentro do repositório/.test(e)));
});

test('verifyOrigin recusa sha diferente e versão diferente', () => {
  const diff = fakeInstall({
    integrity: { '@cds/rte-core': sha('outro') },
    versions: { '@cds/rte-theme': '9.9.9' },
  });
  const errors = verifyOrigin(diff, MANIFEST, fs, { repoRoot: tmp('repo-') });
  assert.ok(errors.some((e) => /@cds\/rte-core/.test(e) && /sha512/.test(e)));
  assert.ok(errors.some((e) => /@cds\/rte-theme/.test(e) && /versão/.test(e)));
});

test('verifyOrigin recusa pacote ausente e lockfile oculto ausente', () => {
  const consumer = tmp('consumer-');
  mkdirSync(join(consumer, 'node_modules'), { recursive: true });
  const errors = verifyOrigin(consumer, MANIFEST, fs, {
    repoRoot: tmp('repo-'),
  });
  assert.ok(errors.some((e) => /@cds\/rte-core/.test(e)));
});

// ---- subcomandos ----

test('commandsFor: ng build/test no cwd do consumidor, sem npx', () => {
  const c = '/consumer';
  const build = commandsFor('build', { consumerDir: c });
  assert.equal(build.cwd, c);
  assert.equal(build.cmd, process.execPath);
  assert.deepEqual(build.args.slice(-1), ['build']);
  assert.match(
    build.args[0].replaceAll('\\', '/'),
    /node_modules\/@angular\/cli\/bin\/ng\.js$/,
  );
  const t = commandsFor('test', { consumerDir: c });
  assert.deepEqual(t.args.slice(-2), ['test', '--watch=false']);
});

test('subcomando desconhecido falha', async () => {
  const { main } = await import('./consumer.mjs');
  await assert.rejects(() => main(['nada'], {}), /desconhecido/);
});

// ---- --versions (spec 08a, X3) ----

const VERSIONS = {
  name: 'compat (latest×latest)',
  angular: { version: '22.4.0', toolingVersion: '22.4.2' },
  tiptap: { version: '3.35.0' },
  legacyPeerDeps: false,
};

test('applyVersions reescreve framework, ferramentas e Tiptap; o resto fica', () => {
  const pkg = {
    dependencies: {
      '@angular/core': '22.2.1',
      '@angular/router': '22.2.1',
      '@tiptap/core': '3.31.4',
      '@tiptap/pm': '3.31.4',
      '@cds/rte-core': 'file:/x.tgz',
      rxjs: '7.8.2',
    },
    devDependencies: {
      '@angular/cli': '22.2.1',
      '@angular/build': '22.2.1',
      '@angular/compiler-cli': '22.2.1',
      '@angular-devkit/core': '22.2.1',
      vitest: '4.1.11',
    },
  };
  const out = applyVersions(pkg, VERSIONS);
  assert.equal(out.dependencies['@angular/core'], '22.4.0');
  assert.equal(out.dependencies['@angular/router'], '22.4.0');
  assert.equal(out.devDependencies['@angular/compiler-cli'], '22.4.0');
  assert.equal(out.devDependencies['@angular/cli'], '22.4.2');
  assert.equal(out.devDependencies['@angular/build'], '22.4.2');
  assert.equal(out.devDependencies['@angular-devkit/core'], '22.4.2');
  assert.equal(out.dependencies['@tiptap/core'], '3.35.0');
  assert.equal(out.dependencies['@tiptap/pm'], '3.35.0');
  assert.equal(out.dependencies['@cds/rte-core'], 'file:/x.tgz');
  assert.equal(out.dependencies.rxjs, '7.8.2');
  assert.equal(out.devDependencies.vitest, '4.1.11');
  assert.equal(
    pkg.dependencies['@angular/core'],
    '22.2.1',
    'não muta a entrada',
  );
});

test('prepareConsumer com versions reescreve só a cópia, nunca o apps/demo do repositório', () => {
  const root = tmp('repo-');
  const out = tmp('out-');
  const demo = join(root, 'apps', 'demo');
  mkdirSync(demo, { recursive: true });
  const original = JSON.stringify({
    dependencies: {
      '@angular/core': '22.2.1',
      '@tiptap/core': '3.31.4',
      '@cds/rte-core': '0.0.0',
    },
  });
  writeFileSync(join(demo, 'package.json'), original);
  mkdirSync(join(root, 'dist', 'tarballs'), { recursive: true });
  writeFileSync(
    join(root, 'dist', 'tarballs', 'manifest.json'),
    JSON.stringify(MANIFEST),
  );
  const consumer = join(out, 'c');
  prepareConsumer({
    repoRoot: root,
    consumerDir: consumer,
    fs,
    versions: VERSIONS,
  });
  const pkg = JSON.parse(readFileSync(join(consumer, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['@angular/core'], '22.4.0');
  assert.equal(pkg.dependencies['@tiptap/core'], '3.35.0');
  assert.match(pkg.dependencies['@cds/rte-core'], /^file:/);
  assert.equal(readFileSync(join(demo, 'package.json'), 'utf8'), original);
});

function withInstalled(consumer, { core = '22.4.0', tiptap = '3.35.0' } = {}) {
  for (const [name, version] of [
    ['@angular/core', core],
    ['@tiptap/core', tiptap],
  ]) {
    const dir = join(consumer, 'node_modules', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version }));
  }
  return consumer;
}

test('verifyOrigin com versions confere @angular/core e @tiptap/core instalados', () => {
  const ok = withInstalled(fakeInstall());
  assert.deepEqual(
    verifyOrigin(ok, MANIFEST, fs, {
      repoRoot: tmp('repo-'),
      versions: VERSIONS,
    }),
    [],
  );
  const wrong = withInstalled(fakeInstall(), { core: '22.2.1' });
  const errors = verifyOrigin(wrong, MANIFEST, fs, {
    repoRoot: tmp('repo-'),
    versions: VERSIONS,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], new RegExp('@angular/core.*22[.]2[.]1.*22[.]4[.]0'));
  const missing = fakeInstall();
  const gone = verifyOrigin(missing, MANIFEST, fs, {
    repoRoot: tmp('repo-'),
    versions: VERSIONS,
  });
  assert.equal(gone.length, 2);
  assert.match(gone[1], new RegExp('@tiptap/core'));
});

test('main com --versions repassa --legacy-peer-deps ao npm install quando a perna é next', async () => {
  const { main } = await import('./consumer.mjs');
  const root = tmp('repo-');
  const out = tmp('out-');
  const consumer = join(out, 'c');
  mkdirSync(join(root, 'apps', 'demo'), { recursive: true });
  writeFileSync(
    join(root, 'apps', 'demo', 'package.json'),
    JSON.stringify({ dependencies: { '@cds/rte-core': '0.0.0' } }),
  );
  mkdirSync(join(root, 'dist', 'tarballs'), { recursive: true });
  writeFileSync(
    join(root, 'dist', 'tarballs', 'manifest.json'),
    JSON.stringify(MANIFEST),
  );
  const next = {
    ...VERSIONS,
    angular: { version: '23.0.0-next.1', toolingVersion: '23.0.0-next.2' },
    legacyPeerDeps: true,
  };
  const versionsPath = join(out, 'versions.json');
  writeFileSync(versionsPath, JSON.stringify(next));
  const installs = [];
  const exec = (cmd, args) => {
    installs.push({ cmd, args });
    fakeInstall({ dir: consumer });
    withInstalled(consumer, { core: '23.0.0-next.1' });
  };
  await main(
    ['prepare', 'install', '--versions', versionsPath],
    { RTE_CONSUMER_DIR: consumer, RTE_NPM: 'npm' },
    { exec, repoRoot: root, fs },
  );
  assert.equal(installs.length, 1);
  assert.ok(installs[0].args.includes('--legacy-peer-deps'));
  const pkg = JSON.parse(readFileSync(join(consumer, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['@cds/rte-core'].startsWith('file:'), true);

  // sem legacyPeerDeps e sem a opção: o install continua o da 07b
  writeFileSync(
    versionsPath,
    JSON.stringify({ ...next, legacyPeerDeps: false }),
  );
  installs.length = 0;
  await main(
    ['prepare', 'install', '--versions', versionsPath],
    { RTE_CONSUMER_DIR: consumer, RTE_NPM: 'npm' },
    { exec, repoRoot: root, fs },
  );
  assert.ok(!installs[0].args.includes('--legacy-peer-deps'));
  installs.length = 0;
  await main(
    ['prepare', 'install'],
    { RTE_CONSUMER_DIR: consumer, RTE_NPM: 'npm' },
    { exec, repoRoot: root, fs },
  );
  assert.deepEqual(installs[0].args, ['install', '--no-audit', '--no-fund']);
});
