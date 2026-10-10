import { escapeHtmlAttribute } from '@comodeviaser/rte-core';

/** Classe do rolador que embrulha cada tabela (H6, H7). */
export const RTE_TABLE_SCROLL_CLASS = 'rte-table-scroll';

/**
 * Classe da `table` cujo `colgroup` tem ao menos um `col` com largura (H20): layout fixo no
 * `content.css` e `width`/`min-width` por CSSOM no navegador, como na edição.
 */
export const RTE_TABLE_SIZED_CLASS = 'rte-table--sized';

const TABLE_OPEN = /<table(?=[\s>])/g;
/** Os `col` de um `colgroup` canônico que começa em `lastIndex` (depois de um `caption` opcional). */
const COLGROUP = /<colgroup>((?:<col\b[^>]*>)*)<\/colgroup>/y;
const TABLE_CAPTION = '<table><caption>';
const CAPTION_CLOSE = '</caption>';
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
  // Cache do próximo `</caption>`: a busca nunca atravessa o mesmo trecho duas vezes
  // (custo linear mesmo com milhares de `caption` sem fechamento; R9 A1).
  let closeAt = -2;
  const nextClose = (from: number): number => {
    if (closeAt === -1 || closeAt >= from) return closeAt;
    closeAt = html.indexOf(CAPTION_CLOSE, from);
    return closeAt;
  };
  /** Os `col` do `colgroup` que abre a tabela em `offset`, sem sair do `caption` dela. */
  const colsOf = (offset: number): string | undefined => {
    let at = offset + '<table>'.length;
    if (html.startsWith(TABLE_CAPTION, offset)) {
      const close = nextClose(offset + TABLE_CAPTION.length);
      if (close === -1) return undefined;
      at = close + CAPTION_CLOSE.length;
    } else if (!html.startsWith('<table>', offset)) {
      return undefined;
    }
    COLGROUP.lastIndex = at;
    return COLGROUP.exec(html)?.[1];
  };
  let out = html
    .replace(TABLE_OPEN, (_tag, offset: number) => {
      const cols = colsOf(offset);
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
