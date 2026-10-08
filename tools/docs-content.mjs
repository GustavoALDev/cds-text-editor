// Gera dist/docs-content/ a partir de apps/docs/content (spec 07c, X3).
// Markdown + diretivas (example/live/generated/no-compile), checagem de HTML (X4) e páginas de API.
// Uso: node tools/docs-content.mjs [--out <dir>] [--api <dir-do-api-documenter>] [--no-api] [--no-readme]
// README raiz (07d, L6): os marcadores `<!-- readme: ... -->` são conferidos contra os exemplos
// compilados; divergência falha. `UPDATE_README=1 node tools/docs-content.mjs` reescreve.
import {
  existsSync,
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
import { assertCoverage, groupApiPages, REPO_URL } from './docs/api-group.mjs';
import { listModelEntries } from './docs/api-model.mjs';
import {
  extractRegion,
  generateInstallCommand,
  langOf,
  liveIdsOf,
  loadPublishedPackages,
} from './docs/directives.mjs';
import { checkReadme } from './docs/readme-markers.mjs';
import { assertIndexSize, buildSearchIndex } from './docs/search-index.mjs';
import { renderApiPage, renderGuidePage } from './docs/markdown.mjs';
import { PACKAGES, packDirOf } from './consumer.mjs';

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
    return { id, title, description: meta.description ?? '', body };
  });
}

/**
 * Ponto de extensão (T4): grava `search-index.json` e `links.json`. Recebe os registros de todas
 * as páginas (`{ id, kind, title, description, headings, segments, links }`) e a navegação.
 * `search-index.json` vem da T4 (`search-index.mjs`); `links.json` segue vazio válido.
 */
export function writeExtras({ out, records }) {
  const json = JSON.stringify(buildSearchIndex(records));
  assertIndexSize(json); // acima de 400 KB falha o build (X8)
  writeFileSync(join(out, 'search-index.json'), `${json}\n`);
  writeFileSync(join(out, 'links.json'), '[]\n');
}

const tsModule = (value) =>
  `export default ${JSON.stringify(value, null, 2)};\n`;

/** Páginas de API (um `.md` agrupado por entry) já convertidas em registros. */
export function buildApiPages({ repoRoot, apiDir, packages }) {
  const entries = PACKAGES.flatMap(({ dir }) =>
    listModelEntries(packages[dir]),
  );
  const grouped = groupApiPages({
    markdownDir: apiDir,
    entries,
    repoUrl: REPO_URL,
  });
  assertCoverage(
    entries.map((e) => e.specifier),
    grouped,
  );
  return grouped.map((g) => {
    const r = renderApiPage(g.markdown, { pageId: g.id });
    return {
      id: g.id,
      kind: 'api',
      title: g.title,
      description: g.description,
      // o sumário da API lista só os itens (h2); membros ficam no corpo
      headings: r.headings.filter((h) => h.depth === 2),
      segments: r.segments,
      links: r.links,
    };
  });
}

/**
 * Orquestra o conteúdo do site (X3): guia (Markdown + diretivas) e, se `apiDir` for dado, as
 * páginas de API do api-documenter. Contrato com `apps/docs` (T2): `pages/<id>.ts` (default
 * PageData), `nav.ts` (`NAV`) e `pages.ts` (`PAGES`).
 */
export function main({
  repoRoot = REPO,
  out = join(REPO, 'dist', 'docs-content'),
  apiDir = null,
  packages,
  extras = writeExtras,
  readme = true,
  updateReadme = process.env.UPDATE_README === '1',
} = {}) {
  const contentDir = join(repoRoot, 'apps', 'docs', 'content');
  const appRoot = join(repoRoot, 'apps', 'docs');
  const navJson = JSON.parse(
    readFileSync(join(contentDir, 'nav.json'), 'utf8'),
  );
  const sources = readPages(contentDir);

  let published = packages;
  const needPackages = (text) => text.includes('<!-- generated:');
  const loadPackages = () =>
    (published ??= loadPublishedPackages(repoRoot, packDirOf));
  if (readme) {
    const readmeFile = join(repoRoot, 'README.md');
    if (existsSync(readmeFile)) {
      const text = readFileSync(readmeFile, 'utf8');
      const resolveMarker = (kind, arg) => {
        if (kind === 'generated') {
          if (arg !== 'install-command')
            throw new Error(
              `generated: "${arg}" desconhecido no README (install-command)`,
            );
          return { code: generateInstallCommand(loadPackages()), lang: 'bash' };
        }
        const [path, region] = arg.split('#');
        const file = resolve(appRoot, path);
        if (file !== appRoot && !file.startsWith(appRoot + sep))
          throw new Error(`o exemplo "${path}" sai de apps/docs`);
        if (!existsSync(file))
          throw new Error(`exemplo "${path}" não existe (apps/docs/${path})`);
        return {
          code: extractRegion(
            readFileSync(file, 'utf8'),
            region || undefined,
            path,
          ),
          lang: langOf(path),
        };
      };
      const r = checkReadme(text, resolveMarker, 'README.md');
      if (!r.ok) {
        if (!updateReadme) throw new Error(r.diff);
        writeFileSync(readmeFile, r.filled);
      }
    }
  }
  const registryFile = join(appRoot, 'examples', 'registry.ts');
  const liveIds = existsSync(registryFile)
    ? liveIdsOf(readFileSync(registryFile, 'utf8'))
    : [];

  const records = sources.map((p) => {
    const r = renderGuidePage(p.body, {
      pageId: p.id,
      appRoot,
      packages: needPackages(p.body) ? loadPackages() : {},
      liveIds,
    });
    return {
      id: p.id,
      kind: 'guia',
      title: p.title,
      description: p.description,
      headings: r.headings,
      segments: r.segments,
      links: r.links,
    };
  });
  if (apiDir) {
    if (!existsSync(apiDir))
      throw new Error(
        `${apiDir} não existe: rode o api-report com RTE_API_MODEL e o api-documenter antes (docs-content)`,
      );
    records.push(
      ...buildApiPages({ repoRoot, apiDir, packages: loadPackages() }),
    );
  }

  // A seção da API é gerada (um item por entry), nunca escrita à mão em nav.json.
  const apiItems = records
    .filter((r) => r.kind === 'api')
    .map((r) => ({ page: r.id, title: r.title }));
  const nav = buildNav(
    {
      sections: [
        ...(navJson.sections ?? []),
        ...(apiItems.length
          ? [{ title: 'Referência da API', items: apiItems }]
          : []),
      ],
    },
    records,
  );

  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'pages'), { recursive: true });
  for (const r of records) {
    const mod = {
      title: r.title,
      description: r.description,
      headings: r.headings,
      segments: r.segments,
    };
    writeFileSync(join(out, 'pages', `${moduleId(r.id)}.ts`), tsModule(mod));
  }
  // nav.ts: `NAV` no formato que o app consome ({ title, items: [{ path, title }] }[]).
  const navTs = nav.sections.map((s) => ({
    title: s.title,
    items: s.items.map((i) => ({ path: i.page, title: i.title })),
  }));
  writeFileSync(
    join(out, 'nav.ts'),
    `export const NAV: readonly {
  readonly title: string;
  readonly items: readonly { readonly path: string; readonly title: string }[];
}[] = ${JSON.stringify(navTs, null, 2)};\n`,
  );
  // pages.ts: `PAGES` (id -> import() do módulo da página, um chunk por página).
  const pageLines = records
    .map(
      (r) =>
        `  ${JSON.stringify(r.id)}: () => import('./pages/${moduleId(r.id)}'),`,
    )
    .join('\n');
  writeFileSync(
    join(out, 'pages.ts'),
    `export const PAGES = {
${pageLines}
} as const;
`,
  );
  extras({ out, records, nav });
  return { pages: records.map((r) => r.id), nav, records };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  try {
    const r = main({
      ...(arg('--out') ? { out: resolve(arg('--out')) } : {}),
      readme: !process.argv.includes('--no-readme'),
      apiDir: process.argv.includes('--no-api')
        ? null
        : resolve(arg('--api') ?? join(REPO, 'dist', 'api-markdown')),
    });
    console.log(`docs-content: ${r.pages.length} página(s) gerada(s)`);
  } catch (e) {
    console.error(`docs-content: ${e.message}`);
    process.exit(1);
  }
}
