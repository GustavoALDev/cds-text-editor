import {
  computed,
  DOCUMENT,
  inject,
  untracked,
  type NgZone,
  type Signal,
} from '@angular/core';
import type { RteHtmlSchema } from '@cds/rte-core';
import type { Editor } from '@tiptap/core';
import { resolveUploadConfig, type RteResolvedUpload } from './config';
import { readUploadRules, type RteUploadRules } from './response';
import type { RteUploadConfig, RteUploadErrorEvent } from './types';

/** O que o gerenciador precisa do `RteEditor` (pré-voo 10). */
export interface RteUploadHost {
  readonly editor: Signal<Editor | null>;
  readonly config: Signal<RteResolvedUpload | null>;
  readonly rules: Signal<RteUploadRules | null>;
  /** Editável e não oculto. */
  canInsert(): boolean;
  /** Diálogo próprio aberto ou composição de IME (E10). */
  mustWait(): boolean;
  readonly zone: NgZone;
  readonly view: Window | null;
  emitError(e: RteUploadErrorEvent): void;
}

/**
 * Hospedeiro do gerenciador no `RteEditor` (contexto de injeção): a
 * configuração resolvida uma vez por objeto de entrada (entrada > provider,
 * `null` desliga; E3), as regras da resposta pelo esquema (E6) e os estados
 * que adiam ou recusam a inserção (E10).
 */
export function createEditorUploadHost(o: {
  readonly editor: Signal<Editor | null>;
  readonly upload: Signal<RteUploadConfig | null | undefined>;
  readonly provided: RteUploadConfig | undefined;
  readonly schema: Signal<RteHtmlSchema>;
  readonly interactive: Signal<boolean>;
  readonly hidden: Signal<boolean>;
  /** Pedido de diálogo em curso; `null` sem diálogo. */
  readonly dialog: Signal<unknown>;
  readonly zone: NgZone;
  emitError(e: RteUploadErrorEvent): void;
}): RteUploadHost {
  return {
    editor: o.editor,
    config: computed(() => {
      const own = o.upload();
      return resolveUploadConfig(own === undefined ? o.provided : own);
    }),
    rules: computed(() => readUploadRules(o.schema())),
    canInsert: () => untracked(o.interactive) && !untracked(o.hidden),
    mustWait: () =>
      untracked(o.dialog) !== null || !!untracked(o.editor)?.view.composing,
    zone: o.zone,
    view: inject(DOCUMENT).defaultView,
    emitError: (e) => o.emitError(e),
  };
}
