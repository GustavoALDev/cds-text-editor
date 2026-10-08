import { REL_VALUES } from './features';
import { normalizeHost } from './host-name';

function union(a: readonly string[]): string[] {
  return [...new Set(a)];
}

export function normalizeHosts(
  option: string,
  hosts: readonly unknown[] = [],
  allowWildcard = true,
): string[] {
  return union(hosts.map((h) => normalizeHost(option, h, allowWildcard)));
}

export function normalizeRelTokens(
  option: string,
  tokens: readonly unknown[] = [],
): string[] {
  const given = new Set<string>();
  for (const t of tokens) {
    const v = typeof t === 'string' ? t.trim().toLowerCase() : '';
    if (!REL_VALUES.includes(v)) {
      throw new TypeError(
        `${option}: token "${String(t)}" fora de ${REL_VALUES.join(' ')}.`,
      );
    }
    given.add(v);
  }
  return REL_VALUES.filter((v) => given.has(v));
}

/** Esquemas que o `href` de um link pode ter (a lista segura; `RteLinkPolicy.protocols` só restringe). */
export const SAFE_LINK_PROTOCOLS = ['https', 'http', 'mailto', 'tel'];

export function normalizeLinkProtocols(
  option: string,
  protocols: readonly unknown[] | undefined,
): string[] {
  if (protocols === undefined) return [...SAFE_LINK_PROTOCOLS];
  const given = new Set<string>();
  for (const p of protocols) {
    const v = typeof p === 'string' ? p.trim().toLowerCase() : '';
    if (!SAFE_LINK_PROTOCOLS.includes(v)) {
      throw new TypeError(
        `${option}: "${String(p)}" fora de ${SAFE_LINK_PROTOCOLS.join(' ')}.`,
      );
    }
    given.add(v);
  }
  return SAFE_LINK_PROTOCOLS.filter((v) => given.has(v));
}
