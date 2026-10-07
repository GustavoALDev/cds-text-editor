import {
  computed,
  effect,
  isDevMode,
  signal,
  untracked,
  type NgZone,
  type Signal,
} from '@angular/core';
import { serializeRteHtml } from '@cds/rte-core/extensions';
import { createDocument, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { isEmptyDoc } from './empty';

type SerializeLabels = NonNullable<
  Parameters<typeof serializeRteHtml>[1]
>['labels'];

/** O HTML lido pela mesma leitura do esquema do `value` (S8): documento e forma canônica. */
export function readCanonical(
  editor: Editor,
  html: string,
): { doc: ProseMirrorNode; html: string } {
  const doc = createDocument(html, editor.schema);
  const content = (
    editor.storage as unknown as {
      rtContent?: { idPrefix?: string; labels?: SerializeLabels };
    }
  ).rtContent;
  return {
    doc,
    html: isEmptyDoc(doc)
      ? ''
      : serializeRteHtml(doc, {
          ...(content?.idPrefix === undefined
            ? {}
            : { idPrefix: content.idPrefix }),
          ...(content?.labels === undefined ? {} : { labels: content.labels }),
        }),
  };
}

export interface RteDirtyDeps {
  readonly zone: NgZone;
  readonly pendingUploads: Signal<number>;
  /** Endereços de mídia do documento neste momento. */
  readonly currentUrls: () => readonly string[];
  /** `adapter.onMediaRemoved`, se houver. */
  readonly deliver: () =>
    | ((urls: readonly string[]) => void | Promise<void>)
    | null;
}

/**
 * Estado de "salvo" (S8, S9): a base salva, `isDirty` e a fila do
 * `onMediaRemoved`. Num contexto de injeção (cria um `effect`). Compara as
 * *strings* canônicas já emitidas por `value`, sem serializar de novo.
 */
export class RteDirtyState {
  private readonly base = signal('');
  private readonly current = signal('');
  readonly isDirty: Signal<boolean> = computed(
    () => this.current() !== this.base(),
  );
  /** Gancho depois de `markSaved` (a Tarefa 2 apaga o rascunho aqui). */
  onSaved: (() => void) | null = null;
  private waiting: Set<string> | null = null;
  private disposed = false;

  constructor(private readonly deps: RteDirtyDeps) {
    effect(() => {
      if (deps.pendingUploads() === 0) untracked(() => this.flush());
    });
  }

  /** Criação e carga externa (D9): base e valor atual coincidem. */
  reset(html: string): void {
    this.current.set(html);
    this.base.set(html);
  }

  /** Valor emitido (já canônico). */
  setCurrent(html: string): void {
    this.current.set(html);
  }

  /** Fixa a base e agenda a entrega dos endereços removidos (S9). */
  save(base: string, removed: readonly string[]): void {
    this.base.set(base);
    if (removed.length > 0) {
      this.waiting ??= new Set();
      for (const url of removed) this.waiting.add(url);
    }
    this.onSaved?.();
    if (untracked(this.deps.pendingUploads) === 0) this.flush();
  }

  dispose(): void {
    this.disposed = true;
    this.waiting = null;
  }

  private flush(): void {
    const waiting = this.waiting;
    if (!waiting || this.disposed) return;
    this.waiting = null;
    const present = new Set(this.deps.currentUrls());
    const urls = [...waiting].filter((url) => !present.has(url));
    const deliver = this.deps.deliver();
    if (urls.length === 0 || !deliver) return;
    const warn = (error: unknown) => {
      if (isDevMode()) {
        console.warn(
          '[rte-editor] onMediaRemoved falhou; os endereços ficam para a limpeza do servidor.',
          error,
        );
      }
    };
    this.deps.zone.runOutsideAngular(() => {
      try {
        const result = deliver(urls);
        if (result && typeof result.then === 'function') {
          result.then(undefined, warn);
        }
      } catch (error) {
        warn(error);
      }
    });
  }
}
