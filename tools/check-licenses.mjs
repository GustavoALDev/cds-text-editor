import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ALLOWED = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0']);
const FORBIDDEN_RE = /(^|\/)(node_modules\/)?@tiptap-(pro|cloud)\//;
const MARKER = 'node_modules/';

export const nameOf = (key) => key.slice(key.lastIndexOf(MARKER) + MARKER.length);

// Nomes proibidos valem para o lockfile INTEIRO (inclui devDependencies e caminhos aninhados).
export function checkForbiddenNames(lock) {
  return Object.keys(lock.packages ?? {})
    .filter((key) => FORBIDDEN_RE.test(key))
    .map((key) => `pacote proibido: ${nameOf(key)}`);
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

const licenseFromEntry = (entry) => (typeof entry?.license === 'string' ? entry.license : undefined);

// Só o conjunto de produção (o que vai ao tarball) é checado: entradas dev/devOptional são
// toolchain. Pacotes do workspace (sem node_modules/ na chave, ou link: true) são ignorados.
export function checkLicenses(lock, licenseOf = (_name, entry) => licenseFromEntry(entry)) {
  const errors = [];
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!key.includes(MARKER) || entry.link || entry.dev || entry.devOptional) continue;
    const name = nameOf(key);
    const license = licenseOf(name, entry);
    if (!license || !isAllowed(license)) errors.push(`${name}: licença "${license ?? 'desconhecida'}" fora da allowlist`);
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const lock = JSON.parse(readFileSync(process.argv[2] ?? 'package-lock.json', 'utf8'));
  const errors = [...checkForbiddenNames(lock), ...checkLicenses(lock)];
  for (const e of errors) console.error(e);
  if (!errors.length) console.log('licenças ok');
  process.exit(errors.length ? 1 : 0);
}
