import type { RteCodeLanguage } from '../../code-languages/src/index';
import { RTE_EMBED_PROVIDERS } from '../../src/embeds/providers';
import { RTE_DEFAULT_LINK_POLICY } from '../../src/links';
import type { RteLinkPolicy } from '../../src/links';
import { getHtmlSchema } from '../../src/schema/get-html-schema';
import type { RteEmbedProvider, RteHtmlSchema } from '../../src/schema/types';
import { resolveContentLabels } from './labels';
import type { RteContentLabels, RteEditorOptions } from './types';

/** Valores que a fábrica entrega a cada extensão (montados uma vez). */
export interface RteExtensionContext {
  schema: RteHtmlSchema;
  idPrefix: string;
  linkPolicy: RteLinkPolicy;
  providers: readonly RteEmbedProvider[];
  codeLanguages: readonly RteCodeLanguage[];
  imageMinWidth: number;
  /** Rótulos resolvidos a cada chamada (lição 4). */
  labels(): RteContentLabels;
}

const DEFAULT_IMAGE_MIN_WIDTH = 48;

/**
 * Contexto das extensões a partir das opções da fábrica. `getHtmlSchema` é
 * chamado uma vez e lança como ele (`RangeError`/`TypeError`) para opções
 * inválidas.
 */
export function createExtensionContext(
  options: RteEditorOptions = {},
): RteExtensionContext {
  const schema = getHtmlSchema(options);
  const source = options.labels;
  return {
    schema,
    idPrefix: schema.idPrefix,
    linkPolicy: { ...RTE_DEFAULT_LINK_POLICY, ...options.linkPolicy },
    providers: options.embedProviders ?? RTE_EMBED_PROVIDERS,
    codeLanguages: options.codeLanguages ?? [],
    imageMinWidth: options.image?.minWidth ?? DEFAULT_IMAGE_MIN_WIDTH,
    labels: () => resolveContentLabels(source),
  };
}
