import { normalizeHost } from '../schema/host-name';
import type { RteEmbedProvider } from '../schema/types';

/** O id vira a classe `rt-embed--<id>` e o valor de `data-rt-provider`. */
const PROVIDER_ID = /^[a-z][a-z0-9-]{0,31}$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Valida um host do provedor e devolve a forma normalizada (punycode,
 * minúsculas, sem ponto final; curinga `*.` preservado). IP e localhost são
 * conferidos no host já interpretado pelo parser de URL, então `127.1`,
 * `0x7f.0.0.1`, `*.0.1` e dígitos de largura total também caem.
 */
function checkHost(id: string, host: unknown): string {
  const fail = (motivo: string): never => {
    throw new TypeError(
      `Provedor de embed "${id}": host "${String(host)}" recusado (${motivo}).`,
    );
  };
  if (typeof host !== 'string') return fail('precisa ser texto');
  const raw = host.startsWith('*.') ? host.slice(2) : host;
  if (raw.includes('*')) return fail('curinga só é aceito como prefixo "*."');
  if (raw.split('.').some((label) => label === '')) return fail('rótulo vazio');
  let normalized: string;
  try {
    normalized = normalizeHost(`Provedor de embed "${id}"`, host, true);
  } catch {
    // Inclui IPv6: "[" e ":" são recusados por normalizeHost.
    return fail('não é um nome de host');
  }
  const name = normalized.startsWith('*.') ? normalized.slice(2) : normalized;
  if (!name.includes('.')) return fail('precisa ter ponto');
  if (IPV4.test(name)) return fail('IP literal não é aceito');
  if (name === 'localhost' || name.endsWith('.localhost'))
    return fail('localhost não é aceito');
  return normalized;
}

/**
 * `|` fora de grupo e de classe: `^a|.*$` começa com `^` e termina com `$`,
 * mas a segunda alternativa casa qualquer coisa. Ignora caracteres escapados
 * (`\x`) e classes (`[...]`).
 */
function hasTopLevelAlternation(pattern: string): boolean {
  let depth = 0;
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') {
      i++;
    } else if (inClass) {
      if (c === ']') inClass = false;
    } else if (c === '[') {
      inClass = true;
    } else if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth--;
    } else if (c === '|' && depth === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Validador único de provedor, usado por `getHtmlSchema` e por `toEmbed`.
 * Devolve os hosts normalizados (sem repetição) ou lança `TypeError`.
 *
 * Regras: id casa `^[a-z][a-z0-9-]{0,31}$`; hosts sem IP, sem localhost, com
 * ponto e curinga só como prefixo `*.`; cada `srcPattern` é uma regex válida,
 * ancorada (`^…$`), sem `|` de topo, e começa com `^https://` + o host
 * literal (escapado, na forma punycode) de um host **sem curinga do próprio
 * provedor** + `/`. Assim cada padrão fixa o host, e a união de padrões no
 * iframe não deixa o padrão de um provedor aceitar o host de outro. Um
 * provedor só com hosts curinga não tem como ser usado.
 *
 * Logo depois da `/` não pode vir quantificador (`?`, `*`, `+`, `{`): com
 * `^https://a\.com/?.*$` a barra vira opcional e o padrão aceitaria
 * `https://a.com.outro-provedor.net/x`.
 */
export function validateEmbedProvider(p: RteEmbedProvider): string[] {
  const id: unknown = p.id;
  if (typeof id !== 'string' || !PROVIDER_ID.test(id)) {
    throw new TypeError(
      `Provedor de embed "${String(id)}": id precisa casar ^[a-z][a-z0-9-]{0,31}$ (vira classe rt-embed--<id>).`,
    );
  }
  if (!Array.isArray(p.hosts) || p.hosts.length === 0) {
    throw new TypeError(
      `Provedor de embed "${id}": "hosts" não pode ser vazio.`,
    );
  }
  const hosts = [...new Set(p.hosts.map((h: unknown) => checkHost(id, h)))];
  const prefixes = hosts
    .filter((h) => !h.startsWith('*.'))
    .map((h) => `^https://${escapeRegExp(h)}/`);
  if (prefixes.length === 0) {
    throw new TypeError(
      `Provedor de embed "${id}": precisa de ao menos um host sem curinga (cada srcPattern fixa um host literal).`,
    );
  }
  if (!Array.isArray(p.srcPatterns) || p.srcPatterns.length === 0) {
    throw new TypeError(
      `Provedor de embed "${id}": "srcPatterns" é obrigatório.`,
    );
  }
  for (const pat of p.srcPatterns as unknown[]) {
    let ok =
      typeof pat === 'string' && pat.startsWith('^') && pat.endsWith('$');
    if (ok) {
      try {
        new RegExp(pat as string);
      } catch {
        ok = false;
      }
    }
    if (
      !ok ||
      hasTopLevelAlternation(pat as string) ||
      !prefixes.some(
        (prefix) =>
          (pat as string).startsWith(prefix) &&
          !'?*+{'.includes((pat as string)[prefix.length] ?? ''),
      )
    ) {
      throw new TypeError(
        `Provedor de embed "${id}": srcPattern "${String(pat)}" precisa ser regex válida ^https://<host sem curinga do provedor, escapado, em punycode>/…$ (sem quantificador logo depois da /), sem "|" fora de grupo.`,
      );
    }
  }
  return hosts;
}
