import type { RteElementSpec } from './types';

const MAX_CLASS_LENGTH = 128;
const ASCII_SPACE = /[ \t\n\r\f]/;
const patternCache = new Map<string, RegExp>();

function compile(pattern: string): RegExp {
  let re = patternCache.get(pattern);
  if (!re) {
    re = new RegExp(pattern);
    patternCache.set(pattern, re);
  }
  return re;
}

/**
 * Diz se um token de `class` é aceito pelo elemento: está em `classes.values`
 * ou casa um dos `classes.patterns` (regex ancoradas do esquema). Token vazio,
 * com espaço ASCII ou acima de 128 caracteres é recusado antes de qualquer regex.
 */
export function isAllowedClass(spec: RteElementSpec, token: string): boolean {
  const classes = spec.classes;
  if (!classes) return false;
  if (
    token.length === 0 ||
    token.length > MAX_CLASS_LENGTH ||
    ASCII_SPACE.test(token)
  ) {
    return false;
  }
  if (classes.values?.includes(token)) return true;
  return (classes.patterns ?? []).some((p) => compile(p).test(token));
}
