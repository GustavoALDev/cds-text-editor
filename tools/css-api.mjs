#!/usr/bin/env node
// Superfície CSS pública (spec 09c, AP7): lê o CSS publicado de um pacote e grava/confere
// `api/<arquivo>.css-api.md`, marcando cada item `public` ou `internal` a partir de
// `api/css-public.json`. Mesma mecânica do `api-report.mjs`: `UPDATE_API=1` regrava.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const eol = (text) => text.replace(/\r\n/g, '\n');
const sortUnique = (items) => [...new Set(items)].sort();

const CLASS_RE = /\.((?:rte|rt)-[A-Za-z0-9_-]+)/g;
const VARIABLE_DECL_RE = /^(--rte-[A-Za-z0-9_-]+)\s*:/;

/**
 * Extrai a superfície CSS de um arquivo: classes `rte-*`/`rt-*` de seletores, variáveis
 * `--rte-*` DECLARADAS (uso em `var()` não conta), camadas `@layer` e `@property`.
 */
export function extractCssApi(cssText) {
  const text = eol(cssText).replace(/\/\*[\s\S]*?\*\//g, '');
  const classes = [];
  const variables = [];
  const layers = [];
  const properties = [];

  const addLayers = (list) => {
    for (const name of list.split(',')) {
      const n = name.trim();
      if (n) layers.push(n);
    }
  };

  const onPrelude = (prelude) => {
    const p = prelude.trim();
    if (p.startsWith('@layer')) {
      addLayers(p.slice('@layer'.length));
    } else if (p.startsWith('@property')) {
      const name = p.slice('@property'.length).trim();
      if (name) properties.push(name);
    } else if (!p.startsWith('@')) {
      for (const m of p.matchAll(CLASS_RE)) classes.push(m[1]);
    }
  };

  const onStatement = (statement) => {
    const s = statement.trim();
    if (!s) return;
    if (s.startsWith('@layer')) addLayers(s.slice('@layer'.length));
    else {
      const m = VARIABLE_DECL_RE.exec(s);
      if (m) variables.push(m[1]);
    }
  };

  let cur = '';
  let quote = '';
  let paren = 0;
  for (const ch of text) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '(') paren++;
    else if (ch === ')') paren = Math.max(0, paren - 1);
    if (paren > 0) {
      cur += ch;
      continue;
    }
    if (ch === '{') {
      onPrelude(cur);
      cur = '';
    } else if (ch === '}' || ch === ';') {
      onStatement(cur);
      cur = '';
    } else cur += ch;
  }
  onStatement(cur);

  // Consumidas: lidas por `var()` mas nunca declaradas nem registradas; quem define é o consumidor.
  const known = new Set([...variables, ...properties]);
  const consumed = [...text.matchAll(/var\(\s*(--rte-[A-Za-z0-9_-]+)/g)]
    .map((m) => m[1])
    .filter((v) => !known.has(v));

  return {
    classes: sortUnique(classes),
    variables: sortUnique(variables),
    layers: sortUnique(layers),
    properties: sortUnique(properties),
    consumed: sortUnique(consumed),
  };
}

/** Relatório Markdown estável (LF); cada item vem marcado `public` ou `internal`. */
export function renderCssReport({ file, api, publicList }) {
  const section = (title, items, prefix, listed) => {
    const lines = [`## ${title}`, ''];
    if (items.length === 0) lines.push('(nenhum)');
    for (const item of items) {
      const mark = (listed ?? []).includes(item) ? 'public' : 'internal';
      lines.push(`- \`${prefix}${item}\` — ${mark}`);
    }
    lines.push('');
    return lines.join('\n');
  };
  return [
    `# Superfície CSS de \`${file}\``,
    '',
    '> Arquivo gerado por `node tools/css-api.mjs`; não edite à mão (regrave com `UPDATE_API=1`). `public` entra no contrato do semver (`api/css-public.json`); `internal` não.',
    '',
    section('Classes', api.classes, '.', publicList.classes),
    section('Variáveis declaradas', api.variables, '', publicList.variables),
    section('Camadas (`@layer`)', api.layers, '', publicList.layers),
    section(
      'Variáveis consumidas (definidas pelo consumidor)',
      api.consumed ?? [],
      '',
      publicList.variables,
    ),
    section('Propriedades registradas (`@property`)', api.properties, '', [
      ...(publicList.properties ?? []),
      ...(publicList.variables ?? []),
    ]),
  ].join('\n');
}

/** Variáveis `--rte-*` da tabela dos níveis do README do tema (linhas que começam por um dígito). */
export function extractReadmeThemeVars(readmeText) {
  const vars = [];
  for (const line of eol(readmeText).split('\n')) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    for (const m of line.matchAll(/--rte-[A-Za-z0-9_-]*\*?/g)) vars.push(m[0]);
  }
  return sortUnique(vars);
}

/** Classes (`.rte-*`/`.rt-*`) e variáveis (`--rte-*`) citadas num texto de guia ou README. */
export function extractGuideTokens(text) {
  const out = [];
  const t = eol(text);
  for (const m of t.matchAll(
    /(?<![\w-])(--rte-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)(?![\w*-])/g,
  ))
    out.push(m[1]);
  for (const m of t.matchAll(
    /(?<![\w./-])(\.(?:rte|rt)-[A-Za-z0-9]+(?:(?:__|--|-)[A-Za-z0-9]+)*)(?![\w*-])/g,
  ))
    out.push(m[1]);
  return sortUnique(out);
}

/**
 * Conferências de consistência (erros em pt-BR):
 * item público ausente do CSS; variável do README do tema fora da lista; classe/variável do
 * guia que existe neste CSS mas não está na lista pública.
 */
export function checkCssApi({ api, publicList, readmeThemeVars, guideTokens }) {
  const errors = [];
  // Variável do consumidor: declarada (`--x: ...`) ou registrada por `@property`.
  const allVars = sortUnique([...api.variables, ...api.properties]);
  // A lista pública também pode nomear uma variável só consumida (gancho definido pelo consumidor).
  const pool = (kind) =>
    kind === 'variables' ? [...allVars, ...(api.consumed ?? [])] : api[kind];
  for (const kind of ['classes', 'variables', 'layers', 'properties']) {
    for (const item of publicList[kind] ?? []) {
      if (!pool(kind).includes(item))
        errors.push(
          `item público ausente do CSS (${kind}): ${item}; remova da lista ou restaure no CSS`,
        );
    }
  }
  const listedVars = new Set(publicList.variables ?? []);
  for (const v of readmeThemeVars ?? []) {
    const expanded = v.endsWith('*')
      ? allVars.filter((x) => x.startsWith(v.slice(0, -1)))
      : [v];
    if (v.endsWith('*') && expanded.length === 0)
      errors.push(
        `README do tema cita ${v}, mas nenhuma variável do CSS combina`,
      );
    for (const name of expanded)
      if (!listedVars.has(name))
        errors.push(
          `variável ${name} está na tabela do README do tema, mas não em css-public.json`,
        );
  }
  const listedClasses = new Set(publicList.classes ?? []);
  for (const token of guideTokens ?? []) {
    if (token.startsWith('--')) {
      if (allVars.includes(token) && !listedVars.has(token))
        errors.push(
          `o guia/README cita ${token}, que não é público (css-public.json)`,
        );
    } else {
      const name = token.slice(1);
      if (api.classes.includes(name) && !listedClasses.has(name))
        errors.push(
          `o guia/README cita ${token}, que não é público (css-public.json)`,
        );
    }
  }
  return errors;
}

function listCssFiles(pkgDir) {
  const files = [];
  for (const sub of ['styles', 'src']) {
    const dir = join(pkgDir, sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort())
      if (f.endsWith('.css')) files.push({ name: f, path: join(dir, f) });
  }
  return files;
}

function walkMarkdown(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walkMarkdown(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

/** Confere (ou, com `update`, regrava) os relatórios CSS de um pacote. */
export function runCssApi(
  packageDir,
  { root = process.cwd(), update = false } = {},
) {
  const pkgDir = resolve(packageDir);
  const errors = [];
  const files = listCssFiles(pkgDir);
  const apiDir = join(pkgDir, 'api');
  if (files.length === 0) return { errors, written: [] };
  const listPath = join(apiDir, 'css-public.json');
  if (!existsSync(listPath)) {
    errors.push(`${listPath}: lista pública ausente (css-public.json)`);
    return { errors, written: [] };
  }
  const publicList = JSON.parse(readFileSync(listPath, 'utf8'));
  const isTheme = basename(pkgDir) === 'theme';
  const readmePath = join(pkgDir, 'README.md');
  const readmeThemeVars =
    isTheme && existsSync(readmePath)
      ? extractReadmeThemeVars(readFileSync(readmePath, 'utf8'))
      : undefined;
  const docs = [
    ...walkMarkdown(join(root, 'apps', 'docs', 'content', 'guia')),
    ...(existsSync(readmePath) ? [readmePath] : []),
  ];
  const guideTokens = sortUnique(
    docs.flatMap((p) => extractGuideTokens(readFileSync(p, 'utf8'))),
  );
  const written = [];
  const expectedReports = new Set();
  for (const f of files) {
    const api = extractCssApi(readFileSync(f.path, 'utf8'));
    errors.push(
      ...checkCssApi({ api, publicList, readmeThemeVars, guideTokens }).map(
        (e) => `${f.name}: ${e}`,
      ),
    );
    const reportName = `${f.name.replace(/\.css$/, '')}.css-api.md`;
    expectedReports.add(reportName);
    const report = renderCssReport({ file: f.name, api, publicList });
    const target = join(apiDir, reportName);
    if (update) {
      mkdirSync(apiDir, { recursive: true });
      writeFileSync(target, report);
      written.push(target);
    } else if (!existsSync(target)) {
      errors.push(
        `${reportName}: relatório CSS ausente (rode com UPDATE_API=1)`,
      );
    } else if (eol(readFileSync(target, 'utf8')) !== report) {
      errors.push(
        `${reportName}: relatório CSS desatualizado (rode com UPDATE_API=1 e revise a diferença)`,
      );
    }
  }
  if (update) {
    for (const f of existsSync(apiDir) ? readdirSync(apiDir) : [])
      if (f.endsWith('.css-api.md') && !expectedReports.has(f))
        rmSync(join(apiDir, f));
  }
  return { errors, written };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('uso: node tools/css-api.mjs <dir-do-pacote>');
    process.exit(2);
  }
  const update = process.env.UPDATE_API === '1';
  const { errors } = runCssApi(dir, { update });
  if (errors.length) {
    console.error(`css-api: ${errors.length} problema(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `css-api: ${update ? 'relatórios atualizados' : 'relatórios conferidos'} em ${dir}`,
  );
}
