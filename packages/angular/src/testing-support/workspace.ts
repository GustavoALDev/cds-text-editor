import { resolve } from 'node:path';

/** Caminho absoluto a partir da raiz do repositório (o `cwd` do builder). */
export function workspacePath(rel: string): string {
  return resolve(process.cwd(), rel);
}
