import { escapeHtmlAttribute } from '@cds/rte-core';

/** Classe do rolador que embrulha cada tabela (H6, H7). */
export const RTE_TABLE_SCROLL_CLASS = 'rte-table-scroll';

/**
 * Classe da `table` cujo `colgroup` tem ao menos um `col` com largura (H20): layout fixo no
 * `content.css` e `width`/`min-width` por CSSOM no navegador, como na edição.
 */
export const RTE_TABLE_SIZED_CLASS = 'rte-table--sized';

const TABLE_OPEN = /<table(?=[\s>])/g;
/** Início canônico de uma tabela com `colgroup` próprio (depois de um `caption` opcional). */
const TABLE_HEAD =
  /<table>(?:<caption>[\s\S]*?<\/caption>)?<colgroup>((?:<col\b[^>]*>)*)<\/colgroup>/y;
/** `width:` como nome de declaração (não o fim de `min-width:`). */
const COL_WIDTH = /<col\b[^>]*\sstyle="(?:[^"]*[;\s])?width:/;
const TABLE_CLOSE = /<\/table>/g;
const ANCHOR_TAG = /<a\s[^>]*>/g;
const FRAGMENT_HREF = /(\s)href="#/;

/**
 * Transformações de exibição (spec 06, H6), puras e iguais no servidor e no
 * navegador: (a) cada `table`, aninhada ou não, ganha exatamente um
 * `div.rte-table-scroll` em volta, e a que tem largura em algum `col` do próprio
 * `colgroup` (forma canônica `<table>[<caption>…</caption>]<colgroup>`) ganha a classe
 * `rte-table--sized` (H20); (b) com `fragmentBase`, o `href="#x"` de
 * cada `a` vira `href="<fragmentBase escapado>#x"` (`null` = `keep`: só as
 * tabelas).
 *
 * Varredura de *tags*, sem *parser*: vale só sobre o HTML canônico do
 * sanitizador (pré-condição da H6, também para `trusted`). Lá o texto escapa
 * `<` e os atributos escapam `"`, `<` e `>` (S13), então `<table`, `</table>`
 * e `<a ` só podem ser *tags* e `[^>]*` não sai da *tag*. Formas fora do
 * canônico (`<TABLE>`, `href='#x'`) ficam intactas.
 */
export function prepareRteHtml(
  html: string,
  options: { fragmentBase: string | null },
): string {
  let out = html
    .replace(TABLE_OPEN, (_tag, offset: number) => {
      TABLE_HEAD.lastIndex = offset;
      const cols = TABLE_HEAD.exec(html)?.[1];
      const sized = cols !== undefined && COL_WIDTH.test(cols);
      return `<div class="${RTE_TABLE_SCROLL_CLASS}"><table${
        sized ? ` class="${RTE_TABLE_SIZED_CLASS}"` : ''
      }`;
    })
    .replace(TABLE_CLOSE, '</table></div>');
  const { fragmentBase } = options;
  if (fragmentBase !== null) {
    const base = escapeHtmlAttribute(fragmentBase);
    // Funções de troca, não *strings*: a base pode conter `$&`, `$1`… (que
    // uma *string* de troca interpretaria; Ruling 2).
    out = out.replace(ANCHOR_TAG, (tag) =>
      tag.replace(
        FRAGMENT_HREF,
        (_match, space: string) => `${space}href="${base}#`,
      ),
    );
  }
  return out;
}
