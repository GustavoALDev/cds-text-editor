import type {
  RteContentLabels,
  RteEditorOptions,
  RteSlashLabels,
} from '@cds/rte-core/extensions';
import type { RteEditorConfig } from '../config';

function mergeKey<T extends object>(
  a: T | undefined,
  b: T | undefined,
): T | undefined {
  return a === undefined && b === undefined ? undefined : ({ ...a, ...b } as T);
}

/** Instância > provider; `features`, `linkPolicy`, `image` e `slash` por chave. */
export function mergeEditorConfig(
  provider: RteEditorConfig | undefined,
  instance: RteEditorConfig | undefined,
): RteEditorConfig {
  const out: Record<string, unknown> = { ...provider };
  for (const [key, value] of Object.entries(instance ?? {})) {
    if (value !== undefined) out[key] = value;
  }
  for (const key of ['features', 'linkPolicy', 'image', 'slash'] as const) {
    const merged = mergeKey<object>(provider?.[key], instance?.[key]);
    if (merged === undefined) delete out[key];
    else out[key] = merged;
  }
  return out as RteEditorConfig;
}

export function buildEditorOptions(
  config: RteEditorConfig,
  sources: {
    placeholder: () => string;
    charLimit: () => number | null;
    content: () => RteContentLabels;
    slash: () => RteSlashLabels;
  },
): RteEditorOptions {
  return {
    ...config,
    placeholder: sources.placeholder,
    charLimit: sources.charLimit,
    labels: sources.content,
    slash: { ...config.slash, labels: sources.slash },
  };
}
