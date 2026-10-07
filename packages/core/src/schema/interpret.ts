// Interpretadores do esquema para o sanitizador e a renderização (spec 04,
// S4–S6; ADR 0003, decisão 16). Puros e sem parser: recebem o que já foi lido.
// Nomes vindos da entrada nunca viram chave de objeto: toda busca no esquema
// passa por `Object.hasOwn`, e o estado interno fica em `Map`/`Set`.
import { isAllowedClass } from './classes';
import { normalizeAttribute, serializeTokens } from './rules';
import { applyStyleFrom, sanitizeStyle } from './style';
import type { RteAttrSpec, RteElementSpec, RteHtmlSchema } from './types';

/** Espaços ASCII do HTML (sem espaços Unicode). */
const ASCII_WS = /[ \t\n\r\f]+/;

/** `spec.attributes[name]` só com `Object.hasOwn`. */
function ownAttribute(
  spec: RteElementSpec,
  name: string,
): RteAttrSpec | undefined {
  return Object.hasOwn(spec.attributes, name)
    ? spec.attributes[name]
    : undefined;
}

/** Resultado de `sanitizeAttributes`. */
export type RteSanitizedAttributes =
  | { action: 'keep'; attributes: [name: string, value: string][] }
  /** Atributo `required` que falhou, com a ação do `onInvalid`. */
  | { action: 'remove' | 'unwrap'; attribute: string };

/**
 * `schema.elements[tag]` só com `Object.hasOwn` (`constructor`, `__proto__`
 * → `undefined`).
 */
export function getElementSpec(
  schema: RteHtmlSchema,
  tag: string,
): RteElementSpec | undefined {
  return Object.hasOwn(schema.elements, tag) ? schema.elements[tag] : undefined;
}

/**
 * Tokens (separados por espaço ASCII) aceitos por `isAllowedClass`, na ordem
 * da entrada e sem repetição; `null` se nenhum.
 */
export function sanitizeClass(
  spec: RteElementSpec,
  value: string,
): string | null {
  if (!spec.classes) return null;
  const kept = new Set<string>();
  for (const token of value.split(ASCII_WS)) {
    if (token !== '' && !kept.has(token) && isAllowedClass(spec, token)) {
      kept.add(token);
    }
  }
  return kept.size === 0 ? null : [...kept].join(' ');
}

/**
 * Sanitiza os atributos de um elemento do esquema (S5). `attributes` vem com
 * os nomes já em minúsculas, na ordem da entrada.
 *
 * 1. Mantém a ordem da entrada; com nome repetido, vale o primeiro. `class`
 *    passa por `sanitizeClass`; `style`, por `sanitizeStyle` (ou é ignorado
 *    quando há `styleFrom`); os demais, por `normalizeAttribute`.
 * 2. Atributo ausente ou inválido recebe o `default`; `required` sem valor
 *    nem `default` devolve `onInvalid` (padrão `'remove'`), o primeiro na
 *    ordem do esquema.
 * 3. `ensureTokens` acrescenta os tokens e re-serializa por `serializeTokens`.
 * 4. O que é acrescentado vai ao fim, na ordem de `spec.attributes`; por
 *    último, o `style` gerado por `styleFrom`.
 */
export function sanitizeAttributes(
  spec: RteElementSpec,
  attributes: Iterable<readonly [string, string]>,
): RteSanitizedAttributes {
  // `Map` mantém a ordem de inserção, e `set` numa chave existente reescreve
  // o valor no lugar.
  const kept = new Map<string, string>();
  const seen = new Set<string>();

  for (const [name, raw] of attributes) {
    if (seen.has(name)) continue;
    seen.add(name);
    let value: string | null = null;
    if (name === 'class') {
      value = sanitizeClass(spec, raw);
    } else if (name === 'style') {
      if (spec.styleFrom || !spec.styles) continue;
      const style = sanitizeStyle(spec.styles, raw);
      value = style === '' ? null : style;
    } else {
      const attr = ownAttribute(spec, name);
      if (attr) value = normalizeAttribute(attr.rule, raw);
    }
    if (value !== null) kept.set(name, value);
  }

  const added = new Map<string, string>();
  for (const [name, attr] of Object.entries(spec.attributes)) {
    if (kept.has(name)) continue;
    if (attr.default !== undefined) {
      added.set(name, attr.default);
    } else if (attr.required) {
      return { action: spec.onInvalid ?? 'remove', attribute: name };
    }
  }

  const current = (name: string): string | undefined =>
    kept.get(name) ?? added.get(name);

  for (const ensure of spec.ensureTokens ?? []) {
    if (ensure.when && current(ensure.when.attribute) !== ensure.when.equals) {
      continue;
    }
    const rule = ownAttribute(spec, ensure.attribute)?.rule;
    if (rule?.kind !== 'tokens') continue;
    const tokens = ensure.tokens.join(rule.separator);
    const before = current(ensure.attribute);
    const value = serializeTokens(
      rule,
      before === undefined ? tokens : before + rule.separator + tokens,
    );
    if (value === null) continue;
    if (kept.has(ensure.attribute)) kept.set(ensure.attribute, value);
    else added.set(ensure.attribute, value);
  }

  const out = [...kept];
  for (const name of Object.keys(spec.attributes)) {
    const value = added.get(name);
    if (value !== undefined) out.push([name, value]);
  }

  if (spec.styleFrom) {
    const source = current(spec.styleFrom.attribute);
    const style =
      source === undefined ? null : applyStyleFrom(spec.styleFrom, source);
    if (style !== null) out.push(['style', style]);
  }

  return { action: 'keep', attributes: out };
}

/**
 * S6: `true` se o elemento não tem `requireChild` ou se algum dos exigidos
 * ("um dentre") está em `childTags` (filhos elemento diretos já sanitizados).
 */
export function hasRequiredChild(
  spec: RteElementSpec,
  childTags: ReadonlySet<string>,
): boolean {
  const required = spec.requireChild;
  return !required || required.some((tag) => childTags.has(tag));
}
