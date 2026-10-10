import type { RteTheme } from '@comodeviaser/rte-theme';

const KEYS = ['primary', 'secondary', 'tertiary', 'mode', 'neutral'] as const;

/**
 * Tema efetivo (U15): mescla por chave, instância > provider; valor
 * `undefined` não apaga o do provider. Sem nenhuma chave definida, `undefined`
 * (vale o CSS em cascata).
 */
export function mergeTheme(
  provider: RteTheme | undefined,
  instance: RteTheme | undefined,
): RteTheme | undefined {
  const merged: Record<string, string> = {};
  for (const source of [provider, instance]) {
    if (!source) continue;
    for (const key of KEYS) {
      const value = source[key];
      if (value !== undefined) merged[key] = value;
    }
  }
  return Object.keys(merged).length ? (merged as RteTheme) : undefined;
}

/** Igualdade por valor nas chaves do tema. */
export function sameTheme(
  a: RteTheme | undefined,
  b: RteTheme | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return KEYS.every((key) => a[key] === b[key]);
}

/** Chave estável do tema (para avisar uma vez por tema diferente). */
export function themeKey(t: RteTheme): string {
  return JSON.stringify(KEYS.map((key) => t[key] ?? null));
}
