import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { crc32, inflateRawSync } from 'node:zlib';
import { buildKit, collectKit, createZip, LEIA_ME } from './kit.mjs';

/** Lê o zip pelo diretório central e confere CRC e tamanho de cada entrada. */
function readZip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26);
    const data = inflateRawSync(buf.subarray(dataStart, dataStart + size));
    assert.equal(crc32(data), crc, name);
    out[name] = data;
    p += 46 + nameLen;
  }
  return out;
}

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'kit-'));
  const put = (path, content) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  put('dist/tarballs/cds-rte-core-0.0.0.tgz', 'tgz-core');
  put('dist/tarballs/cds-rte-theme-0.0.0.tgz', 'tgz-theme');
  put('dist/tarballs/manifest.json', '{"packages":[]}');
  put('examples/server-node/server.mjs', 'export {};');
  put('examples/server-node/test/a.test.mjs', 'x');
  put('examples/server-node/node_modules/x/index.js', 'fora');
  put('examples/server-node/media/m.png', 'fora');
  return root;
}

test('createZip: ida e volta com CRC e nomes UTF-8', () => {
  const zip = createZip([
    { name: 'a/ç.txt', data: 'olá'.repeat(50) },
    { name: 'b.bin', data: Buffer.alloc(0) },
  ]);
  const files = readZip(zip);
  assert.equal(files['a/ç.txt'].toString(), 'olá'.repeat(50));
  assert.equal(files['b.bin'].length, 0);
});

test('collectKit: tarballs, manifest, servidor sem node_modules e LEIA-ME de uma regra', () => {
  const names = collectKit({ repoRoot: repo(), sha: 'abc1234' }).map(
    (e) => e.name,
  );
  assert.deepEqual(names, [
    'rte-kit-abc1234/LEIA-ME.txt',
    'rte-kit-abc1234/kit/cds-rte-core-0.0.0.tgz',
    'rte-kit-abc1234/kit/cds-rte-theme-0.0.0.tgz',
    'rte-kit-abc1234/kit/manifest.json',
    'rte-kit-abc1234/examples/server-node/server.mjs',
    'rte-kit-abc1234/examples/server-node/test/a.test.mjs',
  ]);
  assert.equal(LEIA_ME.trim().split('\n').length, 1);
  assert.match(LEIA_ME, /\.\/kit\/\*\.tgz/);
});

test('buildKit: grava rte-kit-<sha>.zip legível', () => {
  const root = repo();
  const { file } = buildKit({ repoRoot: root, sha: 'abc1234' });
  assert.equal(file, join(root, 'dist', 'rte-kit-abc1234.zip'));
  const files = readZip(readFileSync(file));
  assert.equal(
    files['rte-kit-abc1234/kit/cds-rte-core-0.0.0.tgz'].toString(),
    'tgz-core',
  );
});

test('collectKit: sem pack, falha com a instrução', () => {
  const root = mkdtempSync(join(tmpdir(), 'kit-'));
  assert.throws(
    () => collectKit({ repoRoot: root, sha: 'x' }),
    /consumer\.mjs pack/,
  );
});
