import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/** Teto de resultados indexados e decorados (spec 03c, C10). */
export const SEARCH_CAP = 1000;
/** Consulta cortada neste número de unidades UTF-16 (sem partir par). */
export const MAX_SEARCH_QUERY = 1000;

/** Resultado da busca: posições do documento (ordem de documento). */
export interface RteSearchMatch {
  /** Início do trecho no documento do editor. */
  from: number;
  /** Fim do trecho (exclusivo) no documento do editor. */
  to: number;
}

/** Interno (testes, R5): blocos de texto indexados (faltas no cache). */
export const searchProbe = { blocks: 0 };

/**
 * Dobra de caixa por ponto de código (C8): `toLowerCase()` sem locale, só
 * quando o comprimento se mantém — as posições continuam exatas.
 */
export function foldCase(text: string): string {
  let out = '';
  for (const c of text) {
    const lower = c.toLowerCase();
    out += lower.length === c.length ? lower : c;
  }
  return out;
}

/**
 * Início de cada resultado no segmento (sem sobreposição); `queryLength` é o
 * comprimento de todo resultado (a dobra preserva o comprimento).
 */
export type Matcher = ((segment: string) => readonly number[]) & {
  readonly queryLength: number;
};

const WORD = /[\p{L}\p{M}\p{N}_]/u;

/** Ponto de código que termina em `end` (exclusivo), ou `''` no início. */
function codePointBefore(text: string, end: number): string {
  if (end <= 0) return '';
  const low = text.charCodeAt(end - 1);
  if (end >= 2 && low >= 0xdc00 && low <= 0xdfff) {
    const high = text.charCodeAt(end - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.slice(end - 2, end);
  }
  return text[end - 1] ?? '';
}

function codePointAt(text: string, start: number): string {
  const cp = text.codePointAt(start);
  return cp === undefined ? '' : String.fromCodePoint(cp);
}

/** Vizinhos (ponto de código antes e depois) não são letra, marca, número ou `_`. */
export function isWholeWord(text: string, from: number, to: number): boolean {
  return (
    !WORD.test(codePointBefore(text, from)) && !WORD.test(codePointAt(text, to))
  );
}

/**
 * Busca literal (C8): `indexOf` sobre o texto dobrado — nada é interpretado
 * como expressão. `null` para consulta vazia.
 */
export function createMatcher(
  query: string,
  options: { caseSensitive: boolean; wholeWord: boolean },
): Matcher | null {
  if (query === '') return null;
  const needle = options.caseSensitive ? query : foldCase(query);
  const size = needle.length;
  const match = (segment: string): readonly number[] => {
    const hay = options.caseSensitive ? segment : foldCase(segment);
    const starts: number[] = [];
    let i = hay.indexOf(needle);
    while (i !== -1) {
      if (options.wholeWord && !isWholeWord(segment, i, i + size)) {
        i = hay.indexOf(needle, i + 1);
      } else {
        starts.push(i);
        i = hay.indexOf(needle, i + size);
      }
    }
    return starts;
  };
  return Object.assign(match, { queryLength: size });
}

/**
 * Resultados de um bloco de texto, em deslocamentos no seu conteúdo (C9):
 * atravessa marcas; todo filho que não é texto (inclusive `hardBreak`) corta o
 * segmento.
 */
export function blockMatches(
  node: ProseMirrorNode,
  matcher: Matcher,
): readonly (readonly [number, number])[] {
  searchProbe.blocks++;
  const found: (readonly [number, number])[] = [];
  let segment = '';
  let start = 0;
  const flush = () => {
    for (const s of matcher(segment)) {
      found.push([start + s, start + s + matcher.queryLength]);
    }
    segment = '';
  };
  node.forEach((child, offset) => {
    if (child.isText) {
      if (segment === '') start = offset;
      segment += child.text ?? '';
    } else {
      flush();
    }
  });
  flush();
  return found;
}

/**
 * Resultados do documento em ordem, sem descer nos blocos de texto. O `cache`
 * (por nó, do mesmo `matcher`) poupa os blocos inalterados; para no
 * `cap + 1`º resultado (`capped: true`, devolve `cap`).
 */
export function collectMatches(
  doc: ProseMirrorNode,
  matcher: Matcher,
  cache: WeakMap<ProseMirrorNode, readonly (readonly [number, number])[]>,
  cap: number,
): { matches: RteSearchMatch[]; capped: boolean } {
  const matches: RteSearchMatch[] = [];
  let capped = false;
  doc.descendants((node, pos) => {
    if (capped) return false;
    if (!node.isTextblock) return true;
    let local = cache.get(node);
    if (local === undefined) {
      local = blockMatches(node, matcher);
      cache.set(node, local);
    }
    for (const [from, to] of local) {
      if (matches.length === cap) {
        capped = true;
        break;
      }
      matches.push({ from: pos + 1 + from, to: pos + 1 + to });
    }
    return false;
  });
  return { matches, capped };
}
