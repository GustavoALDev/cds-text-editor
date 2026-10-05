import { computed, type Signal } from '@angular/core';
import { RTE_HIGHLIGHT_COLORS, RTE_TEXT_COLORS } from '@cds/rte-core';
import type { Editor } from '@tiptap/core';
import type { Mark, Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';
import { isInTable } from '@tiptap/pm/tables';
import { calloutVariantAt, canShiftListItem } from './commands';
import type { RteToolbarItemId } from './items';
import { RTE_INSERT_TABLE } from './table-guard';

/** Estado de um item da barra (§4, U5). */
export interface RteItemState {
  readonly active: boolean;
  readonly enabled: boolean;
  /** Valor do menu (bloco, cor, alinhamento, linguagem, variante); senão `null`. */
  readonly value: string | null;
}

const OFF: RteItemState = Object.freeze({
  active: false,
  enabled: false,
  value: null,
});

/**
 * Sonda de teste: quantas vezes o estado de todos os itens foi calculado. Só
 * conta em desenvolvimento (`ngDevMode` some no build de produção).
 */
export const toolbarStateProbe = { computations: 0 };

type CanCommands = Record<
  string,
  ((...args: unknown[]) => boolean) | undefined
>;

/** `editor.can().<command>(...args)`; comando ausente (recurso desligado) = `false`. */
export function can(
  editor: Editor,
  command: string,
  ...args: unknown[]
): boolean {
  const fn = (editor.can() as unknown as CanCommands)[command];
  return typeof fn === 'function' && fn(...args);
}

/** Alternâncias: nome lido por `isActive` e comando conferido por `can()`. */
const TOGGLES: Partial<Record<RteToolbarItemId, readonly [string, string]>> = {
  bold: ['bold', 'toggleBold'],
  italic: ['italic', 'toggleItalic'],
  underline: ['underline', 'toggleUnderline'],
  strike: ['strike', 'toggleStrike'],
  code: ['code', 'toggleCode'],
  superscript: ['superscript', 'toggleSuperscript'],
  subscript: ['subscript', 'toggleSubscript'],
  bulletList: ['bulletList', 'toggleBulletList'],
  orderedList: ['orderedList', 'toggleOrderedList'],
  taskList: ['rtTaskList', 'toggleTaskList'],
  blockquote: ['blockquote', 'toggleBlockquote'],
  codeBlock: ['codeBlock', 'toggleCodeBlock'],
};

const BUTTONS: Partial<Record<RteToolbarItemId, string>> = {
  undo: 'undo',
  redo: 'redo',
  horizontalRule: 'setHorizontalRule',
  readAlso: 'insertReadAlso',
};

/** Blocos de texto tocados pela seleção (todas as faixas, p. ex. `CellSelection`). */
function textblocks(state: EditorState): ProseMirrorNode[] {
  const { selection, doc } = state;
  if (selection.empty) return [selection.$from.parent];
  const out: ProseMirrorNode[] = [];
  for (const range of selection.ranges) {
    doc.nodesBetween(range.$from.pos, range.$to.pos, (node) => {
      if (!node.isTextblock) return true;
      out.push(node);
      return false;
    });
  }
  return out.length ? out : [selection.$from.parent];
}

/** Valor comum a todos os elementos; algum diferente (ou `null`) → `null`. */
function common<T>(
  items: readonly T[],
  read: (item: T) => string | null,
): string | null {
  let value: string | null = null;
  for (const [i, item] of items.entries()) {
    const current = read(item);
    if (current === null) return null;
    if (i === 0) value = current;
    else if (current !== value) return null;
  }
  return value;
}

function blockTypeOf(node: ProseMirrorNode): string | null {
  if (node.type.name === 'paragraph') return 'paragraph';
  if (node.type.name === 'heading') {
    const level = node.attrs['level'] as unknown;
    return level === 2 || level === 3 || level === 4 ? `heading${level}` : null;
  }
  return null;
}

function alignOf(node: ProseMirrorNode): string | null {
  const name = node.type.name;
  if (name !== 'paragraph' && name !== 'heading') return null;
  const value = node.attrs['textAlign'] as unknown;
  return typeof value === 'string' ? value : null;
}

/**
 * Valor de cor de uma seleção com cores diferentes (ou parte sem cor): não
 * casa com nenhum item do menu, então nenhum fica marcado ("Cor padrão"
 * inclusive), e o botão fica ativo (há cor na seleção).
 */
export const RTE_MIXED = '\0mixed';

/**
 * Nome da paleta da marca `markName` comum a todo o texto da seleção; seleção
 * vazia lê as marcas guardadas ou as do cursor; nenhuma parte com a marca →
 * `null`; mista → `RTE_MIXED`.
 */
function colorOf(state: EditorState, markName: string): string | null {
  const type = state.schema.marks[markName];
  if (!type) return null;
  const read = (marks: readonly Mark[]): string | null => {
    const color = type.isInSet(marks)?.attrs['color'] as unknown;
    return typeof color === 'string' ? color : null;
  };
  const { selection, doc, storedMarks } = state;
  if (selection.empty) return read(storedMarks ?? selection.$from.marks());
  const colors = new Set<string | null>();
  for (const range of selection.ranges) {
    doc.nodesBetween(range.$from.pos, range.$to.pos, (node) => {
      if (node.isText) colors.add(read(node.marks));
      return true;
    });
  }
  if (colors.size > 1) return RTE_MIXED;
  return colors.values().next().value ?? null;
}

/** Seleção vazia com marcas guardadas/no cursor, ou não vazia com alguma marca. */
function hasAnyMark(state: EditorState): boolean {
  const { selection, doc, storedMarks } = state;
  if (selection.empty) {
    return (storedMarks ?? selection.$from.marks()).length > 0;
  }
  const types = Object.values(state.schema.marks);
  return selection.ranges.some((range) =>
    types.some((type) =>
      doc.rangeHasMark(range.$from.pos, range.$to.pos, type),
    ),
  );
}

function codeLanguageOf(state: EditorState): string | null {
  const parent = state.selection.$from.parent;
  if (parent.type.name !== 'codeBlock') return null;
  const language = parent.attrs['language'] as unknown;
  return typeof language === 'string' ? language : 'plain';
}

function itemState(
  active: boolean,
  enabled: boolean,
  value: string | null = null,
): RteItemState {
  return { active, enabled, value };
}

/** Estado de um item para a seleção atual (colunas "Ativo"/"Habilitado" da §4). */
export function readItemState(
  editor: Editor,
  id: RteToolbarItemId,
): RteItemState {
  const toggle = TOGGLES[id];
  if (toggle) {
    return itemState(editor.isActive(toggle[0]), can(editor, toggle[1]));
  }
  const button = BUTTONS[id];
  if (button) return itemState(false, can(editor, button));
  const s = editor.state;
  switch (id) {
    case 'blockType': {
      const value = common(textblocks(s), blockTypeOf);
      const enabled =
        can(editor, 'setParagraph') ||
        [2, 3, 4].some((level) => can(editor, 'setHeading', { level }));
      return itemState(value !== null, enabled, value);
    }
    case 'textColor': {
      const value = colorOf(s, 'rtTextColor');
      const sample = RTE_TEXT_COLORS[0]?.name;
      return itemState(
        value !== null,
        can(editor, 'setTextColor', sample),
        value,
      );
    }
    case 'highlight': {
      const value = colorOf(s, 'rtHighlight');
      const sample = RTE_HIGHLIGHT_COLORS[0]?.name;
      return itemState(
        value !== null,
        can(editor, 'setHighlight', sample),
        value,
      );
    }
    case 'indent':
    case 'outdent':
      return itemState(false, canShiftListItem(editor, id));
    case 'align': {
      const value = common(textblocks(s), alignOf);
      return itemState(
        value !== null,
        can(editor, 'setTextAlign', 'left'),
        value,
      );
    }
    case 'codeLanguage': {
      const value = codeLanguageOf(s);
      return itemState(value !== null, value !== null, value);
    }
    case 'table': {
      // Sem ensaios aqui: a guarda só roda com o menu aberto (U14).
      const inTable = isInTable(s);
      return itemState(
        inTable,
        inTable || can(editor, 'insertTable', RTE_INSERT_TABLE),
      );
    }
    case 'callout': {
      const value = calloutVariantAt(editor);
      return itemState(
        value !== null,
        value !== null || can(editor, 'setCallout', 'info'),
        value,
      );
    }
    case 'pullquote': {
      const active = editor.isActive('rtPullquote');
      return itemState(
        active,
        can(editor, active ? 'unsetPullquote' : 'setPullquote'),
      );
    }
    case 'clearFormatting':
      return itemState(false, hasAnyMark(s));
    default:
      return OFF;
  }
}

/** Igualdade por campo (U5: o signal do item só notifica se algo mudou). */
export function sameItemState(a: RteItemState, b: RteItemState): boolean {
  return (
    a.active === b.active && a.enabled === b.enabled && a.value === b.value
  );
}

export interface RteToolbarState {
  /** Estado de todos os itens visíveis, calculado uma vez por transação. */
  readonly all: Signal<ReadonlyMap<RteToolbarItemId, RteItemState>>;
  /** Signal estável do item (o mesmo objeto a cada chamada). */
  item(id: RteToolbarItemId): Signal<RteItemState>;
}

/**
 * Estado da barra (U5): um `computed` sobre a versão da ponte calcula todos
 * os itens visíveis; cada item lê um `computed` próprio com igualdade por
 * campo. Sem editor ou não interativo, nada fica habilitado (o ativo e o
 * valor continuam lidos do editor, se houver).
 */
export function createToolbarState(o: {
  editor: Signal<Editor | null>;
  version: Signal<number>;
  items: Signal<readonly RteToolbarItemId[]>;
  interactive: Signal<boolean>;
}): RteToolbarState {
  const all = computed<ReadonlyMap<RteToolbarItemId, RteItemState>>(() => {
    o.version();
    const editor = o.editor();
    const ids = o.items();
    const interactive = o.interactive();
    if (typeof ngDevMode !== 'undefined' && ngDevMode) {
      toolbarStateProbe.computations += 1;
    }
    const out = new Map<RteToolbarItemId, RteItemState>();
    for (const id of ids) {
      if (!editor || editor.isDestroyed) {
        out.set(id, OFF);
        continue;
      }
      const current = readItemState(editor, id);
      out.set(
        id,
        interactive || !current.enabled
          ? current
          : { ...current, enabled: false },
      );
    }
    return out;
  });
  const signals = new Map<RteToolbarItemId, Signal<RteItemState>>();
  return {
    all,
    item(id) {
      let signal = signals.get(id);
      if (!signal) {
        signal = computed(() => all().get(id) ?? OFF, {
          equal: sameItemState,
        });
        signals.set(id, signal);
      }
      return signal;
    },
  };
}
