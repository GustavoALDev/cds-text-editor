// Referência ingênua da busca (fora do build; spec 03c, R5): compara posição a
// posição, sem `indexOf` nem cache, para conferir o índice incremental.
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { foldCase } from '../search-index';
import type { RteSearchMatch } from '../search-index';

const WORD = /^[\p{L}\p{M}\p{N}_]$/u;

function isWordAround(text: string, from: number, to: number): boolean {
  const before = [...text.slice(0, from)].pop() ?? '';
  const after = [...text.slice(to)][0] ?? '';
  return WORD.test(before) || WORD.test(after);
}

export function referenceMatches(
  doc: ProseMirrorNode,
  query: string,
  options: { caseSensitive?: boolean; wholeWord?: boolean } = {},
): RteSearchMatch[] {
  const out: RteSearchMatch[] = [];
  if (query === '') return out;
  const same = (a: string, b: string) =>
    options.caseSensitive ? a === b : foldCase(a) === foldCase(b);
  const scan = (segment: string, base: number) => {
    let i = 0;
    while (i + query.length <= segment.length) {
      const to = i + query.length;
      if (
        same(segment.slice(i, to), query) &&
        !(options.wholeWord && isWordAround(segment, i, to))
      ) {
        out.push({ from: base + i, to: base + to });
        i = to;
      } else {
        i++;
      }
    }
  };
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Segmentos: textos seguidos, cortados por qualquer filho que não é texto.
    let segment = '';
    let base = 0;
    node.forEach((child, offset) => {
      if (child.isText) {
        if (segment === '') base = pos + 1 + offset;
        segment += child.text;
      } else {
        scan(segment, base);
        segment = '';
      }
    });
    scan(segment, base);
    return false;
  });
  return out;
}
