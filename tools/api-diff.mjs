#!/usr/bin/env node
// Guarda de mudança de API (spec 09c, AP9): quando um relatório de API (TS, CSS ou o esquema de
// HTML) muda num PR, o PR precisa de changeset do pacote, com o tipo mínimo certo: remoção ou
// alteração exige `minor` em 0.x e `major` a partir de 1.0.0; só acréscimo exige ao menos `patch`.
// A comparação é por declaração (EOL, espaços e comentários do api-extractor não contam).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const eol = (text) => text.replace(/\r\n/g, '\n');
const norm = (text) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/ ([;,])/g, '$1')
    .trim();
const STRING_RE = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g;
const NAME = String.raw`[\p{L}\p{N}_$ɵ]+`;

function depthDelta(line) {
  const s = line.replace(STRING_RE, '""');
  let d = 0;
  for (const ch of s) {
    if ('{[('.includes(ch)) d++;
    else if ('}])'.includes(ch)) d--;
  }
  return d;
}

/** Quebra uma lista de linhas em pedaços (declarações ou membros) com os comentários anteriores. */
function chunk(lines, { skipImports, endRe }) {
  const out = [];
  let pending = [];
  let buf = [];
  let depth = 0;
  for (const line of lines) {
    const t = line.trim();
    if (buf.length === 0) {
      if (t === '') continue;
      if (t.startsWith('//')) {
        pending.push(t);
        continue;
      }
      if (skipImports && t.startsWith('import ')) {
        pending = [];
        continue;
      }
    }
    buf.push(line);
    depth += depthDelta(line);
    if (depth <= 0 && endRe.test(t)) {
      out.push({ lines: buf, comments: pending });
      buf = [];
      pending = [];
      depth = 0;
    }
  }
  if (buf.length) out.push({ lines: buf, comments: pending });
  return out;
}

const DECL_RE = new RegExp(
  String.raw`^export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(const\s+enum|class|interface|function|type|enum|const|let|var|namespace)\s+(${NAME})`,
  'u',
);
const MEMBER_RE = new RegExp(
  String.raw`^((?:(?:static|readonly|abstract|protected|private|public|declare)\s+)*)((?:get|set)\s+)?(\[[^\]]+\]|${NAME})`,
  'u',
);

function tagMarker(comments) {
  for (const c of comments) {
    const m = /^\/\/\s*@(internal|alpha|beta)\b/.exec(c);
    if (m) return ` [@${m[1]}]`;
  }
  return '';
}

function put(map, key, text) {
  let k = key;
  for (let i = 2; map.has(k); i++) k = `${key}#${i}`;
  map.set(k, text);
  return k;
}

function parseTs(text) {
  const map = new Map();
  const start = text.indexOf('```ts');
  const body = start < 0 ? text : text.slice(start + 5);
  const end = body.lastIndexOf('```');
  const lines = (end < 0 ? body : body.slice(0, end)).split('\n');
  for (const decl of chunk(lines, { skipImports: true, endRe: /[;}]$/ })) {
    const head = decl.lines[0].trim();
    const m = DECL_RE.exec(head);
    const key = m ? `${m[1]} ${m[2]}` : norm(head);
    const marker = tagMarker(decl.comments);
    const hasBody =
      m &&
      /^(class|interface|enum|namespace|const enum)$/.test(m[1]) &&
      head.endsWith('{');
    if (!hasBody) {
      const k = put(map, key, norm(decl.lines.join(' ')) + marker);
      if (decl.comments.some((c) => /@deprecated/.test(c)))
        map.set(`${k}@deprecated`, 'deprecated');
      continue;
    }
    const k = put(map, key, norm(head) + marker);
    if (decl.comments.some((c) => /@deprecated/.test(c)))
      map.set(`${k}@deprecated`, 'deprecated');
    const inner = decl.lines.slice(1, -1);
    for (const member of chunk(inner, {
      skipImports: false,
      endRe: /[;,}]$/,
    })) {
      const first = member.lines[0].trim();
      const mm = MEMBER_RE.exec(first);
      const name = mm
        ? `${/\bstatic\b/.test(mm[1]) ? 'static ' : ''}${mm[2] ?? ''}${mm[3]}`
        : norm(first);
      const mk = put(map, `${k}::${name}`, norm(member.lines.join(' ')));
      if (member.comments.some((c) => /@deprecated/.test(c)))
        map.set(`${mk}@deprecated`, 'deprecated');
    }
  }
  return map;
}

function parseCss(text) {
  const map = new Map();
  let section = '';
  for (const line of text.split('\n')) {
    const h = /^##\s+(.+)$/.exec(line);
    if (h) {
      section = h[1].trim();
      continue;
    }
    const m = /^-\s+`(.+?)`\s+—\s+(public|internal)\s*$/.exec(line);
    // Só o que é público entra no contrato; item interno que muda não pede nada.
    if (m && m[2] === 'public') map.set(`${section}::${m[1]}`, 'public');
  }
  return map;
}

function parseSchema(text) {
  const map = new Map();
  const lines = text.split('\n');
  let section = '';
  lines.forEach((line, i) => {
    const h = /^##\s+(.+)$/.exec(line);
    if (h) {
      section = h[1].trim();
      return;
    }
    if (/^Versão do esquema/.test(line)) {
      map.set('versão', norm(line));
      return;
    }
    if (!line.startsWith('|')) return;
    if (/^\|[\s:|-]+\|$/.test(line.trim())) return;
    if (/^\|[\s:|-]+\|$/.test((lines[i + 1] ?? '').trim())) return; // cabeçalho
    const first = line.split('|')[1]?.replace(/`/g, '').trim() ?? line;
    put(map, `${section}::${first}`, norm(line));
  });
  return map;
}

/** Relatório -> Map<declaração normalizada, texto normalizado>. Reconhece TS, CSS e esquema. */
export function parseReport(text) {
  const t = eol(text ?? '');
  if (t.includes('```ts')) return parseTs(t);
  if (/^# Superfície CSS/m.test(t)) return parseCss(t);
  if (/^# Esquema de HTML/m.test(t)) return parseSchema(t);
  const map = new Map();
  for (const line of t.split('\n'))
    if (line.trim()) put(map, norm(line), norm(line));
  return map;
}

export function diffReports(oldText, newText) {
  const a = parseReport(oldText);
  const b = parseReport(newText);
  const added = [];
  const removed = [];
  const changed = [];
  for (const [k, v] of a) {
    if (!b.has(k)) removed.push(k);
    else if (b.get(k) !== v) changed.push(k);
  }
  for (const k of b.keys()) if (!a.has(k)) added.push(k);
  return { added, removed, changed };
}

const RANK = { none: 0, patch: 1, minor: 2, major: 3 };

export function requiredBump({ diff, version }) {
  if (diff.removed.length || diff.changed.length)
    return Number.parseInt(String(version).split('.')[0], 10) >= 1
      ? 'major'
      : 'minor';
  if (diff.added.length) return 'patch';
  return 'none';
}

/**
 * `changedReports`: `{ file, package, oldText, newText }[]`; `changesets`: `{ file, releases }[]`
 * (releases = `{ [pacote]: tipo }`); `versions`: `{ [pacote]: versão }`.
 */
export function checkApiDiff({ changedReports, changesets, versions }) {
  const errors = [];
  for (const r of changedReports) {
    const diff = diffReports(r.oldText ?? '', r.newText ?? '');
    const need = requiredBump({
      diff,
      version: versions[r.package] ?? '0.0.0',
    });
    if (need === 'none') continue;
    const have = changesets
      .map((c) => c.releases?.[r.package])
      .filter(Boolean)
      .reduce((max, t) => (RANK[t] > RANK[max] ? t : max), 'none');
    if (RANK[have] >= RANK[need]) continue;
    const sample = [...diff.removed, ...diff.changed, ...diff.added]
      .slice(0, 3)
      .join(', ');
    errors.push(
      have === 'none'
        ? `${r.file}: a API mudou (${sample}) e nenhum changeset de ${r.package} foi adicionado; crie um com tipo mínimo ${need}`
        : `${r.file}: a API mudou (${sample}); o changeset de ${r.package} é ${have}, mas o mínimo é ${need}`,
    );
  }
  return errors;
}

export function parseChangeset(text) {
  const t = eol(text);
  const m = /^---\n([\s\S]*?)\n---/.exec(t);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const kv = /^\s*["']?([^"':]+)["']?\s*:\s*(major|minor|patch)\s*$/.exec(
      line,
    );
    if (kv) out[kv[1].trim()] = kv[2];
  }
  return out;
}

export function packageOfReport(file) {
  const f = file.replace(/\\/g, '/');
  const m = /^packages\/([^/]+)\/api\/[^/]+\.(?:api|css-api)\.md$/.exec(f);
  if (m) return `@comodeviaser/rte-${m[1]}`;
  if (f === 'docs/html-schema.md') return '@comodeviaser/rte-core';
  return null;
}

const lines = (s) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** Reúne as mudanças da base até o HEAD; `git` e `read` são injetáveis nos testes. */
export function collectChanges({ base: baseRef, git, read, packageDirs }) {
  // O ponto de partida é o merge-base: a ponta da base pode ter andado depois do ramo.
  const base = git(['merge-base', baseRef, 'HEAD']).trim();
  const changedReports = [];
  for (const file of lines(
    git(['diff', '--no-renames', '--name-only', `${base}...HEAD`]),
  )) {
    const pkg = packageOfReport(file);
    if (!pkg) continue;
    let oldText;
    try {
      oldText = git(['show', `${base}:${file}`]);
    } catch {
      oldText = undefined; // arquivo novo no PR
    }
    changedReports.push({
      file,
      package: pkg,
      oldText,
      newText: read(file) ?? '',
    });
  }
  const changesets = [];
  for (const file of lines(
    git([
      'diff',
      '--no-renames',
      '--name-only',
      '--diff-filter=AM',
      `${base}...HEAD`,
      '--',
      '.changeset',
    ]),
  )) {
    if (!file.endsWith('.md') || file.endsWith('README.md')) continue;
    changesets.push({ file, releases: parseChangeset(read(file) ?? '') });
  }
  const versions = {};
  for (const dir of packageDirs) {
    const raw = read(`packages/${dir}/package.json`);
    if (!raw) continue;
    const manifest = JSON.parse(raw);
    versions[manifest.name] = manifest.version;
  }
  return { changedReports, changesets, versions };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const i = process.argv.indexOf('--base');
  const base = i > 0 ? process.argv[i + 1] : undefined;
  if (!base) {
    console.error('uso: node tools/api-diff.mjs --base <ref>');
    process.exit(2);
  }
  const root = process.cwd();
  const git = (args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  const read = (p) =>
    existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : undefined;
  let errors;
  try {
    const packageDirs = readdirSync(join(root, 'packages'));
    errors = checkApiDiff(collectChanges({ base, git, read, packageDirs }));
  } catch (e) {
    console.error(
      `api-diff: não foi possível comparar com ${base}: ${e.message}`,
    );
    process.exit(2);
  }
  if (errors.length) {
    console.error(`api-diff: ${errors.length} problema(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `api-diff: mudanças de API cobertas por changeset (base ${base})`,
  );
}
