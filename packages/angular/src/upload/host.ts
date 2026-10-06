import {
  computed,
  DOCUMENT,
  inject,
  signal,
  untracked,
  type NgZone,
  type Signal,
} from '@angular/core';
import type { RteHtmlSchema } from '@cds/rte-core';
import type { Editor } from '@tiptap/core';
import { resolveUploadConfig, type RteResolvedUpload } from './config';
import { readUploadRules, type RteUploadRules } from './rules';
import type {
  RteUploadConfig,
  RteUploadErrorEvent,
  RteUploadErrorReason,
} from './types';

/** Anúncio para a região `aria-live` (E8); `n` muda a cada anúncio. */
export interface RteUploadAnnouncement {
  readonly n: number;
  readonly kind: 'start' | 'done' | 'cancelled' | 'error';
  readonly names: readonly string[];
  readonly count?: number;
  /** Motivo do erro (o do primeiro nome, no anúncio combinado). */
  readonly reason?: RteUploadErrorReason;
  /** Recusas do gesto: o motivo de cada nome, na mesma ordem. */
  readonly reasons?: readonly RteUploadErrorReason[];
}

/** Anúncio sem o contador (quem anuncia não o conhece). */
export type RteUploadSaid = Omit<RteUploadAnnouncement, 'n'>;

/**
 * O que o gerenciador precisa do `RteEditor` (pré-voo 10). Fica no *chunk*
 * principal: é o contrato entre a fachada (`facade.ts`) e o *chunk*
 * `rte-upload` (Ruling 28).
 */
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
  /** Último anúncio (E8), do gerenciador ou da falha de carga. */
  readonly announcement: Signal<RteUploadAnnouncement | null>;
  /**
   * Anúncios do turno atual, na ordem (E8): os do mesmo turno acumulam
   * (início e recusa de um gesto); o primeiro de um turno novo substitui.
   */
  readonly announcements: Signal<readonly RteUploadAnnouncement[]>;
  announce(a: RteUploadSaid): void;
}

/**
 * Hospedeiro do gerenciador no `RteEditor` (contexto de injeção): a
 * configuração resolvida uma vez por objeto de entrada (entrada > provider,
 * `null` desliga; E3), as regras da resposta pelo esquema (E6), os estados
 * que adiam ou recusam a inserção (E10) e o anúncio (E8).
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
  const said = signal<readonly RteUploadAnnouncement[]>([]);
  let n = 0;
  let turn = false;
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
    announcement: computed(() => said().at(-1) ?? null),
    announcements: said.asReadonly(),
    announce: (a) => {
      const next: RteUploadAnnouncement = { n: ++n, ...a };
      if (turn) {
        said.update((list) => [...list, next]);
        return;
      }
      turn = true;
      queueMicrotask(() => (turn = false));
      said.set([next]);
    },
  };
}
