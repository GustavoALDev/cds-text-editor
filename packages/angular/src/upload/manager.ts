import { signal, untracked, type NgZone, type Signal } from '@angular/core';
import type { RteImageAttrs, RteVideoAttrs } from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import type { RteResolvedUpload } from './config';
import {
  insertUploaded,
  selectOnArrival,
  type RteUploadArrival,
} from './insert';
import {
  RTE_UPLOAD_KEY,
  uploadMetaTransaction,
  type RteUploadMeta,
} from './markers';
import {
  readUploadedMedia,
  type RteUploadedAttrs,
  type RteUploadRules,
} from './response';
import {
  uploadReason,
  type RteUploadAdapter,
  type RteUploadErrorEvent,
  type RteUploadErrorReason,
  type RteUploadStatus,
  type RteUploadText,
  type RteUploadType,
} from './types';
import { displayName, validateUploadFile } from './validate';

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

/** Anúncio para a região `aria-live` (E8); `n` muda a cada anúncio. */
export interface RteUploadAnnouncement {
  readonly n: number;
  readonly kind: 'start' | 'done' | 'cancelled' | 'error';
  readonly names: readonly string[];
  readonly count?: number;
  readonly reason?: RteUploadErrorReason;
}

type JobState = RteUploadStatus['state'];

interface Job {
  readonly id: string;
  readonly file: File;
  readonly type: RteUploadType;
  readonly name: string;
  readonly text: RteUploadText | undefined;
  readonly adapter: RteUploadAdapter;
  readonly abort: AbortController;
  readonly element: HTMLElement;
  state: JobState;
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
/** Mudança mínima de progresso publicada (E23). */
const STEP = 0.01;

let instances = 0;

/** `NaN`/não número → `null`; senão preso a `[0, 1]` (Review Focus 2). */
function clampProgress(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Math.min(1, Math.max(0, value));
}

function moved(shown: number | null, next: number | null): boolean {
  if (shown === null || next === null) return shown !== next;
  return Math.abs(next - shown) >= STEP;
}

/**
 * Chegada (E9): resposta + textos do diálogo; colado, solto ou por
 * `uploadFiles`, a imagem entra com `alt: null` (E19). No vídeo, o pôster do
 * diálogo vence o da resposta.
 */
function arrival(
  id: string,
  type: RteUploadType,
  r: RteUploadedAttrs,
  text: RteUploadText | undefined,
  select: boolean,
): RteUploadArrival {
  if (type === 'image') {
    const attrs: RteImageAttrs = { ...r, alt: text?.alt ?? null };
    if (text) attrs.caption = text.caption;
    if (text?.credit !== undefined) attrs.credit = text.credit;
    return { id, type, attrs, select };
  }
  const { poster: served, ...rest } = r;
  const attrs: RteVideoAttrs = { ...rest };
  const poster = text?.poster ?? served;
  if (poster !== undefined) attrs.poster = poster;
  if (text) attrs.caption = text.caption;
  if (text?.tracks) attrs.tracks = text.tracks;
  return { id, type, attrs, select };
}

/**
 * Gerenciador de envios (E4, E10, E11, E15–E18, E23; pré-voo 10): fila FIFO
 * com 2 simultâneos, `AbortController` por envio, progresso publicado no
 * máximo uma vez por quadro, inserção adiada com diálogo aberto ou
 * composição, e abortos de ciclo de vida. Vive fora da zona; `uploadError`,
 * `uploads` e o anúncio entram nela.
 */
export class RteUploadManager {
  private readonly prefix = `rte-upload-${++instances}-`;
  private seq = 0;
  private gestures = 0;
  private announced = 0;
  private jobs: Job[] = [];
  private frame: number | null = null;
  private disposed = false;
  private readonly list = signal<readonly RteUploadStatus[]>([]);
  private readonly said = signal<RteUploadAnnouncement | null>(null);

  /** Envios em curso, na ordem dos gestos (E18). */
  readonly uploads: Signal<readonly RteUploadStatus[]> = this.list.asReadonly();
  /** Último anúncio (E8); a bandeja o lê. */
  readonly announcement: Signal<RteUploadAnnouncement | null> =
    this.said.asReadonly();

  constructor(private readonly host: RteUploadHost) {}

  /**
   * Um gesto (E5, E11): os arquivos de índice `>= maxFilesPerAction` dão
   * `'count'`; os outros passam pela E5; os aceitos ganham marcadores em
   * `at`, na ordem do gesto. Devolve quantos foram aceitos; 0 sem editor,
   * sem adaptador, sem mídia no esquema ou não editável.
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
    const gesture = ++this.gestures;
    const added: Job[] = [];
    const refused: RteUploadErrorEvent[] = [];
    files.forEach((file, i) => {
      const check = validateUploadFile(file, cfg);
      const reason =
        i >= cfg.maxFilesPerAction ? 'count' : check.ok ? null : check.reason;
      if (reason) {
        refused.push({ fileName: file.name, type: check.type, reason });
      } else {
        added.push(this.createJob(file, check.type, text, cfg.adapter));
      }
    });
    if (added.length) {
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
      this.jobs.push(...added);
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
    if (this.jobs.length)
      this.drop([...this.jobs], announce ? 'cancelled' : null);
  }

  /** Tenta as inserções adiadas (diálogo fechado, `compositionend`). */
  flush(): void {
    for (const job of [...this.jobs]) {
      if (!job.done && job.attrs) this.insert(job);
    }
  }

  /** Elemento do marcador `id` (o *plugin* o põe no *widget*). */
  elementOf(id: string): HTMLElement {
    return (
      this.jobs.find((j) => j.id === id)?.element ?? this.createElement('image')
    );
  }

  /** Destruição do editor: aborta sem anunciar e para o laço por quadro. */
  dispose(): void {
    this.abortAll(false);
    this.disposed = true;
    if (this.frame !== null) this.host.view?.cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private createJob(
    file: File,
    type: RteUploadType,
    text: RteUploadText | undefined,
    adapter: RteUploadAdapter,
  ): Job {
    return {
      id: `${this.prefix}${++this.seq}`,
      file,
      type,
      name: displayName(file),
      text,
      adapter,
      abort: new AbortController(),
      element: this.createElement(type),
      state: 'queued',
      progress: null,
      shown: null,
      attrs: null,
      settled: false,
      done: false,
    };
  }

  /** Elemento mínimo do marcador; a Tarefa 8 completa o DOM (E7). */
  private createElement(type: RteUploadType): HTMLElement {
    const doc =
      untracked(this.host.editor)?.view.dom.ownerDocument ??
      (this.host.view?.document as Document);
    const el = doc.createElement('span');
    el.className = `rte-upload-marker rte-upload-marker--${type} rte-upload-marker--queued`;
    el.setAttribute('contenteditable', 'false');
    el.setAttribute('aria-hidden', 'true');
    return el;
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
   * Chama o adaptador uma vez, fora da zona (E4, E23): o lançamento síncrono
   * vira rejeição e um valor que não é *promise* vale como resposta.
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
    this.host.zone
      .runOutsideAngular(
        () =>
          new Promise<unknown>((resolve) =>
            resolve(upload?.call(job.adapter, job.file, ctx)),
          ),
      )
      .then(
        (value) => this.arrive(job, value),
        (error: unknown) => {
          job.settled = true;
          if (!job.done) this.fail(job, uploadReason(error), error);
        },
      );
  }

  private progress(job: Job, fraction: unknown): void {
    if (job.done || job.settled) return;
    job.progress = clampProgress(fraction);
    if (moved(job.shown, job.progress)) this.schedule();
  }

  /** Um quadro por vez, só com envio ativo (E23). */
  private schedule(): void {
    const view = this.host.view;
    if (this.frame !== null || this.disposed) return;
    if (!view?.requestAnimationFrame) {
      this.paint();
      return;
    }
    this.frame = this.host.zone.runOutsideAngular(() =>
      view.requestAnimationFrame(() => {
        this.frame = null;
        this.paint();
      }),
    );
  }

  /** Publica o progresso que mudou ≥ 0,01 (ou entre `null` e número). */
  private paint(): void {
    let changed = false;
    for (const job of this.jobs) {
      if (job.state !== 'uploading' || !moved(job.shown, job.progress))
        continue;
      job.shown = job.progress;
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
    this.insert(job);
  }

  /**
   * Inserção (E9, E10): não editável → `'unavailable'`; diálogo aberto ou
   * composição → espera o `flush`; comando recusado → `'response'`.
   */
  private insert(job: Job): void {
    const editor = untracked(this.host.editor);
    if (!editor || editor.isDestroyed || !this.host.canInsert()) {
      this.fail(job, 'unavailable', undefined);
      return;
    }
    if (this.host.mustWait() || !job.attrs) return;
    const attrs = job.attrs;
    let ok = false;
    try {
      ok = this.host.zone.runOutsideAngular(() =>
        insertUploaded(
          editor,
          arrival(
            job.id,
            job.type,
            attrs,
            job.text,
            selectOnArrival(editor, job.id),
          ),
        ),
      );
    } catch {
      ok = false;
    }
    if (!ok) {
      this.fail(job, 'response', undefined);
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
    said: Omit<RteUploadAnnouncement, 'n'> | null,
    error?: RteUploadErrorEvent,
  ): void {
    const gone = new Set(jobs);
    for (const job of jobs) job.done = true;
    this.jobs = this.jobs.filter((j) => !gone.has(j));
    this.host.zone.run(() => {
      this.publish();
      if (said) this.announce(said);
      if (error) this.host.emitError(error);
    });
    this.pump();
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

  private announce(a: Omit<RteUploadAnnouncement, 'n'>): void {
    this.said.set({ n: ++this.announced, ...a });
  }
}
