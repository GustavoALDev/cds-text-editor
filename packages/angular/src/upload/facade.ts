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
import type { RteUploadAnnouncement, RteUploadHost } from './host';
import type { RteUploadRuntime } from './rte-upload';
import type {
  RteUploadErrorEvent,
  RteUploadErrorReason,
  RteUploadStatus,
  RteUploadText,
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

/** Gesto feito antes de o *chunk* chegar, reposto na ordem. */
interface Pending {
  readonly files: readonly File[];
  at: number;
  readonly text: RteUploadText | undefined;
}

/**
 * Fachada dos envios no *chunk* principal (Ruling 28, ADR 0013): só com
 * configuração não nula, e no navegador (o editor só existe lá), carrega o
 * *chunk* `rte-upload` em ocioso (ou já no primeiro gesto). Até ele chegar,
 * os gestos esperam na ordem, com a posição mapeada pelas transações, e
 * `uploadFiles` devolve a contagem da E5; se a carga falha, cada arquivo
 * aceito vira `uploadError` `'unavailable'` (os recusados, o motivo da E5),
 * com um anúncio por lote. Configuração `null` desmonta o gerenciador e os
 * *plugins*; o módulo carregado fica guardado.
 */
export class RteUploads {
  private readonly runtime = signal<RteUploadRuntime | null>(null);
  private loaded: Promise<RteUploadModule | null> | null = null;
  private failed = false;
  private warned = false;
  private disposed = false;
  private cancelIdle: (() => void) | null = null;
  private pending: Pending[] = [];

  /** Envios em curso (E18); vazio até o *chunk* chegar. */
  readonly uploads: Signal<readonly RteUploadStatus[]> = computed(
    () => this.runtime()?.manager.uploads() ?? NO_UPLOADS,
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

  /** Um gesto (E5, E11); devolve quantos a E5 aceita. */
  start(files: readonly File[], at: number, text?: RteUploadText): number {
    const editor = untracked(this.host.editor);
    if (this.disposed || !editor || editor.isDestroyed) return 0;
    const runtime = untracked(this.runtime);
    if (runtime) return runtime.manager.start(files, at, text);
    const cfg = untracked(this.host.config);
    if (!cfg || !untracked(this.host.rules) || !this.host.canInsert()) return 0;
    const accepted = files.filter(
      (file, i) =>
        i < cfg.maxFilesPerAction && validateUploadFile(file, cfg).ok,
    ).length;
    this.pending.push({ files: [...files], at, text });
    if (this.failed) this.fail();
    else void this.load();
    return accepted;
  }

  cancel(id: string): boolean {
    return untracked(this.runtime)?.manager.cancel(id) ?? false;
  }

  /** Cancela os envios e descarta os gestos em espera (fora da bandeja). */
  cancelAll(): void {
    this.pending = [];
    untracked(this.runtime)?.manager.cancelAll();
  }

  /** E17: aborta os envios e descarta os gestos em espera. */
  abortAll(announce: boolean): void {
    this.pending = [];
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
    this.pending = [];
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
    for (const p of pending) runtime.manager.start(p.files, p.at, p.text);
  }

  /** Carga falhou: recusa os gestos em espera, um anúncio por lote. */
  private fail(): void {
    this.failed = true;
    const pending = this.pending;
    this.pending = [];
    const cfg = untracked(this.host.config);
    if (!cfg || !pending.some((p) => p.files.length > 0)) return;
    if (isDevMode() && !this.warned) {
      this.warned = true;
      console.warn(LOAD_FAILED);
    }
    const events: RteUploadErrorEvent[] = [];
    const names: string[] = [];
    for (const p of pending) {
      p.files.forEach((file, i) => {
        const check = validateUploadFile(file, cfg);
        const reason: RteUploadErrorReason =
          i >= cfg.maxFilesPerAction
            ? 'count'
            : check.ok
              ? 'unavailable'
              : check.reason;
        events.push({ fileName: file.name, type: check.type, reason });
        names.push(displayName(file));
      });
    }
    this.host.zone.run(() => {
      for (const e of events) this.host.emitError(e);
      const reasons = events.map((e) => e.reason);
      this.host.announce({
        kind: 'error',
        names,
        reasons,
        reason: reasons[0] as RteUploadErrorReason,
      });
    });
  }

  private teardown(): void {
    const runtime = untracked(this.runtime);
    if (!runtime) return;
    this.runtime.set(null);
    runtime.dispose();
  }
}
