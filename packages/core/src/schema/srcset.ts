export interface SrcsetCandidate {
  url: string;
  descriptor?: string;
}

const DESCRIPTOR =
  /^(?:[0-9]{1,5}w|(?:[0-9]{1,3}(?:\.[0-9]{1,3})?|\.[0-9]{1,3})x)$/;

/**
 * Lê um `srcset` estrito: candidatos separados por vírgula, URL sem espaços
 * nem vírgulas e descritor `Nw` ou `Nx`. Com mais de um candidato, todos
 * precisam de descritor. Devolve `null` se algo estiver fora do formato.
 */
export function parseSrcset(value: string): SrcsetCandidate[] | null {
  const out: SrcsetCandidate[] = [];
  for (const raw of value.split(',')) {
    const [url, descriptor, extra] = raw.trim().split(/\s+/);
    if (!url || extra !== undefined) return null;
    const candidate: SrcsetCandidate = { url };
    if (descriptor !== undefined) {
      if (!DESCRIPTOR.test(descriptor)) return null;
      candidate.descriptor = descriptor;
    }
    out.push(candidate);
  }
  if (out.length > 1 && out.some((c) => c.descriptor === undefined))
    return null;
  return out;
}

export function formatSrcset(candidates: SrcsetCandidate[]): string {
  return candidates
    .map((c) =>
      c.descriptor === undefined ? c.url : `${c.url} ${c.descriptor}`,
    )
    .join(', ');
}
