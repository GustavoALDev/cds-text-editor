// Leitura dos fixtures de conteúdo compartilhados (fora do build).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Raiz `fixtures/content/` do repositório, achada subindo a partir do `cwd`
 * (como o core): `__dirname` não vale sob o builder do angular, que empacota
 * os specs em ESM (o render usa `hostileHtml`), e `import.meta.url` quebra o
 * CommonJS do Playwright nos E2E do sanitizador.
 */
function fixtureDir(): string {
  const rel = join('fixtures', 'content');
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    if (existsSync(join(dir, rel, 'all-features.html'))) return join(dir, rel);
    if (dirname(dir) === dir)
      throw new Error(`fixtures não encontrados: ${rel}`);
  }
}

const FIXTURE_DIR = fixtureDir();

/**
 * Texto do fixture em UTF-8 com quebras normalizadas para `\n` (checkout com
 * `core.autocrlf` não pode quebrar a comparação byte a byte).
 */
export function readFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8').replace(/\r\n?/g, '\n');
}
