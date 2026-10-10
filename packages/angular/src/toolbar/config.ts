import { isDevMode } from '@angular/core';
import type { RteFeatureId } from '@comodeviaser/rte-core';
import {
  RTE_TOOLBAR_ITEMS,
  RTE_TOOLBAR_PRESETS,
  type RteToolbarConfig,
  type RteToolbarItemId,
} from './items';

/** Prioridade: entrada > provider > `'article'` (U8). */
export function pickToolbarConfig(
  instance: RteToolbarConfig | undefined,
  provider: RteToolbarConfig | undefined,
): RteToolbarConfig {
  return instance ?? provider ?? 'article';
}

export interface ResolveToolbarContext {
  features: readonly RteFeatureId[];
  /** `features.search` ligado (padrão do core); o item `search` depende dele. */
  search: boolean;
  hasCodeLanguages: boolean;
  /** Algum provedor de *embed* ativo (sem ele o item `embed` sai; V9). */
  hasEmbedProviders: boolean;
  /** Avisos já emitidos (um por id e por conjunto). */
  warned: Set<string>;
}

function warnOnce(warned: Set<string>, key: string, message: string): void {
  if (!isDevMode() || warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

function isPreset(value: unknown): value is keyof typeof RTE_TOOLBAR_PRESETS {
  return typeof value === 'string' && Object.hasOwn(RTE_TOOLBAR_PRESETS, value);
}

/**
 * Descrição para aviso sem lançar: `String()` lança em objeto sem protótipo
 * (ou com `toString` inválido) e o template literal lança em `Symbol`.
 */
function describeValue(value: unknown): string {
  if (
    (typeof value === 'object' && value !== null) ||
    typeof value === 'function'
  )
    return Object.prototype.toString.call(value);
  return String(value);
}

function isKnown(id: unknown): id is RteToolbarItemId {
  return typeof id === 'string' && Object.hasOwn(RTE_TOOLBAR_ITEMS, id);
}

/**
 * Grupos finais da barra: ids desconhecidos e repetidos ignorados com aviso,
 * itens de recurso desligado removidos e grupos vazios descartados (U8).
 */
export function resolveToolbarGroups(
  config: RteToolbarConfig,
  ctx: ResolveToolbarContext,
): readonly (readonly RteToolbarItemId[])[] {
  if (config === false) return [];
  let groups: readonly (readonly unknown[])[];
  if (isPreset(config)) groups = RTE_TOOLBAR_PRESETS[config];
  else if (Array.isArray(config)) groups = config;
  else {
    warnOnce(
      ctx.warned,
      '\0toolbar',
      "[rte-editor] toolbar inválido; usando 'article'.",
    );
    groups = RTE_TOOLBAR_PRESETS.article;
  }

  const seen = new Set<string>();
  const out: RteToolbarItemId[][] = [];
  for (const group of groups) {
    const kept: RteToolbarItemId[] = [];
    if (!Array.isArray(group)) {
      const name = describeValue(group);
      warnOnce(
        ctx.warned,
        `group:${name}`,
        `[rte-editor] grupo de barra inválido ignorado (esperado um array): ${name}.`,
      );
      continue;
    }
    for (const id of group as readonly unknown[]) {
      if (!isKnown(id)) {
        const name = describeValue(id);
        warnOnce(
          ctx.warned,
          `unknown:${name}`,
          `[rte-editor] item de barra desconhecido ignorado: "${name}".`,
        );
        continue;
      }
      if (seen.has(id)) {
        warnOnce(
          ctx.warned,
          `dup:${id}`,
          `[rte-editor] item de barra repetido ignorado: "${id}".`,
        );
        continue;
      }
      seen.add(id);
      const { feature } = RTE_TOOLBAR_ITEMS[id];
      if (feature === 'search') {
        if (!ctx.search) continue;
      } else if (feature !== null && !ctx.features.includes(feature)) {
        continue;
      }
      if (id === 'codeLanguage' && !ctx.hasCodeLanguages) continue;
      if (id === 'embed' && !ctx.hasEmbedProviders) continue;
      kept.push(id);
    }
    if (kept.length > 0) out.push(kept);
  }
  return out;
}
