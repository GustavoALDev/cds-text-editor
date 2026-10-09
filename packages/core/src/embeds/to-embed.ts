import { isAllowedUrl } from '../schema/url';
import { RTE_EMBED_PROVIDERS } from './providers';
import { validateEmbedProvider } from './validate-provider';
import type { RteEmbedProvider } from '../schema/types';

export interface RteEmbed {
  provider: string;
  src: string;
  title: string;
  width: number;
  height: number;
  aspectRatio?: string;
}

const WIDTH = 640;
const HEIGHT_MAX = 10000;
const RATIO = /^([1-9]\d{0,3}) \/ ([1-9]\d{0,3})$/;

/** Hosts normalizados do provedor, ou `null` se ele for recusado pelo validador. */
function validHosts(p: RteEmbedProvider): string[] | null {
  try {
    return validateEmbedProvider(p);
  } catch {
    return null;
  }
}

/**
 * Converte uma URL de página em dados de embed. O `src` é revalidado pelo core
 * (https, host e `srcPatterns` do provedor), inclusive para provedores do consumidor.
 * Nunca lança por URL ruim ou provedor defeituoso.
 */
export function toEmbed(
  url: string,
  providers: readonly RteEmbedProvider[] = RTE_EMBED_PROVIDERS,
): RteEmbed | null {
  if (typeof url !== 'string') return null;
  for (const provider of providers) {
    const hosts = validHosts(provider);
    if (hosts === null) continue;
    try {
      if (!provider.match(url)) continue;
      const result = provider.toEmbed(url);
      if (!result) continue;
      const src = isAllowedUrl(
        {
          kind: 'url',
          schemes: ['https'],
          relative: false,
          fragment: false,
          hosts,
          patterns: [...provider.srcPatterns],
          maxLength: 2048,
        },
        result.src,
      );
      if (src === null) continue;
      const ratio =
        result.aspectRatio !== undefined
          ? RATIO.exec(result.aspectRatio)
          : null;
      const h = result.height;
      const height =
        typeof h === 'number' && Number.isInteger(h) && h > 0 && h <= 4000
          ? h
          : // Proporção extrema não pode sair do int(1, 10000) do esquema.
            Math.min(
              HEIGHT_MAX,
              Math.max(
                1,
                Math.round(
                  WIDTH /
                    (ratio ? Number(ratio[1]) / Number(ratio[2]) : 16 / 9),
                ),
              ),
            );
      const embed: RteEmbed = {
        provider: provider.id,
        src,
        title: provider.name,
        width: WIDTH,
        height,
      };
      if (ratio && result.aspectRatio !== undefined)
        embed.aspectRatio = result.aspectRatio;
      return embed;
    } catch {
      continue;
    }
  }
  return null;
}
