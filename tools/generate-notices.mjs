import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lockfileError, nameOf } from './check-licenses.mjs';

const OUT = 'THIRD-PARTY-NOTICES.md';
const MARKER = 'node_modules/';
const LICENSE_FILE_RE = /^(licen[sc]e|copying)(\.(md|txt|markdown))?$/i;
const EMPTY =
  '# Avisos de terceiros\n\nNenhuma dependência de produção de terceiros no momento.\n';

// Resolve `dep` a partir do diretório `from` como o npm: caminho aninhado primeiro, depois içado.
function resolveDependency(packages, from, dep) {
  let base = from;
  for (;;) {
    const key = base ? `${base}/${MARKER}${dep}` : `${MARKER}${dep}`;
    if (packages[key]) return key;
    if (!base) return undefined;
    const i = base.lastIndexOf(`/${MARKER}`);
    base = i === -1 ? '' : base.slice(0, i);
  }
}

// Fecho transitivo das `dependencies` (e optionalDependencies instaladas) de produção dos pacotes do
// workspace (entradas do lockfile sem node_modules/ na chave, exceto a raiz). `peerDependencies` e
// devDependencies ficam de fora: o consumidor instala os peers por conta própria.
export function productionEntries(lock) {
  const { packages } = lock;
  const queue = [];
  for (const [key, entry] of Object.entries(packages)) {
    if (key === '' || key.includes(MARKER) || entry.link) continue;
    queue.push([key, entry]);
  }
  const seen = new Set();
  const out = new Map();
  while (queue.length) {
    const [from, entry] = queue.shift();
    const deps = { ...entry.dependencies, ...entry.optionalDependencies };
    for (const dep of Object.keys(deps)) {
      const key = resolveDependency(packages, from, dep);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const resolved = packages[key];
      if (resolved.link) continue;
      const name = nameOf(key);
      const version = resolved.version ?? '0.0.0';
      out.set(`${name}@${version}`, {
        key,
        name,
        version,
        license:
          typeof resolved.license === 'string' ? resolved.license : 'UNKNOWN',
      });
      queue.push([key, resolved]);
    }
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
