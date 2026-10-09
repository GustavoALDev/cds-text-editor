import { Extension } from '@tiptap/core';
import type { AnyExtension, Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { ReplaceStep } from '@tiptap/pm/transform';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import type { RteExtensionContext } from './context';
import {
  filterSlashItems,
  resolveSlashItems,
  resolveSlashLabels,
  slashTitle,
} from './slash-items';
import type { RteSlashItem, RteSlashOptions } from './slash-items';

/** Estado público do menu `/` (spec 03c, §4 e C18). */
export interface RteSlashMenuState {
  /** Se o menu está aberto. */
  open: boolean;
  /** Texto digitado depois da barra. */
  query: string;
  /** Do `/` ao cursor (posicionamento na spec 05); `null` fechado. */
  range: { from: number; to: number } | null;
  /**
   * Itens que casam com a consulta, com o grupo para agrupar na interface.
   */
  items: readonly { id: string; title: string; group?: string }[];
  /** `-1` sem itens. */
  activeIndex: number;
}

/** A consulta fecha o menu acima deste número de pontos de código (C13). */
export const SLASH_QUERY_MAX = 30;

/**
 * Estado interno do plugin. `from` é a posição do `/`; `pendingUi` guarda o
 * item de UI a entregar ao `onUiItem` depois do despacho (C15); dura só o
 * estado criado pela execução.
 */
export interface SlashPluginState {
  readonly open: boolean;
  readonly from: number;
  readonly activeIndex: number;
  readonly pendingUi: string | null;
}

/**
 * Ações da *meta* do plugin: `close` e `activate` vêm de transações só de
 * estado; `run` vem da execução de um item (fecha e grava `pendingUi`).
 */
export type SlashAction =
  | { type: 'close' }
  | { type: 'activate'; index: number }
  | { type: 'run'; ui: string | null };

/** Armazenamento `editor.storage.rtSlashCommand` (lido pelo getter). */
export interface RteSlashStorage {
  /** Itens resolvidos na criação (recursos e `slash.items`). */
  readonly items: readonly RteSlashItem[];
  /** Opções do consumidor; `labels` é lido a cada uso (lição 4). */
  readonly options: RteSlashOptions | undefined;
}

declare module '@tiptap/core' {
  interface Storage {
    /** Ausente com `features.slashCommands: false`. */
    rtSlashCommand?: RteSlashStorage;
  }
  interface Commands<ReturnType> {
    rtSlashCommand: {
      /** Item ativo do menu aberto (índice entre os itens visíveis). */
      setSlashActiveIndex: (index: number) => ReturnType;
      /** Fecha o menu; o mesmo `/` não reabre (C13). */
      closeSlashMenu: () => ReturnType;
      /**
       * Executa o item `index` dos visíveis (padrão: o ativo) numa transação:
       * apaga `/consulta` e roda o comando; item de UI chama `onUiItem` (C15).
       */
      runSlashItem: (index?: number) => ReturnType;
    };
  }
}

export const slashKey = new PluginKey<SlashPluginState>('rtSlashCommand');

const CLASS = 'rte-slash-query';
const SPACE = /\s/u;

const CLOSED_STATE: SlashPluginState = Object.freeze({
  open: false,
  from: 0,
  activeIndex: 0,
  pendingUi: null,
});

const CLOSED_MENU: RteSlashMenuState = Object.freeze({
  open: false,
  query: '',
  range: null,
  items: Object.freeze([]),
  activeIndex: -1,
});

/** `/` digitado e ainda não despachado (gravado por `handleTextInput`). */
interface Pending {
  readonly from: number;
  readonly to: number;
  readonly doc: ProseMirrorNode;
}

/**
 * A transação é a padrão da digitação de `/` gravada em `pending` (C13): um
 * passo só, que troca `from..to` por um nó de texto `/` sem a marca `code`,
 * num `paragraph`, no início do bloco ou depois de espaço (inclusive NBSP).
 */
function opensMenu(
  tr: Transaction,
  pending: Pending,
  doc: ProseMirrorNode,
): boolean {
  if (tr.before !== pending.doc || tr.steps.length !== 1) return false;
  const step = tr.steps[0];
  if (!(step instanceof ReplaceStep)) return false;
  if (step.from !== pending.from || step.to !== pending.to) return false;
  const { content } = step.slice;
  const node = content.firstChild;
  if (
    content.childCount !== 1 ||
    !node?.isText ||
    node.text !== '/' ||
    node.marks.some((mark) => mark.type.name === 'code')
  ) {
    return false;
  }
  const $pos = doc.resolve(pending.from);
  if ($pos.parent.type.name !== 'paragraph') return false;
  const before = $pos.nodeBefore;
  if (before === null) return true;
  const text = before.isText ? (before.text ?? '') : '';
  return text.endsWith(' ') || text.endsWith('\u00A0');
}

/**
 * Faixa e consulta do menu aberto em `from`, ou `null` se uma regra de
 * fechamento de C13 vale: o `/` sumiu, a seleção não é um cursor dentro da
 * faixa do mesmo bloco, a consulta tem espaço (ou quebra de linha) ou passa
 * de 30 pontos de código.
 */
function queryAt(
  state: EditorState,
  from: number,
): { to: number; query: string } | null {
  const { doc, selection } = state;
  if (from < 0 || from >= doc.content.size) return null;
  const $from = doc.resolve(from);
  const after = $from.nodeAfter;
  if (
    $from.parent.type.name !== 'paragraph' ||
    !after?.isText ||
    !(after.text ?? '').startsWith('/')
  ) {
    return null;
  }
  const head = selection.head;
  if (!selection.empty || head <= from || head > $from.end()) return null;
  const query = doc.textBetween(from + 1, head, '\n', '\n');
  if (SPACE.test(query) || [...query].length > SLASH_QUERY_MAX) return null;
  return { to: head, query };
}

function nextState(
  tr: Transaction,
  prev: SlashPluginState,
  oldState: EditorState,
  newState: EditorState,
  pending: Pending | null,
): SlashPluginState {
  const action = tr.getMeta(slashKey) as SlashAction | undefined;
  if (action?.type === 'run') {
    return action.ui === null
      ? CLOSED_STATE
      : { ...CLOSED_STATE, pendingUi: action.ui };
  }
  // `pendingUi` vale só para o estado da execução e para as transações que
  // os `appendTransaction` acrescentam a ela no mesmo despacho: o
  // `view.update` só roda depois de todas.
  const keep =
    prev.pendingUi === null || tr.getMeta('appendedTransaction') !== undefined;
  let value = keep ? prev : CLOSED_STATE;
  if (pending && opensMenu(tr, pending, newState.doc)) {
    value = { open: true, from: pending.from, activeIndex: 0, pendingUi: null };
  } else if (prev.open && tr.docChanged) {
    const mapped = tr.mapping.mapResult(prev.from, 1);
    value = mapped.deleted ? CLOSED_STATE : { ...prev, from: mapped.pos };
  }
  if (!value.open) return value === prev ? prev : CLOSED_STATE;
  const current = queryAt(newState, value.from);
  if (current === null) return CLOSED_STATE;
  // Consulta nova: o ativo volta ao primeiro item.
  if (value.activeIndex !== 0 && prev.open) {
    const before = queryAt(oldState, prev.from);
    if (before?.query !== current.query) value = { ...value, activeIndex: 0 };
  }
  if (action?.type === 'close') return CLOSED_STATE;
  if (action?.type === 'activate' && action.index !== value.activeIndex) {
    value = { ...value, activeIndex: action.index };
  }
  return value;
}

function stateOnly(tr: Transaction, action: SlashAction): Transaction {
  return tr.setMeta(slashKey, action).setMeta('addToHistory', false);
}

/**
 * Disponibilidade (C14): item com comando só aparece se a cadeia de pré-voo
 * (`editor.can()`, com `/consulta` apagada) roda; exceção = indisponível.
 */
function isAvailable(
  editor: Editor,
  entry: RteSlashItem,
  range: { from: number; to: number },
): boolean {
  if (typeof entry.command !== 'function') return true;
  try {
    const chain = entry.command(
      editor.can().chain().deleteRange(range),
      editor,
    );
    return chain.run() === true;
  } catch {
    return false;
  }
}

function storageOf(editor: Editor): RteSlashStorage | undefined {
  return (editor.storage as { rtSlashCommand?: RteSlashStorage })
    .rtSlashCommand;
}

const memo = new WeakMap<EditorState, RteSlashMenuState>();

/**
 * Estado do menu `/` (spec 03c, C18), congelado e memorizado por
 * `EditorState`. Fechado sem a extensão (`features.slashCommands: false`) ou
 * com o editor não editável.
 */
export function getSlashMenuState(editor: Editor): RteSlashMenuState {
  return menuAt(editor, editor.state);
}

/**
 * Estado do menu em `state` (o do editor ou o encadeável de um comando);
 * memorizado só para o `EditorState` do editor.
 */
function menuAt(editor: Editor, state: EditorState): RteSlashMenuState {
  const value = slashKey.getState(state);
  const storage = storageOf(editor);
  if (!value?.open || !storage || !editor.isEditable) return CLOSED_MENU;
  const cached = memo.get(state);
  if (cached) return cached;
  const current = queryAt(state, value.from);
  if (current === null) return CLOSED_MENU;
  const range = Object.freeze({ from: value.from, to: current.to });
  const labels = resolveSlashLabels(storage.options?.labels);
  const items = Object.freeze(
    filterSlashItems(storage.items, current.query, labels)
      .filter((entry) => isAvailable(editor, entry, range))
      .map((entry) =>
        Object.freeze({
          id: entry.id,
          title: slashTitle(entry, labels),
          ...(typeof entry.group === 'string' ? { group: entry.group } : {}),
        }),
      ),
  );
  const result: RteSlashMenuState = Object.freeze({
    open: true,
    query: current.query,
    range,
    items,
    activeIndex: Math.min(value.activeIndex, items.length - 1),
  });
  if (state === editor.state) memo.set(state, result);
  return result;
}

/** Comando de menu: só com o menu aberto e sem outra ação na transação. */
function openState(
  state: EditorState,
  tr: Transaction,
): SlashPluginState | undefined {
  const value = slashKey.getState(state);
  if (!value?.open || tr.docChanged || tr.getMeta(slashKey) !== undefined) {
    return undefined;
  }
  return value;
}

/**
 * Menu `/` (spec 03c, C13, C14): abre só com `/` digitado, acompanha a
 * consulta, aplica as regras de fechamento e expõe o estado por
 * `getSlashMenuState`. `priority: 1000` (acima das extensões de conteúdo).
 */
export function createSlashCommandExtension(
  ctx: RteExtensionContext,
  options: RteSlashOptions | undefined,
): AnyExtension {
  const items = resolveSlashItems(ctx, options?.items);
  return Extension.create<unknown, RteSlashStorage>({
    name: 'rtSlashCommand',
    priority: 1000,
    addStorage() {
      return { items, options };
    },
    addCommands() {
      return {
        setSlashActiveIndex:
          (index) =>
          ({ editor, state, tr, dispatch }) => {
            if (!openState(state, tr)) return false;
            const { open, items: visible } = menuAt(editor, state);
            if (
              !open ||
              !Number.isInteger(index) ||
              index < 0 ||
              index >= visible.length
            ) {
              return false;
            }
            if (dispatch) stateOnly(tr, { type: 'activate', index });
            return true;
          },
        closeSlashMenu:
          () =>
          ({ state, tr, dispatch }) => {
            if (!openState(state, tr)) return false;
            if (dispatch) stateOnly(tr, { type: 'close' });
            return true;
          },
        runSlashItem:
          (index) =>
          ({ editor, state, tr, chain }) => {
            if (!openState(state, tr)) return false;
            const current = menuAt(editor, state);
            const at = index ?? current.activeIndex;
            const { range } = current;
            if (
              !current.open ||
              range === null ||
              !Number.isInteger(at) ||
              at < 0 ||
              at >= current.items.length
            ) {
              return false;
            }
            const id = current.items[at]?.id;
            const entry = storageOf(editor)?.items.find((i) => i.id === id);
            if (entry === undefined) return false;
            const command =
              typeof entry.command === 'function' ? entry.command : null;
            const action: SlashAction = {
              type: 'run',
              ui: command === null ? entry.id : null,
            };
            // Mesma transação (C15): um passo de desfazer, sem fundir com a
            // digitação de `/consulta`.
            const base = chain()
              .command(({ tr: next, dispatch }) => {
                if (dispatch) closeHistory(next).setMeta(slashKey, action);
                return true;
              })
              .deleteRange(range);
            return (command ? command(base, editor) : base).run();
          },
      };
    },
    addKeyboardShortcuts() {
      // Só com o menu aberto (e o editor editável); sem itens, só `Escape`.
      // `Tab` nunca é capturado (C16, WCAG 2.1.2).
      const move =
        (step: number) =>
        ({ editor }: { editor: Editor }): boolean => {
          const {
            open,
            items: visible,
            activeIndex,
          } = getSlashMenuState(editor);
          if (!open || visible.length === 0) return false;
          const next = (activeIndex + step + visible.length) % visible.length;
          return editor.commands.setSlashActiveIndex(next);
        };
      return {
        ArrowDown: move(1),
        ArrowUp: move(-1),
        Enter: ({ editor }) => {
          const { open, items: visible } = getSlashMenuState(editor);
          if (!open || visible.length === 0) return false;
          // Consome a tecla mesmo se o comando do item falhar ao executar: o
          // Tiptap despacha a cadeia parcial (consulta já apagada), e dividir
          // o parágrafo depois disso fere C16.
          editor.commands.runSlashItem();
          return true;
        },
        Escape: ({ editor }) =>
          getSlashMenuState(editor).open && editor.commands.closeSlashMenu(),
      };
    },
    addProseMirrorPlugins() {
      // Por editor: o `/` visto no `handleTextInput`, consumido no próximo
      // `apply` (seja ele a transação padrão da digitação ou não).
      let pending: Pending | null = null;
      const { editor } = this;
      return [
        new Plugin<SlashPluginState>({
          key: slashKey,
          state: {
            init: () => CLOSED_STATE,
            apply: (tr, prev, oldState, newState) => {
              const seen = pending;
              pending = null;
              return nextState(tr, prev, oldState, newState, seen);
            },
          },
          props: {
            handleTextInput(view, from, to, text) {
              pending =
                text === '/' && view.editable
                  ? { from, to, doc: view.state.doc }
                  : null;
              return false;
            },
            decorations(state) {
              const value = slashKey.getState(state);
              if (!value?.open) return null;
              const to = state.selection.head;
              return DecorationSet.create(state.doc, [
                Decoration.inline(value.from, to, { class: CLASS }),
              ]);
            },
          },
          view: () => ({
            update(view: EditorView, prevState: EditorState) {
              const value = slashKey.getState(view.state);
              // O editor deixou de ser editável com o menu aberto (C13).
              // Despacho reentrante: o `updatePluginViews` em curso já recebeu
              // o estado anterior; o aninhado aplica o fechamento e roda de novo
              // os `update` com o estado fechado, que não despacha outra vez.
              if (!view.editable && value?.open) {
                view.dispatch(stateOnly(view.state.tr, { type: 'close' }));
                return;
              }
              // Item de UI (C15): uma chamada, com o estado da execução já
              // aplicado (`/consulta` apagada, menu fechado). O mesmo estado
              // visto de novo (`setProps`) não repete a chamada.
              const id = value?.pendingUi;
              if (id == null || slashKey.getState(prevState) === value) return;
              const onUiItem = options?.onUiItem;
              if (typeof onUiItem !== 'function') return;
              try {
                onUiItem(id, editor);
              } catch {
                // Função do consumidor que lança vale como ausente: nunca
                // lança durante a entrada (lição 4).
              }
            },
          }),
        }),
      ];
    },
  });
}
