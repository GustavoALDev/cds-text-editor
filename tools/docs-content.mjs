// Gera dist/docs-content/ a partir de apps/docs/content (spec 07c, X3).
// Esqueleto da T1: módulo TS por página, nav.ts e JSON vazios; a conversão real vem na T3.
// Uso: node tools/docs-content.mjs [--out <dir>]
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildNav, moduleId } from './docs/nav.mjs';
import { uniqueSlugs } from './docs/slug.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.md')) out.push(p);
  }
  return out.sort();
}

export function parseFrontMatter(text, file = '(arquivo)') {
  const src = text.replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  const meta = {};
  if (m)
    for (const line of m[1].split('\n')) {
      const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
      if (!kv)
        throw new Error(`${file}: linha de front matter inválida: "${line}"`);
      meta[kv[1]] = kv[2].trim();
    }
  return { meta, body: m ? src.slice(m[0].length) : src };
}

export function readPages(contentDir) {
  return walk(contentDir).map((file) => {
    const rel = relative(contentDir, file).split(sep).join('/');
    const id = rel.replace(/\.md$/, '');
    const { meta, body } = parseFrontMatter(readFileSync(file, 'utf8'), rel);
    const h1 = /^#\s+(.+)$/m.exec(body)?.[1];
    const title = meta.title ?? h1;
    if (!title)
      throw new Error(
        `${rel}: a página precisa de "title" no front matter ou de um # título`,
      );
    const found = [...body.matchAll(/^(##|###)\s+(.+)$/gm)].map((x) => ({
      depth: x[1].length,
      text: x[2].trim(),
    }));
    const slugs = uniqueSlugs(
      found.map((h) => h.text),
      id,
    );
    const headings = found.map((h, i) => ({ ...h, id: slugs[i] }));
    return { id, title, description: meta.description ?? '', headings, body };
  });
}

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function main({
  repoRoot = REPO,
  out = join(REPO, 'dist', 'docs-content'),
} = {}) {
  const contentDir = join(repoRoot, 'apps', 'docs', 'content');
  const pages = readPages(contentDir);
  const nav = buildNav(
    JSON.parse(readFileSync(join(contentDir, 'nav.json'), 'utf8')),
    pages,
  );
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'pages'), { recursive: true });
  for (const p of pages) {
    const mod = {
      title: p.title,
      description: p.description,
      headings: p.headings,
      segments: [{ html: `<pre>${escapeHtml(p.body)}</pre>` }],
    };
    writeFileSync(
      join(out, 'pages', `${moduleId(p.id)}.ts`),
      `export default ${JSON.stringify(mod, null, 2)};\n`,
    );
  }
  writeFileSync(
    join(out, 'nav.ts'),
    `export default ${JSON.stringify(nav, null, 2)};\n`,
  );
  writeFileSync(join(out, 'search-index.json'), '[]\n');
  writeFileSync(join(out, 'links.json'), '[]\n');
  return { pages: pages.map((p) => p.id), nav };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const i = process.argv.indexOf('--out');
  try {
    const r = main(i > 0 ? { out: resolve(process.argv[i + 1]) } : {});
    console.log(`docs-content: ${r.pages.length} página(s) gerada(s)`);
  } catch (e) {
    console.error(`docs-content: ${e.message}`);
    process.exit(1);
  }
}
