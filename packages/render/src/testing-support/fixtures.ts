import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Texto de `fixtures/content/<name>` com quebras normalizadas para `\n`. Sobe
 * a partir do `cwd` até achar o arquivo: o builder roda os specs do render com
 * `cwd` em `packages/render` (e `__dirname`/`import.meta.url` não valem nos
 * specs empacotados; ver o helper do core).
 */
export function readFixture(name: string): string {
  const rel = join('fixtures', 'content', name);
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    const file = join(dir, rel);
    if (existsSync(file)) {
      return readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
    }
    if (dirname(dir) === dir) throw new Error(`fixture não encontrado: ${rel}`);
  }
}
