import { isDevMode, signal, untracked, type Signal } from '@angular/core';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { RteDialogMode, RteDialogTarget } from './target';
import type { RteDialogKind } from './types';
import { setPendingSelection } from './ui-extension';

const DEFER_FAILED =
  '[rte-editor] não foi possível carregar os diálogos; o pedido foi descartado.';

/**
 * Controlador com pedido em curso por documento (G6): recusa um segundo
 * pedido mesmo antes de qualquer `<dialog>` aberto (o *chunk* ainda chegando).
 */
const busy = new WeakMap<Document, RteDialogController>();

/** `true` se algum editor do documento tem um pedido de diálogo em curso. */
export function dialogBusy(doc: Document): boolean {
  return busy.has(doc);
}

/** Pedido de diálogo aceito (G18): o alvo e o documento da abertura (G5). */
export interface RteDialogRequest {
  readonly id: number;
  readonly kind: RteDialogKind;
  readonly mode: RteDialogMode;
  /** Elemento que pediu (G4); `null` quando não havia foco no host. */
  readonly origin: HTMLElement | null;
  readonly doc: ProseMirrorNode;
  readonly range: { readonly from: number; readonly to: number };
}

/** O que o controlador precisa do `RteDialogs` (que vive no *chunk*). */
export interface RteDialogView {
  hide(): void;
}

/**
 * Controlador dos diálogos, no *chunk* principal e sem Angular Forms (G7):
 * guarda o pedido, liga a seleção pendente (G13), confere o documento antes
 * de aplicar (G5) e devolve o foco no cancelamento (G4). O `RteDialogs`
 * (carregado por `@defer`) lê o pedido e registra a vista para ser fechado.
 */
export class RteDialogController {
  private readonly editor: Signal<Editor | null>;
  private readonly current = signal<RteDialogRequest | null>(null);
  private readonly wanted = signal(false);
  private readonly broken = signal(false);
  private view: RteDialogView | null = null;
  private nextId = 1;
  /** Documento em que o pedido em curso foi registrado (G6). */
  private owner: Document | null = null;
  /** Fechando por aplicação/cancelamento: o `close` desse fechamento é ignorado. */
  private settling = false;
  private disposed = false;

  /** Pedido em curso (aberto ou à espera do *chunk*); `null` sem diálogo. */
  readonly request: Signal<RteDialogRequest | null> = this.current.asReadonly();
  /** Sobe no primeiro pedido e não desce (`when` do `@defer`, de mão única). */
  readonly requested: Signal<boolean> = this.wanted.asReadonly();
  /** O *chunk* falhou (`@error`, terminal; pré-voo 5). */
  readonly failed: Signal<boolean> = this.broken.asReadonly();

  constructor(o: { editor: Signal<Editor | null> }) {
    this.editor = o.editor;
  }

  /**
   * Grava o pedido (um por documento, G6); `link`/`lang` com intervalo ganham
   * a seleção pendente.
   */
  open(
    kind: RteDialogKind,
    target: RteDialogTarget,
    origin: HTMLElement | null,
  ): void {
    const editor = untracked(this.editor);
    if (this.disposed || !editor || editor.isDestroyed) return;
    const doc = editor.view.dom.ownerDocument;
    if (busy.has(doc)) return;
    busy.set(doc, this);
    this.owner = doc;
    const { from, to } = target.range;
    if ((kind === 'link' || kind === 'lang') && from < to) {
      setPendingSelection(editor, { from, to });
    }
    this.current.set({
      id: this.nextId++,
      kind,
      mode: target.mode,
      origin,
      doc: editor.state.doc,
      range: { from, to },
    });
    this.wanted.set(true);
  }

  /** Registra a vista do diálogo; devolve a função que a remove. */
  register(view: RteDialogView): () => void {
    this.view = view;
    return () => {
      if (this.view === view) this.view = null;
    };
  }

  /**
   * Aplica (G5): com outro documento no estado, cancela e devolve `false`;
   * senão fecha o diálogo, limpa a seleção pendente, roda o comando (que
   * devolve o foco ao editável) e encerra o pedido.
   */
  apply(run: (editor: Editor) => boolean): boolean {
    const req = untracked(this.current);
    const editor = untracked(this.editor);
    if (!req || this.settling) return false;
    if (!editor || editor.isDestroyed || editor.state.doc !== req.doc) {
      this.cancel('cancelled');
      return false;
    }
    this.settling = true;
    try {
      this.view?.hide();
      setPendingSelection(editor, null);
      return run(editor);
    } finally {
      this.clear();
      this.settling = false;
    }
  }

  /**
   * Cancela o pedido em curso (G3/G5). `'cancelled'` devolve o foco à origem
   * (conectada e habilitada) ou ao editável (G4); `'state'` (`disabled`,
   * `hidden`, destroy) não move o foco (pré-voo 11).
   */
  cancel(reason: 'cancelled' | 'state'): void {
    const req = untracked(this.current);
    if (!req || this.settling) return;
    this.settling = true;
    try {
      this.view?.hide();
      const editor = untracked(this.editor);
      const alive = !!editor && !editor.isDestroyed;
      if (alive) setPendingSelection(editor, null);
      this.clear();
      if (reason === 'cancelled' && !this.disposed) {
        restoreFocus(req.origin, alive ? editor : null);
      }
    } finally {
      this.settling = false;
    }
  }

  /** `@error` do `@defer`: terminal; descarta o pedido (pré-voo 5). */
  fail(): void {
    this.broken.set(true);
    if (isDevMode()) console.warn(DEFER_FAILED);
    this.cancel('cancelled');
  }

  /** Encerra o pedido em curso e libera o documento (G6). */
  private clear(): void {
    this.current.set(null);
    if (this.owner && busy.get(this.owner) === this) busy.delete(this.owner);
    this.owner = null;
  }

  /** Destruição do editor: fecha sem mover o foco e recusa pedidos novos. */
  dispose(): void {
    this.cancel('state');
    this.disposed = true;
    this.view = null;
  }
}

function restoreFocus(origin: HTMLElement | null, editor: Editor | null): void {
  const usable =
    origin !== null &&
    origin.isConnected &&
    origin !== editor?.view.dom &&
    !(origin as HTMLButtonElement).disabled;
  if (usable) origin.focus();
  else editor?.commands.focus();
}
