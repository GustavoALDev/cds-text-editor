import type {
  RteCalloutVariant,
  RteContentLabels,
  RteContentLabelsSource,
} from './types';

const VARIANTS: readonly RteCalloutVariant[] = [
  'info',
  'success',
  'warning',
  'danger',
];

function pack(
  calloutTitles: Record<RteCalloutVariant, string>,
  readAlsoTitle: string,
  taskPrefix: string,
): RteContentLabels {
  return Object.freeze({
    calloutTitles: Object.freeze(calloutTitles),
    readAlsoTitle,
    taskCheckbox: (text: string) => `${taskPrefix}: ${text}`,
  });
}

/** Pacotes de rótulos pt-BR, en e es (congelados). O padrão é `en`. */
export const RTE_CONTENT_LABELS: Readonly<
  Record<'pt-BR' | 'en' | 'es', RteContentLabels>
> = Object.freeze({
  'pt-BR': pack(
    {
      info: 'Informação',
      success: 'Sucesso',
      warning: 'Atenção',
      danger: 'Perigo',
    },
    'Leia também',
    'Tarefa',
  ),
  en: pack(
    {
      info: 'Information',
      success: 'Success',
      warning: 'Warning',
      danger: 'Danger',
    },
    'Read also',
    'Task',
  ),
  es: pack(
    {
      info: 'Información',
      success: 'Éxito',
      warning: 'Atención',
      danger: 'Peligro',
    },
    'Lee también',
    'Tarea',
  ),
});

/** Função que lança ou não devolve objeto vale como ausente (lição 4). */
function readSource(
  source: RteContentLabelsSource | undefined,
): Partial<RteContentLabels> | undefined {
  let value: unknown = source;
  if (typeof source === 'function') {
    try {
      value = source();
    } catch {
      return undefined;
    }
  }
  return value !== null && typeof value === 'object'
    ? (value as Partial<RteContentLabels>)
    : undefined;
}

/**
 * `taskCheckbox` do consumidor roda a cada renderização da tarefa (inclusive
 * durante a digitação): se lançar ou não devolver texto, vale o rótulo `en`
 * (lição 4).
 */
function guardTaskCheckbox(
  fn: unknown,
  fallback: RteContentLabels['taskCheckbox'],
): RteContentLabels['taskCheckbox'] {
  const consumer = fn as (text: string) => unknown;
  return (text) => {
    try {
      const result = consumer(text);
      return typeof result === 'string' ? result : fallback(text);
    } catch {
      return fallback(text);
    }
  };
}

/**
 * Resolve a fonte de rótulos sobre `en`. Uma fonte por função é chamada a
 * cada resolução; `calloutTitles` é mesclado variante a variante. Só chaves
 * próprias com valor do tipo esperado são aceitas.
 */
export function resolveContentLabels(
  source?: RteContentLabelsSource,
): RteContentLabels {
  const base = RTE_CONTENT_LABELS.en;
  const partial = readSource(source);
  const titles = { ...base.calloutTitles };
  const given: unknown = partial?.calloutTitles;
  if (given !== null && typeof given === 'object') {
    for (const variant of VARIANTS) {
      if (!Object.hasOwn(given, variant)) continue;
      const value: unknown = (given as Record<string, unknown>)[variant];
      if (typeof value === 'string') titles[variant] = value;
    }
  }
  const readAlsoTitle: unknown =
    partial && Object.hasOwn(partial, 'readAlsoTitle')
      ? partial.readAlsoTitle
      : undefined;
  const taskCheckbox: unknown =
    partial && Object.hasOwn(partial, 'taskCheckbox')
      ? partial.taskCheckbox
      : undefined;
  return {
    calloutTitles: titles,
    readAlsoTitle:
      typeof readAlsoTitle === 'string' ? readAlsoTitle : base.readAlsoTitle,
    taskCheckbox:
      typeof taskCheckbox === 'function'
        ? guardTaskCheckbox(taskCheckbox, base.taskCheckbox)
        : base.taskCheckbox,
  };
}
