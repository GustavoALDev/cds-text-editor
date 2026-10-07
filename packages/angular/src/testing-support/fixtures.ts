import { readFileSync } from 'node:fs';
import { workspacePath } from './workspace';

/** Texto de `fixtures/content/<name>` com quebras normalizadas para `\n`. */
export function readFixture(name: string): string {
  return readFileSync(
    workspacePath('fixtures/content/' + name),
    'utf8',
  ).replace(/\r\n?/g, '\n');
}
