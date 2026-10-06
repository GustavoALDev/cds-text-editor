import { normalizeHref, type RteLinkPolicy } from '@cds/rte-core';
import type { RteImageAlign } from '@cds/rte-core/extensions';
import type { ChainedCommands, Editor } from '@tiptap/core';
// Tipos de `unsetLink` no `ChainedCommands`.
import type {} from '@tiptap/extension-link';
import { NodeSelection } from '@tiptap/pm/state';
import { dialogTarget } from '../dialogs/target';
import type { RteDialogKind } from '../dialogs/types';
import type { RteFloatingMenuLabels } from '../labels/types';
import { runTableOp, runToolbarCommand } from '../toolbar/commands';
import type { RteToolbarItemId } from '../toolbar/items';
import type { RteMenu } from '../toolbar/menu';
import type { RteToolbarState } from '../toolbar/state';
import type { RteFloatingMenuKind } from './types';
import {
  readTableOpState,
  RTE_TABLE_OPS,
  type RteTableOp,
  type RteTableOpState,
} from '../toolbar/table-guard';

/** Marcas do menu de texto, antes do `link` (M13). */
export const RTE_FLOATING_TEXT_MARKS = [
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
] as const;

/** Botões do menu de imagem: alinhamento, rótulo de `floating` e ícone. */
export const RTE_FLOATING_IMAGE_ALIGNS = [
  ['left', 'imageAlignLeft', 'alignLeft'],
  ['center', 'imageAlignCenter', 'alignCenter'],
  ['right', 'imageAlignRight', 'alignRight'],
  ['full', 'imageAlignFull', 'imageAlignFull'],
] as const satisfies readonly (readonly [RteImageAlign, string, string])[];

/** Tipos de menu de mídia: "Detalhes…" abre o diálogo do mesmo nome (V10). */
export type RteFloatingMediaKind = 'image' | 'video' | 'embed';

/** Itens comuns de um menu de mídia: nó, "Detalhes…" e "Remover". */
export interface RteFloatingMedia {
  readonly kind: RteFloatingMediaKind;
  /** Nome do nó do core (`NodeSelection`). */
  readonly node: string;
  readonly details: keyof RteFloatingMenuLabels;
  readonly remove: keyof RteFloatingMenuLabels;
}

/**
 * Menus de mídia (pré-voo 10): "Detalhes…" · (alinhamentos, só imagem) ·
 * "Remover". Os demais tipos não têm entrada. O `satisfies` exige uma
 * entrada por tipo de mídia (com o `kind` da própria chave): uma mídia nova
 * esquecida aqui não compila, em vez de renderizar um menu vazio.
 */
export const RTE_FLOATING_MEDIA: Readonly<
  Partial<Record<RteFloatingMenuKind, RteFloatingMedia>>
> = Object.freeze({
  image: {
    kind: 'image',
    node: 'rtImage',
    details: 'imageDetails',
    remove: 'removeImage',
  },
  video: {
    kind: 'video',
    node: 'rtVideo',
    details: 'videoDetails',
    remove: 'removeVideo',
  },
  embed: {
    kind: 'embed',
    node: 'rtEmbed',
    details: 'embedDetails',
    remove: 'removeEmbed',
  },
} satisfies {
  readonly [K in RteFloatingMediaKind]: RteFloatingMedia & { readonly kind: K };
});

/** Operações de tabela do menu flutuante como botões (M13, M16). */
export const RTE_FLOATING_TABLE_OPS = [
  'addRowAfter',
  'addColumnAfter',
  'deleteRow',
  'deleteColumn',
] as const satisfies readonly RteTableOp[];

/**
 * Demais operações de `RTE_TABLE_OPS` no submenu "Mais operações de tabela"
 * (sem `insertTable` e sem as quatro dos botões; ordem preservada).
 */
export const RTE_FLOATING_TABLE_MORE: readonly RteTableOp[] = Object.freeze(
  RTE_TABLE_OPS.filter(
    (op) =>
      op !== 'insertTable' &&
      !(RTE_FLOATING_TABLE_OPS as readonly RteTableOp[]).includes(op),
  ),
);

export type RteTableStates = Partial<Record<RteTableOp, RteTableOpState>>;

/** Estado (com ensaio, M16) só das operações dadas; `null` sem editor. */
export function readTableStates(
  editor: Editor,
  ops: readonly RteTableOp[],
): RteTableStates | null {
  if (editor.isDestroyed) return null;
  const out: RteTableStates = {};
  for (const op of ops) out[op] = readTableOpState(editor, op);
  return out;
}

type ImageChain = ChainedCommands & {
  setImageAlign(align: RteImageAlign): ImageChain;
};

/** `NodeSelection` de um nó do tipo `typeName` ou `null`. */
export function selectedMedia(
  editor: Editor,
  typeName: string,
): NodeSelection | null {
  const { selection } = editor.state;
  return selection instanceof NodeSelection &&
    selection.node.type.name === typeName
    ? selection
    : null;
}

/** Alinhamento da imagem selecionada (`aria-pressed`); `null` sem imagem. */
export function imageAlignAt(editor: Editor): string | null {
  const selection = selectedMedia(editor, 'rtImage');
  return selection ? String(selection.node.attrs['align'] ?? '') : null;
}

/**
 * Alinha a imagem selecionada mantendo a `NodeSelection` (pré-voo 7): o menu
 * de imagem continua visível com o novo `aria-pressed`. Um passo de desfazer.
 */
export function alignImage(editor: Editor, align: RteImageAlign): boolean {
  const pos = selectedMedia(editor, 'rtImage')?.from ?? null;
  if (pos === null) return false;
  // o `declare module` do core (`setImageAlign`) não chega ao `.d.ts` do build
  const chain = editor.chain().focus() as ImageChain;
  return chain.setImageAlign(align).setNodeSelection(pos).run();
}

/**
 * Remove o nó de mídia selecionado (`deleteSelection()`, M13): um passo de
 * desfazer; `false` se a seleção não for uma `NodeSelection` de `typeName`.
 */
export function removeMedia(editor: Editor, typeName: string): boolean {
  if (!selectedMedia(editor, typeName)) return false;
  return editor.chain().focus().deleteSelection().run();
}

/**
 * Remove o link inteiro sob a seleção (pré-voo 6): o intervalo vem de
 * `dialogTarget(editor, 'link')` em modo `edit` (vale com o cursor na borda),
 * e a seleção original é restaurada. Um passo de desfazer.
 */
export function removeLinkAt(editor: Editor): boolean {
  const target = dialogTarget(editor, 'link');
  if (!target || target.mode !== 'edit') return false;
  const { from, to } = editor.state.selection;
  return editor
    .chain()
    .focus()
    .setTextSelection(target.range)
    .unsetLink()
    .setTextSelection({ from, to })
    .run();
}

/**
 * Endereço mostrado no menu de link (M13): o `href` da marca revalidado pela
 * política mesclada; `null` (sem `<a>`) se não for texto ou for rejeitado.
 */
export function floatingHref(
  href: unknown,
  policy: Partial<RteLinkPolicy> | undefined,
): string | null {
  return typeof href === 'string' ? normalizeHref(href, policy) : null;
}

/**
 * {@link floatingHref} do link sob a seleção; `null` sem editor. A marca é
 * lida no intervalo de `dialogTarget` (o mesmo do contexto `link`), não em
 * `$head.marks()`, que na borda inicial olha o texto antes do link.
 */
export function linkHrefAt(
  editor: Editor,
  policy: Partial<RteLinkPolicy> | undefined,
): string | null {
  if (editor.isDestroyed) return null;
  const target = dialogTarget(editor, 'link');
  if (target?.mode !== 'edit') return null;
  const mark = editor.state.doc
    .nodeAt(target.range.from)
    ?.marks.find((m) => m.type.name === 'link');
  return floatingHref(mark?.attrs['href'], policy);
}

/** Cliques dos itens dos menus flutuantes (M13, M14, M16). */
export interface RteFloatingActions {
  /** Marca do menu de texto: habilitado lido na hora do clique (N11). */
  mark(id: RteToolbarItemId): void;
  /** `link`/`editLink`: o dono pede o diálogo com origem no editável (M14). */
  link(): void;
  /** "Detalhes…" de uma mídia: o dono pede o diálogo do tipo (V10, M14). */
  details(kind: RteFloatingMediaKind): void;
  /** Comando puro deste arquivo (remover link/mídia, alinhar imagem). */
  exec<A extends unknown[]>(
    command: (editor: Editor, ...args: A) => boolean,
    ...args: A
  ): void;
  /**
   * Operação de tabela; `runTableOp` reensaia e recusa a bloqueada (U14). Do
   * submenu (`menu`), só com ele aberto, e o fecha depois de aplicar.
   */
  table(op: RteTableOp, menu?: RteMenu): void;
}

export function createFloatingActions(o: {
  editor: () => Editor;
  /** Editor interativo e não `hidden`. */
  enabled: () => boolean;
  state: () => RteToolbarState;
  dialog: (kind: RteDialogKind) => void;
}): RteFloatingActions {
  const ready = (): Editor | null => {
    const editor = o.editor();
    return !editor.isDestroyed && editor.isEditable && o.enabled()
      ? editor
      : null;
  };
  return {
    mark(id) {
      const editor = ready();
      if (editor && o.state().item(id)().enabled) runToolbarCommand(editor, id);
    },
    link() {
      if (ready()) o.dialog('link');
    },
    details(kind) {
      if (ready()) o.dialog(kind);
    },
    exec(command, ...args) {
      const editor = ready();
      if (editor) command(editor, ...args);
    },
    table(op, menu) {
      const editor = ready();
      if (!editor || (menu && !menu.isOpen())) return;
      if (runTableOp(editor, op)) menu?.close('none');
    },
  };
}
