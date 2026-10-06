import { isDevMode, signal, untracked, type Signal } from '@angular/core';
import type { Editor } from '@tiptap/core';
import { insertArrival } from './arrival';
import type {
  RteUploadAnnouncement,
  RteUploadHost,
  RteUploadSaid as Said,
} from './host';
import { createMarkerElement, setMarkerProgress } from './marker-element';
import {
  RTE_UPLOAD_KEY,
  uploadMetaTransaction,
  type RteUploadMeta,
} from './markers';
import { clampProgress, moved, RteFramePublisher } from './progress';
import { createPreview, revokePreview } from './preview';
import { readUploadedMedia, type RteUploadedAttrs } from './response';
import { uploadReason } from './reason';
import type {
  RteUploadAdapter,
  RteUploadErrorEvent,
  RteUploadErrorReason,
  RteUploadStatus,
  RteUploadText,
  RteUploadType,
} from './types';
import { displayName, validateUploadFile } from './validate';

export type { RteUploadAnnouncement, RteUploadHost } from './host';

const MISSING_ELEMENT =
  '[rte-editor] marcador de envio sem envio correspondente; usando um elemento vazio.';

interface Job {
  readonly id: string;
  readonly file: File;
  readonly type: RteUploadType;
  readonly name: string;
  readonly text: RteUploadText | undefined;
  readonly adapter: RteUploadAdapter;
  readonly abort: AbortController;
  readonly element: HTMLElement;
  /** *Object URL* da miniatura (E16), revogada ao encerrar. */
  readonly preview: string | null;
  state: RteUploadStatus['state'];
  /** Último progresso recebido (`null` = indeterminado). */
  progress: number | null;
  /** Progresso publicado em `uploads` (E23). */
  shown: number | null;
  /** Resposta revalidada, à espera da inserção (E10). */
  attrs: RteUploadedAttrs | null;
  /** O adaptador já respondeu (progresso ignorado daí em diante). */
  settled: boolean;
  /** Encerrado (inserido, falhou, cancelado ou abortado). */
  done: boolean;
}

/** Envios simultâneos por instância (E11). */
const CONCURRENCY = 2;

let instances = 0;

/**
 * Gerenciador de envios (E4, E10, E11, E15–E18, E23; pré-voo 10): fila FIFO
 * com 2 simultâneos, `AbortController` por envio, anúncios e abortos de
 * ciclo de vida. O progresso por quadro fica em `progress.ts`, a inserção em
 * `arrival.ts` e o elemento do marcador em `marker-element.ts`. Vive fora da
 * zona; `uploadError`, `uploads` e o anúncio entram nela.
 */
export class RteUploadManager {
  private readonly prefix = `rte-upload-${++instances}-`;
  private seq = 0;
  private gestures = 0;
  private jobs: Job[] = [];
  private disposed = false;
  private flushQueued = false;
  private readonly frames: RteFramePublisher;
  private readonly list = signal<readonly RteUploadStatus[]>([]);

  /** Envios em curso, na ordem dos gestos (E18). */
  readonly uploads: Signal<readonly RteUploadStatus[]> = this.list.asReadonly();
  /** Último anúncio (E8), do hospedeiro: a falha de carga também anuncia. */
  readonly announcement: Signal<RteUploadAnnouncement | null>;

  constructor(private readonly host: RteUploadHost) {
    this.announcement = host.announcement;
    this.frames = new RteFramePublisher({
      view: host.view,
      zone: host.zone,
      paint: () => this.paint(),
    });
  }

  /**
   * Um gesto (E5, E11): os arquivos de índice `>= maxFilesPerAction` dão
   * `'count'`; os outros passam pela E5; os aceitos ganham marcadores em
   * `at`, na ordem do gesto. Recusas: um `uploadError` por arquivo e um
   * anúncio combinado (E8). Devolve quantos foram aceitos; 0 sem editor, sem
   * adaptador, sem mídia no esquema ou não editável.
   */
  start(files: readonly File[], at: number, text?: RteUploadText): number {
    const editor = untracked(this.host.editor);
    const cfg = untracked(this.host.config);
    if (
      this.disposed ||
      !editor ||
      editor.isDestroyed ||
      !cfg ||
      !untracked(this.host.rules) ||
      !this.host.canInsert()
    ) {
      return 0;
    }
    const doc = editor.view.dom.ownerDocument;
    const gesture = ++this.gestures;
    const added: Job[] = [];
    const refused: RteUploadErrorEvent[] = [];
    const refusedNames: string[] = [];
    files.forEach((file, i) => {
      const check = validateUploadFile(file, cfg);
      const reason =
        i >= cfg.maxFilesPerAction ? 'count' : check.ok ? null : check.reason;
      if (reason) {
        refused.push({ fileName: file.name, type: check.type, reason });
        refusedNames.push(displayName(file));
      } else {
        added.push(
          this.createJob(doc, file, check.type, text, cfg.adapter, cfg.preview),
        );
      }
    });
    if (added.length) {
      // os envios existem antes da transação: o *widget* pede `elementOf`
      this.jobs.push(...added);
      const pos = Math.min(Math.max(at, 0), editor.state.doc.content.size);
      this.dispatch(editor, {
        add: added.map((job, index) => ({
          id: job.id,
          gesture,
          index,
          pos,
          type: job.type,
        })),
      });
    }
    this.host.zone.run(() => {
      for (const e of refused) this.host.emitError(e);
      if (added.length) {
        this.publish();
        this.announce({
          kind: 'start',
          names: added.map((j) => j.name),
          count: added.length,
        });
      }
      if (refused.length) {
        const reasons = refused.map((e) => e.reason);
        this.announce({
          kind: 'error',
          names: refusedNames,
          reasons,
          reason: reasons[0] as RteUploadErrorReason,
        });
      }
    });
    this.pump();
    return added.length;
  }

  /** Cancelar pela pessoa (E8, E15): aborta, tira marcador e item, anuncia. */
  cancel(id: string): boolean {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return false;
    this.drop([job], 'cancelled');
    return true;
  }

  /** Cancela todos pela pessoa: um anúncio com os nomes de todos. */
  cancelAll(): void {
    this.abortAll(true);
  }

  /**
   * Aborta todos (E17): troca de `upload`, carga externa (`announce`) e
   * `destroy` (sem anúncio). Nunca emite `uploadError`.
   */
  abortAll(announce: boolean): void {
    if (this.jobs.length) {
      this.drop([...this.jobs], announce ? 'cancelled' : null);
    }
  }

  /** Tenta as inserções adiadas (diálogo fechado, `compositionend`). */
  flush(): void {
    for (const job of [...this.jobs]) {
      if (!job.done && job.attrs) this.insert(job, job.attrs);
    }
  }

  /**
   * Rede de segurança depois de cada transação: com uma inserção adiada e
   * nada mais a impedir (motor que não dispara `compositionend`), tenta numa
   * microtarefa, fora do despacho em curso.
   */
  afterTransaction(): void {
    if (this.flushQueued || !this.jobs.some((j) => j.attrs && !j.done)) return;
    if (this.host.mustWait()) return;
    this.flushQueued = true;
    queueMicrotask(() => {
      this.flushQueued = false;
      if (!this.disposed) this.flush();
    });
  }

  /** Elemento do marcador `id` (o *plugin* o põe no *widget*). */
  elementOf(id: string): HTMLElement {
    const job = this.jobs.find((j) => j.id === id);
    if (job) return job.element;
    if (isDevMode()) console.warn(MISSING_ELEMENT);
    const doc =
      untracked(this.host.editor)?.view.dom.ownerDocument ??
      this.host.view?.document;
    if (!doc) throw new Error(MISSING_ELEMENT);
    return createMarkerElement(doc, 'image');
  }

  /** Destruição do editor: aborta sem anunciar e para o laço por quadro. */
  dispose(): void {
    this.abortAll(false);
    this.disposed = true;
    this.frames.cancel();
  }

  private createJob(
    doc: Document,
    file: File,
    type: RteUploadType,
    text: RteUploadText | undefined,
    adapter: RteUploadAdapter,
    wantsPreview: boolean,
  ): Job {
    const name = displayName(file);
    const preview =
      wantsPreview && type === 'image'
        ? createPreview(this.host.view, file)
        : null;
    return {
      id: `${this.prefix}${++this.seq}`,
      file,
      type,
      name,
      text,
      adapter,
      abort: new AbortController(),
      element: createMarkerElement(doc, type, name, preview),
      preview,
      state: 'queued',
      progress: null,
      shown: null,
      attrs: null,
      settled: false,
      done: false,
    };
  }

  /** Começa os da fila até 2 simultâneos (E11). */
  private pump(): void {
    if (this.disposed) return;
    let active = this.jobs.filter((j) => j.state === 'uploading').length;
    let changed = false;
    for (const job of this.jobs) {
      if (active >= CONCURRENCY) break;
      if (job.state !== 'queued') continue;
      active += 1;
      changed = true;
      this.begin(job);
    }
    if (changed) this.host.zone.run(() => this.publish());
  }

  /**
   * Chama o adaptador uma vez, fora da zona (E4, E23), com as reações também
   * ligadas fora dela: o lançamento síncrono vira rejeição e um valor que não
   * é *promise* vale como resposta.
   */
  private begin(job: Job): void {
    job.state = 'uploading';
    job.element.classList.remove('rte-upload-marker--queued');
    const ctx = {
      signal: job.abort.signal,
      onProgress: (fraction: number | null) => this.progress(job, fraction),
    };
    const upload =
      job.type === 'video' ? job.adapter.uploadVideo : job.adapter.uploadImage;
    this.host.zone.runOutsideAngular(() => {
      new Promise<unknown>((resolve) =>
        resolve(upload?.call(job.adapter, job.file, ctx)),
      ).then(
        (value) => this.arrive(job, value),
        (error: unknown) => {
          job.settled = true;
          if (!job.done) this.fail(job, uploadReason(error), error);
        },
      );
    });
  }

  private progress(job: Job, fraction: unknown): void {
    if (job.done || job.settled) return;
    job.progress = clampProgress(fraction);
    if (!this.disposed && moved(job.shown, job.progress)) {
      this.frames.request();
    }
  }

  /** Publica o progresso que mudou ≥ 0,01 (ou entre `null` e número). */
  private paint(): void {
    let changed = false;
    for (const job of this.jobs) {
      if (job.state !== 'uploading' || !moved(job.shown, job.progress)) {
        continue;
      }
      job.shown = job.progress;
      setMarkerProgress(job.element, job.shown);
      changed = true;
    }
    if (changed) this.host.zone.run(() => this.publish());
  }

  /** Resposta do adaptador: revalida (E6) e tenta inserir (E9, E10). */
  private arrive(job: Job, value: unknown): void {
    job.settled = true;
    if (job.done) return;
    const rules = untracked(this.host.rules);
    const read = rules ? readUploadedMedia(job.type, value, rules) : null;
    if (!read?.ok) {
      this.fail(job, 'response', undefined);
      return;
    }
    job.attrs = read.attrs;
    job.state = 'inserting';
    this.host.zone.run(() => this.publish());
    this.insert(job, read.attrs);
  }

  private insert(job: Job, attrs: RteUploadedAttrs): void {
    const outcome = insertArrival(this.host, {
      id: job.id,
      type: job.type,
      attrs,
      text: job.text,
    });
    if (outcome.kind === 'wait') return;
    if (outcome.kind === 'failed') {
      this.fail(job, outcome.reason, outcome.cause);
      return;
    }
    this.finish([job], { kind: 'done', names: [job.name] });
  }

  private fail(job: Job, reason: RteUploadErrorReason, cause: unknown): void {
    const event: RteUploadErrorEvent =
      cause === undefined
        ? { fileName: job.file.name, type: job.type, reason }
        : { fileName: job.file.name, type: job.type, reason, cause };
    this.removeMarkers([job]);
    this.finish([job], { kind: 'error', names: [job.name], reason }, event);
  }

  /** Cancelamento ou aborto: `AbortController.abort()` real e marcadores fora. */
  private drop(jobs: readonly Job[], kind: 'cancelled' | null): void {
    for (const job of jobs) {
      job.done = true;
      job.abort.abort();
    }
    this.removeMarkers(jobs);
    this.finish(jobs, kind ? { kind, names: jobs.map((j) => j.name) } : null);
  }

  /** Tira os envios da lista, publica, anuncia, emite e anda a fila. */
  private finish(
    jobs: readonly Job[],
    said: Said | null,
    error?: RteUploadErrorEvent,
  ): void {
    const gone = new Set(jobs);
    for (const job of jobs) {
      job.done = true;
      if (job.preview !== null) revokePreview(this.host.view, job.preview);
    }
    this.jobs = this.jobs.filter((j) => !gone.has(j));
    this.host.zone.run(() => {
      this.publish();
      if (said) this.announce(said);
      if (error) this.host.emitError(error);
    });
    this.pump();
    // sem envio ativo, nenhum quadro pendente (E23)
    if (!this.jobs.some((j) => j.state === 'uploading')) this.frames.cancel();
  }

  private removeMarkers(jobs: readonly Job[]): void {
    const editor = untracked(this.host.editor);
    if (!editor || editor.isDestroyed) return;
    const live = new Set(
      RTE_UPLOAD_KEY.getState(editor.state)?.markers.map((m) => m.id) ?? [],
    );
    const remove = jobs.map((j) => j.id).filter((id) => live.has(id));
    if (remove.length) this.dispatch(editor, { remove });
  }

  /** Transação só de *meta* (E7), fora da zona. */
  private dispatch(editor: Editor, meta: RteUploadMeta): void {
    this.host.zone.runOutsideAngular(() =>
      editor.view.dispatch(uploadMetaTransaction(editor.state, meta)),
    );
  }

  private publish(): void {
    this.list.set(
      this.jobs.map((j) => ({
        id: j.id,
        fileName: j.name,
        type: j.type,
        state: j.state,
        progress: j.state === 'queued' ? null : j.shown,
      })),
    );
  }

  private announce(a: Said): void {
    this.host.announce(a);
  }
}
