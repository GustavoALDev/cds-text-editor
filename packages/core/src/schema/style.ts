import { normalizeAttribute } from './rules';
import type { RteAttrRule, RteElementSpec } from './types';

/** Espaços ASCII (sem depender de locale nem de espaços Unicode). */
const ASCII_WS = /[ \t\n\r\f]+/g;

function trimAscii(s: string): string {
  return s.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, '');
}

function lowerAscii(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

/**
 * Sanitiza o texto de um atributo `style` pelas regras do esquema e devolve a
 * forma canônica `prop: valor; prop: valor`, na ordem das chaves de `styles`
 * (`''` se nada sobra). Barra invertida, comentário e `expression` descartam o
 * estilo inteiro; `!important`, `url(` e valor inválido descartam só a
 * declaração. Havendo repetição, a última declaração válida vale.
 */
export function sanitizeStyle(
  styles: Record<string, RteAttrRule>,
  styleText: string,
): string {
  if (
    styleText.includes('\\') ||
    styleText.includes('/*') ||
    styleText.includes('*/') ||
    lowerAscii(styleText).includes('expression')
  ) {
    return '';
  }
  const found = new Map<string, string>();
  for (const decl of styleText.split(';')) {
    const colon = decl.indexOf(':');
    if (colon < 0) continue;
    const prop = lowerAscii(trimAscii(decl.slice(0, colon)));
    const rule = Object.hasOwn(styles, prop) ? styles[prop] : undefined;
    if (!rule) continue;
    const raw = trimAscii(decl.slice(colon + 1)).replace(ASCII_WS, ' ');
    const lower = lowerAscii(raw);
    if (lower.includes('!') || lower.includes('url(')) continue;
    const value = normalizeAttribute(rule, raw);
    if (value === null) continue;
    found.set(prop, value);
  }
  const out: string[] = [];
  for (const prop of Object.keys(styles)) {
    const value = found.get(prop);
    if (value !== undefined) out.push(`${prop}: ${value}`);
  }
  return out.join('; ');
}

/**
 * Regenera o `style` a partir do nome do atributo (A3: nunca lido da entrada).
 * `null` se o valor não está no mapa da paleta.
 */
export function applyStyleFrom(
  spec: NonNullable<RteElementSpec['styleFrom']>,
  attributeValue: string,
): string | null {
  if (!Object.hasOwn(spec.map, attributeValue)) return null;
  return `${spec.property}: ${spec.map[attributeValue]}`;
}
