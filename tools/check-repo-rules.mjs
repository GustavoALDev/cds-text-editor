import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
