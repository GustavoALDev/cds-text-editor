import { computed, signal, type Signal } from '@angular/core';
import {
  getCharLimitState,
  type RteCharLimitState,
} from '@comodeviaser/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import type { RteEditor } from './rte-editor';
import { isEmptyDoc } from './empty';

/**
 * Ponte de signals (D4): um ouvinte de `transaction` sobe a versão; o estado
 * exposto é `computed` sobre ela com igualdade, então só notifica quando o
 * valor muda.
 */
export interface RteBridge {
  readonly version: Signal<number>;
  readonly isEmpty: Signal<boolean>;
  readonly isFocused: Signal<boolean>;
  readonly textStats: Signal<RteCharLimitState | null>;
  connect(editor: Editor): void;
  disconnect(): void;
  /** Sobe a versão sem transação (troca de `EditorState` por `updateState`). */
  refresh(): void;
}

const STATS_KEYS = [
  'characters',
  'words',
  'limit',
  'remaining',
  'overLimit',
  'rejected',
] as const;

function sameStats(
  a: RteCharLimitState | null,
  b: RteCharLimitState | null,
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return STATS_KEYS.every((key) => Object.is(a[key], b[key]));
}

export function createRteBridge(
  editor: Signal<Editor | null>,
  emptyBeforeCreate: () => boolean,
): RteBridge {
  const version = signal(0);
  const bump = () => version.update((v) => v + 1);
  let connected: Editor | null = null;

  return {
    version: version.asReadonly(),
    isEmpty: computed(() => {
      version();
      const e = editor();
      return e ? isEmptyDoc(e.state.doc) : emptyBeforeCreate();
    }),
    isFocused: computed(() => {
      version();
      return editor()?.isFocused ?? false;
    }),
    // `getCharLimitState` é memorizado por `EditorState` e lê o limite atual
    // (a entrada `maxLength`), por isso também reage ao limite sem transação.
    textStats: computed(
      () => {
        version();
        const e = editor();
        return e ? getCharLimitState(e) : null;
      },
      { equal: sameStats },
    ),
    connect(e) {
      connected = e;
      e.on('transaction', bump);
    },
    disconnect() {
      connected?.off('transaction', bump);
      connected = null;
    },
    refresh: bump,
  };
}

const bridges = new WeakMap<RteEditor, RteBridge>();

/** Liga a ponte ao componente (interno; lida por `rteEditorVersion`). */
export function bindRteBridge(cmp: RteEditor, bridge: RteBridge): void {
  bridges.set(cmp, bridge);
}

/**
 * Versão da ponte (pré-voo 10): sobe 1 por transação. Interna, para as
 * partes seguintes (05b); não é exportada pelo entry `.`.
 */
export function rteEditorVersion(cmp: RteEditor): Signal<number> {
  const bridge = bridges.get(cmp);
  if (!bridge) {
    throw new TypeError('rteEditorVersion: componente sem ponte de signals.');
  }
  return bridge.version;
}
