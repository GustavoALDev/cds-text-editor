import { Node } from '@tiptap/core';
import type { AnyExtension } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { RteExtensionContext } from './context';
import { createItemKeymap, itemsToParagraphs } from './item-keymap';
import { getRenderDocument } from './render-document';
import { TaskItemView } from './task-view';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    rtTaskList: {
      /**
       * Converte os blocos de texto da seleção em tarefas; dentro de uma lista
       * de tarefas, os itens selecionados voltam a ser parágrafos.
       */
      toggleTaskList: () => ReturnType;
    };
    rtTaskItem: {
      /** Alterna `checked` da tarefa do cursor. */
      toggleTaskItemChecked: () => ReturnType;
    };
  }
}

const LIST = 'rtTaskList';
const ITEM = 'rtTaskItem';
// Acima das regras de `ul`/`li`/`p` das listas e do parágrafo oficiais (50).
const PRIORITY = 60;

function tagOf(element: Element): string {
  return element.tagName.toLowerCase();
}

/** Conteúdo do item no formato do Tiptap: o `div`, senão o próprio `li`. */
function tiptapContent(li: HTMLElement): HTMLElement {
  for (const child of Array.from(li.children)) {
    if (tagOf(child) === 'div') return child as HTMLElement;
  }
  return li;
}

/** `checked` de `data-checked` (`true` ou vazio) ou de `input[checked]`. */
function parseChecked(li: HTMLElement): boolean {
  const data = li.getAttribute('data-checked');
  if (data !== null) return data === '' || data === 'true';
  for (const child of Array.from(li.children)) {
    const inputs =
      tagOf(child) === 'label' ? Array.from(child.children) : [child];
    for (const input of inputs) {
      if (tagOf(input) === 'input') return input.hasAttribute('checked');
    }
  }
  return false;
}

// Espaço em branco do HTML (sem `trim()`, que também remove NBSP etc.).
const BLANK = /^[ \t\n\f\r]*$/;

/**
 * O `p` é o texto da tarefa só se for o primeiro conteúdo do item: antes
 * dele, só espaço em branco, comentários e `label`/`input` sem texto (o
 * formato do Tiptap). Senão ele sai da lista como parágrafo, para que nenhum
 * texto anterior se junte a ele. Só lê o DOM de entrada.
 */
function isTaskText(element: HTMLElement): boolean {
  for (
    let sibling = element.previousSibling;
    sibling;
    sibling = sibling.previousSibling
  ) {
    if (sibling.nodeType === 8) continue;
    if (sibling.nodeType === 3) {
      if (BLANK.test(sibling.nodeValue ?? '')) continue;
      return false;
    }
    if (sibling.nodeType !== 1) return false;
    const tag = tagOf(sibling as Element);
    if (tag !== 'label' && tag !== 'input') return false;
    if (!BLANK.test(sibling.textContent ?? '')) return false;
  }
  return true;
}

/**
 * Tarefas (spec 03b, B11 e §4): `rtTaskList` > `rtTaskItem` (bloco de texto
 * `inline*`, sem aninhamento) com a saída da 03a §4.6. A renderização monta
 * `{ dom, contentDOM }` no documento de renderização, com o `label` como
 * conteúdo; no editor, `TaskItemView`.
 */
export function createTaskExtensions(ctx: RteExtensionContext): AnyExtension[] {
  const taskList = Node.create({
    name: LIST,
    group: 'block',
    content: `${ITEM}+`,
    parseHTML() {
      return [
        { tag: 'ul.rt-tasks', priority: PRIORITY },
        { tag: 'ul[data-type="taskList"]', priority: PRIORITY },
      ];
    },
    renderHTML() {
      return ['ul', { class: 'rt-tasks' }, 0];
    },
    // o mesmo atalho do `TaskList` do Tiptap (K2)
    addKeyboardShortcuts() {
      return { 'Mod-Shift-9': () => this.editor.commands.toggleTaskList() };
    },
    addCommands() {
      return {
        toggleTaskList:
          () =>
          ({ state, tr, dispatch }) => {
            const { $from, $to, from, to } = state.selection;
            const listType = state.schema.nodes[LIST];
            const itemType = state.schema.nodes[ITEM];
            if (!listType || !itemType) return false;
            for (let depth = $from.depth; depth > 0; depth -= 1) {
              if ($from.node(depth).type !== listType) continue;
              const list = $from.node(depth);
              const first = $from.index(depth);
              const last =
                $to.depth >= depth && $to.node(depth) === list
                  ? $to.index(depth)
                  : list.childCount - 1;
              // Último ponto de texto do último item da lista.
              const end = $from.start(depth) + list.content.size - 1;
              const target = dispatch ? tr : state.tr;
              const shift = itemsToParagraphs(
                target,
                $from,
                depth,
                first,
                last,
              );
              if (shift === null) return false;
              if (dispatch) {
                tr.setSelection(
                  TextSelection.create(
                    tr.doc,
                    from + shift,
                    Math.min(to, end) + shift,
                  ),
                );
              }
              return true;
            }
            const range = $from.blockRange($to);
            if (!range) return false;
            const items = [];
            for (let i = range.startIndex; i < range.endIndex; i += 1) {
              const block = range.parent.child(i);
              if (!block.isTextblock || block.type.spec.code) return false;
              if (!itemType.validContent(block.content)) return false;
              items.push(itemType.create(null, block.content));
            }
            const list = Fragment.from(listType.create(null, items));
            if (
              items.length === 0 ||
              !range.parent.canReplace(range.startIndex, range.endIndex, list)
            ) {
              return false;
            }
            if (dispatch) {
              tr.replaceWith(range.start, range.end, list);
              // Cada item tem o tamanho do bloco; tudo anda 1 (abertura da lista).
              tr.setSelection(TextSelection.create(tr.doc, from + 1, to + 1));
            }
            return true;
          },
      };
    },
  });

  const taskItem = Node.create({
    name: ITEM,
    content: 'inline*',
    defining: true,
    addAttributes() {
      return {
        checked: {
          default: false,
          keepOnSplit: false,
          rendered: false,
          parseHTML: parseChecked,
        },
      };
    },
    parseHTML() {
      return [
        {
          tag: 'li[data-type="taskItem"]',
          priority: PRIORITY,
          contentElement: tiptapContent,
        },
        // O `label` é um invólucro inline transparente; o `input` some.
        { tag: 'li.rt-task', priority: PRIORITY },
        { tag: 'li', context: `${LIST}/`, priority: PRIORITY },
        // Formato do Tiptap: o 1º `p` do conteúdo é o texto da tarefa.
        {
          tag: 'p',
          context: `${ITEM}/`,
          priority: PRIORITY,
          skip: true,
          getAttrs: (element) => (isTaskText(element) ? null : false),
        },
      ];
    },
    renderHTML({ node }) {
      const doc = getRenderDocument();
      const li = doc.createElement('li');
      li.setAttribute('class', 'rt-task');
      const label = doc.createElement('label');
      const input = doc.createElement('input');
      input.setAttribute('type', 'checkbox');
      input.setAttribute('disabled', '');
      if (node.attrs['checked'] === true) input.setAttribute('checked', '');
      label.appendChild(input);
      li.appendChild(label);
      return { dom: li, contentDOM: label };
    },
    addCommands() {
      return {
        toggleTaskItemChecked:
          () =>
          ({ state, tr, dispatch }) => {
            const { $from } = state.selection;
            for (let depth = $from.depth; depth > 0; depth -= 1) {
              const node = $from.node(depth);
              if (node.type.name !== ITEM) continue;
              if (dispatch) {
                tr.setNodeAttribute(
                  $from.before(depth),
                  'checked',
                  node.attrs['checked'] !== true,
                );
              }
              return true;
            }
            return false;
          },
      };
    },
    addKeyboardShortcuts() {
      return {
        ...createItemKeymap(ITEM),
        'Mod-Enter': () => this.editor.commands.toggleTaskItemChecked(),
      };
    },
    addNodeView() {
      return ({ node, view, editor, getPos }) =>
        new TaskItemView({ node, view, editor, getPos, labels: ctx.labels });
    },
  });

  return [taskList, taskItem];
}
