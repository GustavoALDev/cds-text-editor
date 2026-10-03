import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';

/**
 * Intervalos do documento final (`doc`) tocados pelos passos de um lote de
 * transações (o `transactions` de `appendTransaction`, ou `[tr]`). Cada
 * intervalo é mapeado pelos passos seguintes, inclusive os das transações
 * posteriores do lote, e sai limitado a `0..doc.content.size` com `a <= b`.
 *
 * Passos com mapa vazio entram pelas posições próprias: `pos` em `AttrStep`
 * (`setNodeAttribute`) e `AddNodeMarkStep`; `from`/`to` em `AddMarkStep` e
 * `RemoveMarkStep`.
 */
export function changedRanges(
  transactions: readonly Transaction[],
  doc: ProseMirrorNode,
): [number, number][] {
  let ranges: [number, number][] = [];
  for (const tr of transactions) {
    tr.mapping.maps.forEach((map, i) => {
      ranges = ranges.map(([a, b]) => [map.map(a, -1), map.map(b, 1)]);
      let any = false;
      map.forEach((_oldFrom, _oldTo, from, to) => {
        any = true;
        ranges.push([from, to]);
      });
      if (any) return;
      const step = tr.steps[i] as {
        pos?: unknown;
        from?: unknown;
        to?: unknown;
      };
      if (typeof step?.pos === 'number') {
        ranges.push([step.pos, step.pos + 1]);
      } else if (
        typeof step?.from === 'number' &&
        typeof step.to === 'number'
      ) {
        ranges.push([step.from, step.to]);
      }
    });
  }
  const size = doc.content.size;
  const clamp = (n: number) => Math.max(0, Math.min(n, size));
  return ranges.map(([a, b]) => [clamp(Math.min(a, b)), clamp(Math.max(a, b))]);
}
