import {
  computed,
  effect,
  signal,
  untracked,
  type NgZone,
  type Signal,
} from '@angular/core';
import type { RteHtmlSchema } from '@cds/rte-core';
import type { Editor } from '@tiptap/core';
import type { RteUploadLabels } from '../labels/types';
import { announcementTexts } from './announce';
import { createDialogUploads, type RteDialogUploads } from './dialog-port';
import { RteUploads } from './facade';
import { createEditorUploadHost } from './host';
import { createUploadInputExtension } from './input';
import type { RteUploadConfig, RteUploadErrorEvent } from './types';

/** O que a ligação lê do `RteEditor`. */
export interface RteEditorUploadDeps {
  readonly editor: Signal<Editor | null>;
  readonly upload: Signal<RteUploadConfig | null | undefined>;
  readonly provided: RteUploadConfig | undefined;
  readonly schema: Signal<RteHtmlSchema>;
  readonly interactive: Signal<boolean>;
  readonly hidden: Signal<boolean>;
  /** Pedido de diálogo em curso; `null` sem diálogo. */
  readonly dialog: Signal<unknown>;
  readonly zone: NgZone;
  readonly labels: () => RteUploadLabels;
  emitError(e: RteUploadErrorEvent): void;
}

/**
 * Envios do `RteEditor` (E3, E4, E10, E11, E17, E23; Ruling 31), num
 * contexto de injeção: a fachada (`RteUploads`: `uploads`, `cancel`,
 * `cancelAll`, `abortAll`, `afterTransaction`, `dispose`) fica no principal
 * e a maquinaria no *chunk* `rte-upload`, carregado só com configuração
 * (Ruling 28). Acrescenta o que o `RteEditor` publica e o efeito da E10 (o
 * diálogo fechado libera as inserções adiadas; a troca de configuração,
 * E17, fica na fachada).
 */
export class RteEditorUploads extends RteUploads {
  /** Textos da região `aria-live` (E8): um nó por anúncio do turno. */
  readonly announcements: Signal<
    readonly { readonly n: number; readonly text: string }[]
  >;
  private readonly missingAlt = signal(0);
  /** Imagens com `alt: null` (E18), fora do portão do delta de URLs. */
  readonly imagesMissingAlt: Signal<number> = this.missingAlt.asReadonly();
  /** Porta dos diálogos de imagem e vídeo (E14); `null` sem adaptador. */
  readonly dialogUploads: Signal<RteDialogUploads | null>;
  private readonly deps: RteEditorUploadDeps;

  constructor(deps: RteEditorUploadDeps) {
    const host = createEditorUploadHost(deps);
    super(host);
    this.deps = deps;
    this.announcements = announcementTexts(host, deps.labels);
    this.dialogUploads = computed(() => {
      const cfg = host.config();
      return cfg ? createDialogUploads(this, cfg) : null;
    });
    effect(() => {
      if (!deps.dialog()) untracked(() => this.flush());
    });
  }

  /** Colar e soltar arquivos (E12, E13): no principal, Ruling 29. */
  inputExtension() {
    return createUploadInputExtension(this);
  }

  /** Envia na posição da seleção (E18); devolve os aceitos (E5). */
  uploadFiles(files: Iterable<File>): number {
    const editor = untracked(this.deps.editor);
    if (!editor || editor.isDestroyed) return 0;
    return this.start([...files], editor.state.selection.to);
  }

  /**
   * Contagem de imagens sem `alt` (E18); `zoned` na transação, que roda
   * fora da zona (grava só com mudança).
   */
  setMissingAlt(count: number, zoned = false): void {
    if (!zoned) this.missingAlt.set(count);
    else if (count !== untracked(this.missingAlt)) {
      this.deps.zone.run(() => this.missingAlt.set(count));
    }
  }
}
