/**
 * Fonte única dos limites de equivalência entre o CSS nativo (cores relativas) e o plano B em TS.
 * Usados por `fallback-equivalence.spec.ts` (grade de sementes) e `property.spec.ts` (sementes
 * aleatórias, 3 motores).
 */

export type Group = 'linear' | 'text' | 'neutral' | 'border';

/**
 * Limites de ΔE por grupo. Limites da spec (R7): linear ~0, neutro <= 0,019, borda <= 0,041.
 * Medidos aqui (matriz OKLab corrigida), neutros e bordas ficam em ~0,0035 (1 unidade de 8 bits),
 * então 0,019 e 0,041 não detectariam uma constante de neutro alterada; os limites de neutro e de
 * borda abaixo são mais apertados que os da spec de propósito (a spec continua válida com folga).
 * `linear` e `text` ficam no piso de quantização (0 e 1 unidade de 8 bits, ~0,0028).
 */
export const LIMITS: Record<Group, number> = {
  linear: 0.002,
  text: 0.004,
  neutral: 0.006,
  border: 0.006,
};

/** Desvio máximo de matiz (distância (a, b) em OKLab, ver o teste) por neutro e token. */
export const HUE_LIMITS = {
  'gray-subtle': 0.004,
  'gray-border': 0.004,
  'tinted-subtle': 0.016,
  'tinted-border': 0.01,
};

export function groupOf(token: string): Group | null {
  if (/^(primary|secondary|tertiary)$/.test(token)) return null; // semente: idêntica nos dois planos
  if (/^on-|-hover$|-active$/.test(token)) return 'linear';
  if (token === 'focus' || token.endsWith('-text')) {
    return token === 'text' ? 'neutral' : 'text';
  }
  if (token.endsWith('-border')) return 'border';
  return 'neutral'; // surface, surface-raised, text, text-muted, border, *-subtle
}

/**
 * Piso de quantização: canais de 8 bits que diferem por no máximo `steps` unidades. Perto do preto
 * o canvas pode arredondar o valor nativo (float) e o do plano B (hex) para lados opostos de uma
 * fronteira, e uma unidade ali vale ΔE ~0,012 (muito acima do limite de ~0,0028 de meio de tom).
 * Achado da propriedade (b): `hsl(0 0% 1%)` no modo escuro, `primary-hover` 3,3,3 × 2,2,2.
 */
export function withinQuantStep(
  a: readonly number[],
  b: readonly number[],
  steps = 1,
): boolean {
  return a.every((v, i) => Math.abs(v - b[i]!) <= steps);
}
