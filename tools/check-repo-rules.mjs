import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

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

export function checkRepoRules(rootDir) {
  const errors = [];
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
