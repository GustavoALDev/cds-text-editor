import type { RteUrlRule } from './types';

const MAILTO_PATH =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const TEL_HREF = /^tel:\+?[0-9][0-9().-]{0,30}$/;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function trimC0(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) <= 0x20) start++;
  while (end > start && s.charCodeAt(end - 1) <= 0x20) end--;
  return s.slice(start, end);
}

function hasControl(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

function hostMatches(host: string, entry: string): boolean {
  const e = entry.toLowerCase();
  if (e.startsWith('*.')) return host.endsWith(e.slice(1));
  return host === e;
}

/**
 * Valida uma URL pela regra e devolve a forma canônica (serializada pelo
 * WHATWG URL), ou `null` se for rejeitada. O comprimento é checado antes de
 * qualquer outra coisa.
 */
export function isAllowedUrl(rule: RteUrlRule, value: string): string | null {
  if (value.length > rule.maxLength) return null;
  // WHATWG: TAB/LF/CR somem em qualquer posição; C0 e espaço são aparados nas pontas.
  const v = trimC0(value.replace(/[\t\n\r]/g, ''));
  if (v === '' || v.includes('\\')) return null;
  if (hasControl(v)) return null;

  if (v.startsWith('#')) return rule.fragment ? v : null;
  if (v.startsWith('/')) return rule.relative && !v.startsWith('//') ? v : null;
  if (!SCHEME.test(v)) return null;

  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  const scheme = url.protocol.slice(0, -1);
  if (!rule.schemes.some((s) => s.toLowerCase() === scheme)) return null;
  if (url.username !== '' || url.password !== '') return null;

  if (scheme === 'mailto') {
    if (!MAILTO_PATH.test(url.pathname)) return null;
  } else if (scheme === 'tel') {
    if (!TEL_HREF.test(url.href)) return null;
  } else if (scheme === 'http' || scheme === 'https') {
    const host = url.hostname.replace(/\.$/, '');
    if (host === '') return null;
    if (rule.hosts && !rule.hosts.some((h) => hostMatches(host, h)))
      return null;
    if (
      rule.blockedHosts?.some(
        (b) => hostMatches(host, b) || host.endsWith(`.${b.toLowerCase()}`),
      )
    )
      return null;
  }

  if (rule.patterns && !rule.patterns.some((p) => new RegExp(p).test(url.href)))
    return null;
  // A forma canônica (percent-encoding, punycode) pode crescer: vale o mesmo limite.
  return url.href.length > rule.maxLength ? null : url.href;
}
