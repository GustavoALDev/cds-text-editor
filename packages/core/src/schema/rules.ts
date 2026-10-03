import { formatSrcset, parseSrcset } from './srcset';
import type { RteAttrRule } from './types';
import { isAllowedUrl } from './url';

type TokensRule = Extract<RteAttrRule, { kind: 'tokens' }>;

/** Minúsculas só em ASCII (sem depender de locale). */
function lowerAscii(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

/**
 * Filtra os tokens aceitos e devolve na ordem canônica da lista `values`,
 * sem repetição. `null` se nenhum token for aceito.
 */
export function serializeTokens(
  rule: TokensRule,
  value: string,
): string | null {
  if (value.length > rule.maxLength) return null;
  const given = new Set(
    (rule.separator === ' ' ? value.split(/\s+/) : value.split(';')).map((t) =>
      lowerAscii(t.trim()),
    ),
  );
  const out = rule.values.filter((v) => given.has(lowerAscii(v)));
  return out.length === 0 ? null : out.join(rule.separator);
}

/**
 * Valida o valor pela regra e devolve a forma canônica, ou `null`.
 * Idempotente: normalizar o resultado devolve o mesmo resultado.
 */
export function normalizeAttribute(
  rule: RteAttrRule,
  value: string,
): string | null {
  switch (rule.kind) {
    case 'enum': {
      const v = lowerAscii(value);
      return rule.values.find((x) => lowerAscii(x) === v) ?? null;
    }
    case 'pattern':
      if (value.length > rule.maxLength) return null;
      return new RegExp(rule.pattern).test(value) ? value : null;
    case 'int': {
      if (value.length > 15 || !/^[0-9]+$/.test(value)) return null;
      const n = Number(value);
      return n >= rule.min && n <= rule.max ? String(n) : null;
    }
    case 'bool':
      return '';
    case 'text':
      return value.length <= rule.maxLength ? value : null;
    case 'url':
      return isAllowedUrl(rule, value);
    case 'srcset': {
      if (value.length > rule.maxLength) return null;
      const candidates = parseSrcset(value);
      if (!candidates) return null;
      for (const c of candidates) {
        const url = isAllowedUrl(rule.url, c.url);
        if (url === null || /[\s,]/.test(url)) return null;
        c.url = url;
      }
      return formatSrcset(candidates);
    }
    case 'tokens':
      return serializeTokens(rule, value);
  }
}

export function matchesRule(rule: RteAttrRule, value: string): boolean {
  return normalizeAttribute(rule, value) !== null;
}
