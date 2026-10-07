import { normalizeHref, type RteLinkPolicy } from '@cds/rte-core';
import { inspectRteHtml, type RteHtmlInspection } from '@cds/rte-core/html';

/** Opções de `rteSafeLinks` / `RteValidators.safeLinks`. */
export interface RteSafeLinksOptions {
  /** Política de links (mesclada com a padrão do core); padrão: a padrão do core. */
  readonly policy?: Partial<RteLinkPolicy>;
}

const EMPTY: RteHtmlInspection = { hrefs: [], emptyHeadings: 0 };
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

/** Quantos `href` a política recusa e os primeiros 5 (sem repetir). */
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
  return { count, hrefs };
}
