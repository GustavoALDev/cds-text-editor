// Âncoras de título: slug ASCII determinístico (spec 07c, X3).
export function slug(title) {
  return String(title)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Slugs únicos por página; colisão (inclusive "A" e "Á") falha o build.
export function uniqueSlugs(titles, page = '(página)') {
  const seen = new Map();
  const out = [];
  for (const title of titles) {
    const s = slug(title);
    if (!s)
      throw new Error(
        `página ${page}: o título "${title}" não gera âncora (sem letras ou números)`,
      );
    if (seen.has(s))
      throw new Error(
        `página ${page}: âncora duplicada "${s}" pelos títulos "${seen.get(s)}" e "${title}"; renomeie um deles`,
      );
    seen.set(s, title);
    out.push(s);
  }
  return out;
}
