import { walkHtml } from './walk';

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

/**
 * Converte HTML em texto simples, sem DOM: blocos e `<br>` viram quebras de linha,
 * espaços em branco são colapsados e entidades decodificadas. Nunca lança.
 */
export function htmlToText(html: string): string {
  const lines: string[] = [];
  let line = '';
  const flush = () => {
    const t = line.replace(/\s+/g, ' ').trim();
    if (t) lines.push(t);
    line = '';
  };
  walkHtml(html, {
    open: (name) => BLOCKS.has(name) && flush(),
    close: (name) => BLOCKS.has(name) && flush(),
    text: (data) => {
      line += data;
    },
  });
  flush();
  return lines.join('\n');
}
