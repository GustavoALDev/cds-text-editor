import { buildSync } from 'esbuild';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../packages/core/src');

let cached: string | undefined;

/** Bundle IIFE (`window.RteCore`) do índice e do entry `/embeds`, gerado uma vez por worker. */
export function coreBundle(): string {
  cached ??= buildSync({
    stdin: {
      contents: `export * from './index'; export * from './embeds/index';`,
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    globalName: 'RteCore',
    write: false,
    target: 'es2020',
  }).outputFiles[0]!.text;
  return cached;
}
