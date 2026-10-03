import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { EditorView, NodeView } from '@tiptap/pm/view';
import { computeResize } from '../../src/image';
import type { RteResizeCorner } from '../../src/image';

const CORNERS: readonly RteResizeCorner[] = ['nw', 'ne', 'sw', 'se'];
const ABS_MAX = 10000;
const DEFAULT_MIN_WIDTH = 48;
const SELECTED = 'rte-image--selected';

export interface ImageViewOptions {
  node: ProseMirrorNode;
  view: EditorView;
  getPos: () => number | undefined;
  /** Atributos validados (checagens `loose` da extensão): nada cru no DOM. */
  normalize: (attrs: Record<string, unknown>) => Record<string, unknown>;
  minWidth: number;
}

interface Drag {
  corner: RteResizeCorner;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  maxWidth: number;
  /** Tamanho da prévia; `null` enquanto o ponteiro não se moveu. */
  next: { width: number; height: number } | null;
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Vista de `rtImage` no editor (spec 03b, §6 e B17): a figura da 03a com
 * `img`, legenda e 4 alças `span.rte-image__handle--nw|ne|sw|se`. Arrastar
 * uma alça (botão primário) mostra a prévia nos atributos do `img` e grava
 * uma única transação no `pointerup`; `Escape` e `pointercancel` desfazem a
 * prévia. Ouvintes de `document` só durante o arrasto. Só DOM, sem
 * `innerHTML`; a alternativa sem arrasto é o comando `setImageSize`.
 */
export class ImageView implements NodeView {
  readonly dom: HTMLElement;
  private readonly img: HTMLImageElement;
  private readonly handles: HTMLSpanElement[];
  private caption: HTMLElement | null = null;
  private node: ProseMirrorNode;
  private selected = false;
  private drag: Drag | null = null;
  private readonly options: ImageViewOptions;

  constructor(options: ImageViewOptions) {
    this.options = options;
    this.node = options.node;
    const doc = options.view.dom.ownerDocument;
    this.dom = doc.createElement('figure');
    this.img = doc.createElement('img');
    this.dom.appendChild(this.img);
    this.handles = CORNERS.map((corner) => {
      const handle = doc.createElement('span');
      handle.className = `rte-image__handle rte-image__handle--${corner}`;
      handle.setAttribute('aria-hidden', 'true');
      handle.addEventListener('pointerdown', (event) =>
        this.start(event, corner, handle),
      );
      this.dom.appendChild(handle);
      return handle;
    });
    // Arrastar a alça não pode virar o arrastar-e-soltar nativo da figura.
    this.dom.addEventListener('dragstart', this.blockDrag);
    this.render();
  }

  private readonly blockDrag = (event: Event): void => {
    if (this.drag) event.preventDefault();
  };

  private attrs(): Record<string, unknown> {
    return this.options.normalize(this.node.attrs);
  }

  private render(): void {
    const a = this.attrs();
    this.dom.className = `rt-figure rt-figure--${String(a['align'])}`;
    this.dom.classList.toggle(SELECTED, this.selected);
    const img = this.img;
    this.setAttr('src', a['src']);
    this.setAttr('alt', a['alt'] ?? '');
    this.setSize(a['width'], a['height']);
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
    this.setAttr('srcset', a['srcset']);
    this.setAttr('sizes', a['sizes']);
    this.renderCaption(String(a['caption'] ?? ''), String(a['credit'] ?? ''));
  }

  private setAttr(name: string, value: unknown): void {
    if (value === null || value === undefined) this.img.removeAttribute(name);
    else this.img.setAttribute(name, String(value));
  }

  private setSize(width: unknown, height: unknown): void {
    this.setAttr('width', width);
    this.setAttr('height', height);
  }

  /** `figcaption` com `[legenda][ ][<small class="rt-credit">crédito</small>]`. */
  private renderCaption(caption: string, credit: string): void {
    if (!caption && !credit) {
      this.caption?.remove();
      this.caption = null;
      return;
    }
    const doc = this.dom.ownerDocument;
    this.caption ??= doc.createElement('figcaption');
    const parts: (string | globalThis.Node)[] = [];
    const lead = caption && credit ? `${caption} ` : caption;
    if (lead) parts.push(lead);
    if (credit) {
      const small = doc.createElement('small');
      small.className = 'rt-credit';
      small.textContent = credit;
      parts.push(small);
    }
    this.caption.replaceChildren(...parts);
    this.dom.appendChild(this.caption);
  }

  private start(
    event: PointerEvent,
    corner: RteResizeCorner,
    handle: HTMLElement,
  ): void {
    const { view } = this.options;
    if (event.button !== 0 || this.drag || !view.editable) return;
    const a = this.attrs();
    const rect = this.img.getBoundingClientRect();
    let width: number;
    let height: number;
    let scale = 1;
    if (positive(a['width']) && positive(a['height'])) {
      width = a['width'];
      height = a['height'];
      if (rect.width > 0) scale = width / rect.width;
    } else {
      // Sem os dois atributos, parte do tamanho exibido.
      width = Math.round(rect.width);
      height = Math.round(rect.height);
      if (width <= 0 || height <= 0) return;
    }
    event.preventDefault();
    if (typeof handle.setPointerCapture === 'function') {
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // Ponteiro já liberado: o arrasto segue pelos ouvintes de `document`.
      }
    }
    const area = view.dom.clientWidth;
    const minWidth = this.minWidth();
    const maxWidth =
      area > 0 ? Math.min(ABS_MAX, Math.floor(area * scale)) : ABS_MAX;
    this.drag = {
      corner,
      x: event.clientX,
      y: event.clientY,
      width,
      height,
      scale,
      maxWidth: Math.max(minWidth, maxWidth),
      next: null,
    };
    this.listen(true);
  }

  private minWidth(): number {
    const value = this.options.minWidth;
    return Number.isFinite(value) && value >= 1
      ? Math.min(value, ABS_MAX)
      : DEFAULT_MIN_WIDTH;
  }

  private listen(on: boolean): void {
    const doc = this.dom.ownerDocument;
    if (on) {
      doc.addEventListener('pointermove', this.onMove);
      doc.addEventListener('pointerup', this.onUp);
      doc.addEventListener('pointercancel', this.onCancel);
      // Captura: o `Escape` do arrasto não chega ao editor.
      doc.addEventListener('keydown', this.onKey, true);
    } else {
      doc.removeEventListener('pointermove', this.onMove);
      doc.removeEventListener('pointerup', this.onUp);
      doc.removeEventListener('pointercancel', this.onCancel);
      doc.removeEventListener('keydown', this.onKey, true);
    }
  }

  private readonly onMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag) return;
    event.preventDefault();
    drag.next = computeResize({
      width: drag.width,
      height: drag.height,
      dx: (event.clientX - drag.x) * drag.scale,
      dy: (event.clientY - drag.y) * drag.scale,
      corner: drag.corner,
      minWidth: this.minWidth(),
      maxWidth: drag.maxWidth,
    });
    this.setSize(drag.next.width, drag.next.height);
  };

  private readonly onUp = (): void => {
    const drag = this.end();
    if (!drag?.next) return;
    const a = this.attrs();
    const { width, height } = drag.next;
    const pos = this.options.getPos();
    if (
      typeof pos === 'number' &&
      (width !== a['width'] || height !== a['height'])
    ) {
      const { view } = this.options;
      const wasSelected =
        view.state.selection instanceof NodeSelection &&
        view.state.selection.from === pos;
      const tr = view.state.tr.setNodeMarkup(pos, undefined, {
        ...a,
        width,
        height,
      });
      if (wasSelected) tr.setSelection(NodeSelection.create(tr.doc, pos));
      view.dispatch(tr);
    }
    // Transação aplicada ou não, o `img` volta a refletir o nó.
    this.render();
  };

  private readonly onCancel = (): void => {
    this.cancel();
  };

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.drag) return;
    event.preventDefault();
    event.stopPropagation();
    this.cancel();
  };

  private cancel(): void {
    if (this.end()) this.render();
  }

  /** Encerra o arrasto (remove os ouvintes) e devolve o estado dele. */
  private end(): Drag | null {
    const drag = this.drag;
    if (drag) this.listen(false);
    this.drag = null;
    return drag;
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    const next = this.drag?.next;
    if (next) this.setSize(next.width, next.height);
    return true;
  }

  selectNode(): void {
    this.selected = true;
    this.dom.classList.add(SELECTED);
  }

  deselectNode(): void {
    this.selected = false;
    this.dom.classList.remove(SELECTED);
  }

  stopEvent(event: Event): boolean {
    if (this.drag) return true;
    const target = event.target as globalThis.Node | null;
    return this.handles.some((handle) => handle.contains(target));
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.end();
    this.dom.removeEventListener('dragstart', this.blockDrag);
  }
}
