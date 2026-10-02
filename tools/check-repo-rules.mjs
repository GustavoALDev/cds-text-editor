import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const NO_ANGULAR = ['core', 'sanitizer', 'theme'];
const DEP_FIELDS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
  'devDependencies',
];

// tsconfig aceita comentários (JSONC): remove comentários de bloco e de linha inteira.
function readJsonc(path) {
  const text = readFileSync(path, 'utf8');
  return JSON.parse(text.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, ''));
}

export function checkRepoRules(rootDir) {
  const errors = [];
  const packagesDir = join(rootDir, 'packages');
  if (!existsSync(packagesDir)) return errors;

  for (const pkg of readdirSync(packagesDir)) {
    if (!statSync(join(packagesDir, pkg)).isDirectory()) continue;
    const manifestPath = join(packagesDir, pkg, 'package.json');
    if (NO_ANGULAR.includes(pkg) && existsSync(manifestPath)) {
      const manifest = readJsonc(manifestPath);
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
    const specConfig = join(packagesDir, pkg, 'tsconfig.spec.json');
    if (existsSync(specConfig)) {
      const config = readJsonc(specConfig);
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
