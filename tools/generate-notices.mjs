import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const OUT = 'THIRD-PARTY-NOTICES.md';
const BASE = [
  '--no-install',
  'license-checker-rseidelsohn',
  '--production',
  '--excludePrivatePackages',
];
const EMPTY =
  '# Avisos de terceiros\n\nNenhuma dependência de produção de terceiros no momento.\n';

const run = (args) =>
  execFileSync('npx', [...BASE, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

// Com o conjunto de produção vazio a ferramenta imprime um arquivo vazio/sem conteúdo útil,
// então o documento é gerado aqui para continuar sendo um markdown válido.
export function generateNotices(runTool = run) {
  const packages = JSON.parse(runTool(['--json']) || '{}');
  if (Object.keys(packages).length === 0) return EMPTY;
  return `# Avisos de terceiros\n\n${runTool(['--markdown']).trim()}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  writeFileSync(OUT, generateNotices());
  console.log(`${OUT} gerado`);
}
