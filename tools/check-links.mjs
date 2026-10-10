// Verificação de links internos (spec 07c, X9).
//   node tools/check-links.mjs <siteDir> [--base /comodeviaser-editor/] [--demo-root <dir>] [--readmes]
//                              [--externos <arquivo>] [--repo <raiz>]
//   node tools/check-links.mjs --consultar <links-externos.txt>   (links.yml: consulta e resume, nunca falha)
// Sobre o HTML construído: todo href/src interno resolve para um arquivo do build e todo #âncora existe
// na página de destino. Com --readmes, também os links relativos e âncoras (slug do GitHub) dos README.md
// dos pacotes, do README raiz e de docs/**/*.md. Links externos só são listados (nunca consultados aqui).
//
// Limite do parser de HTML (sem dependência nova): regex sobre as tags, sem DOM. Atributos entre aspas
// simples ou duplas são lidos; ids/hrefs montados por script não existem no HTML pré-renderizado e
// portanto não são vistos. Comentários e <script>/<style> são ignorados.
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const ORIGIN = 'http://site.invalid';

// ---------- util ----------
function walk(dir, ok, skip = true) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (skip && ['node_modules', '.git', 'dist'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, ok, skip));
    else if (ok(name)) out.push(p);
  }
  return out.sort();
}

const posix = (p) => p.split(sep).join('/');

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Classifica o destino: externo, ignorado (mailto etc.) ou interno. */
function kind(url) {
  if (/^(https?:)?\/\//i.test(url)) return 'external';
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return 'ignored';
  return 'internal';
}

// ---------- HTML ----------
function stripNoise(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, (m) =>
      // mantém só a abertura: <script src> ainda conta como referência
      /^<script\b[^>]*\bsrc=/i.test(m) ? m.slice(0, m.indexOf('>') + 1) : '',
    );
}

const TAG = /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function attrsOf(raw) {
  const out = {};
  for (const m of raw.matchAll(ATTR)) out[m[1].toLowerCase()] = m[2] ?? m[3];
  return out;
}

const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** `{ ids:Set, refs:[{attr,url}], base }` de um HTML. */
export function parseHtml(html) {
  const ids = new Set();
  const refs = [];
  let base = null;
  for (const m of stripNoise(html).matchAll(TAG)) {
    const tag = m[1].toLowerCase();
    const a = attrsOf(m[2]);
    if (a.id !== undefined) ids.add(decodeEntities(a.id));
    if (tag === 'a' && a.name !== undefined) ids.add(decodeEntities(a.name));
    if (tag === 'base' && a.href !== undefined) base = decodeEntities(a.href);
    if (tag === 'a' || tag === 'area') {
      if (a.href !== undefined) refs.push({ attr: 'href', url: a.href });
    } else if (tag === 'link') {
      if (a.href !== undefined) refs.push({ attr: 'href', url: a.href });
    } else if (
      ['img', 'script', 'source', 'video', 'audio', 'track', 'iframe'].includes(
        tag,
      )
    ) {
      if (a.src !== undefined) refs.push({ attr: 'src', url: a.src });
    }
  }
  return {
    ids,
    base,
    refs: refs.map((r) => ({ ...r, url: decodeEntities(r.url.trim()) })),
  };
}

/**
 * Verifica o site construído. `base` é o prefixo de publicação; `demoRoot` (opcional) é o build do
 * demo, montado em `<base>demo/`.
 * @returns {{ errors: string[], externals: string[], files: number }}
 */
export function checkSite({ siteDir, base = '/', demoRoot = null }) {
  const root = resolve(siteDir);
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const errors = [];
  const externals = new Set();
  const cache = new Map();
  const load = (file) => {
    if (!cache.has(file))
      cache.set(file, parseHtml(readFileSync(file, 'utf8')));
    return cache.get(file);
  };

  const resolveFile = (dir, path) => {
    const rel = safeDecode(path).replace(/^\/+/, '');
    const abs = resolve(dir, rel);
    if (abs !== dir && !abs.startsWith(dir + sep)) return null;
    const candidates = [abs, join(abs, 'index.html'), `${abs}.html`];
    return (
      candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null
    );
  };

  const pages = walk(root, (n) => n.endsWith('.html'), false);
  if (pages.length === 0)
    throw new Error(
      `nenhum arquivo .html em ${root}; confira o diretório do site`,
    );
  for (const file of pages) {
    const from = posix(relative(root, file));
    const here = load(file);
    const pagePath = `${prefix}${from}`;
    const pageUrl = new URL(pagePath, ORIGIN);
    const baseUrl = new URL(here.base ?? pageUrl.href, pageUrl);
    for (const { attr, url } of here.refs) {
      const k = kind(url);
      if (k === 'external') {
        externals.add(url.startsWith('//') ? `https:${url}` : url);
        continue;
      }
      if (k === 'ignored' || url === '') continue;
      // Com <base>, `#x` relativo vai à base, não à página (a armadilha do X7): resolve como o navegador.
      const target = new URL(url, baseUrl);
      const bad = (msg) => errors.push(`${from}: ${attr}="${url}" ${msg}`);
      let dir = root;
      let path = target.pathname;
      if (path.startsWith(`${prefix}demo/`) || path === `${prefix}demo`) {
        if (!demoRoot) continue;
        dir = resolve(demoRoot);
        path = path.slice(`${prefix}demo`.length);
      } else if (path.startsWith(prefix)) {
        path = path.slice(prefix.length - 1);
      } else {
        bad(`aponta para fora da base "${prefix}"`);
        continue;
      }
      const dest = resolveFile(dir, path);
      if (!dest) {
        bad('não existe no build');
        continue;
      }
      const frag = target.hash ? safeDecode(target.hash.slice(1)) : '';
      if (frag && frag !== 'top' && dest.endsWith('.html')) {
        if (!load(dest).ids.has(frag))
          bad(
            `a âncora "#${frag}" não existe em ${posix(relative(dir, dest))}`,
          );
      }
    }
  }
  return { errors, externals: [...externals].sort(), files: pages.length };
}

// ---------- Markdown ----------
/** Slug de título do GitHub: minúsculas, sem pontuação (mantém letras com acento, `-` e `_`). */
export function githubSlug(heading) {
  return heading
    .replace(/<[^>]*>/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function stripCode(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let fence = null;
  const out = lines.map((line) => {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length)
        fence = null;
      return '';
    }
    if (f) {
      fence = f[1];
      return '';
    }
    return line.replace(/`+[^`\n]*`+/g, (m) => ' '.repeat(m.length));
  });
  return out;
}

/** `{ anchors:Set, links:[{url,line}] }` de um Markdown (links inline, imagens, definições e HTML). */
export function parseMarkdown(md) {
  const lines = stripCode(md);
  const anchors = new Set();
  const seen = new Map();
  const links = [];
  lines.forEach((line, i) => {
    const h = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      const base = githubSlug(h[1]);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      anchors.add(n ? `${base}-${n}` : base);
    }
    for (const m of line.matchAll(
      /<(?:a|img)\b[^>]*?\b(?:name|id)="([^"]+)"/gi,
    ))
      anchors.add(m[1]);
    for (const m of line.matchAll(
      /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g,
    ))
      links.push({ url: m[1], line: i + 1 });
    const def = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+"[^"]*")?\s*$/.exec(
      line,
    );
    if (def) links.push({ url: def[1], line: i + 1 });
    for (const m of line.matchAll(
      /<(?:a|img)\b[^>]*?\b(?:href|src)="([^"]+)"/gi,
    ))
      links.push({ url: m[1], line: i + 1 });
  });
  return { anchors, links };
}

export function markdownFiles(repoRoot) {
  const files = [join(repoRoot, 'README.md')];
  const pk = join(repoRoot, 'packages');
  if (existsSync(pk))
    for (const name of readdirSync(pk)) files.push(join(pk, name, 'README.md'));
  files.push(...walk(join(repoRoot, 'docs'), (n) => n.endsWith('.md')));
  return files.filter((f) => existsSync(f));
}

/** Verifica README.md dos pacotes, o raiz e docs/**\/*.md. */
export function checkMarkdown({ repoRoot, files = markdownFiles(repoRoot) }) {
  const root = resolve(repoRoot);
  const errors = [];
  const externals = new Set();
  const cache = new Map();
  const load = (f) => {
    if (!cache.has(f)) cache.set(f, parseMarkdown(readFileSync(f, 'utf8')));
    return cache.get(f);
  };
  for (const file of files) {
    const from = posix(relative(root, file));
    for (const { url, line } of load(file).links) {
      const k = kind(url);
      if (k === 'external') {
        externals.add(url.startsWith('//') ? `https:${url}` : url);
        continue;
      }
      if (k === 'ignored') continue;
      const hash = url.indexOf('#');
      const pathPart = safeDecode(hash < 0 ? url : url.slice(0, hash));
      const frag = hash < 0 ? '' : safeDecode(url.slice(hash + 1));
      const bad = (msg) => errors.push(`${from}:${line}: link "${url}" ${msg}`);
      const dest = pathPart
        ? pathPart.startsWith('/')
          ? resolve(root, pathPart.slice(1))
          : resolve(dirname(file), pathPart)
        : file;
      if (!existsSync(dest)) {
        bad('aponta para um arquivo que não existe');
        continue;
      }
      if (frag && statSync(dest).isFile() && dest.endsWith('.md')) {
        if (!load(dest).anchors.has(frag))
          bad(
            `tem a âncora "#${frag}", que não existe em ${posix(relative(root, dest))}`,
          );
      }
    }
  }
  return { errors, externals: [...externals].sort(), files: files.length };
}

// ---------- CLI ----------
// ---------- links externos (links.yml, semanal): consulta sem nunca falhar ----------

/**
 * Consulta cada URL externa (HEAD; se recusado, GET), com tempo limite. Devolve, por URL,
 * `{ url, state: 'ok' | 'redirecionado' | 'quebrado' | 'erro', status?, to?, detail? }`. Nunca
 * lança: rede ruidosa não pode bloquear nada (o `links.yml` só registra o resultado).
 */
export async function checkExternal(
  urls,
  fetchImpl = globalThis.fetch,
  { timeoutMs = 15_000, concurrency = 8 } = {},
) {
  const attempt = async (url, method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };
  const one = async (url) => {
    // Só http(s): a lista vem de arquivo (artefato do CI), então nada de file:, ftp: etc.
    if (!/^https?:\/\//i.test(url))
      return {
        url,
        state: 'erro',
        detail: 'esquema não suportado (só http(s) é consultado)',
      };
    try {
      let res = await attempt(url, 'HEAD');
      if (res.status === 405 || res.status === 501 || res.status === 403)
        res = await attempt(url, 'GET');
      if (res.status >= 400)
        return { url, state: 'quebrado', status: res.status };
      // `res.url` já vem normalizado (barra final, %20): compara com a forma normalizada.
      if (res.url && res.url !== new URL(url).href)
        return { url, state: 'redirecionado', status: res.status, to: res.url };
      return { url, state: 'ok', status: res.status };
    } catch (e) {
      const aborted = e?.name === 'AbortError';
      return {
        url,
        state: 'erro',
        detail: aborted
          ? `tempo esgotado (${timeoutMs} ms)`
          : String(e?.message ?? e),
      };
    }
  };
  const out = new Array(urls.length);
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      out[i] = await one(urls[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, worker),
  );
  return out;
}

/** Resumo em Markdown (para `$GITHUB_STEP_SUMMARY`): contagens e só o que merece atenção. */
export function externalReport(results) {
  const count = (state) => results.filter((r) => r.state === state).length;
  const lines = [
    '## Links externos',
    '',
    `${results.length} link(s) externo(s): ${count('ok')} ok, ${count('redirecionado')} redirecionado(s), ${count('quebrado')} quebrado(s), ${count('erro')} com erro de rede.`,
  ];
  const problems = results.filter((r) => r.state !== 'ok');
  if (problems.length) {
    lines.push('', '| Link | Situação |', '| --- | --- |');
    for (const r of problems) {
      const what =
        r.state === 'quebrado'
          ? `HTTP ${r.status}`
          : r.state === 'redirecionado'
            ? `redirecionado para ${r.to}`
            : r.detail;
      lines.push(`| ${r.url} | ${what} |`);
    }
  }
  return lines.join('\n');
}

export function main(
  argv,
  { cwd = process.cwd(), log = console, fetchImpl = globalThis.fetch } = {},
) {
  const args = argv.slice();
  const opt = (name) => {
    const i = args.indexOf(name);
    if (i < 0) return null;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const flag = (name) => {
    const i = args.indexOf(name);
    if (i < 0) return false;
    args.splice(i, 1);
    return true;
  };
  const consultar = opt('--consultar');
  if (consultar) {
    // Modo do links.yml: devolve uma Promise e nunca falha (código 0).
    const urls = readFileSync(resolve(cwd, consultar), 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return checkExternal(urls, fetchImpl).then((results) => {
      log.log(externalReport(results));
      return 0;
    });
  }
  const base = opt('--base') ?? '/';
  const demoRoot = opt('--demo-root');
  const externosFile = opt('--externos');
  const repoRoot = resolve(cwd, opt('--repo') ?? '.');
  const readmes = flag('--readmes');
  const siteDir = args[0];
  if (!siteDir && !readmes) {
    log.error(
      'uso: node tools/check-links.mjs <siteDir> [--base /comodeviaser-editor/] [--demo-root <dir>] [--readmes] [--externos <arquivo>]',
    );
    return 2;
  }
  const errors = [];
  const externals = new Set();
  let files = 0;
  if (siteDir) {
    const r = checkSite({
      siteDir: resolve(cwd, siteDir),
      base,
      demoRoot: demoRoot ? resolve(cwd, demoRoot) : null,
    });
    errors.push(...r.errors);
    r.externals.forEach((e) => externals.add(e));
    files += r.files;
  }
  if (readmes) {
    const r = checkMarkdown({ repoRoot });
    errors.push(...r.errors);
    r.externals.forEach((e) => externals.add(e));
    files += r.files;
  }
  if (externosFile)
    writeFileSync(
      resolve(cwd, externosFile),
      [...externals].sort().join('\n') + (externals.size ? '\n' : ''),
    );
  if (errors.length) {
    for (const e of errors) log.error(`check-links: ${e}`);
    log.error(`check-links: ${errors.length} link(s) interno(s) quebrado(s)`);
    return 1;
  }
  log.log(
    `check-links: ${files} arquivo(s) verificado(s), ${externals.size} link(s) externo(s) listado(s)`,
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(await main(process.argv.slice(2)));
}
