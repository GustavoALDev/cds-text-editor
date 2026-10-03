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
