import { contrastRatio } from '../../../packages/theme/src/color/convert';
import type { Rgb8 } from '../../../packages/theme/src/color/convert';

export type Tokens = Record<string, Rgb8>;

export interface CheckResult {
  id: string;
  ratio: number;
  min: number;
  ok: boolean;
}

function token(t: Tokens, name: string): Rgb8 {
  const v = t[name];
  if (!v) throw new Error(`token ausente: --rte-${name}`);
  return v;
}

export const ROLES = ['primary', 'secondary', 'tertiary'] as const;

/** As 10 verificações de analyze.py (C1..C6b) por papel; C4/C5 (só dependem da base) rodam uma vez. */
export function evaluateChecks(t: Tokens): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (id: string, a: string, b: string, min: number): void => {
    const ratio = contrastRatio(token(t, a), token(t, b));
    out.push({ id, ratio, min, ok: ratio >= min });
  };
  add('C4', 'focus', 'surface', 3);
  add('C5a', 'text', 'surface', 7);
  add('C5b', 'text-muted', 'surface', 4.5);
  for (const r of ROLES) {
    add(`C1:${r}`, `on-${r}`, r, 4.5);
    add(`C2a:${r}`, `on-${r}`, `${r}-hover`, 4.5);
    add(`C2b:${r}`, `on-${r}`, `${r}-active`, 4.5);
    add(`C3a:${r}`, `${r}-text`, 'surface', 4.5);
    add(`C3b:${r}`, `${r}-text`, 'surface-raised', 4.5);
    add(`C6a:${r}`, 'text', `${r}-subtle`, 4.5);
    add(`C6b:${r}`, `${r}-text`, `${r}-subtle`, 4.5);
  }
  return out;
}

/** Falhas (texto legível), vazio quando tudo passa. */
export function runChecks(t: Tokens): string[] {
  return evaluateChecks(t)
    .filter((c) => !c.ok)
    .map((c) => `${c.id} ${c.ratio.toFixed(3)} < ${c.min}`);
}
