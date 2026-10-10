// Engine interna (spec 04, S1): leitura, sanitização e serialização.
import type { RteHtmlSchema } from '@comodeviaser/rte-core';
import { parseHtml } from './parse';
import { sanitizeTree } from './sanitize-tree';
import { serializeNodes } from './serialize';

/** Sanitiza `html` pelo `schema`; lança `RteSanitizeError('max-depth')`. */
export function sanitizeWithSchema(
  html: string,
  schema: RteHtmlSchema,
  maxDepth: number,
): string {
  return serializeNodes(sanitizeTree(parseHtml(html, maxDepth), schema));
}
