/** Caracteres do nome mostrados na bandeja e no marcador (E8). */
const MAX_SHOWN = 100;

/**
 * Nome cortado em 100 caracteres (pontos de código, sem partir um par
 * substituto) com reticências; só para exibição: `title`, anúncios e
 * `uploadError` usam o nome inteiro (pré-voo 14).
 */
export function shortName(name: string): string {
  const chars = [...name];
  return chars.length > MAX_SHOWN
    ? `${chars.slice(0, MAX_SHOWN).join('')}…`
    : name;
}

/** Último segmento do caminho do endereço (ou o host) como nome na bandeja (S10). */
export function externalName(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).at(-1);
    return decodeURIComponent(last ?? u.host);
  } catch {
    return url;
  }
}
