import { normalizeHref, type RteLinkPolicy } from '@cds/rte-core';
import { inspectRteHtml, type RteHtmlInspection } from '@cds/rte-core/html';

/** Opções de `rteSafeLinks` / `RteValidators.safeLinks`. */
export interface RteSafeLinksOptions {
  /** Política de links (mesclada com a padrão do core); padrão: a padrão do core. */
  readonly policy?: Partial<RteLinkPolicy>;
}

const EMPTY: RteHtmlInspection = {
  hrefs: [],
  emptyHeadings: 0,
  truncated: false,
};
const MAX_LISTED = 5;

let lastValue: string | undefined;
let lastResult: RteHtmlInspection | undefined;

/** Lê o valor (links e títulos vazios); o último par valor→resultado fica em cache. */
export function inspectValue(
  html: string | null | undefined,
): RteHtmlInspection {
  if (typeof html !== 'string' || html === '') return EMPTY;
  if (lastResult && lastValue === html) return lastResult;
  lastValue = html;
  lastResult = inspectRteHtml(html);
  return lastResult;
}

/**
 * Quantos `href` a política recusa e os primeiros 5 (sem repetir). Um HTML
 * aninhado além do limite de leitura (`truncated`) não pôde ser verificado por
 * inteiro: conta como mais um link inseguro (sem `href` listado), para que o
 * aninhamento hostil não esconda `javascript:` do validador.
 */
export function findUnsafeLinks(
  html: string | null | undefined,
  policy: Partial<RteLinkPolicy> | undefined,
): { count: number; hrefs: string[] } {
  let count = 0;
  const hrefs: string[] = [];
  for (const href of inspectValue(html).hrefs) {
    if (normalizeHref(href, policy) !== null) continue;
    count++;
    if (hrefs.length < MAX_LISTED && !hrefs.includes(href)) hrefs.push(href);
  }
  if (inspectValue(html).truncated) count++;
  return { count, hrefs };
}

/**
 * Títulos `h2`–`h4` vazios; HTML `truncated` (aninhado além do limite de
 * leitura) conta como mais um, pois não pôde ser verificado por inteiro.
 */
export function countEmptyHeadings(html: string | null | undefined): number {
  const r = inspectValue(html);
  return r.emptyHeadings + (r.truncated ? 1 : 0);
}
