import { buildSync } from 'esbuild';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');

let cached: string | undefined;

/**
 * Bundle IIFE (`window.RteSanitizerLab`) com `sanitizeRichText` e
 * `createSanitizer` do sanitizador e `getHtmlSchema` do core, gerado uma vez
 * por worker. O alias aponta `@comodeviaser/rte-core` para o código-fonte do core.
 */
export function sanitizerBundle(): string {
  cached ??= buildSync({
    stdin: {
      contents: [
        `export { createSanitizer, sanitizeRichText } from './packages/sanitizer/src/index';`,
        `export { getHtmlSchema } from './packages/core/src/index';`,
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
    },
    alias: { '@comodeviaser/rte-core': resolve(ROOT, 'packages/core/src/index.ts') },
    bundle: true,
    format: 'iife',
    globalName: 'RteSanitizerLab',
    write: false,
    target: 'es2020',
  }).outputFiles[0]!.text;
  return cached;
}
