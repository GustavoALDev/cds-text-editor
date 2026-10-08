import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

function checkApp(rootDir, app) {
  const demo = join(rootDir, 'apps', app);
  if (!existsSync(demo)) return [];
  const errors = [];
  const rel = (file) =>
    `apps/${app}/${relative(demo, file).split(sep).join('/')}`;

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

export function checkRepoRules(rootDir) {
  const errors = [];
  errors.push(...checkApp(rootDir, 'demo'), ...checkApp(rootDir, 'docs'));
  // Só no repositório real (com package.json na raiz); fixtures parciais de teste ficam de fora.
  if (existsSync(join(rootDir, 'package.json'))) {
    for (const file of GOVERNANCE_FILES) {
      if (!existsSync(join(rootDir, file))) {
        errors.push(
          `${file}: arquivo de governança obrigatório ausente (spec 09)`,
        );
      }
    }
  }
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
