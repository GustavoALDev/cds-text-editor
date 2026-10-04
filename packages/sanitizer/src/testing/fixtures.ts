// Leitura dos fixtures de conteúdo compartilhados (fora do build).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Raiz `fixtures/content/` do repositório. */
const FIXTURE_DIR = resolve(
  import.meta.dirname,
  '../../../../fixtures/content',
);

/**
 * Texto do fixture em UTF-8 com quebras normalizadas para `\n` (checkout com
 * `core.autocrlf` não pode quebrar a comparação byte a byte).
 */
export function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURE_DIR, name), 'utf8').replace(
    /\r\n?/g,
    '\n',
  );
}
