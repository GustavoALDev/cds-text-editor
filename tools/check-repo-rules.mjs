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
