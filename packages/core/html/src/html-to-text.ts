import { resolveMaxDepth, walkHtml } from './walk';

/** Elementos que quebram linha nos dois limites (abertura e fechamento). */
const BLOCKS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
  'pre',
  'figure',
  'figcaption',
  'tr',
  'div',
  'section',
  'article',
  'aside',
  'ul',
  'ol',
  'table',
  'hr',
  'br',
]);

export interface HtmlToTextOptions {
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
  options: HtmlToTextOptions = {},
): string {
  const maxDepth = resolveMaxDepth(options.maxDepth);
  const lines: string[] = [];
  let line = '';
  const flush = () => {
    const t = line.replace(/\s+/g, ' ').trim();
    if (t) lines.push(t);
    line = '';
  };
  walkHtml(
    html,
    {
      open: (name) => BLOCKS.has(name) && flush(),
      close: (name) => BLOCKS.has(name) && flush(),
      text: (data) => {
        line += data;
      },
    },
    maxDepth,
  );
  flush();
  return lines.join('\n');
}
