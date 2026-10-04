import { buildSync } from 'esbuild';
import { resolve } from 'node:path';

const CORE = resolve(__dirname, '../../../packages/core');

let cached: string | undefined;

/**
 * Bundle IIFE (`window.RteEditorLab`) com o editor da fábrica, o serializador,
 * os getters da 03c (contagem, limite, busca e menu `/`), o esquema, o
 * validador, o `htmlToText`, o catálogo de linguagens e a normalização de
 * comparação; gerado uma vez por worker. Sem `splitting`, o esbuild embute as
 * gramáticas do `import()` no bundle, mas a carga continua assíncrona por
 * `load()` (é o que o E5 observa).
 */
export function editorBundle(): string {
  cached ??= buildSync({
    stdin: {
      contents: [
        `export { Editor } from '@tiptap/core';`,
        `export {`,
        `  createEditorExtensions,`,
        `  getRteHtml,`,
        `  getRteTextStats,`,
        `  getCharLimitState,`,
        `  getSearchState,`,
        `  getSlashMenuState,`,
        `} from './extensions/src/index';`,
        `export { RTE_CODE_LANGUAGES } from './code-languages/src/index';`,
        `export { htmlToText, validateHtml } from './html/src/index';`,
        `export { getHtmlSchema } from './src/index';`,
        `export { normalizeForCompare } from './extensions/src/testing/compare';`,
      ].join('\n'),
      resolveDir: CORE,
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    globalName: 'RteEditorLab',
    write: false,
    target: 'es2020',
  }).outputFiles[0]!.text;
  return cached;
}
