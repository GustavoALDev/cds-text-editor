import type { RteTocEntry } from '@comodeviaser/rte-core/html';

/**
 * Nó do sumário: a entrada e as entradas aninhadas sob ela (H11).
 *
 * @internal
 */
export interface RteTocNode {
  readonly entry: RteTocEntry;
  readonly children: readonly RteTocNode[];
}

/** Entradas com `id` único: a primeira ocorrência vence (H11, como a S7). */
export function uniqueTocEntries(
  entries: readonly RteTocEntry[],
): RteTocEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

/**
 * Árvore do sumário por pilha (H11): desempilha enquanto o nível do topo for
 * maior ou igual ao da entrada; a entrada vira filha do topo ou raiz. Assim um
 * nível que salta (h4 sem h3) fica sob o último anterior, e um título sem
 * ancestral no nível de cima vira raiz.
 */
export function buildTocTree(entries: readonly RteTocEntry[]): RteTocNode[] {
  const roots: RteTocNode[] = [];
  const stack: { entry: RteTocEntry; children: RteTocNode[] }[] = [];
  for (const entry of entries) {
    let top = stack.at(-1);
    while (top && top.entry.level >= entry.level) {
      stack.pop();
      top = stack.at(-1);
    }
    const node = { entry, children: [] as RteTocNode[] };
    (top ? top.children : roots).push(node);
    stack.push(node);
  }
  return roots;
}
