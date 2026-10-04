import type { ChainedCommands, Editor } from '@tiptap/core';
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';
import type { RteToolbarItemId } from './items';
import {
  RTE_INSERT_TABLE,
  RTE_TABLE_OPS,
  readTableOpState,
  type RteTableOp,
} from './table-guard';

export type { RteTableOp } from './table-guard';

const CALLOUT_VARIANTS: readonly string[] = [
  'info',
  'success',
  'warning',
  'danger',
];
const ALIGNMENTS: readonly string[] = ['left', 'center', 'right', 'justify'];
const HEADINGS: Readonly<Record<string, 2 | 3 | 4>> = {
  heading2: 2,
  heading3: 3,
  heading4: 4,
};
const MARK_COMMANDS: Partial<Record<RteToolbarItemId, string>> = {
  bold: 'toggleBold',
  italic: 'toggleItalic',
  underline: 'toggleUnderline',
  strike: 'toggleStrike',
  code: 'toggleCode',
  superscript: 'toggleSuperscript',
  subscript: 'toggleSubscript',
  bulletList: 'toggleBulletList',
  orderedList: 'toggleOrderedList',
  taskList: 'toggleTaskList',
  blockquote: 'toggleBlockquote',
  codeBlock: 'toggleCodeBlock',
  horizontalRule: 'setHorizontalRule',
  readAlso: 'insertReadAlso',
  clearFormatting: 'unsetAllMarks',
  undo: 'undo',
  redo: 'redo',
};

type Chain = Record<string, ((...args: unknown[]) => Chain) | undefined> & {
  run(): boolean;
};

/**
 * `editor.chain().focus().<command>(...args).run()` (U4); comando ausente
 * (recurso desligado) devolve `false` sem tocar no editor.
 */
function run(editor: Editor, command: string, ...args: unknown[]): boolean {
  if (
    typeof (editor.commands as Record<string, unknown>)[command] !== 'function'
  ) {
    return false;
  }
  const chain = editor.chain().focus() as ChainedCommands as unknown as Chain;
  const step = chain[command];
  return typeof step === 'function' && step(...args).run();
}

/** Tipo do item de lista mais próximo do cursor (tarefa ou lista comum). */
export function closestListItemType(editor: Editor): string | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === 'rtTaskItem' || name === 'listItem') return name;
  }
  return null;
}

/**
 * `indent`/`outdent` aplicáveis? Ensaio do comando do `prosemirror-schema-list`
 * com um `dispatch` que descarta a transação: o `can()` não monta os passos e
 * aprova, por exemplo, aninhar `rtTaskItem` (conteúdo `inline*`), cujo passo
 * lança `TransformError`.
 */
export function canShiftListItem(
  editor: Editor,
  direction: 'indent' | 'outdent',
): boolean {
  const name = closestListItemType(editor);
  const type = name === null ? undefined : editor.schema.nodes[name];
  if (!type) return false;
  const command = direction === 'indent' ? sinkListItem : liftListItem;
  let applied = false;
  try {
    command(type)(editor.state, () => {
      applied = true;
    });
  } catch {
    return false;
  }
  return applied;
}

/** Dentro de uma caixa de destaque (`rtCallout`)? */
export function calloutVariantAt(editor: Editor): string | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'rtCallout') {
      return String(node.attrs['variant']);
    }
  }
  return null;
}

/** Executa a operação de tabela se o menu a habilita (U14). */
export function runTableOp(editor: Editor, op: RteTableOp): boolean {
  if (!readTableOpState(editor, op).enabled) return false;
  return op === 'insertTable'
    ? run(editor, op, RTE_INSERT_TABLE)
    : run(editor, op);
}

/**
 * Comando de um item da barra (§4), sempre `chain().focus()…run()` (U4).
 * `value` é o item do menu (bloco, cor, alinhamento, linguagem, operação de
 * tabela, variante da caixa ou `'remove'`).
 */
export function runToolbarCommand(
  editor: Editor,
  id: RteToolbarItemId,
  value?: string | null,
): boolean {
  const simple = MARK_COMMANDS[id];
  if (simple) return run(editor, simple);
  switch (id) {
    case 'blockType':
      if (value === 'paragraph') return run(editor, 'setParagraph');
      if (typeof value === 'string' && Object.hasOwn(HEADINGS, value)) {
        return run(editor, 'setHeading', { level: HEADINGS[value] });
      }
      return false;
    case 'textColor':
      return value == null
        ? run(editor, 'unsetTextColor')
        : run(editor, 'setTextColor', value);
    case 'highlight':
      return value == null
        ? run(editor, 'unsetHighlight')
        : run(editor, 'setHighlight', value);
    case 'indent':
    case 'outdent': {
      const type = closestListItemType(editor);
      if (type === null || !canShiftListItem(editor, id)) return false;
      return run(
        editor,
        id === 'indent' ? 'sinkListItem' : 'liftListItem',
        type,
      );
    }
    case 'align':
      return typeof value === 'string' && ALIGNMENTS.includes(value)
        ? run(editor, 'setTextAlign', value)
        : false;
    case 'codeLanguage':
      return run(
        editor,
        'setCodeBlockLanguage',
        value == null || value === 'plain' ? null : value,
      );
    case 'table':
      return typeof value === 'string' &&
        (RTE_TABLE_OPS as readonly string[]).includes(value)
        ? runTableOp(editor, value as RteTableOp)
        : false;
    case 'callout':
      if (value === 'remove') return run(editor, 'unsetCallout');
      if (typeof value !== 'string' || !CALLOUT_VARIANTS.includes(value)) {
        return false;
      }
      return calloutVariantAt(editor) === null
        ? run(editor, 'setCallout', value)
        : run(editor, 'setCalloutVariant', value);
    case 'pullquote':
      return editor.isActive('rtPullquote')
        ? run(editor, 'unsetPullquote')
        : run(editor, 'setPullquote');
    default:
      return false;
  }
}
