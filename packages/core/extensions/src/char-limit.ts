import { Extension } from '@tiptap/core';
import type { AnyExtension, Editor } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { dropPoint } from '@tiptap/pm/transform';
import type { RteExtensionContext } from './context';
import { getRteTextStats } from './text-stats';
import type { RteTextStats } from './text-stats';
import type { RteEditorOptions } from './types';

/** Estado do limite (spec 03c, C18): estatísticas mais limite e recusas. */
export interface RteCharLimitState extends RteTextStats {
  /** `null`: sem limite. */
  limit: number | null;
  /** `limit - characters` (negativo acima do limite); `null` sem limite. */
  remaining: number | null;
  overLimit: boolean;
  /** Entradas diretas recusadas ou cortadas desde a criação. */
  rejected: number;
}

/** Armazenamento `editor.storage.rtCharLimit`. */
export interface RteCharLimitStorage {
  /** Limite resolvido a cada chamada (lição 4). */
  limit(): number | null;
}

declare module '@tiptap/core' {
  interface Storage {
    rtCharLimit: RteCharLimitStorage;
  }
}

/** Estado do plugin; a *meta* `'rejected'` conta uma recusa ou corte. */
export const charLimitKey = new PluginKey<{ rejected: number }>('rtCharLimit');

const REJECTED = 'rejected';

/**
 * Validação estática da opção `charLimit` (fábrica): `null`, `undefined` e
 * função passam (a função é conferida a cada uso); número precisa ser inteiro
 * `>= 0`.
 */
export function assertCharLimit(value: unknown): void {
  if (value === null || value === undefined || typeof value === 'function') {
    return;
  }
  if (!(Number.isInteger(value) && (value as number) >= 0)) {
    throw new RangeError(
      `charLimit inválido: ${String(value)} (use um inteiro >= 0, null ou uma função).`,
    );
  }
}

/**
 * Limite lido a cada uso (lição 4). Função que lança ou valor que não é
 * inteiro `>= 0` valem como ausentes: `null` (sem limite).
 */
export function resolveCharLimit(
  source: RteEditorOptions['charLimit'],
): number | null {
  try {
    const value: unknown = typeof source === 'function' ? source() : source;
    return Number.isInteger(value) && (value as number) >= 0
      ? (value as number)
      : null;
  } catch {
    return null;
  }
}

/** Pontos de código dos nós de texto do recorte. */
export function sliceCodePoints(slice: Slice): number {
  let count = 0;
  slice.content.descendants((node) => {
    if (node.isText) {
      for (const _ of node.text ?? '') count++;
    }
    return true;
  });
  return count;
}

/**
 * Recorte com os primeiros `codePoints` pontos de código do texto (sem partir
 * par substituto). `Fragment.cut` fecha a estrutura; o fim fica aberto até onde
 * o conteúdo permitir, para o texto cortado se juntar ao que vem depois.
 */
export function cutSlice(slice: Slice, codePoints: number): Slice {
  let end = 0;
  let remaining = codePoints;
  if (remaining > 0) {
    let found = false;
    slice.content.descendants((node, pos) => {
      if (found) return false;
      if (node.isText) {
        let offset = 0;
        for (const ch of node.text ?? '') {
          if (remaining === 0) break;
          offset += ch.length;
          remaining--;
        }
        if (remaining === 0) {
          end = pos + offset;
          found = true;
        }
      }
      return !found;
    });
    if (!found) end = slice.content.size;
  }
  const content = slice.content.cut(0, end);
  return new Slice(content, slice.openStart, Slice.maxOpen(content).openEnd);
}

/** Regra única (C6): cabe no limite ou não aumenta a contagem. */
function accepts(before: number, after: number, limit: number): boolean {
  return after <= limit || after <= before;
}

function sliceSingleNode(slice: Slice): ProseMirrorNode | null {
  return slice.openStart === 0 &&
    slice.openEnd === 0 &&
    slice.content.childCount === 1
    ? slice.content.firstChild
    : null;
}

/** Transação da colagem, como o `doPaste` do `prosemirror-view`. */
function pasteTransaction(state: EditorState, slice: Slice): Transaction {
  const single = sliceSingleNode(slice);
  return single
    ? state.tr.replaceSelectionWith(single, false)
    : state.tr.replaceSelection(slice);
}

function rejection(state: EditorState): Transaction {
  return state.tr
    .setMeta(charLimitKey, REJECTED)
    .setMeta('addToHistory', false);
}

/**
 * Limite de caracteres (spec 03c, C4/C6/R3): só a entrada direta (digitação
 * fora de composição, colagem e soltar externo) é barrada quando aumentaria a
 * contagem acima do limite. Os demais caminhos nunca são barrados; o estado
 * fica `overLimit`. O limite é lido a cada verificação.
 */
export function createCharLimitExtension(
  ctx: RteExtensionContext,
  source: RteEditorOptions['charLimit'],
): AnyExtension {
  const limitOf = () => resolveCharLimit(source);
  const count = (doc: ProseMirrorNode) =>
    getRteTextStats(doc, { labels: ctx.labels }).characters;

  return Extension.create<Record<string, never>, RteCharLimitStorage>({
    name: 'rtCharLimit',
    // Antes das regras de entrada e dos tratadores de colagem do conteúdo.
    priority: 1000,
    addStorage() {
      return { limit: limitOf };
    },
    addProseMirrorPlugins() {
      return [
        new Plugin<{ rejected: number }>({
          key: charLimitKey,
          state: {
            init: () => ({ rejected: 0 }),
            apply: (tr, value) =>
              tr.getMeta(charLimitKey) === REJECTED
                ? { rejected: value.rejected + 1 }
                : value,
          },
          props: {
            handleTextInput(view, _from, _to, _text, deflt) {
              const limit = limitOf();
              if (view.composing || limit === null) return false;
              const before = count(view.state.doc);
              const after = count(deflt().doc);
              if (accepts(before, after, limit)) return false;
              // O `DOMObserver` redesenha o nó que o navegador já alterou.
              view.dispatch(rejection(view.state));
              return true;
            },
            handlePaste(view, _event, slice) {
              const limit = limitOf();
              if (limit === null) return false;
              const { state } = view;
              const before = count(state.doc);
              const fits = (tr: Transaction) =>
                accepts(before, count(tr.doc), limit);
              if (fits(pasteTransaction(state, slice))) return false;
              // Maior prefixo que cabe: busca binária sobre o resultado real.
              // `best` só recebe candidatos conferidos; `null` = nada cabe.
              let lo = 0;
              let hi = sliceCodePoints(slice) - 1;
              let best: Transaction | null = null;
              while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                const tr = pasteTransaction(state, cutSlice(slice, mid));
                if (fits(tr)) {
                  lo = mid;
                  best = tr;
                } else {
                  hi = mid - 1;
                }
              }
              if (best === null) {
                view.dispatch(rejection(state));
                return true;
              }
              view.dispatch(
                best
                  .scrollIntoView()
                  .setMeta('paste', true)
                  .setMeta('uiEvent', 'paste')
                  .setMeta(charLimitKey, REJECTED),
              );
              return true;
            },
            handleDrop(view, event, slice, moved) {
              const limit = limitOf();
              if (moved || view.composing || limit === null) return false;
              const coords = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              });
              if (!coords) return false;
              const { state } = view;
              const pos = dropPoint(state.doc, coords.pos, slice) ?? coords.pos;
              const tr = state.tr;
              const single = sliceSingleNode(slice);
              if (single) tr.replaceRangeWith(pos, pos, single);
              else tr.replaceRange(pos, pos, slice);
              if (accepts(count(state.doc), count(tr.doc), limit)) return false;
              view.dispatch(rejection(state));
              return true;
            },
          },
        }),
      ];
    },
  });
}

const memo = new WeakMap<EditorState, RteCharLimitState>();

/**
 * Estado do limite (spec 03c, C18): congelado e memorizado por `EditorState`
 * (revalidado se o limite atual mudou). Lança `TypeError` se o editor não foi
 * criado com `createEditorExtensions`.
 */
export function getCharLimitState(editor: Editor): RteCharLimitState {
  const storage = editor.storage as Partial<Editor['storage']>;
  const own = Object.hasOwn(storage, 'rtCharLimit')
    ? storage.rtCharLimit
    : undefined;
  if (!own) {
    throw new TypeError(
      'getCharLimitState: o editor não foi criado com createEditorExtensions (falta a extensão rtCharLimit).',
    );
  }
  const { state } = editor;
  const limit = own.limit();
  const cached = memo.get(state);
  if (cached && cached.limit === limit) return cached;
  const content = Object.hasOwn(storage, 'rtContent')
    ? storage.rtContent
    : undefined;
  const stats = getRteTextStats(
    state.doc,
    content ? { labels: content.labels } : {},
  );
  const result: RteCharLimitState = Object.freeze({
    characters: stats.characters,
    words: stats.words,
    limit,
    remaining: limit === null ? null : limit - stats.characters,
    overLimit: limit !== null && stats.characters > limit,
    rejected: charLimitKey.getState(state)?.rejected ?? 0,
  });
  memo.set(state, result);
  return result;
}
