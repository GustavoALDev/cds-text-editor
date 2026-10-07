import {
  computed,
  effect,
  inject,
  InjectionToken,
  isDevMode,
  signal,
  untracked,
  type Signal,
} from '@angular/core';
import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import type { RteResolvedUpload } from './config';
import type { RteUploadAnnouncement, RteUploadHost } from './host';
import type { RteUploadInput } from './input';
import type { RteUploadRuntime } from './rte-upload';
import type {
  RteUploadErrorReason,
  RteUploadStatus,
  RteUploadText,
  RteUploadType,
} from './types';
import { displayName, validateUploadFile } from './validate';

/** O que o *chunk* `rte-upload` oferece (só o tipo fica no principal). */
export interface RteUploadModule {
  createUploadRuntime(host: RteUploadHost, editor: Editor): RteUploadRuntime;
}

export type RteUploadLoader = () => Promise<RteUploadModule>;

/**
 * Carregador do *chunk* `rte-upload` (Ruling 28): o `import()` que o
 * ng-packagr separa em `fesm2022/cds-rte-angular-rte-upload-<hash>.mjs`.
 * Interno; os testes o trocam para atrasar ou falhar a carga.
 */
export const RTE_UPLOAD_LOADER = new InjectionToken<RteUploadLoader>(
  'RTE_UPLOAD_LOADER',
  { providedIn: 'root', factory: () => () => import('./rte-upload') },
);

const LOAD_FAILED =
  '[rte-editor] não foi possível carregar o envio de arquivos; os arquivos foram recusados.';

/** Prazo do ocioso antes de carregar mesmo assim (ms). */
const IDLE_TIMEOUT = 2000;

const NO_UPLOADS: readonly RteUploadStatus[] = Object.freeze([]);

/** Recusa de um arquivo (E5 ou `'unavailable'`). */
interface Refusal {
  readonly file: File;
  readonly type: RteUploadType;
  readonly reason: RteUploadErrorReason;
}

/** Gesto feito antes de o *chunk* chegar (só os aceitos), reposto na ordem. */
interface Pending {
  readonly files: readonly File[];
  at: number;
  readonly text: RteUploadText | undefined;
}

/**
 * Fachada dos envios no *chunk* principal (Ruling 28, ADR 0013): só com
 * configuração não nula, e no navegador (o editor só existe lá), carrega o
 * *chunk* `rte-upload` em ocioso (ou já no primeiro gesto). Até ele chegar,
 * as recusas da E5 saem na hora (Ruling 29) e os aceitos esperam na ordem,
 * com a posição mapeada pelas transações; `uploadFiles` devolve a contagem
 * da E5; se a carga falha, cada aceito vira `uploadError` `'unavailable'`,
 * com um anúncio por lote. Configuração `null` desmonta o gerenciador e os
 * *plugins*; o módulo carregado fica guardado.
 */
export class RteUploads implements RteUploadInput {
  private readonly runtime = signal<RteUploadRuntime | null>(null);
  private loaded: Promise<RteUploadModule | null> | null = null;
  private failed = false;
  private warned = false;
  private disposed = false;
  private cancelIdle: (() => void) | null = null;
  private pending: Pending[] = [];
  /** Arquivos aceitos em espera do *chunk* (Ruling 33). */
  private readonly waiting = signal(0);

  /** Envios em curso (E18); vazio até o *chunk* chegar. */
  readonly uploads: Signal<readonly RteUploadStatus[]> = computed(
    () => this.runtime()?.manager.uploads() ?? NO_UPLOADS,
  );
  /**
   * Envios ainda não terminados (E18): os da fila mais os aceitos que
   * esperam o *chunk* (Ruling 33: o formulário não pode passar antes).
   */
  readonly pendingUploads: Signal<number> = computed(
    () => this.uploads().length + this.waiting(),
  );
  /** Último anúncio (E8). */
  readonly announcement: Signal<RteUploadAnnouncement | null>;

  constructor(
    private readonly host: RteUploadHost,
    private readonly loader: RteUploadLoader = inject(RTE_UPLOAD_LOADER),
  ) {
    this.announcement = host.announcement;
    // E17: outra configuração aborta os envios e os gestos em espera; `null`
    // desmonta o gerenciador e tira os *plugins*.
    effect(() => {
      const cfg = this.host.config();
      untracked(() => {
        this.abortAll(true);
        if (!cfg) this.teardown();
      });
    });
    // Carga em ocioso: configuração não nula e editor criado (nunca no SSR).
    effect(() => {
      if (this.host.config() && this.host.editor()) {
        untracked(() => this.schedule());
      }
    });
  }

  /** O envio montado (gerenciador e *plugins*), ou `null`. */
  current(): RteUploadRuntime | null {
    return untracked(this.runtime);
  }

  /**
   * Carrega o *chunk* (uma vez por instância) e monta o envio se ainda há
   * configuração e editor; resolve depois de montar ou de recusar os gestos
   * em espera (falha).
   */
  load(): Promise<void> {
    this.cancelIdle?.();
    this.cancelIdle = null;
    return this.host.zone.runOutsideAngular(() => {
      this.loaded ??= this.loader().then(
        (m) => m,
        () => null,
      );
      return this.loaded.then((m) => (m ? this.attach(m) : this.fail()));
    });
  }

  /** Há envio possível: configuração, mídia no esquema, editável e visível. */
  accepts(): boolean {
    const editor = untracked(this.host.editor);
    return (
      !this.disposed &&
      !!editor &&
      !editor.isDestroyed &&
      !!untracked(this.host.config) &&
      !!untracked(this.host.rules) &&
      this.host.canInsert()
    );
  }

  /** Um gesto (E5, E11); devolve quantos a E5 aceita. */
  start(files: readonly File[], at: number, text?: RteUploadText): number {
    if (!this.accepts()) return 0;
    const runtime = untracked(this.runtime);
    if (runtime) return runtime.manager.start(files, at, text);
    const cfg = untracked(this.host.config) as RteResolvedUpload;
    const accepted: File[] = [];
    const refused: Refusal[] = [];
    files.forEach((file, i) => {
      const check = validateUploadFile(file, cfg);
      if (i >= cfg.maxFilesPerAction) {
        refused.push({ file, type: check.type, reason: 'count' });
      } else if (!check.ok) {
        refused.push({ file, type: check.type, reason: check.reason });
      } else if (this.failed) {
        accepted.push(file);
        refused.push({ file, type: check.type, reason: 'unavailable' });
      } else {
        accepted.push(file);
      }
    });
    this.refuse(refused);
    if (accepted.length && !this.failed) {
      this.pending.push({ files: accepted, at, text });
      this.syncWaiting();
      void this.load();
    }
    return accepted.length;
  }

  cancel(id: string): boolean {
    return untracked(this.runtime)?.manager.cancel(id) ?? false;
  }

  /** Cancela os envios e descarta os gestos em espera (fora da bandeja). */
  cancelAll(): void {
    this.dropPending();
    untracked(this.runtime)?.manager.cancelAll();
  }

  /** E17: aborta os envios e descarta os gestos em espera. */
  abortAll(announce: boolean): void {
    this.dropPending();
    untracked(this.runtime)?.manager.abortAll(announce);
  }

  flush(): void {
    untracked(this.runtime)?.manager.flush();
  }

  /** Depois de cada transação: mapeia os gestos em espera; rede da E10. */
  afterTransaction(transactions: readonly Transaction[]): void {
    for (const p of this.pending) {
      for (const tr of transactions) p.at = tr.mapping.map(p.at, -1);
    }
    untracked(this.runtime)?.manager.afterTransaction();
  }

  /** Destruição do editor. */
  dispose(): void {
    this.disposed = true;
    this.cancelIdle?.();
    this.cancelIdle = null;
    this.dropPending();
    this.teardown();
  }

  private schedule(): void {
    const view = this.host.view;
    if (this.disposed || this.cancelIdle || untracked(this.runtime) || !view) {
      return;
    }
    this.host.zone.runOutsideAngular(() => {
      const run = () => {
        this.cancelIdle = null;
        void this.load();
      };
      if (typeof view.requestIdleCallback === 'function') {
        const id = view.requestIdleCallback(run, { timeout: IDLE_TIMEOUT });
        this.cancelIdle = () => view.cancelIdleCallback(id);
      } else {
        const id = view.setTimeout(run, 1);
        this.cancelIdle = () => view.clearTimeout(id);
      }
    });
  }

  private attach(m: RteUploadModule): void {
    const editor = untracked(this.host.editor);
    if (
      this.disposed ||
      untracked(this.runtime) ||
      !editor ||
      editor.isDestroyed ||
      !untracked(this.host.config)
    ) {
      return;
    }
    const runtime = m.createUploadRuntime(this.host, editor);
    this.host.zone.run(() => this.runtime.set(runtime));
    const pending = this.pending;
    this.pending = [];
    const cfg = untracked(this.host.config);
    if (cfg && (!this.host.canInsert() || !untracked(this.host.rules))) {
      // Ficou somente leitura (ou sem mídia no esquema) durante a carga.
      this.refuse(
        pending.flatMap((p) =>
          p.files.map((file) => ({
            file,
            type: validateUploadFile(file, cfg).type,
            reason: 'unavailable' as const,
          })),
        ),
      );
    } else {
      for (const p of pending) runtime.manager.start(p.files, p.at, p.text);
    }
    this.syncWaiting();
  }

  /** Carga falhou: os aceitos em espera viram `'unavailable'`. */
  private fail(): void {
    this.failed = true;
    const pending = this.pending;
    this.dropPending();
    const cfg = untracked(this.host.config);
    if (!cfg) return;
    this.refuse(
      pending.flatMap((p) =>
        p.files.map((file) => ({
          file,
          type: validateUploadFile(file, cfg).type,
          reason: 'unavailable' as const,
        })),
      ),
    );
  }

  /** Um `uploadError` por arquivo e um anúncio combinado (E8, E15). */
  private refuse(list: readonly Refusal[]): void {
    if (!list.length) return;
    if (
      isDevMode() &&
      !this.warned &&
      list.some((r) => r.reason === 'unavailable')
    ) {
      this.warned = true;
      console.warn(LOAD_FAILED);
    }
    this.host.zone.run(() => {
      for (const r of list) {
        this.host.emitError({
          fileName: r.file.name,
          type: r.type,
          reason: r.reason,
        });
      }
      const reasons = list.map((r) => r.reason);
      this.host.announce({
        kind: 'error',
        names: list.map((r) => displayName(r.file)),
        reasons,
        reason: reasons[0] as RteUploadErrorReason,
      });
    });
  }

  private dropPending(): void {
    this.pending = [];
    this.syncWaiting();
  }

  /** Publica a contagem em espera (só com mudança, na zona). */
  private syncWaiting(): void {
    const count = this.pending.reduce((n, p) => n + p.files.length, 0);
    if (count !== untracked(this.waiting)) {
      this.host.zone.run(() => this.waiting.set(count));
    }
  }

  private teardown(): void {
    const runtime = untracked(this.runtime);
    if (!runtime) return;
    this.runtime.set(null);
    runtime.dispose();
  }
}
