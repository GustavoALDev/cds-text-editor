import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { RteCalloutVariant, RteContentLabels } from './types';

const VARIANTS: readonly RteCalloutVariant[] = [
  'info',
  'success',
  'warning',
  'danger',
];

/** Sem nenhum nó de texto (vazio ou só `hardBreak`): o HTML não tem texto. */
function hasNoText(node: ProseMirrorNode): boolean {
  let empty = true;
  node.forEach((child) => {
    if (child.isText) empty = false;
  });
  return empty;
}

/**
 * Rótulo que a serialização escreve no lugar de um título de caixa sem texto
 * (spec 03b, §5; 03c, C5), ou `null` se o nó não é um título vazio. A variante
 * da caixa vem de `parent.attrs.variant` (fora das 4 conhecidas, `info`).
 */
export function emptyTitleLabel(
  node: ProseMirrorNode,
  parent: ProseMirrorNode | null,
  labels: RteContentLabels,
): string | null {
  const name = node.type.name;
  if (name !== 'rtCalloutTitle' && name !== 'rtReadAlsoTitle') return null;
  if (!hasNoText(node)) return null;
  if (name === 'rtReadAlsoTitle') return labels.readAlsoTitle;
  const value: unknown = parent?.attrs['variant'];
  const variant = VARIANTS.find((v) => v === value) ?? 'info';
  return labels.calloutTitles[variant];
}
