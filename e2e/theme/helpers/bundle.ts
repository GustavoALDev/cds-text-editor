import { buildSync } from 'esbuild';
import { resolve } from 'node:path';

const ENTRY = resolve(__dirname, '../../../packages/theme/src/index.ts');

let cached: string | undefined;

/** Bundle IIFE (`window.RteTheme`) do pacote, gerado uma vez por worker. */
export function themeBundle(): string {
  cached ??= buildSync({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'iife',
    globalName: 'RteTheme',
    write: false,
    target: 'es2020',
  }).outputFiles[0]!.text;
  return cached;
}
