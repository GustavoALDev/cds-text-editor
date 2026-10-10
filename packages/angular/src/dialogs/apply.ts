import {
  RTE_DEFAULT_LINK_POLICY,
  normalizeHref,
  type RteLinkPolicy,
} from '@comodeviaser/rte-core';
import type { Editor } from '@tiptap/core';
// Tipos dos comandos de link (`setLink`, `unsetLink`) e de tabela
// (`insertTable`, `toggleHeaderColumn`) no `ChainedCommands`.
import type {} from '@tiptap/extension-link';
import type {} from '@tiptap/extension-table';
import type { Transaction } from '@tiptap/pm/state';
import { findTable } from '@tiptap/pm/tables';
import type { RteDialogRequest } from './controller';

/** Política mesclada (`RTE_DEFAULT_LINK_POLICY` < a do editor): "nova aba" só com `preserve`. */
export function linkTargetPreserved(
  policy: Partial<RteLinkPolicy> | undefined,
): boolean {
  return { ...RTE_DEFAULT_LINK_POLICY, ...policy }.target === 'preserve';
}

/**
 * Link (G9, G10): `href` canônico de `normalizeHref` pela política do editor
 * (rejeitado → `false`, nada aplicado). *insert* insere `v.text` com a marca;
 * *apply* e *edit* marcam o intervalo da abertura. Uma cadeia (um passo de
 * desfazer, uma emissão) que termina com o cursor no fim e sem a marca
 * guardada (pré-voo 7): o que se digita depois não vira link.
 */
export function applyLink(
  editor: Editor,
  req: RteDialogRequest,
  v: { url: string; text: string; newTab: boolean },
  policy: Partial<RteLinkPolicy> | undefined,
): boolean {
  const href = normalizeHref(v.url, policy);
  if (href === null) return false;
  const target = linkTargetPreserved(policy) && v.newTab ? '_blank' : null;
  const chain = editor.chain().focus().setTextSelection(req.range);
  if (req.mode === 'insert') {
    if (v.text === '') return false;
    return chain
      .insertContent({
        type: 'text',
        text: v.text,
        marks: [{ type: 'link', attrs: { href, target } }],
      })
      .setTextSelection(req.range.from + v.text.length)
      .unsetMark('link')
      .run();
  }
  return chain
    .setLink({ href, target })
    .setTextSelection(req.range.to)
    .unsetMark('link')
    .run();
}

/** Remove o link do intervalo da abertura (o link inteiro); cursor no fim. */
export function removeLink(editor: Editor, req: RteDialogRequest): boolean {
  return editor
    .chain()
    .focus()
    .setTextSelection(req.range)
    .unsetLink()
    .setTextSelection(req.range.to)
    .run();
}

/** Idioma (G14) sobre o intervalo da abertura; cursor no fim. */
export function applyLang(
  editor: Editor,
  req: RteDialogRequest,
  v: { lang: string; dir: 'ltr' | 'rtl' | null },
): boolean {
  return editor
    .chain()
    .focus()
    .setTextSelection(req.range)
    .setLang(v)
    .setTextSelection(req.range.to)
    .run();
}

/** Remove o idioma do intervalo da abertura (o trecho inteiro); cursor no fim. */
export function removeLang(editor: Editor, req: RteDialogRequest): boolean {
  return editor
    .chain()
    .focus()
    .setTextSelection(req.range)
    .unsetLang()
    .setTextSelection(req.range.to)
    .run();
}

/** Autor e cargo da citação (G15): uma cadeia, foco de volta ao editável. */
export function applyQuote(
  editor: Editor,
  req: RteDialogRequest,
  v: { author: string; role: string },
): boolean {
  return editor
    .chain()
    .focus()
    .setTextSelection(req.range)
    .updatePullquote(v)
    .run();
}

/**
 * Tabela nova (G16): uma cadeia (um passo de desfazer, uma emissão) com
 * `insertTable`, a coluna de cabeçalho quando pedida e o `scope` dos `th`
 * (pré-voo 1).
 */
export function applyTable(
  editor: Editor,
  req: RteDialogRequest,
  v: { rows: number; cols: number; headerRow: boolean; headerColumn: boolean },
): boolean {
  let chain = editor
    .chain()
    .focus()
    .setTextSelection(req.range)
    .insertTable({ rows: v.rows, cols: v.cols, withHeaderRow: v.headerRow });
  if (v.headerColumn) chain = chain.toggleHeaderColumn();
  return chain.command(({ tr }) => setHeaderScopes(tr, v.headerRow)).run();
}

/**
 * Na tabela da seleção (a recém-inserida, sem células mescladas): com linha
 * de cabeçalho, os `th` da 1ª linha → `scope="col"`; os demais `th` da 1ª
 * coluna → `scope="row"`.
 */
function setHeaderScopes(tr: Transaction, headerRow: boolean): boolean {
  const table = findTable(tr.selection.$from);
  if (!table) return false;
  const updates: { pos: number; scope: 'col' | 'row' }[] = [];
  table.node.forEach((row, rowOffset, rowIndex) => {
    row.forEach((cell, cellOffset, colIndex) => {
      if (cell.type.name !== 'tableHeader') return;
      if (rowIndex > 0 && colIndex > 0) return;
      updates.push({
        pos: table.start + rowOffset + 1 + cellOffset,
        scope: rowIndex === 0 && headerRow ? 'col' : 'row',
      });
    });
  });
  for (const { pos, scope } of updates) {
    const cell = tr.doc.nodeAt(pos);
    if (cell) tr.setNodeMarkup(pos, undefined, { ...cell.attrs, scope });
  }
  return true;
}
