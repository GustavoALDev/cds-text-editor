// Índice de busca offline do site (spec 07c, X8): uma entrada por seção h2/h3 de cada página.
// Entrada: páginas no formato gerado (`id`, `title`, `segments` com `html` já checado). As seções vêm
// das tags <h2 id>/<h3 id> do HTML; o texto antes do primeiro título entra com âncora vazia.

export const MAX_INDEX_BYTES = 400 * 1024;
/** Trecho máximo por seção (caracteres), para o índice da API não inflar o download. */
export const MAX_SECTION_CHARS = 700;

/** Minúsculas, NFD sem diacríticos. Idêntico a `normalize` de search-logic.ts. */
export function normalize(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

export function htmlToPlain(html) {
  return html
    .replace(
      /<\/?(?:p|li|ul|ol|div|h[1-6]|pre|br|tr|td|th|table|section|dd|dt|dl)\b[^>]*>/gi,
      ' ',
    )
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim();
}

const HEADING = /<(h[23])\b([^>]*)>([\s\S]*?)<\/\1>/gi;

/** Entradas `{ page, pageTitle, anchor, title, text }` de uma página. */
export function pageEntries(page) {
  const html = (page.segments ?? [])
    .filter((s) => typeof s.html === 'string')
    .map((s) => s.html)
    .join('\n');
  const entries = [];
  let last = 0;
  let current = { anchor: '', title: page.title };
  const flush = (end) => {
    const text = htmlToPlain(html.slice(last, end));
    if (text || current.anchor)
      entries.push({
        page: page.id,
        pageTitle: page.title,
        anchor: current.anchor,
        title: current.title,
        text: normalize(text).slice(0, MAX_SECTION_CHARS).trim(),
      });
  };
  for (const m of html.matchAll(HEADING)) {
    const id = /\bid="([^"]*)"/.exec(m[2])?.[1];
    if (!id) continue;
    flush(m.index);
    last = m.index + m[0].length;
    current = { anchor: id, title: htmlToPlain(m[3]) };
  }
  flush(html.length);
  return entries;
}

export function buildSearchIndex(pages) {
  return pages.flatMap(pageEntries);
}

/** Falha (pt-BR) se o JSON do índice passa do teto em bytes UTF-8. */
export function assertIndexSize(json, max = MAX_INDEX_BYTES) {
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > max)
    throw new Error(
      `search-index.json tem ${(bytes / 1024).toFixed(1)} KB, acima do teto de ${(max / 1024).toFixed(0)} KB; reduza o conteúdo indexado (MAX_SECTION_CHARS) ou a API`,
    );
  return bytes;
}
