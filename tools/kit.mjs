#!/usr/bin/env node
// Monta o kit do teste de 15 minutos (spec 07d, L9/L10): `dist/rte-kit-<sha>.zip` com os tarballs
// (`kit/*.tgz` + `kit/manifest.json`, gerados por `node tools/consumer.mjs pack`), o servidor de
// exemplo (`examples/server-node`, sem `node_modules`) e um `LEIA-ME.txt` com uma única regra.
// Sem dependência nova: o zip é escrito aqui com `node:zlib` (deflate + CRC-32).
// Uso: node tools/kit.mjs [--sha <sha>] [--out <dir>]
import { execFileSync } from 'node:child_process';
import * as nodeFs from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', 'media', '.git']);

export const LEIA_ME =
  'Onde o guia manda instalar os pacotes @cds/rte-* do registro, instale os arquivos ./kit/*.tgz.\n';

/** Zip mínimo (deflate, nomes UTF-8, data fixa 1980-01-01 para ser reprodutível). */
export function createZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const packed = deflateRawSync(raw);
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, packed);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

function walkFiles(dir, fs) {
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) out.push(...walkFiles(full, fs));
    } else out.push(full);
  }
  return out;
}

/** Reúne as entradas do kit: devolve `[{ name, data }]` com a raiz `rte-kit-<sha>/`. */
export function collectKit({ repoRoot = REPO, sha, fs = nodeFs }) {
  if (!sha) throw new Error('sha do commit ausente (git rev-parse --short HEAD)');
  const root = `rte-kit-${sha}`;
  const tarballs = join(repoRoot, 'dist', 'tarballs');
  const manifest = join(tarballs, 'manifest.json');
  if (!fs.existsSync(manifest))
    throw new Error(
      `${manifest} não existe: rode "node tools/consumer.mjs pack" antes (depois do build dos pacotes)`,
    );
  const names = fs
    .readdirSync(tarballs)
    .filter((n) => n.endsWith('.tgz'))
    .sort();
  if (!names.length) throw new Error(`nenhum .tgz em ${tarballs}`);
  const entries = [{ name: `${root}/LEIA-ME.txt`, data: LEIA_ME }];
  for (const n of names)
    entries.push({
      name: `${root}/kit/${n}`,
      data: fs.readFileSync(join(tarballs, n)),
    });
  entries.push({
    name: `${root}/kit/manifest.json`,
    data: fs.readFileSync(manifest),
  });
  const server = join(repoRoot, 'examples', 'server-node');
  if (!fs.existsSync(server)) throw new Error(`${server} não existe`);
  for (const file of walkFiles(server, fs))
    entries.push({
      name: `${root}/examples/server-node/${relative(server, file).split(sep).join('/')}`,
      data: fs.readFileSync(file),
    });
  return entries;
}

export function buildKit({ repoRoot = REPO, sha, outDir, fs = nodeFs }) {
  const entries = collectKit({ repoRoot, sha, fs });
  const file = join(outDir ?? join(repoRoot, 'dist'), `rte-kit-${sha}.zip`);
  fs.mkdirSync(dirname(file), { recursive: true });
  fs.writeFileSync(file, createZip(entries));
  return { file, entries: entries.map((e) => e.name) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (n) => {
    const i = process.argv.indexOf(n);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  try {
    const sha =
      arg('--sha') ??
      execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: REPO,
        encoding: 'utf8',
      }).trim();
    const { file, entries } = buildKit({ sha, outDir: arg('--out') });
    console.log(`kit: ${file} (${entries.length} arquivos)`);
  } catch (e) {
    console.error(`kit: ${e.message}`);
    process.exit(1);
  }
}
