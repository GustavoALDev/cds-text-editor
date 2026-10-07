import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView, NodeView, ViewMutationRecord } from '@tiptap/pm/view';
import type { RteContentLabels } from './types';

export interface TaskItemViewOptions {
  node: ProseMirrorNode;
  view: EditorView;
  /** Só para ouvir `update` (mudança de `editable`). */
  editor: Editor;
  getPos: () => number | undefined;
  labels: () => RteContentLabels;
}

/**
 * Vista de `rtTaskItem` no editor (spec 03b, §6): `li.rt-task[data-checked]`
 * com o checkbox fora da área editável e o texto em `span.rte-task__text`.
 * O checkbox só fica habilitado com o editor editável, tem `aria-label`
 * = `labels.taskCheckbox(texto)` e alterna `checked` por transação; o
 * `mousedown` nele não rouba a seleção. Só DOM, sem `innerHTML`.
 */
export class TaskItemView implements NodeView {
  readonly dom: HTMLLIElement;
  readonly contentDOM: HTMLSpanElement;
  private readonly check: HTMLSpanElement;
  private readonly input: HTMLInputElement;
  private node: ProseMirrorNode;
  private readonly options: TaskItemViewOptions;
  private readonly syncEditable = (): void => {
    this.input.disabled = !this.isEditable();
  };

  constructor(options: TaskItemViewOptions) {
    this.options = options;
    this.node = options.node;
    const doc = options.view.dom.ownerDocument;
    this.dom = doc.createElement('li');
    this.dom.className = 'rt-task';
    this.check = doc.createElement('span');
    this.check.className = 'rte-task__check';
    this.check.setAttribute('contenteditable', 'false');
    this.input = doc.createElement('input');
    this.input.type = 'checkbox';
    this.check.appendChild(this.input);
    this.contentDOM = doc.createElement('span');
    this.contentDOM.className = 'rte-task__text';
    this.dom.append(this.check, this.contentDOM);
    this.input.addEventListener('mousedown', (event) => event.preventDefault());
    this.input.addEventListener('change', () => this.toggle());
    options.editor.on('update', this.syncEditable);
    this.render();
  }

  private render(): void {
    const checked = this.node.attrs['checked'] === true;
    this.dom.setAttribute('data-checked', String(checked));
    this.input.checked = checked;
    this.input.setAttribute(
      'aria-label',
      this.options.labels().taskCheckbox(this.node.textContent),
    );
    this.syncEditable();
  }

  /**
   * O Tiptap cria a vista antes do plugin `editable`; até o 1º `update`,
   * `view.editable` não reflete `editor.options.editable`.
   */
  private isEditable(): boolean {
    return (
      this.options.editor.options.editable !== false &&
      this.options.view.editable
    );
  }

  private toggle(): void {
    const { view, getPos } = this.options;
    const pos = getPos();
    if (!this.isEditable() || typeof pos !== 'number') {
      this.input.checked = this.node.attrs['checked'] === true;
      return;
    }
    view.dispatch(
      view.state.tr.setNodeAttribute(
        pos,
        'checked',
        this.node.attrs['checked'] !== true,
      ),
    );
    // Sem transação aplicada (p.ex. filtrada), o checkbox volta ao estado do nó.
    this.input.checked = this.node.attrs['checked'] === true;
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  stopEvent(event: Event): boolean {
    return this.check.contains(event.target as Node | null);
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    if (mutation.type === 'selection') return false;
    return !this.contentDOM.contains(mutation.target);
  }

  destroy(): void {
    this.options.editor.off('update', this.syncEditable);
  }
}
