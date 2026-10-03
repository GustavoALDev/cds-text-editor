import type { AnyExtension, Attributes } from '@tiptap/core';
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from '@tiptap/extension-table';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { changedRanges } from './changed-ranges';
import type { RteExtensionContext } from './context';

// Limites do esquema: `int(1, 100)` de colspan/rowspan e `col.styles.width`
// (1–9999 px).
const SPAN_MAX = 100;
const WIDTH_MAX = 9999;

/** Inteiro 1–100 de um valor lido (texto do HTML ou atributo do JSON); senão 1. */
function span(value: unknown): number {
  const n =
    typeof value === 'string' && /^\s*\d+\s*$/.test(value)
      ? Number(value)
      : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= SPAN_MAX
    ? n
    : 1;
}

/** Largura em px limitada a 1–9999; 0 = sem largura (valor inválido ou < 1). */
function width(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const n = Math.round(value);
  return n < 1 ? 0 : Math.min(n, WIDTH_MAX);
}

/** `colwidth` canônico: lista com 0 onde não há largura; `null` se nenhuma. */
function canonicalColwidth(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const list = value.map(width);
  return list.some((n) => n > 0) ? list : null;
}

function widthFromStyle(style: string | null): number {
  if (!style) return 0;
  for (const declaration of style.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    if (declaration.slice(0, colon).trim().toLowerCase() !== 'width') continue;
    const match = /^(\d+)px$/i.exec(declaration.slice(colon + 1).trim());
    if (match) return width(Number(match[1]));
  }
  return 0;
}

function widthOfCol(col: Element): number {
  const fromStyle = widthFromStyle(col.getAttribute('style'));
  if (fromStyle > 0) return fromStyle;
  const attr = /^\s*(\d+)(?:px)?\s*$/i.exec(col.getAttribute('width') ?? '');
  return attr ? width(Number(attr[1])) : 0;
}

/** `col`s do `colgroup` do próprio `table` da célula (não de tabela aninhada). */
function colsOf(table: Element): Element[] {
  const cols: Element[] = [];
  for (const group of Array.from(table.children)) {
    if (group.tagName.toLowerCase() !== 'colgroup') continue;
    for (const col of Array.from(group.children)) {
      if (col.tagName.toLowerCase() === 'col') cols.push(col);
    }
  }
  return cols;
}

/**
 * `colwidth` de uma célula (spec 03b, §4 tables): atributo `colwidth` (formato
 * Tiptap) ou larguras dos `col` das colunas que ela cobre; o índice soma o
 * `colspan` das células anteriores da linha.
 */
function parseColwidth(element: HTMLElement): number[] | null {
  const colspan = span(element.getAttribute('colspan'));
  const attr = element.getAttribute('colwidth');
  if (attr) {
    const list = attr
      .split(',')
      .slice(0, colspan)
      .map((part) => (/^\s*\d+\s*$/.test(part) ? width(Number(part)) : 0));
    while (list.length < colspan) list.push(0);
    return canonicalColwidth(list);
  }
  const row = element.parentElement;
  const table = element.closest('table');
  if (!row || !table) return null;
  let index = 0;
  for (const sibling of Array.from(row.children)) {
    if (sibling === element) break;
    index += span(sibling.getAttribute('colspan'));
  }
  const cols = colsOf(table);
  const list: number[] = [];
  for (let i = 0; i < colspan; i += 1) {
    const col = cols[index + i];
    list.push(col ? widthOfCol(col) : 0);
  }
  return canonicalColwidth(list);
}

function cellAttributes(header: boolean): Attributes {
  const spanAttribute = (name: 'colspan' | 'rowspan') => ({
    default: 1,
    parseHTML: (element: HTMLElement) => span(element.getAttribute(name)),
    renderHTML: (attributes: Record<string, unknown>) => {
      const value = span(attributes[name]);
      return value === 1 ? {} : { [name]: String(value) };
    },
  });
  return {
    colspan: spanAttribute('colspan'),
    rowspan: spanAttribute('rowspan'),
    ...(header
      ? {
          scope: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const scope = element.getAttribute('scope');
              return scope === 'col' || scope === 'row' ? scope : null;
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              const scope = attributes['scope'];
              return scope === 'col' || scope === 'row' ? { scope } : {};
            },
          },
        }
      : {}),
    colwidth: {
      default: null,
      parseHTML: parseColwidth,
      rendered: false,
    },
  };
}

/** `colgroup` da 1ª linha: só existe se alguma coluna tiver largura. */
function renderColgroup(node: ProseMirrorNode) {
  const row = node.firstChild;
  if (!row) return null;
  const cols: ['col', Record<string, string>][] = [];
  let any = false;
  row.forEach((cell) => {
    const colspan = span(cell.attrs['colspan']);
    const widths = canonicalColwidth(cell.attrs['colwidth']);
    for (let i = 0; i < colspan; i += 1) {
      const w = widths?.[i] ?? 0;
      if (w > 0) any = true;
      cols.push(['col', w > 0 ? { style: `width: ${w}px` } : {}]);
    }
  });
  return any ? (['colgroup', {}, ...cols] as const) : null;
}

/**
 * Corrige `colwidth` fora de 1–9999 nas células tocadas pela transação (o
 * redimensionamento do prosemirror-tables não tem teto).
 */
function clampWidthsPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey('rtTableColwidth'),
    appendTransaction(transactions, _old, state) {
      const doc = state.doc;
      const size = doc.content.size;
      const fixes = new Map<number, number[] | null>();
      for (const tr of transactions) {
        if (!tr.docChanged) continue;
        for (const [a, b] of changedRanges(tr)) {
          doc.nodesBetween(
            Math.max(0, Math.min(a, b, size)),
            Math.min(size, Math.max(a, b)),
            (node, pos) => {
              const role = node.type.spec['tableRole'] as unknown;
              if (role !== 'cell' && role !== 'header_cell') return true;
              const current: unknown = node.attrs['colwidth'];
              const canon = canonicalColwidth(current);
              if (JSON.stringify(canon) !== JSON.stringify(current)) {
                fixes.set(pos, canon);
              }
              return false;
            },
          );
        }
      }
      if (fixes.size === 0) return null;
      const tr = state.tr;
      for (const [pos, colwidth] of fixes) {
        tr.setNodeAttribute(pos, 'colwidth', colwidth);
      }
      return tr;
    },
  });
}

/**
 * Tabelas (spec 03b, B16): as extensões oficiais com a saída da 03a §4.5 —
 * `table` sem `style`, `colgroup` só com largura, células sem `align` e com
 * os atributos do esquema.
 */
export function createTableExtensions(
  _ctx: RteExtensionContext,
): AnyExtension[] {
  const table = Table.extend({
    parseHTML() {
      return [{ tag: 'caption', ignore: true }, { tag: 'table' }];
    },
    renderHTML({ node }) {
      const colgroup = renderColgroup(node);
      return colgroup
        ? ['table', {}, colgroup, ['tbody', 0]]
        : ['table', {}, ['tbody', 0]];
    },
    addProseMirrorPlugins() {
      return [...(this.parent?.() ?? []), clampWidthsPlugin()];
    },
  }).configure({
    HTMLAttributes: {},
    resizable: true,
    renderWrapper: false,
    allowTableNodeSelection: false,
  });
  const tableRow = TableRow.configure({ HTMLAttributes: {} });
  const tableHeader = TableHeader.extend({
    addAttributes: () => cellAttributes(true),
    renderHTML: ({ HTMLAttributes }) => ['th', HTMLAttributes, 0],
  }).configure({ HTMLAttributes: {} });
  const tableCell = TableCell.extend({
    addAttributes: () => cellAttributes(false),
    renderHTML: ({ HTMLAttributes }) => ['td', HTMLAttributes, 0],
  }).configure({ HTMLAttributes: {} });
  return [table, tableRow, tableHeader, tableCell];
}
