import { REL_VALUES } from './features';

function union(a: readonly string[]): string[] {
  return [...new Set(a)];
}

/**
 * Host de configuração na forma comparável: ASCII (punycode), minúsculas,
 * sem ponto final; preserva o curinga `*.` (se permitido). Lança `TypeError` se não for um
 * nome de host.
 */
function normalizeHost(
  option: string,
  host: unknown,
  allowWildcard: boolean,
): string {
  const fail = (): never => {
    throw new TypeError(`${option}: host "${String(host)}" inválido.`);
  };
  if (typeof host !== 'string') return fail();
  const wildcard = host.startsWith('*.');
  // Domínio bloqueado já cobre os subdomínios (seção 4.2); curinga deixaria o apex passar.
  if (!allowWildcard && host.includes('*')) return fail();
  const name = (wildcard ? host.slice(2) : host).replace(/\.$/, '');
  if (name === '') return fail();
  let parsed: string;
  try {
    parsed = new URL(`https://${name}/`).hostname.replace(/\.$/, '');
  } catch {
    return fail();
  }
  // ASCII precisa sair igual (só minúsculas): "a/b", "a:1" ou IPs abreviados são erro.
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7f]*$/.test(name) && parsed !== name.toLowerCase())
    return fail();
  return wildcard ? `*.${parsed}` : parsed;
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
