import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateCompat } from './compat.mjs';

const NO_ANGULAR = ['core', 'sanitizer', 'theme'];
const DEP_FIELDS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
  'devDependencies',
];

const GOVERNANCE_FILES = [
  'SECURITY.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'docs/support.md',
  'docs/open-core.md',
  'docs/security.md',
  'docs/release/prontidao-1.0.md',
  '.github/workflows/release.yml',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
];
// Piso 22.x e teto <23 (o @cds/rte-angular pode subir o piso para um minor do 22).
const ANGULAR_PEER_RANGE = /^>=22\.\d+\.\d+ <23$/;

const ts = createRequire(import.meta.url)('typescript');

// tsconfig aceita comentários (JSONC): usa o parser do TypeScript, que é
// consciente de strings (globs com "/*" e URLs com "//" não são comentários).
function readTsconfig(path) {
  const { config, error } = ts.parseConfigFileTextToJson(
    path,
    readFileSync(path, 'utf8'),
  );
  if (error)
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  return config;
}

// Arquivos .ts de produção de um pacote (sem specs, testing-support, dist e node_modules).
function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (
      name === 'node_modules' ||
      name === 'dist' ||
      name === 'testing-support'
    )
      continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.ts$/.test(name) && !/\.(spec|d)\.ts$/.test(name))
      out.push(full);
  }
  return out;
}

// O JSDoc imediatamente antes de `export function|const|class <name>` contém @internal?
// null = declaração não encontrada neste arquivo.
function declarationIsInternal(source, name) {
  const re = new RegExp(
    String.raw`(?:/\*\*(?:(?!\*/)[\s\S])*\*/\s*)?export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function|const|class)\s+` +
      name.replace(/\$/g, String.raw`\$`) +
      String.raw`(?![\w$])`,
  );
  const m = re.exec(source);
  return m ? /@internal\b/.test(m[0]) : null;
}

// Spec 05d2 (Z8): todo export com prefixo `ɵ` precisa de @internal no JSDoc da declaração.
function checkInternalExports(pkgDir, pkg) {
  const errors = [];
  const files = sourceFiles(pkgDir).map((f) => [f, readFileSync(f, 'utf8')]);
  const decl = (name) => {
    for (const [, src] of files) {
      const r = declarationIsInternal(src, name);
      if (r !== null) return r;
    }
    return false;
  };
  const seen = new Set();
  for (const [file, src] of files) {
    const rel = `packages/${pkg}/${relative(pkgDir, file).split(sep).join('/')}`;
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const item of m[1].split(',')) {
        const mm = /^\s*(?:type\s+)?([\w$]+)\s+as\s+(ɵ[\w$]*)\s*$/.exec(item);
        if (!mm || seen.has(mm[2])) continue;
        seen.add(mm[2]);
        if (!decl(mm[1]))
          errors.push(
            `${rel}: o export ${mm[2]} exige @internal no JSDoc de ${mm[1]} (spec 05d2, Z8)`,
          );
      }
    }
    for (const m of src.matchAll(
      /export\s+(?:declare\s+)?(?:function|const|class)\s+(ɵ[\w$]*)/g,
    )) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      if (!declarationIsInternal(src, m[1]))
        errors.push(
          `${rel}: o export ${m[1]} exige @internal no JSDoc (spec 05d2, Z8)`,
        );
    }
  }
  return errors;
}

// Spec 05d2 (Z13): todo entry público (subcaminho do `exports` com `types`, ou subdiretório
// com ng-package.json nos pacotes do ng-packagr) é citado no README do pacote.
function publicEntries(pkgDir, name) {
  const subpaths = ['.'];
  const manifest = JSON.parse(
    readFileSync(join(pkgDir, 'package.json'), 'utf8'),
  );
  for (const [sub, target] of Object.entries(manifest.exports ?? {})) {
    if (
      sub !== '.' &&
      sub.startsWith('.') &&
      typeof target === 'object' &&
      target?.types
    )
      subpaths.push(sub.slice(2));
  }
  for (const dir of readdirSync(pkgDir)) {
    const full = join(pkgDir, dir);
    if (
      dir !== 'node_modules' &&
      dir !== 'dist' &&
      statSync(full).isDirectory() &&
      existsSync(join(full, 'ng-package.json'))
    )
      subpaths.push(dir);
  }
  return [...new Set(subpaths)].map((sub) =>
    sub === '.' ? name : `${name}/${sub}`,
  );
}

function checkReadmeEntries(pkgDir, pkg) {
  const manifestPath = join(pkgDir, 'package.json');
  if (!existsSync(manifestPath)) return [];
  const { name } = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!name) return [];
  const entries = publicEntries(pkgDir, name);
  const readmePath = join(pkgDir, 'README.md');
  if (!existsSync(readmePath)) return [];
  const readme = readFileSync(readmePath, 'utf8');
  const errors = [];
  for (const entry of entries) {
    // Cita o entry inteiro: o caractere seguinte não pode continuar o nome (`/html` não cobre `/html-extra`).
    const cited = readme
      .split(entry)
      .slice(1)
      .some((rest) => !/^[\w/-]/.test(rest));
    if (!cited)
      errors.push(
        `packages/${pkg}/README.md: o entry público ${entry} não é citado (spec 05d2, Z13)`,
      );
  }
  return errors;
}

// ---- Demo (spec 07b, W3/W4): `apps/demo` é um consumidor externo dos tarballs ----

// Dependências de terceiros do demo que precisam ser exatamente as da raiz (W3).
const DEMO_EXACT = [
  /^@angular\//,
  /^@tiptap\//,
  /^lowlight$/,
  /^highlight\.js$/,
  /^rxjs$/,
  /^typescript$/,
];

const insideDir = (parent, child) => {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

function walk(dir, accept) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', '.angular'].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, accept));
    else if (accept(name)) out.push(full);
  }
  return out;
}

// Atributos que o CSP `style-src 'self'` bloqueia no HTML pré-renderizado (W4).
const STYLE_ATTR =
  /(?:\s|^)(?:style\s*=|\[style[\].]|\[ngStyle\]|\[attr\.style\])/;

// Chaves de `host: {}` que aplicam estilo inline (o CSP `style-src 'self'` as bloqueia).
const HOST_STYLE =
  /(?:^|[,{\s])(?:(['"`])\[?(?:style(?:\.[\w.-]+)?|ngStyle|attr\.style)\]?\1|style)\s*:/;

// Especificadores de import/export/import()/require de um arquivo TypeScript.
function importSpecifiers(source) {
  const re =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/g;
  return [...source.matchAll(re)].map((m) => m[2]);
}

// Blocos cercados do conteúdo do site (spec 07c, X6/R4): cada um precisa de uma diretiva
// example|generated|no-compile na linha anterior (ignorando linhas em branco).
const CONTENT_DIRECTIVE =
  /^\s*<!--\s*(?:example|generated|no-compile)\s*:\s*\S.*-->\s*$/;
const CONTENT_FENCE = /^( {0,3})(`{3,}|~{3,})/;
// Cerca em lista (recuo >= 4, ou na própria linha do marcador) ou citação: o conversor também
// as recusa (marca das diretivas), aqui a mensagem aponta a linha.
const CONTENT_NESTED_FENCE =
  /^(?: {4,}|\t|[ \t]*(?:>|[-*+]\s|\d+[.)]\s))[ \t>]*(?:[-*+]\s+|\d+[.)]\s+)?(`{3,}|~{3,})/;

export function checkContentFences(text, where) {
  const errors = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let fence = null;
  let previous = '';
  let nested = null;
  lines.forEach((line, i) => {
    const m = CONTENT_FENCE.exec(line);
    if (fence) {
      if (m && m[2][0] === fence[0] && m[2].length >= fence.length)
        fence = null;
      return;
    }
    const n = m ? null : CONTENT_NESTED_FENCE.exec(line);
    if (nested) {
      if (n && n[1][0] === nested[0] && n[1].length >= nested.length)
        nested = null;
      return;
    }
    if (n) {
      errors.push(
        `${where}:${i + 1}: bloco de código aninhado em lista ou citação não é suportado; leve-o para o nível raiz da página com uma diretiva (spec 07c, X6)`,
      );
      nested = n[1];
      return;
    }
    if (m) {
      if (!CONTENT_DIRECTIVE.test(previous))
        errors.push(
          `${where}:${i + 1}: bloco de código sem diretiva na linha anterior (<!-- example: ... -->, <!-- generated: ... --> ou <!-- no-compile: motivo -->; spec 07c, X6)`,
        );
      fence = m[2];
    }
    if (line.trim()) previous = line;
  });
  return errors;
}

function checkApp(rootDir, app) {
  const demo = join(rootDir, 'apps', app);
  if (!existsSync(demo)) return [];
  const errors = [];
  const rel = (file) =>
    `apps/${app}/${relative(demo, file).split(sep).join('/')}`;

  if (app === 'docs' && existsSync(join(demo, 'content'))) {
    for (const file of walk(join(demo, 'content'), (n) => /\.md$/.test(n))) {
      errors.push(...checkContentFences(readFileSync(file, 'utf8'), rel(file)));
    }
  }

  // CSS de exemplo do guia (07d, L4): classe envolvente, nunca o chrome do site.
  const stylesDir = join(demo, 'src', 'styles');
  if (app === 'docs' && existsSync(stylesDir)) {
    for (const file of walk(stylesDir, (n) => /^exemplos.*\.css$/.test(n))) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/([^{}]+)\{/g)) {
        const bad = /(^|[\s,>+~(])(:root|html|body)(?![\w-])/.exec(m[1]);
        if (bad) {
          errors.push(
            `${rel(file)}: o seletor "${m[1].trim()}" mira ${bad[2]}; CSS de exemplo usa uma classe envolvente (.meu-tema), para não mudar o chrome do site (spec 07d, L4)`,
          );
          break;
        }
      }
    }
  }

  for (const name of readdirSync(demo)) {
    if (name === 'package-lock.json') {
      errors.push(
        `apps/${app}/package-lock.json: o ${app} não tem lockfile (o hash dos tarballs muda a cada build; spec 07b, W2)`,
      );
    }
    if (!/^tsconfig.*\.json$/.test(name)) continue;
    let config;
    try {
      config = readTsconfig(join(demo, name));
    } catch (e) {
      errors.push(`apps/${app}/${name}: não foi possível ler (${e.message})`);
      continue;
    }
    if (config.compilerOptions?.paths !== undefined) {
      errors.push(
        `apps/${app}/${name}: "paths" é proibido no ${app} (consome @cds/* só pelos tarballs; spec 07b, W3)`,
      );
    }
    for (const target of [config.extends].flat().filter(Boolean)) {
      if (
        typeof target === 'string' &&
        (target.startsWith('.') || isAbsolute(target)) &&
        !insideDir(demo, resolve(demo, target))
      ) {
        errors.push(
          `apps/${app}/${name}: "extends" (${target}) sai de apps/${app} (spec 07b, W3)`,
        );
      }
    }
  }

  const manifestPath = join(demo, 'package.json');
  const rootManifestPath = join(rootDir, 'package.json');
  if (existsSync(manifestPath) && existsSync(rootManifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const rootManifest = JSON.parse(readFileSync(rootManifestPath, 'utf8'));
    const rootVersions = {
      ...rootManifest.dependencies,
      ...rootManifest.devDependencies,
    };
    for (const field of ['dependencies', 'devDependencies']) {
      for (const [dep, version] of Object.entries(manifest[field] ?? {})) {
        if (!DEMO_EXACT.some((re) => re.test(dep)) || !rootVersions[dep]) {
          continue;
        }
        const exact = rootVersions[dep].replace(/^[\^~]/, '');
        if (version !== exact) {
          errors.push(
            `apps/${app}/package.json: ${dep} deve ser exatamente ${exact} (a da raiz), está "${version}" (spec 07b, W3)`,
          );
        }
      }
    }
  }

  // `serve.mjs`, `e2e/` e demais arquivos fora de `src/` são ferramentas do repositório.
  const src = join(demo, 'src');
  if (existsSync(src)) {
    const sources = walk(src, (n) => /\.ts$/.test(n) && !/\.d\.ts$/.test(n));
    for (const file of sources) {
      const source = readFileSync(file, 'utf8');
      for (const spec of importSpecifiers(source)) {
        const isPath =
          spec.startsWith('.') || isAbsolute(spec) || spec.startsWith('file:');
        let target;
        try {
          target = spec.startsWith('file:')
            ? fileURLToPath(spec)
            : resolve(dirname(file), spec);
        } catch {
          target = null; // file: malformado
        }
        const bad = isPath
          ? target === null ||
            !insideDir(demo, target) ||
            /(^|\/)(packages|dist)\//.test(spec)
          : /^(packages|dist)\//.test(spec);
        if (bad) {
          errors.push(
            `${rel(file)}: import "${spec}" sai de apps/${app} ou aponta para packages/ ou dist/ (spec 07b, W3)`,
          );
        }
      }
      const allowedTrust =
        app === 'docs' && rel(file) === 'apps/docs/src/app/content/doc-html.ts';
      if (!allowedTrust && /\bbypassSecurityTrust\w*/.test(source)) {
        errors.push(
          `${rel(file)}: bypassSecurityTrust* só é permitido em apps/docs/src/app/content/doc-html.ts (spec 07c, X2)`,
        );
      }
      if (
        /@Component\b/.test(source) &&
        /\b(?:styleUrls?|styles)\s*:/.test(source)
      ) {
        errors.push(
          `${rel(file)}: componente com styleUrl/styleUrls/styles (gera <style> inline barrado pela CSP; o CSS vai em src/styles/ e é importado por src/styles.css; spec 07b, W4)`,
        );
      }
      for (const m of source.matchAll(/\bhost\s*:\s*\{([^}]*)\}/g)) {
        if (HOST_STYLE.test(m[1])) {
          errors.push(
            `${rel(file)}: host com style, [style…], [ngStyle] ou [attr.style] (CSP estrita; spec 07b, W4)`,
          );
        }
      }
      if (/@HostBinding\(\s*['"`](?:style|attr\.style)\b/.test(source)) {
        errors.push(
          `${rel(file)}: @HostBinding de style (CSP estrita; spec 07b, W4)`,
        );
      }
      for (const m of source.matchAll(
        /\btemplate\s*:\s*(`[\s\S]*?`|'[^'\n]*'|"[^"\n]*")/g,
      )) {
        if (STYLE_ATTR.test(m[1])) {
          errors.push(
            `${rel(file)}: template inline com style=, [style…] ou [ngStyle] (CSP estrita; spec 07b, W4)`,
          );
        }
      }
    }
    for (const file of walk(src, (n) => /\.html$/.test(n))) {
      if (STYLE_ATTR.test(readFileSync(file, 'utf8'))) {
        errors.push(
          `${rel(file)}: style=, [style…] ou [ngStyle] no template (CSP estrita; spec 07b, W4)`,
        );
      }
    }
  }
  return errors;
}

// Spec 08b (O2): capturas da regressão visual versionadas em git comum, com teto por arquivo e total.
const SHOT_MAX_FILE = 300 * 1024;
const SHOT_MAX_TOTAL = 20 * 1024 * 1024;
const SHOT_DIRS = [
  ['e2e', 'visual', '__screenshots__'],
  ['apps', 'demo', 'e2e', 'visual', '__screenshots__'],
];
function checkScreenshots(rootDir) {
  return SHOT_DIRS.flatMap((parts) =>
    checkScreenshotsIn(rootDir, join(rootDir, ...parts)),
  );
}
function checkScreenshotsIn(rootDir, base) {
  if (!existsSync(base)) return [];
  const errors = [];
  let total = 0;
  const walkShots = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walkShots(full);
      else {
        total += st.size;
        if (st.size > SHOT_MAX_FILE) {
          errors.push(
            `${relative(rootDir, full).split(sep).join('/')}: captura com ${Math.ceil(st.size / 1024)} KB acima do teto de 300 KB por arquivo (spec 08b, O2)`,
          );
        }
      }
    }
  };
  walkShots(base);
  if (total > SHOT_MAX_TOTAL) {
    errors.push(
      `${relative(rootDir, base).split(sep).join('/')}: ${(total / 1024 / 1024).toFixed(1)} MB acima do teto de 20 MB no total (spec 08b, O2)`,
    );
  }
  return errors;
}

/** README raiz (spec 07d, L6): o aviso "não afiliado" aparece antes do primeiro `##` e depois do último. */
export function checkRootReadmeNotice(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const heads = lines.flatMap((l, i) => (/^## /.test(l) ? [i] : []));
  const notice = /não\s+(é\s+)?afiliad/i;
  const errors = [];
  const first = heads.length ? heads[0] : lines.length;
  if (!lines.slice(0, first).some((l) => notice.test(l)))
    errors.push(
      'README.md: falta o aviso "não afiliado à Tiptap nem ao ProseMirror" antes do primeiro "##" (spec 07d, L6)',
    );
  const last = heads.length ? heads[heads.length - 1] : -1;
  if (!lines.slice(last + 1).some((l) => notice.test(l)))
    errors.push(
      'README.md: falta o aviso "não afiliado à Tiptap nem ao ProseMirror" depois do último "##" (spec 07d, L6)',
    );
  return errors;
}

// Spec 08a (X5): todo teto e todo `skip` de tools/compat.json exigem `reason` e `adr`.
// Sem o arquivo (fixtures parciais), a regra não faz nada.
function checkCompat(rootDir) {
  const path = join(rootDir, 'tools', 'compat.json');
  if (!existsSync(path)) return [];
  try {
    validateCompat(JSON.parse(readFileSync(path, 'utf8')));
    return [];
  } catch (e) {
    return [e.message];
  }
}

// Spec 08b (O9): o roteiro manual de leitor de tela existe e traz os fluxos, o critério da K4 e o
// modelo de registro. Só no repositório real (com package.json na raiz).
const ROTEIRO = 'docs/quality/roteiro-leitor-de-tela.md';
const ROTEIRO_SECOES = [
  '### F1. Rótulo e descrição do editável',
  '### F2. Barra de ferramentas',
  '### F3. `Alt+F10` e menus flutuantes',
  '### F4. Menu `/` (inserção de blocos), critério da K4',
  '### F5. Busca',
  '### F6. Diálogos',
  '### F7. Contadores e limite',
  '### F8. Envio de arquivos',
  '### F9. Rascunho',
  '### F10. `rte-render`',
  '### F11. Modo de navegação × foco do NVDA',
  '## Seção móvel real',
  '## Critério da K4',
  '## Severidade',
  '## Modelo de registro',
];
const ROTEIRO_CAMPOS = [
  'Data:',
  'Executor:',
  'Commit:',
  'Sistema operacional:',
  'Leitor de tela e versão:',
  'Navegador e versão:',
  'Resultado da K4:',
];
export function checkRoteiro(rootDir) {
  const path = join(rootDir, ROTEIRO);
  if (!existsSync(path)) {
    return [
      `${ROTEIRO}: roteiro manual de leitor de tela obrigatório ausente (spec 08b, O9)`,
    ];
  }
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const errors = [];
  for (const secao of ROTEIRO_SECOES) {
    if (!text.includes(`\n${secao}`)) {
      errors.push(`${ROTEIRO}: seção ausente "${secao}" (spec 08b, O9)`);
    }
  }
  for (const campo of ROTEIRO_CAMPOS) {
    if (!text.includes(campo)) {
      errors.push(
        `${ROTEIRO}: campo "${campo}" ausente do modelo de registro (spec 08b, O9)`,
      );
    }
  }
  if (!/aria-activedescendant/.test(text) || !/região viva/.test(text)) {
    errors.push(
      `${ROTEIRO}: o critério da K4 deve citar aria-activedescendant e a região viva (spec 08b, O9)`,
    );
  }
  return errors;
}

// Dependências internas (spec 09c, AP12): `@cds/rte-*` importado vai em `dependencies`
// com a versão exata do pacote referido; nenhum peer interno; ng-package.json lista as
// internas em `allowedNonPeerDependencies`.
const INTERNAL_SCOPE = '@cds/rte-';
const INTERNAL_IMPORT = /^(@cds\/rte-[a-z]+)(?:\/|$)/;

export function checkInternalDeps(rootDir) {
  const errors = [];
  const packagesDir = join(rootDir, 'packages');
  if (!existsSync(packagesDir)) return errors;
  const manifests = new Map();
  for (const dir of readdirSync(packagesDir)) {
    const path = join(packagesDir, dir, 'package.json');
    if (!existsSync(path)) continue;
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifests.set(dir, manifest);
  }
  const versions = new Map(
    [...manifests.values()].map((m) => [m.name, m.version]),
  );
  for (const [dir, manifest] of manifests) {
    const where = `packages/${dir}/package.json`;
    for (const field of ['peerDependencies', 'peerDependenciesMeta']) {
      for (const dep of Object.keys(manifest[field] ?? {})) {
        if (dep.startsWith(INTERNAL_SCOPE)) {
          errors.push(
            `${where}: ${dep} em ${field} (proibido: dependência interna vai em dependencies, com versão exata)`,
          );
        }
      }
    }
    const internal = Object.entries(manifest.dependencies ?? {}).filter(([d]) =>
      d.startsWith(INTERNAL_SCOPE),
    );
    for (const [dep, range] of internal) {
      const expected = versions.get(dep);
      if (expected === undefined) continue;
      if (range !== expected) {
        errors.push(
          `${where}: dependência ${dep} deve ser a versão exata ${expected} (está "${range}")`,
        );
      }
    }
    const declared = new Set(Object.keys(manifest.dependencies ?? {}));
    const pkgDir = join(packagesDir, dir);
    const reported = new Set();
    for (const file of walk(
      pkgDir,
      (n) => /\.ts$/.test(n) && !/\.(spec|d)\.ts$/.test(n),
    )) {
      if (file.split(sep).includes('testing-support')) continue;
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        const m = INTERNAL_IMPORT.exec(spec);
        if (!m || m[1] === manifest.name || declared.has(m[1])) continue;
        const key = `${file}|${m[1]}`;
        if (reported.has(key)) continue;
        reported.add(key);
        errors.push(
          `${relative(rootDir, file).split(sep).join('/')}: importa ${m[1]}, que falta em dependencies de ${where}`,
        );
      }
    }
    const ngPath = join(pkgDir, 'ng-package.json');
    if (internal.length && existsSync(ngPath)) {
      const ng = JSON.parse(readFileSync(ngPath, 'utf8'));
      const allowed = new Set(ng.allowedNonPeerDependencies ?? []);
      for (const [dep] of internal) {
        if (!allowed.has(dep)) {
          errors.push(
            `packages/${dir}/ng-package.json: allowedNonPeerDependencies deve listar ${dep}`,
          );
        }
      }
    }
  }
  return errors;
}

// Nomes públicos antigos (spec 09c, AP3): renomeados ou removidos; nada foi publicado, então não há alias.
export const OLD_TO_NEW = {
  DEFAULT_ID_PREFIX: 'RTE_DEFAULT_ID_PREFIX',
  DEFAULT_LINK_POLICY: 'RTE_DEFAULT_LINK_POLICY',
  DraftStorage: 'RteDraftStorage',
  DraftStore: 'RteDraftStore',
  DraftStoreOptions: 'RteDraftStoreOptions',
  SrcsetCandidate: 'RteSrcsetCandidate',
  DEFAULT_EMBED_PROVIDERS: 'RTE_EMBED_PROVIDERS',
  YOUTUBE_PROVIDER: 'RTE_YOUTUBE_PROVIDER',
  VIMEO_PROVIDER: 'RTE_VIMEO_PROVIDER',
  SPOTIFY_PROVIDER: 'RTE_SPOTIFY_PROVIDER',
  SerializeRteHtmlOptions: 'RteSerializeHtmlOptions',
  ExtractTocOptions: 'RteExtractTocOptions',
  HtmlToTextOptions: 'RteHtmlToTextOptions',
  ValidateHtmlOptions: 'RteValidateHtmlOptions',
  ApplyRteThemeOptions: 'RteApplyThemeOptions',
  CheckThemeOptions: 'RteCheckThemeOptions',
  CreateRteThemeOptions: 'RteCreateThemeOptions',
  SuggestRteColorOptions: 'RteSuggestColorOptions',
  ColorParser: 'RteColorParser',
  Rgb: 'RteRgb',
};
// Removidos sem substituto (também proibidos).
export const REMOVED_NAMES = [
  'ANGULAR_DEFAULTS',
  'CORE_VERSION',
  'SANITIZER_VERSION',
  'THEME_VERSION',
  'RENDER_VERSION',
];
const OLD_NAME_SKIP_PREFIXES = [
  'docs/decisions/',
  'docs/specs/',
  'docs/superpowers/',
];
const OLD_NAME_SKIP_FILES = new Set([
  'tools/check-repo-rules.mjs',
  'tools/check-repo-rules.test.mjs',
  'package-lock.json',
  'THIRD-PARTY-NOTICES.md',
]);
const OLD_NAME_SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.angular',
  '.git',
  '.nx',
  'coverage',
  'test-results',
  'playwright-report',
]);
const OLD_NAME_MAX_BYTES = 2 * 1024 * 1024;
const oldNameRegex = (name) =>
  new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`, 'g');

function trackedFiles(rootDir) {
  const git = spawnSync('git', ['ls-files', '-z'], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (git.status === 0 && git.stdout) {
    return git.stdout
      .split('\0')
      .filter(Boolean)
      .filter((p) => existsSync(join(rootDir, p)));
  }
  const out = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      if (OLD_NAME_SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) visit(full);
      else out.push(relative(rootDir, full).split(sep).join('/'));
    }
  };
  visit(rootDir);
  return out;
}

/** Nomes antigos da API pública (09c, AP3) em qualquer texto rastreado, exceto ADRs, specs e planos. */
export function checkOldNames(rootDir) {
  const errors = [];
  const entries = [
    ...Object.entries(OLD_TO_NEW).map(([old, novo]) => [old, novo]),
    ...REMOVED_NAMES.map((old) => [old, null]),
  ].map(([old, novo]) => [old, novo, oldNameRegex(old)]);
  for (const path of trackedFiles(rootDir)) {
    if (
      OLD_NAME_SKIP_FILES.has(path) ||
      OLD_NAME_SKIP_PREFIXES.some((p) => path.startsWith(p))
    ) {
      continue;
    }
    const full = join(rootDir, path);
    if (statSync(full).size > OLD_NAME_MAX_BYTES) continue;
    const buf = readFileSync(full);
    if (buf.includes(0)) continue; // binário
    const lines = buf.toString('utf8').split(/\r?\n/);
    for (const [old, novo, re] of entries) {
      for (let i = 0; i < lines.length; i++) {
        re.lastIndex = 0;
        if (re.test(lines[i])) {
          errors.push(
            `${path}:${i + 1}: nome antigo da API "${old}" ${
              novo ? `(use "${novo}")` : '(removido, sem substituto)'
            }`,
          );
        }
      }
    }
  }
  return errors;
}

// CSS publicado (spec 09c, AP7): todo `styles/*.css` (e o `src/*.css` do tema) tem relatório
// `api/<arquivo>.css-api.md` e a lista `api/css-public.json`.
export function checkCssReports(rootDir) {
  const errors = [];
  const packagesDir = join(rootDir, 'packages');
  if (!existsSync(packagesDir)) return errors;
  for (const pkg of readdirSync(packagesDir)) {
    const pkgDir = join(packagesDir, pkg);
    if (!statSync(pkgDir).isDirectory()) continue;
    const cssFiles = ['styles', 'src'].flatMap((sub) =>
      existsSync(join(pkgDir, sub))
        ? readdirSync(join(pkgDir, sub)).filter((f) => f.endsWith('.css'))
        : [],
    );
    if (cssFiles.length === 0) continue;
    if (!existsSync(join(pkgDir, 'api', 'css-public.json'))) {
      errors.push(
        `packages/${pkg}/api/css-public.json: lista pública do CSS ausente (spec 09c, AP7)`,
      );
    }
    for (const css of cssFiles) {
      const report = `${css.replace(/\.css$/, '')}.css-api.md`;
      if (!existsSync(join(pkgDir, 'api', report))) {
        errors.push(
          `packages/${pkg}/api/${report}: relatório do CSS publicado ${css} ausente (rode UPDATE_API=1 node tools/css-api.mjs packages/${pkg})`,
        );
      }
    }
  }
  return errors;
}

// Lista de prontidão para a 1.0 (spec 09c, AP14): tabela `| Item | Dono | Evidência | Estado |`.
const PRONTIDAO = 'docs/release/prontidao-1.0.md';
export function checkProntidao(rootDir) {
  const path = join(rootDir, PRONTIDAO);
  if (!existsSync(path)) {
    return [
      `${PRONTIDAO}: lista de prontidão para a 1.0 obrigatória ausente (spec 09c, AP14)`,
    ];
  }
  const lines = readFileSync(path, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const cells = (line) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  const header = lines.findIndex((l) =>
    /^\|\s*Item\s*\|\s*Dono\s*\|\s*Evidência\s*\|\s*Estado\s*\|\s*$/.test(l),
  );
  if (header < 0) {
    return [
      `${PRONTIDAO}: tabela "| Item | Dono | Evidência | Estado |" ausente (spec 09c, AP14)`,
    ];
  }
  const errors = [];
  let rows = 0;
  for (let i = header + 2; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('|')) break;
    rows++;
    const [item = '', dono = '', evidencia = '', estado = ''] = cells(lines[i]);
    const where = `${PRONTIDAO}:${i + 1}`;
    if (dono !== 'agente' && dono !== 'dono') {
      errors.push(
        `${where}: dono deve ser "agente" ou "dono" (item "${item}")`,
      );
    }
    const estadoBase = estado.split(/[\s—-]/)[0];
    if (estadoBase !== 'feito' && estadoBase !== 'aberto') {
      errors.push(
        `${where}: estado deve ser "feito" ou "aberto" (item "${item}")`,
      );
    }
    if (estadoBase === 'feito' && evidencia === '') {
      errors.push(`${where}: item feito sem evidência (item "${item}")`);
    }
    if (
      dono === 'dono' &&
      estadoBase === 'aberto' &&
      !lines[i].includes('TODO-AUTOR')
    ) {
      errors.push(
        `${where}: item do dono em aberto sem TODO-AUTOR (item "${item}")`,
      );
    }
  }
  if (rows === 0) {
    errors.push(
      `${PRONTIDAO}: a tabela não tem nenhuma linha (spec 09c, AP14)`,
    );
  }
  return errors;
}

export function checkRepoRules(rootDir) {
  const errors = [];
  errors.push(...checkCssReports(rootDir));
  errors.push(...checkApp(rootDir, 'demo'), ...checkApp(rootDir, 'docs'));
  errors.push(...checkCompat(rootDir));
  errors.push(...checkScreenshots(rootDir));
  // Só no repositório real (com package.json na raiz); fixtures parciais de teste ficam de fora.
  if (existsSync(join(rootDir, 'package.json'))) {
    errors.push(...checkRoteiro(rootDir));
    errors.push(...checkProntidao(rootDir));
    for (const file of GOVERNANCE_FILES) {
      if (!existsSync(join(rootDir, file))) {
        errors.push(
          `${file}: arquivo de governança obrigatório ausente (spec 09)`,
        );
      }
    }
  }
  errors.push(...checkInternalDeps(rootDir));
  if (existsSync(join(rootDir, 'package.json')))
    errors.push(...checkOldNames(rootDir));
  const rootReadme = join(rootDir, 'README.md');
  if (existsSync(join(rootDir, 'package.json')) && existsSync(rootReadme))
    errors.push(...checkRootReadmeNotice(readFileSync(rootReadme, 'utf8')));
  const packagesDir = join(rootDir, 'packages');
  if (!existsSync(packagesDir)) return errors;

  for (const pkg of readdirSync(packagesDir)) {
    if (!statSync(join(packagesDir, pkg)).isDirectory()) continue;
    errors.push(...checkInternalExports(join(packagesDir, pkg), pkg));
    errors.push(...checkReadmeEntries(join(packagesDir, pkg), pkg));
    const manifestPath = join(packagesDir, pkg, 'package.json');
    if (NO_ANGULAR.includes(pkg) && existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      for (const field of DEP_FIELDS) {
        for (const dep of Object.keys(manifest[field] ?? {})) {
          if (dep.startsWith('@angular/')) {
            errors.push(
              `packages/${pkg}/package.json: ${dep} em ${field} (proibido em ${pkg})`,
            );
          }
        }
      }
    }
    if (!NO_ANGULAR.includes(pkg) && existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      for (const [dep, range] of Object.entries(
        manifest.peerDependencies ?? {},
      )) {
        if (dep.startsWith('@angular/') && !ANGULAR_PEER_RANGE.test(range)) {
          errors.push(
            `packages/${pkg}/package.json: peer ${dep} deve ser ">=22.x.y <23" (está "${range}")`,
          );
        }
      }
    }
    const specConfig = join(packagesDir, pkg, 'tsconfig.spec.json');
    if (existsSync(specConfig)) {
      let config;
      try {
        config = readTsconfig(specConfig);
      } catch (e) {
        errors.push(
          `packages/${pkg}/tsconfig.spec.json: não foi possível ler (${e.message})`,
        );
        continue;
      }
      if (config.compilerOptions?.composite === true) {
        errors.push(
          `packages/${pkg}/tsconfig.spec.json: composite deve ser false`,
        );
      }
    }
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const errors = checkRepoRules(process.cwd());
  for (const e of errors) console.error(e);
  process.exit(errors.length ? 1 : 0);
}
