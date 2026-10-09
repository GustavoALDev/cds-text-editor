import { TEXT_BLOCK_TAGS, collapseTextLine } from '../../src/text-lines';
import { resolveMaxDepth, walkHtml } from './walk';

/** Opções de `htmlToText`. */
export interface RteHtmlToTextOptions {
  /** Profundidade máxima de elementos (padrão 256); `RangeError` se não for inteiro positivo. */
  maxDepth?: number;
}

/**
 * Converte HTML em texto simples, sem DOM: blocos e `<br>` viram quebras de linha,
 * espaços em branco são colapsados e entidades decodificadas. Nunca lança por HTML malformado.
 *
 * O resultado é TEXTO PURO já decodificado (`&lt;b&gt;` vira `<b>`): deve ser escapado, ou atribuído
 * via `textContent`, antes de voltar a qualquer HTML. Acima de `maxDepth` a leitura é truncada:
 * devolve o que foi coletado até ali, sem lançar.
 */
export function htmlToText(
  html: string,
  options: RteHtmlToTextOptions = {},
): string {
  const maxDepth = resolveMaxDepth(options.maxDepth);
  const lines: string[] = [];
  let line = '';
  const flush = () => {
    const t = collapseTextLine(line);
    if (t) lines.push(t);
    line = '';
  };
  walkHtml(
    html,
    {
      open: (name) => TEXT_BLOCK_TAGS.has(name) && flush(),
      close: (name) => TEXT_BLOCK_TAGS.has(name) && flush(),
      text: (data) => {
        line += data;
      },
    },
    maxDepth,
  );
  flush();
  return lines.join('\n');
}
