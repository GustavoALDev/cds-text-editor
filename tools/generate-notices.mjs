import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lockfileError, nameOf } from './check-licenses.mjs';

const OUT = 'THIRD-PARTY-NOTICES.md';
const MARKER = 'node_modules/';
const LICENSE_FILE_RE = /^(licen[sc]e|copying)(\.(md|txt|markdown))?$/i;
const EMPTY =
  '# Avisos de terceiros\n\nNenhuma dependência de produção de terceiros no momento.\n';

// Mesmo critério de tools/check-licenses.mjs: entradas `node_modules/*` do lockfile que vão ao
// consumidor (não dev/devOptional) e não são pacotes do workspace (sem node_modules/ ou link).
export function productionEntries(lock) {
  const out = new Map();
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (!key.includes(MARKER) || entry.link || entry.dev || entry.devOptional)
      continue;
    const name = nameOf(key);
    const version = entry.version ?? '0.0.0';
    out.set(`${name}@${version}`, {
      key,
      name,
      version,
      license: typeof entry.license === 'string' ? entry.license : 'UNKNOWN',
    });
  }
  return [...out.values()].sort(
    (a, b) =>
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
      (a.version < b.version ? -1 : a.version > b.version ? 1 : 0),
  );
}

// Lê o texto do arquivo de licença do pacote em node_modules (undefined quando não houver).
export function readLicenseText(key, root = '.') {
  const dir = join(root, key);
  if (!existsSync(dir)) return undefined;
  const file = readdirSync(dir)
    .filter((f) => LICENSE_FILE_RE.test(f))
    .sort()[0];
  return file ? readFileSync(join(dir, file), 'utf8') : undefined;
}

// `licenseText(key)` é injetável para testes; o documento é determinístico (ordenado por nome/versão).
export function generateNotices(lock, licenseText = readLicenseText) {
  const invalid = lockfileError(lock);
  if (invalid) throw new Error(invalid);
  const entries = productionEntries(lock);
  if (entries.length === 0) return EMPTY;
  const sections = entries.map(({ key, name, version, license }) => {
    const text = licenseText(key)?.replace(/\r\n/g, '\n').trim();
    const body = text
      ? `\n\`\`\`text\n${text}\n\`\`\`\n`
      : '\n(texto da licença não encontrado no pacote)\n';
    return `## ${name}@${version}\n\nLicença: ${license}\n${body}`;
  });
  return `# Avisos de terceiros\n\n${sections.join('\n')}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  writeFileSync(OUT, generateNotices(lock));
  console.log(`${OUT} gerado`);
}
