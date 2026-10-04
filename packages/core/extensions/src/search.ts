import { Extension } from '@tiptap/core';
import type { AnyExtension, CommandProps, Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import type { RteExtensionContext } from './context';
import { truncateText } from './limits';
import {
  MAX_SEARCH_QUERY,
  SEARCH_CAP,
  collectMatches,
  createMatcher,
} from './search-index';
import type { Matcher, RteSearchMatch } from './search-index';

export type { RteSearchMatch } from './search-index';

/** Opções da busca (spec 03c, C8); ausentes mantêm o valor atual. */
export interface RteSearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

/** Estado público da busca (spec 03c, §4 e C18). */
export interface RteSearchState {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  /** Ordem de documento, no máximo 1000. */
  matches: readonly RteSearchMatch[];
  total: number;
  capped: boolean;
  /** `-1` sem resultado. */
  activeIndex: number;
  /** Nº de trechos da última substituição (`null` antes). */
  lastReplaced: number | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    rtSearch: {
      /** Consulta literal (cortada em 1000 unidades; vazia = sem busca). */
      setSearchQuery: (query: string, options?: RteSearchOptions) => ReturnType;
      /** Muda as opções e recalcula com a mesma consulta. */
      setSearchOptions: (options: RteSearchOptions) => ReturnType;
      /** Encerra a busca; `false` se já não havia busca. */
      clearSearch: () => ReturnType;
      /** Próximo resultado (circular): seleciona e rola, sem focar. */
      nextSearchMatch: () => ReturnType;
      /** Resultado anterior (circular): seleciona e rola, sem focar. */
      previousSearchMatch: () => ReturnType;
      /** Substitui o ativo (texto literal); o ativo passa ao próximo. */
      replaceSearchMatch: (replacement: string) => ReturnType;
      /** Substitui todos os resultados, sem teto, num passo de desfazer. */
      replaceAllSearchMatches: (replacement: string) => ReturnType;
    };
  }
}

type BlockCache = WeakMap<
  ProseMirrorNode,
  readonly (readonly [number, number])[]
>;

/** Estado interno do plugin. `matcher` e `cache` valem para a consulta atual. */
export interface SearchPluginState {
  readonly query: string;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly matcher: Matcher | null;
  readonly cache: BlockCache;
  readonly matches: readonly RteSearchMatch[];
  readonly capped: boolean;
  readonly activeIndex: number;
  readonly lastReplaced: number | null;
  readonly decorations: DecorationSet;
}

/** Ações da *meta* do plugin (transações só de estado). */
export type SearchAction =
  | {
      type: 'setQuery';
      query: string;
      caseSensitive: boolean;
      wholeWord: boolean;
    }
  | { type: 'clear' }
  | { type: 'activate'; index: number }
  /** Substituição: ativo = primeiro em ou depois de `anchor` (fim do inserido). */
  | { type: 'replaced'; anchor: number; count: number };

export const searchKey = new PluginKey<SearchPluginState>('rtSearch');

// Estados do plugin produzidos por `nextSearchMatch`/`previousSearchMatch`.
const navigated = new WeakSet<SearchPluginState>();

const CLASS = 'rte-search-match';
const CLASS_ACTIVE_ONLY = 'rte-search-match--active';
const CLASS_ACTIVE = `${CLASS} ${CLASS_ACTIVE_ONLY}`;
const NO_MATCHES: readonly RteSearchMatch[] = Object.freeze([]);

function emptyState(
  caseSensitive: boolean,
  wholeWord: boolean,
): SearchPluginState {
  return {
    query: '',
    caseSensitive,
    wholeWord,
    matcher: null,
    cache: new WeakMap(),
    matches: NO_MATCHES,
    capped: false,
    activeIndex: -1,
    lastReplaced: null,
    decorations: DecorationSet.empty,
  };
}

/** Primeiro resultado em ou depois de `pos`; circular; `-1` sem resultados. */
export function firstAtOrAfter(
  matches: readonly RteSearchMatch[],
  pos: number,
): number {
  if (matches.length === 0) return -1;
  const index = matches.findIndex((m) => m.from >= pos);
  return index === -1 ? 0 : index;
}

function buildDecorations(
  doc: ProseMirrorNode,
  matches: readonly RteSearchMatch[],
  activeIndex: number,
): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, {
        class: i === activeIndex ? CLASS_ACTIVE : CLASS,
      }),
    ),
  );
}

function index(
  doc: ProseMirrorNode,
  matcher: Matcher,
  cache: BlockCache,
): { matches: readonly RteSearchMatch[]; capped: boolean } {
  const { matches, capped } = collectMatches(doc, matcher, cache, SEARCH_CAP);
  for (const m of matches) Object.freeze(m);
  return { matches: Object.freeze(matches), capped };
}

/** Nova consulta ou opções: índice do zero; ativo pela seleção (`anchor`). */
function withQuery(
  prev: SearchPluginState,
  doc: ProseMirrorNode,
  action: Extract<SearchAction, { type: 'setQuery' }>,
  anchor: number,
): SearchPluginState {
  const { query, caseSensitive, wholeWord } = action;
  const matcher = createMatcher(query, { caseSensitive, wholeWord });
  if (matcher === null) {
    return {
      ...emptyState(caseSensitive, wholeWord),
      lastReplaced: prev.lastReplaced,
    };
  }
  const cache: BlockCache = new WeakMap();
  const { matches, capped } = index(doc, matcher, cache);
  const activeIndex = firstAtOrAfter(matches, anchor);
  return {
    ...prev,
    query,
    caseSensitive,
    wholeWord,
    matcher,
    cache,
    matches,
    capped,
    activeIndex,
    decorations: buildDecorations(doc, matches, activeIndex),
  };
}

/**
 * Documento mudou: reindexa (o cache poupa os blocos inalterados); o ativo é o
 * primeiro em ou depois da posição mapeada do ativo anterior. Decorações só
 * são recriadas se os resultados ou o ativo mudaram; senão, mapeadas.
 */
function afterEdit(
  prev: SearchPluginState,
  matcher: Matcher,
  tr: Transaction,
): SearchPluginState {
  const { matches, capped } = index(tr.doc, matcher, prev.cache);
  const old = prev.matches[prev.activeIndex];
  const anchor = old ? tr.mapping.map(old.from) : tr.selection.from;
  const activeIndex = firstAtOrAfter(matches, anchor);
  // Mesmo mapeamento das decorações `inline` (sem `inclusiveStart/End`).
  const same =
    activeIndex === prev.activeIndex &&
    matches.length === prev.matches.length &&
    matches.every((m, i) => {
      const p = prev.matches[i] as RteSearchMatch;
      return (
        tr.mapping.map(p.from, 1) === m.from &&
        tr.mapping.map(p.to, -1) === m.to
      );
    });
  return {
    ...prev,
    matches,
    capped,
    activeIndex,
    decorations: same
      ? prev.decorations.map(tr.mapping, tr.doc)
      : buildDecorations(tr.doc, matches, activeIndex),
  };
}

function applyAction(
  value: SearchPluginState,
  action: SearchAction,
  tr: Transaction,
): SearchPluginState {
  switch (action.type) {
    case 'setQuery':
      return withQuery(value, tr.doc, action, tr.selection.from);
    case 'clear':
      return emptyState(value.caseSensitive, value.wholeWord);
    case 'activate': {
      const { index: i } = action;
      if (i === value.activeIndex || i < 0 || i >= value.matches.length) {
        return value;
      }
      return {
        ...value,
        activeIndex: i,
        decorations: buildDecorations(tr.doc, value.matches, i),
      };
    }
    case 'replaced': {
      // `value` já reflete o documento novo (`afterEdit` roda antes).
      const activeIndex = firstAtOrAfter(value.matches, action.anchor);
      return {
        ...value,
        activeIndex,
        lastReplaced: action.count,
        decorations:
          activeIndex === value.activeIndex
            ? value.decorations
            : buildDecorations(tr.doc, value.matches, activeIndex),
      };
    }
  }
}

function stateOnly(tr: Transaction, action: SearchAction): Transaction {
  return tr.setMeta(searchKey, action).setMeta('addToHistory', false);
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/*
 * Comandos encadeados (`editor.chain()`): o `state` da cadeia só acompanha
 * `doc` e `selection`; o estado do plugin continua o de antes da cadeia e
 * todos os comandos escrevem a mesma *meta*. Em vez de reconstituir o estado
 * intermediário, a regra é recusar o que leria dados defasados:
 * - todo comando de busca devolve `false` sem efeito se a transação já leva
 *   uma *meta* da busca (`chain().setSearchQuery(q).nextSearchMatch()` aplica
 *   a consulta e recusa a navegação);
 * - navegação e substituição, que usam posições dos resultados, também
 *   recusam se a transação já mudou o documento
 *   (`chain().insertContent(x).nextSearchMatch()` só insere).
 * Consulta, opções e `clearSearch` depois de editar continuam valendo: o
 * `apply` reindexa sobre o documento final.
 */
function hasSearchMeta(tr: Transaction): boolean {
  return tr.getMeta(searchKey) !== undefined;
}

/** Estado para comando que lê posições (navegar, substituir); ver acima. */
function positionsState(
  state: EditorState,
  tr: Transaction,
): SearchPluginState | undefined {
  if (hasSearchMeta(tr) || tr.docChanged) return undefined;
  return searchKey.getState(state);
}

/**
 * Texto de substituição (C11): NUL vira U+FFFD; CRLF/CR/LF viram espaço fora
 * de bloco de código e `\n` dentro dele.
 */
export function normalizeReplacement(text: string, inCode: boolean): string {
  return text
    .replace(/\0/g, String.fromCharCode(0xfffd))
    .replace(/\r\n|\r|\n/g, inCode ? '\n' : ' ');
}

/**
 * Troca `from..to` pelo texto literal com as marcas do início do trecho (como
 * `insertText`, mas sem ler `storedMarks`); vazio apaga. Devolve o fim do
 * texto inserido.
 */
function replaceRange(
  tr: Transaction,
  from: number,
  to: number,
  replacement: string,
): number {
  const $from = tr.doc.resolve(from);
  const $to = tr.doc.resolve(to);
  const value = normalizeReplacement(
    replacement,
    $from.parent.type.spec.code === true,
  );
  if (value === '') {
    tr.delete(from, to);
  } else {
    const marks = $from.marksAcross($to) ?? [];
    tr.replaceWith(from, to, tr.doc.type.schema.text(value, marks));
  }
  return from + value.length;
}

/** Navegação: seleciona o resultado e rola até ele, sem focar (C12). */
function navigate(step: 1 | -1): (props: CommandProps) => boolean {
  return ({ state, tr, dispatch }) => {
    const current = positionsState(state, tr);
    const n = current?.matches.length ?? 0;
    if (!current || n === 0) return false;
    const from = current.activeIndex;
    const next = from < 0 ? (step === 1 ? 0 : n - 1) : (from + step + n) % n;
    const match = current.matches[next] as RteSearchMatch;
    if (dispatch) {
      stateOnly(tr, { type: 'activate', index: next })
        .setSelection(TextSelection.create(tr.doc, match.from, match.to))
        .scrollIntoView();
    }
    return true;
  };
}

/**
 * Busca literal por bloco de texto (spec 03c, C8–C10, C12, R5): índice
 * incremental com teto de 1000, decorações `rte-search-match(--active)` e
 * navegação circular. O core não registra atalhos.
 */
export function createSearchExtension(_ctx: RteExtensionContext): AnyExtension {
  return Extension.create({
    name: 'rtSearch',
    addCommands() {
      return {
        setSearchQuery:
          (query, options) =>
          ({ state, tr, dispatch }) => {
            const current = searchKey.getState(state);
            if (!current || hasSearchMeta(tr)) return false;
            const opts = options ?? {};
            if (dispatch) {
              stateOnly(tr, {
                type: 'setQuery',
                query: truncateText(String(query), MAX_SEARCH_QUERY),
                caseSensitive: boolOr(
                  opts.caseSensitive,
                  current.caseSensitive,
                ),
                wholeWord: boolOr(opts.wholeWord, current.wholeWord),
              });
            }
            return true;
          },
        setSearchOptions:
          (options) =>
          ({ state, tr, dispatch }) => {
            const current = searchKey.getState(state);
            if (!current || hasSearchMeta(tr)) return false;
            const opts = options ?? {};
            if (dispatch) {
              stateOnly(tr, {
                type: 'setQuery',
                query: current.query,
                caseSensitive: boolOr(
                  opts.caseSensitive,
                  current.caseSensitive,
                ),
                wholeWord: boolOr(opts.wholeWord, current.wholeWord),
              });
            }
            return true;
          },
        clearSearch:
          () =>
          ({ state, tr, dispatch }) => {
            const current = searchKey.getState(state);
            if (
              !current ||
              hasSearchMeta(tr) ||
              (current.query === '' && current.lastReplaced === null)
            ) {
              return false;
            }
            if (dispatch) stateOnly(tr, { type: 'clear' });
            return true;
          },
        nextSearchMatch: () => navigate(1),
        previousSearchMatch: () => navigate(-1),
        replaceSearchMatch:
          (replacement) =>
          ({ editor, state, tr, dispatch }) => {
            if (!editor.isEditable) return false;
            const current = positionsState(state, tr);
            const match = current?.matches[current.activeIndex];
            if (!match) return false;
            if (dispatch) {
              const anchor = replaceRange(
                tr,
                match.from,
                match.to,
                String(replacement),
              );
              const action: SearchAction = {
                type: 'replaced',
                anchor,
                count: 1,
              };
              closeHistory(tr).setMeta(searchKey, action);
            }
            return true;
          },
        replaceAllSearchMatches:
          (replacement) =>
          ({ editor, state, tr, dispatch }) => {
            if (!editor.isEditable) return false;
            const current = positionsState(state, tr);
            if (!current?.matcher) return false;
            // Sem teto (C10): todos os resultados, com o cache da consulta.
            const { matches } = collectMatches(
              state.doc,
              current.matcher,
              current.cache,
              Infinity,
            );
            const last = matches.at(-1);
            if (!last) return false;
            if (dispatch) {
              const text = String(replacement);
              // Do último ao primeiro, numa transação: as posições anteriores
              // ainda valem a cada troca.
              const end = replaceRange(tr, last.from, last.to, text);
              for (let i = matches.length - 2; i >= 0; i--) {
                const m = matches[i] as RteSearchMatch;
                replaceRange(tr, m.from, m.to, text);
              }
              // Ativo: o primeiro depois do último trecho trocado (circular).
              const action: SearchAction = {
                type: 'replaced',
                anchor: tr.mapping.slice(1).map(end),
                count: matches.length,
              };
              closeHistory(tr).setMeta(searchKey, action);
            }
            return true;
          },
      };
    },
    addProseMirrorPlugins() {
      return [
        new Plugin<SearchPluginState>({
          key: searchKey,
          state: {
            init: () => emptyState(false, false),
            apply: (tr, value) => {
              let next = value;
              if (tr.docChanged && value.matcher) {
                next = afterEdit(value, value.matcher, tr);
              }
              const action = tr.getMeta(searchKey) as SearchAction | undefined;
              if (!action) return next;
              const result = applyAction(next, action, tr);
              if (action.type !== 'activate' || !tr.scrolledIntoView) {
                return result;
              }
              // Navegação: objeto novo mesmo com o ativo igual (um resultado
              // só), para a vista rolar de novo.
              const navigatedTo = result === value ? { ...result } : result;
              navigated.add(navigatedTo);
              return navigatedTo;
            },
          },
          props: {
            decorations: (state) => searchKey.getState(state)?.decorations,
          },
          view: () => ({
            update(view: EditorView, prevState: EditorState) {
              const value = searchKey.getState(view.state);
              if (
                !value ||
                value === searchKey.getState(prevState) ||
                !navigated.has(value)
              ) {
                return;
              }
              // Com o foco no editor, o ProseMirror rola até a seleção. Sem
              // ele (foco na barra de busca, C12), a seleção do DOM não é do
              // editor e o `scrollIntoView` da transação não rola nada.
              if (view.hasFocus()) return;
              const target = view.dom.querySelector(`.${CLASS_ACTIVE_ONLY}`);
              if (typeof target?.scrollIntoView === 'function') {
                target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }
            },
          }),
        }),
      ];
    },
  });
}

// Por estado do plugin: o mesmo `EditorState` (e toda transação que não muda
// a busca) devolve o mesmo objeto.
const memo = new WeakMap<SearchPluginState, RteSearchState>();

const IDLE_SEARCH: RteSearchState = Object.freeze({
  query: '',
  caseSensitive: false,
  wholeWord: false,
  matches: NO_MATCHES,
  total: 0,
  capped: false,
  activeIndex: -1,
  lastReplaced: null,
});

/**
 * Estado da busca (spec 03c, C18), congelado e memorizado; `null` sem a
 * extensão `rtSearch` (`features.search: false`).
 */
export function getSearchState(editor: Editor): RteSearchState | null {
  const value = searchKey.getState(editor.state);
  // Editor sem `element` (SSR): o estado inicial do Tiptap ainda não tem
  // plugins; com a extensão registrada, a busca está vazia.
  if (!value) {
    return editor.extensionManager.extensions.some((e) => e.name === 'rtSearch')
      ? IDLE_SEARCH
      : null;
  }
  let result = memo.get(value);
  if (!result) {
    result = Object.freeze({
      query: value.query,
      caseSensitive: value.caseSensitive,
      wholeWord: value.wholeWord,
      matches: value.matches,
      total: value.matches.length,
      capped: value.capped,
      activeIndex: value.activeIndex,
      lastReplaced: value.lastReplaced,
    });
    memo.set(value, result);
  }
  return result;
}
