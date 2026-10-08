/** Uma seção indexada (`tools/docs/search-index.mjs`); `text` já vem normalizado. */
export interface SearchEntry {
  readonly page: string;
  readonly pageTitle: string;
  readonly anchor: string;
  readonly title: string;
  readonly text: string;
}

export const MAX_RESULTS = 20;

const WEIGHT_TITLE = 10;
const WEIGHT_PAGE = 5;
const WEIGHT_TEXT = 1;
const EXACT_BONUS = 3;

/** Minúsculas e NFD sem diacríticos (igual a `normalize` do índice). */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const tokenize = (text: string): string[] =>
  normalize(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

interface Tokens {
  readonly title: string[];
  readonly page: string[];
  readonly text: string[];
}

const cache = new WeakMap<SearchEntry, Tokens>();

function tokensOf(entry: SearchEntry): Tokens {
  let t = cache.get(entry);
  if (!t) {
    t = {
      title: tokenize(entry.title),
      page: tokenize(entry.pageTitle),
      text: tokenize(entry.text),
    };
    cache.set(entry, t);
  }
  return t;
}

/** Melhor pontuação de `term` num campo: prefixo de palavra, com bônus para palavra inteira. */
function fieldScore(
  words: readonly string[],
  term: string,
  weight: number,
): number {
  let best = 0;
  for (const w of words) {
    if (!w.startsWith(term)) continue;
    best = Math.max(best, weight + (w === term ? EXACT_BONUS : 0));
    if (best >= weight + EXACT_BONUS) break;
  }
  return best;
}

/**
 * Busca no cliente: normaliza a consulta, cada termo casa por prefixo de palavra, todos os termos são
 * obrigatórios, título > página > corpo, até 20 resultados (empate mantém a ordem do índice).
 */
export function search(
  index: readonly SearchEntry[],
  query: string,
  max: number = MAX_RESULTS,
): SearchEntry[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const scored: { entry: SearchEntry; score: number; order: number }[] = [];
  index.forEach((entry, order) => {
    const t = tokensOf(entry);
    let score = 0;
    for (const term of terms) {
      const s = Math.max(
        fieldScore(t.title, term, WEIGHT_TITLE),
        fieldScore(t.page, term, WEIGHT_PAGE),
        fieldScore(t.text, term, WEIGHT_TEXT),
      );
      if (s === 0) return;
      score += s;
    }
    scored.push({ entry, score, order });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, max).map((s) => s.entry);
}
