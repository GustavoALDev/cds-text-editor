// Diretivas do Markdown do site (spec 07c, X6): example, live, generated, no-compile.
//   <!-- example: examples/a.ts#regiao -->   código compilado (regiões // #region / <!-- #region -->)
//   <!-- live: id -->                        exemplo vivo (registro examples/registry.ts)
//   <!-- generated: install-command -->      comando de instalação dos package.json publicados
//   <!-- generated: styles-order [render] --> ordem do CSS (exports dos package.json publicados)
//   <!-- no-compile: motivo -->              bloco cercado escrito à mão, com motivo
// Todo bloco cercado sem uma destas diretivas falha o build (e o `check:rules`).
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

export const LIVE_OPEN = '<!--@@live:';
export const LIVE_CLOSE = '@@-->';

const DIRECTIVE =
  /^\s*<!--\s*(example|live|generated|no-compile)\s*:\s*(.*?)\s*-->\s*$/;
const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const LANG_BY_EXT = {
  ts: 'ts',
  html: 'html',
  css: 'css',
  json: 'json',
  js: 'js',
};

const REGION_START =
  /^\s*(?:\/\/\s*#region\b\s*(.*?)|<!--\s*#region\b\s*(.*?)\s*-->)\s*$/;
const REGION_END = /^\s*(?:\/\/\s*#endregion\b.*|<!--\s*#endregion\b.*-->)\s*$/;

function dedent(lines) {
  const indents = lines
    .filter((l) => l.trim())
    .map((l) => /^[ \t]*/.exec(l)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut));
}

/**
 * Texto de uma região (ou do arquivo todo, sem `name`), sem nenhum marcador de região.
 * Lança se a região não existe ou não fecha.
 */
export function extractRegion(text, name, file = '(arquivo)') {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const open = []; // pilha de regiões abertas
  let found = false;
  for (const line of lines) {
    const start = REGION_START.exec(line);
    if (start) {
      open.push((start[1] ?? start[2] ?? '').trim());
      if (name !== undefined && open.at(-1) === name) found = true;
      continue;
    }
    if (REGION_END.test(line)) {
      if (!open.length)
        throw new Error(`${file}: #endregion sem #region correspondente`);
      open.pop();
      continue;
    }
    if (name === undefined || open.includes(name)) out.push(line);
  }
  if (open.length)
    throw new Error(
      `${file}: a região "${open.at(-1)}" não foi fechada com #endregion`,
    );
  if (name !== undefined && !found)
    throw new Error(`${file}: região "${name}" não encontrada`);
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out.at(-1).trim()) out.pop();
  return dedent(out).join('\n');
}

/** Ids do registro de exemplos vivos (`examples/registry.ts`). */
export function liveIdsOf(registrySource) {
  const ids = [];
  const re = /^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][\w-]*))\s*:/gm;
  for (const m of registrySource.matchAll(re)) ids.push(m[1] ?? m[2] ?? m[3]);
  return ids;
}

const unscoped = (name) => name.replace(/^@[^/]+\//, '');

/** `npm install` com os pacotes do consumidor e os peers obrigatórios fora do Angular. */
export function generateInstallCommand(packages) {
  const angular = packages.angular;
  if (!angular)
    throw new Error(
      'generated: install-command precisa do package.json do angular',
    );
  const peers = angular.peerDependencies ?? {};
  const optional = angular.peerDependenciesMeta ?? {};
  const own = [angular.name];
  const third = [];
  for (const [name, range] of Object.entries(peers)) {
    if (optional[name]?.optional) continue;
    if (name.startsWith('@angular/')) continue;
    if (name.startsWith('@cds/')) own.push(name);
    else third.push(`${name}@${range}`);
  }
  const names = [...new Set(own)].sort((a, b) =>
    unscoped(a).localeCompare(unscoped(b)),
  );
  third.sort();
  return `npm install ${names.join(' ')}${third.length ? ` \\\n  ${third.join(' \\\n  ')}` : ''}`;
}

const STYLES = [
  { pkg: 'theme', subpath: './theme.css' },
  { pkg: 'core', subpath: './styles/content.css' },
  { pkg: 'angular', subpath: './styles/editor.css' },
  { pkg: 'render', subpath: './styles/render.css', onlyWith: 'render' },
];

/** Lista `styles` do `angular.json`, na ordem do tema → conteúdo → editor (→ exibição). */
export function generateStylesOrder(packages, { render = false } = {}) {
  const specs = [];
  for (const s of STYLES) {
    if (s.onlyWith === 'render' && !render) continue;
    const pkg = packages[s.pkg];
    if (!pkg?.exports?.[s.subpath])
      throw new Error(
        `generated: styles-order: ${pkg?.name ?? s.pkg} não exporta "${s.subpath}" (package.json publicado)`,
      );
    specs.push(`${pkg.name}/${s.subpath.slice(2)}`);
  }
  return `"styles": [\n${specs.map((s) => `  "${s}"`).join(',\n')}\n]`;
}

function fenced(code, lang) {
  const ticks = Math.max(
    3,
    ...[...code.matchAll(/`{3,}/g)].map((m) => m[0].length + 1),
  );
  const bar = '`'.repeat(ticks);
  return `${bar}${lang}\n${code}\n${bar}`;
}

/**
 * Troca as diretivas por Markdown: `example`/`generated` viram blocos cercados, `live` vira o
 * marcador `<!--@@live:id@@-->` (o conversor o separa em segmento), `no-compile` é consumida e
 * autoriza o bloco cercado seguinte. Bloco cercado sem diretiva falha.
 *
 * ctx: { page, appRoot, packages, liveIds }
 */
export function expandDirectives(body, ctx) {
  const { page, appRoot, packages = {}, liveIds = [] } = ctx;
  const fail = (line, msg) => {
    throw new Error(`${page}:${line}: ${msg}`);
  };
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inFence = null; // { char, len }
  let pending = null; // { kind, line }
  let produced = null; // example/generated da linha anterior
  lines.forEach((line, i) => {
    const n = i + 1;
    if (inFence) {
      out.push(line);
      const m = FENCE.exec(line);
      if (
        m &&
        m[2][0] === inFence.char &&
        m[2].length >= inFence.len &&
        !m[3].trim()
      )
        inFence = null;
      return;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      if (produced)
        fail(
          n,
          `o bloco cercado depois de <!-- ${produced}: ... --> seria substituído pela diretiva; remova-o`,
        );
      if (!pending)
        fail(
          n,
          'bloco de código sem diretiva: use <!-- example: ... -->, <!-- generated: ... --> ou <!-- no-compile: motivo --> antes dele',
        );
      if (pending.kind !== 'no-compile')
        fail(
          n,
          `o bloco cercado depois de <!-- ${pending.kind}: ... --> seria substituído pela diretiva; remova-o`,
        );
      pending = null;
      inFence = { char: fence[2][0], len: fence[2].length };
      out.push(line);
      return;
    }
    const d = DIRECTIVE.exec(line);
    if (line.trim()) produced = null;
    if (d) {
      const [, kind, arg] = d;
      if (pending && line.trim()) {
        // duas diretivas seguidas
        fail(
          n,
          `a diretiva "${pending.kind}" da linha ${pending.line} não foi seguida de um bloco cercado`,
        );
      }
      if (kind === 'no-compile') {
        if (!arg)
          fail(n, '<!-- no-compile: motivo --> exige um motivo não vazio');
        pending = { kind, line: n };
        return;
      }
      if (kind === 'live') {
        if (!arg) fail(n, '<!-- live: id --> exige um id');
        if (!liveIds.includes(arg))
          fail(
            n,
            `exemplo vivo "${arg}" não existe em examples/registry.ts (ids: ${liveIds.join(', ') || 'nenhum'})`,
          );
        out.push(`${LIVE_OPEN}${arg}${LIVE_CLOSE}`);
        return;
      }
      if (kind === 'example') {
        const [path, region] = arg.split('#');
        if (!path) fail(n, '<!-- example: caminho#região --> exige um caminho');
        const file = resolve(appRoot, path);
        if (file !== appRoot && !file.startsWith(appRoot + sep))
          fail(n, `o exemplo "${path}" sai de apps/docs`);
        if (!existsSync(file))
          fail(n, `exemplo "${path}" não existe (apps/docs/${path})`);
        let code;
        try {
          code = extractRegion(
            readFileSync(file, 'utf8'),
            region || undefined,
            path,
          );
        } catch (e) {
          fail(n, e.message);
        }
        const ext = path.split('.').pop();
        out.push(fenced(code, LANG_BY_EXT[ext] ?? 'text'));
        produced = 'example';
        return;
      }
      // generated
      produced = 'generated';
      const [what, ...rest] = arg.split(/\s+/);
      try {
        if (what === 'install-command')
          out.push(fenced(generateInstallCommand(packages), 'bash'));
        else if (what === 'styles-order')
          out.push(
            fenced(
              generateStylesOrder(packages, {
                render: rest.includes('render'),
              }),
              'json',
            ),
          );
        else
          fail(
            n,
            `generated: "${what}" desconhecido (install-command, styles-order)`,
          );
      } catch (e) {
        if (e.message.startsWith(`${page}:`)) throw e;
        fail(n, e.message);
      }
      return;
    }
    if (pending && line.trim())
      fail(
        n,
        `a diretiva "${pending.kind}" da linha ${pending.line} não foi seguida de um bloco cercado`,
      );
    out.push(line);
  });
  if (inFence) fail(lines.length, 'bloco cercado sem fechamento');
  if (pending)
    fail(
      pending.line,
      `a diretiva "${pending.kind}" não foi seguida de um bloco cercado`,
    );
  return out.join('\n');
}

/** Lê os `package.json` publicados (`packDirOf`) de angular/core/theme/render/sanitizer. */
export function loadPublishedPackages(
  repoRoot,
  packDirOf,
  names = ['angular', 'core', 'theme', 'render', 'sanitizer'],
) {
  const out = {};
  for (const dir of names) {
    const file = join(packDirOf(repoRoot, dir), 'package.json');
    if (!existsSync(file))
      throw new Error(
        `${file} não existe: construa os pacotes antes (nx run-many -t build)`,
      );
    out[dir] = JSON.parse(readFileSync(file, 'utf8'));
  }
  return out;
}
