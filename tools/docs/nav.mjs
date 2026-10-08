// Navegação do site: ordem e títulos vêm de apps/docs/content/nav.json (spec 07c, X3/X7).
export function buildNav(navJson, pages) {
  const ids = new Set(pages.map((p) => p.id));
  const listed = new Set();
  const sections = [];
  for (const section of navJson.sections ?? []) {
    const items = [];
    for (const item of section.items ?? []) {
      if (!ids.has(item.page))
        throw new Error(
          `nav.json: a página "${item.page}" (seção "${section.title}") não existe em apps/docs/content`,
        );
      if (listed.has(item.page))
        throw new Error(
          `nav.json: a página "${item.page}" aparece mais de uma vez`,
        );
      listed.add(item.page);
      items.push({ page: item.page, title: item.title });
    }
    sections.push({ title: section.title, items });
  }
  for (const id of ids)
    if (!listed.has(id))
      throw new Error(
        `a página "${id}" existe em apps/docs/content mas não está no nav.json`,
      );
  return { sections };
}

// `guia/pagina-minima` -> `guia-pagina-minima` (nome do módulo gerado).
export const moduleId = (page) => page.replaceAll('/', '-');
