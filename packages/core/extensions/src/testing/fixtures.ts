// Leitura e escrita dos fixtures de conteúdo (fora do build; spec 03b, §7.2).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Raiz `fixtures/content/` do repositório (consumida também pelas specs 04 e 06). */
export const FIXTURE_DIR = resolve(
  __dirname,
  '../../../../../fixtures/content',
);

/**
 * Texto do fixture em UTF-8 com quebras normalizadas para `\n` (checkout com
 * `core.autocrlf` não pode quebrar a comparação byte a byte; o teste "sem
 * `\r`" lê o arquivo cru).
 */
export function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURE_DIR, name), 'utf8').replace(
    /\r\n?/g,
    '\n',
  );
}

/** Grava o fixture exatamente como recebido (UTF-8, sem conversão de quebras). */
export function writeFixture(name: string, text: string): void {
  writeFileSync(resolve(FIXTURE_DIR, name), text, 'utf8');
}
