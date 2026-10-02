import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Emenda à R14 (ADR 0001): 0BSD permitido (tslib, dependência de runtime dos pacotes ng-packagr).
const ALLOWED = new Set([
  '0BSD',
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
]);
const FORBIDDEN_RE = /(^|\/)(node_modules\/)?@tiptap-(pro|cloud)\//;
const MARKER = 'node_modules/';

export const nameOf = (key) =>
  key.slice(key.lastIndexOf(MARKER) + MARKER.length);

// Falha fechado: lockfile sem mapa `packages` utilizável (v1, {}, arquivo errado) não pode passar.
export function lockfileError(lock) {
  const packages = lock?.packages;
  const ok =
    typeof lock?.lockfileVersion === 'number' &&
    lock.lockfileVersion >= 2 &&
    packages !== null &&
    typeof packages === 'object' &&
    !Array.isArray(packages) &&
    Object.keys(packages).length > 0;
  return ok
    ? undefined
    : "lockfile inválido: sem 'packages' (lockfileVersion >= 2 exigido)";
}

const FORBIDDEN_FIELD_RE = /@tiptap-(pro|cloud)\//;
const FORBIDDEN_HOST_RE = /^https?:\/\/registry\.tiptap\.dev(\/|$)/;

// Nomes proibidos valem para o lockfile INTEIRO (inclui devDependencies, caminhos aninhados e
// aliases npm: a chave pode ser inocente enquanto `name`/`resolved` apontam para o pacote proibido).
export function checkForbiddenNames(lock) {
  const invalid = lockfileError(lock);
  if (invalid) return [invalid];
  const errors = [];
  for (const [key, entry] of Object.entries(lock.packages)) {
    const fields = [];
    if (FORBIDDEN_RE.test(key)) fields.push('chave');
    if (typeof entry?.name === 'string' && FORBIDDEN_FIELD_RE.test(entry.name))
      fields.push('name');
    const resolved = entry?.resolved;
    if (
      typeof resolved === 'string' &&
      (FORBIDDEN_FIELD_RE.test(resolved) || FORBIDDEN_HOST_RE.test(resolved))
    ) {
      fields.push('resolved');
    }
    if (fields.length)
      errors.push(`pacote proibido: ${key} (campo: ${fields.join(', ')})`);
  }
  return errors;
}

// Avalia uma expressão SPDX: AND exige todos os operandos permitidos, OR exige ao menos um.
// AND tem precedência sobre OR; qualquer coisa não reconhecida (ex.: WITH) é rejeitada.
export function isAllowed(expression) {
  const tokens = String(expression ?? '').match(/\(|\)|[^\s()]+/g) ?? [];
  let pos = 0;
  const parseOr = () => {
    let result = parseAnd();
    while (tokens[pos]?.toUpperCase() === 'OR') {
      pos++;
      const right = parseAnd();
      result = result || right;
    }
    return result;
  };
  const parseAnd = () => {
    let result = parseAtom();
    while (tokens[pos]?.toUpperCase() === 'AND') {
      pos++;
      const right = parseAtom();
      result = result && right;
    }
    return result;
  };
  const parseAtom = () => {
    const token = tokens[pos++];
    if (token === '(') {
      const inner = parseOr();
      if (tokens[pos++] !== ')') throw new Error('unbalanced');
      return inner;
    }
    if (token === undefined || token === ')') throw new Error('unexpected');
    return ALLOWED.has(token);
  };
  try {
    const result = parseOr();
    return pos === tokens.length && result;
  } catch {
    return false;
  }
}

const licenseFromEntry = (entry) =>
  typeof entry?.license === 'string' ? entry.license : undefined;

// Só o conjunto de produção (o que vai ao tarball) é checado: entradas dev/devOptional são
// toolchain. Pacotes do workspace (sem node_modules/ na chave, ou link: true) são ignorados.
export function checkLicenses(
  lock,
  licenseOf = (_name, entry) => licenseFromEntry(entry),
) {
  const invalid = lockfileError(lock);
  if (invalid) return [invalid];
  const errors = [];
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (!key.includes(MARKER) || entry.link || entry.dev || entry.devOptional)
      continue;
    const name = nameOf(key);
    const license = licenseOf(name, entry);
    if (!license || !isAllowed(license))
      errors.push(
        `${name}: licença "${license ?? 'desconhecida'}" fora da allowlist`,
      );
  }
  return errors;
}

// `dependencies`/`optionalDependencies` de manifestos publicáveis vão ao consumidor mesmo quando o
// lockfile marca o pacote como dev (ex.: tslib é devDependency da raiz). `manifests`: [{ path, json }].
// Pacotes do workspace (entrada com link) são ignorados; dependência sem entrada no lockfile falha.
export function checkManifestDependencies(
  lock,
  manifests,
  licenseOf = (_name, entry) => licenseFromEntry(entry),
) {
  const invalid = lockfileError(lock);
  if (invalid) return [invalid];
  const errors = [];
  for (const { path, json } of manifests) {
    const dir = path.replace(/\/?package\.json$/, '');
    const deps = {
      ...json?.dependencies,
      ...json?.optionalDependencies,
    };
    for (const name of Object.keys(deps)) {
      const entry =
        lock.packages[`${dir}/node_modules/${name}`] ??
        lock.packages[`node_modules/${name}`];
      if (!entry) {
        errors.push(
          `${path}: dependência "${name}" não encontrada no lockfile`,
        );
        continue;
      }
      if (entry.link) continue;
      const license = licenseOf(name, entry);
      if (!license || !isAllowed(license))
        errors.push(
          `${path}: dependência "${name}" com licença "${license ?? 'desconhecida'}" fora da allowlist`,
        );
    }
  }
  return errors;
}

// Manifestos publicáveis: packages/*/package.json e, quando existirem, dist/packages/*/package.json.
export function publishableManifests(root = '.') {
  const out = [];
  for (const base of ['packages', 'dist/packages']) {
    const dir = join(root, base);
    if (!existsSync(dir)) continue;
    for (const d of readdirSync(dir)) {
      const file = join(dir, d, 'package.json');
      if (existsSync(file))
        out.push({
          path: `${base}/${d}/package.json`,
          json: JSON.parse(readFileSync(file, 'utf8')),
        });
    }
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const lock = JSON.parse(
    readFileSync(process.argv[2] ?? 'package-lock.json', 'utf8'),
  );
  const errors = [
    ...new Set([
      ...checkForbiddenNames(lock),
      ...checkLicenses(lock),
      ...checkManifestDependencies(lock, publishableManifests()),
    ]),
  ];
  for (const e of errors) console.error(e);
  if (!errors.length) console.log('licenças ok');
  process.exit(errors.length ? 1 : 0);
}
