import type { AnyExtension, Attributes } from '@tiptap/core';
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from '@tiptap/extension-table';
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
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

/**
 * `colwidth` canônico: uma largura por coluna coberta (`colspan`), 0 onde não
 * há largura; `null` se nenhuma. É ponto fixo da votação de larguras do
 * `fixTables` do prosemirror-tables, que só escreve valores já presentes.
 */
function canonicalColwidth(value: unknown, colspan = 1): number[] | null {
  if (!Array.isArray(value)) return null;
  const list: number[] = [];
  for (let i = 0; i < colspan; i += 1) list.push(width(value[i]));
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
    return canonicalColwidth(list, colspan);
  }
  const row = element.parentElement;
  const table = element.closest('table');
  if (!row || !table) return null;
  // Só a 1ª linha lê o colgroup (a única que renderColgroup usa): nas demais
  // o rowspan de linhas anteriores desloca o índice; o fixTables do
  // prosemirror-tables copia as larguras da 1ª linha para baixo.
  if (table.querySelector('tr') !== row) return null;
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
  return canonicalColwidth(list, colspan);
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
              const scope = (element.getAttribute('scope') ?? '').replace(
                /[A-Z]/g,
                (c) => String.fromCharCode(c.charCodeAt(0) + 32),
              );
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
    const widths = canonicalColwidth(cell.attrs['colwidth'], colspan);
    for (let i = 0; i < colspan; i += 1) {
      const w = widths?.[i] ?? 0;
      if (w > 0) any = true;
      cols.push(['col', w > 0 ? { style: `width: ${w}px` } : {}]);
    }
  });
  return any ? (['colgroup', {}, ...cols] as const) : null;
}

const isCell = (node: ProseMirrorNode) => {
  const role = node.type.spec['tableRole'] as unknown;
  return role === 'cell' || role === 'header_cell';
};

/**
 * Corrige `colwidth` fora do canônico (1–9999 inteiro; o redimensionamento do
 * prosemirror-tables não tem teto). Basta uma célula tocada para canonizar
 * **todas** as células da tabela: o `fixTables` vota uma largura por coluna
 * entre todas as células dela e reescreve as divergentes; com só as tocadas
 * corrigidas, ele voltaria a escrever o valor da maioria fora do canônico e
 * os dois se alternariam sem fim. Com a tabela inteira canônica, a votação só
 * escolhe valores canônicos e a segunda rodada não acha nada (sem laço).
 */
function clampWidthsPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey('rtTableColwidth'),
    appendTransaction(transactions, _old, state) {
      const doc = state.doc;
      const tables = new Set<number>();
      for (const [a, b] of changedRanges(transactions, doc)) {
        // nodesBetween visita também os ancestrais do trecho: a tabela de
        // uma célula tocada entra aqui.
        doc.nodesBetween(a, b, (node, pos) => {
          if (node.type.spec['tableRole'] === 'table') tables.add(pos);
          return !node.isTextblock;
        });
      }
      const fixes = new Map<number, number[] | null>();
      for (const tablePos of tables) {
        const table = doc.nodeAt(tablePos);
        table?.descendants((node, offset) => {
          if (!isCell(node)) return true;
          const current: unknown = node.attrs['colwidth'];
          const canon = canonicalColwidth(current, span(node.attrs['colspan']));
          if (JSON.stringify(canon) !== JSON.stringify(current)) {
            fixes.set(tablePos + 1 + offset, canon);
          }
          return true;
        });
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

/** Atributos de célula de um nó JSON normalizados (cópia; senão o próprio). */
function normalizeCellJson(json: unknown, cellTypes: ReadonlySet<string>) {
  if (typeof json !== 'object' || json === null) return json;
  const { type, attrs } = json as { type?: unknown; attrs?: unknown };
  if (typeof type !== 'string' || !cellTypes.has(type)) return json;
  if (typeof attrs !== 'object' || attrs === null) return json;
  const raw = attrs as Record<string, unknown>;
  const colspan = span(raw['colspan']);
  return {
    ...json,
    attrs: {
      ...raw,
      colspan,
      rowspan: span(raw['rowspan']),
      colwidth: canonicalColwidth(raw['colwidth'], colspan),
    },
  };
}

const NORMALIZES_CELLS = Symbol('rtNormalizesCells');

/**
 * Normaliza `colspan`/`rowspan` (1–100, senão 1) e `colwidth` (canônico) de
 * toda célula lida de JSON (B9: JSON é entrada não confiável), antes de o nó
 * existir. `TableMap` e `TableView` iteram sobre os atributos crus (colspan
 * 1e6 travava a carga) e o conteúdo inicial não passa por transação nenhuma.
 *
 * O atributo `validate` do ProseMirror só lança, não corrige; por isso o
 * ponto de entrada é `schema.nodeFromJSON`, por onde passam `createDocument`
 * (conteúdo inicial e `setContent`), `insertContent` e `Node.fromJSON`
 * (cada filho, via `Fragment.fromJSON`). O JSON recebido não é alterado.
 */
function installCellJsonNormalizer(schema: Schema): void {
  const current = schema.nodeFromJSON as Schema['nodeFromJSON'] & {
    [NORMALIZES_CELLS]?: true;
  };
  if (current[NORMALIZES_CELLS]) return;
  const cellTypes = new Set(
    Object.values(schema.nodes)
      .filter((type) => {
        const role = type.spec['tableRole'] as unknown;
        return role === 'cell' || role === 'header_cell';
      })
      .map((type) => type.name),
  );
  const normalized = (json: unknown) =>
    current(normalizeCellJson(json, cellTypes));
  schema.nodeFromJSON = Object.assign(normalized, {
    [NORMALIZES_CELLS]: true as const,
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
      // O texto do caption é descartado (limitação conhecida): o esquema
      // nunca emite caption e o parse não pode mutar o DOM de entrada.
      return [{ tag: 'caption', ignore: true }, { tag: 'table' }];
    },
    renderHTML({ node }) {
      const colgroup = renderColgroup(node);
      return colgroup
        ? ['table', {}, colgroup, ['tbody', 0]]
        : ['table', {}, ['tbody', 0]];
    },
    addKeyboardShortcuts() {
      return {
        ...this.parent?.(),
        // Sem armadilha de teclado (spec 03b, §6; WCAG 2.1.2): na última
        // célula o oficial cria uma linha e o Tab nunca sai da tabela. Aqui
        // devolve false e o navegador leva o foco adiante. O `Shift-Tab`
        // oficial já devolve false na primeira célula.
        Tab: () => this.editor.commands.goToNextCell(),
      };
    },
    onBeforeCreate(event) {
      this.parent?.(event);
      // antes do conteúdo inicial (como o parser de HTML em `rtContent`)
      installCellJsonNormalizer(this.editor.schema);
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
