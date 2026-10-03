import type { Transaction } from '@tiptap/pm/state';

/**
 * Intervalos do documento final tocados pelos passos da transação. Passos de
 * atributo (`AttrStep`, de `setNodeAttribute`) têm mapa vazio: entra o `pos`.
 */
export function changedRanges(tr: Transaction): [number, number][] {
  let ranges: [number, number][] = [];
  tr.mapping.maps.forEach((map, i) => {
    ranges = ranges.map(([a, b]) => [map.map(a, -1), map.map(b, 1)]);
    let any = false;
    map.forEach((_oldFrom, _oldTo, from, to) => {
      any = true;
      ranges.push([from, to]);
    });
    const step = tr.steps[i] as { pos?: unknown };
    if (!any && typeof step?.pos === 'number') {
      ranges.push([step.pos, step.pos + 1]);
    }
  });
  return ranges;
}
