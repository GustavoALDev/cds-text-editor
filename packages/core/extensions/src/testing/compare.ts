// Normalização para comparar a saída canônica com `editor.getHTML()` (fora do
// build; usada no Vitest e no E2E, spec 03b, §7.2 item 3 e E1). Sem Node: só DOM.
import { applyStyleFrom, sanitizeStyle } from '../../../src/schema/style';
import type { RteHtmlSchema } from '../../../src/schema/types';

const HEADINGS = new Set(['h2', 'h3', 'h4']);

/**
 * Analisa `html` com o `DOMParser` de `doc`, retira o `id` de `h2`–`h4` e
 * reescreve cada `style` como o esquema o canonicaliza (`applyStyleFrom` com
 * `styleFrom`, senão `sanitizeStyle`) como último atributo; devolve o HTML
 * reescrito.
 */
export function normalizeForCompare(
  html: string,
  schema: RteHtmlSchema,
  doc: Document,
): string {
  const Parser = doc.defaultView?.DOMParser ?? globalThis.DOMParser;
  const parsed = new Parser().parseFromString(
    `<!doctype html><body>${html}</body>`,
    'text/html',
  );
  for (const el of Array.from(parsed.body.querySelectorAll('*'))) {
    const tag = el.localName;
    if (HEADINGS.has(tag)) el.removeAttribute('id');
    const style = el.getAttribute('style');
    if (style === null) continue;
    const spec = Object.hasOwn(schema.elements, tag)
      ? schema.elements[tag]
      : undefined;
    let clean: string | null = '';
    if (spec?.styleFrom) {
      const value = el.getAttribute(spec.styleFrom.attribute);
      clean = value === null ? null : applyStyleFrom(spec.styleFrom, value);
    } else if (spec?.styles) {
      clean = sanitizeStyle(spec.styles, style);
    }
    // Sempre como último atributo: Chromium e WebKit reescrevem o `style` (e o
    // movem para o fim) ao adotar o elemento em outro documento, como faz o
    // `getHTML()` do Tiptap; a posição dele não faz parte do contrato.
    el.removeAttribute('style');
    if (clean) el.setAttribute('style', clean);
  }
  const outer = parsed.body.outerHTML;
  return outer.slice('<body>'.length, outer.length - '</body>'.length);
}
