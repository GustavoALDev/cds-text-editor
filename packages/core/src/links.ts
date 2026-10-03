import { REL_VALUES } from './schema/features';
import type { RteUrlRule } from './schema/types';
import { isAllowedUrl } from './schema/url';

/** Política de links (seção 7 da spec 03a). */
export interface RteLinkPolicy {
  protocols: string[];
  allowRelative: boolean;
  defaultRel: string[];
  forceRel: string[];
  blockedDomains: string[];
  target: 'preserve' | 'blank' | 'never';
}

export const DEFAULT_LINK_POLICY: Readonly<RteLinkPolicy> = Object.freeze({
  protocols: Object.freeze(['https', 'http', 'mailto', 'tel']) as string[],
  allowRelative: true,
  defaultRel: Object.freeze([]) as unknown as string[],
  forceRel: Object.freeze([]) as unknown as string[],
  blockedDomains: Object.freeze([]) as unknown as string[],
  target: 'preserve',
});

const URL_MAX = 2048;
const EMAIL = /^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/;
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#].*)?$/i;

function resolvePolicy(policy: Partial<RteLinkPolicy>): RteLinkPolicy {
  return { ...DEFAULT_LINK_POLICY, ...policy };
}

function normalizeBlocked(domains: readonly string[]): string[] {
  return domains.map((d) => {
    if (typeof d !== 'string' || d.includes('*') || d.trim() === '') {
      throw new TypeError(
        `linkPolicy.blockedDomains: host "${String(d)}" inválido.`,
      );
    }
    return d.trim().toLowerCase().replace(/\.$/, '');
  });
}

function relTokens(option: string, tokens: readonly string[]): string[] {
  return tokens.map((t) => {
    const v = typeof t === 'string' ? t.trim().toLowerCase() : '';
    if (!REL_VALUES.includes(v)) {
      throw new TypeError(
        `linkPolicy.${option}: token "${String(t)}" fora de ${REL_VALUES.join(' ')}.`,
      );
    }
    return v;
  });
}

function urlRule(policy: RteLinkPolicy): RteUrlRule {
  const rule: RteUrlRule = {
    kind: 'url',
    schemes: [...policy.protocols],
    relative: policy.allowRelative,
    fragment: policy.allowRelative,
    maxLength: URL_MAX,
  };
  const blocked = normalizeBlocked(policy.blockedDomains);
  if (blocked.length > 0) rule.blockedHosts = blocked;
  return rule;
}

/**
 * Normaliza o que o usuário digitou num href seguro e serializado pelo WHATWG
 * URL, ou `null` se a política o rejeitar. `site.com` vira `https://site.com/`
 * e `a@b.com` vira `mailto:a@b.com`.
 */
export function normalizeHref(
  input: string,
  policy: Partial<RteLinkPolicy> = {},
): string | null {
  const p = resolvePolicy(policy);
  const rule = urlRule(p);
  if (typeof input !== 'string' || input.length > URL_MAX) return null;
  const v = input.trim();
  if (v === '') return null;
  if (EMAIL.test(v)) return isAllowedUrl(rule, `mailto:${v}`);
  if (BARE_DOMAIN.test(v)) return isAllowedUrl(rule, `https://${v}`);
  return isAllowedUrl(rule, v);
}

/**
 * Atributos de um `<a>` conforme a política: `href` normalizado, `rel` em
 * ordem canônica e `target` só quando cabe. `null` se o href for inválido.
 */
export function getLinkAttributes(
  href: string,
  policy: Partial<RteLinkPolicy> = {},
  options: { target?: '_blank' | null } = {},
): { href: string; rel?: string; target?: '_blank' } | null {
  const p = resolvePolicy(policy);
  const defaults = relTokens('defaultRel', p.defaultRel);
  const forced = relTokens('forceRel', p.forceRel);
  const normalized = normalizeHref(href, p);
  if (normalized === null) return null;

  const external = /^https?:/.test(normalized);
  const blank =
    p.target === 'blank'
      ? external
      : p.target === 'preserve'
        ? options.target === '_blank'
        : false;

  const given = new Set([...defaults, ...forced]);
  if (blank) {
    given.add('noopener');
    given.add('noreferrer');
  }
  const rel = REL_VALUES.filter((v) => given.has(v)).join(' ');
  const out: { href: string; rel?: string; target?: '_blank' } = {
    href: normalized,
  };
  if (rel !== '') out.rel = rel;
  if (blank) out.target = '_blank';
  return out;
}
