// Regras de linha do texto simples (spec 03c, C5), compartilhadas por
// `htmlToText` (lê HTML) e `getRteTextStats` (percorre o documento do editor):
// as duas contagens só coincidem se as regras forem as mesmas.

/** Elementos que quebram linha nos dois limites (abertura e fechamento). */
export const TEXT_BLOCK_TAGS: ReadonlySet<string> = new Set([
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

/** Linha com espaços em branco colapsados em um e sem espaço nas pontas. */
export function collapseTextLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}
