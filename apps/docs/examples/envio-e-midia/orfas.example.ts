// #region orfas
export interface StoredFile {
  readonly name: string;
  /** Relógio do armazenamento (mtime), nunca o do cliente. */
  readonly mtimeMs: number;
}

/** Nomes de arquivo citados por `src`, `poster` e `srcset` no HTML canônico (já sanitizado). */
export function referencedFiles(htmls: readonly string[]): Set<string> {
  const names = new Set<string>();
  const attribute = /\b(?:src|poster|srcset)="([^"]*)"/g;
  for (const html of htmls) {
    for (const [, value] of html.matchAll(attribute)) {
      // `srcset` traz "url 1x, url 2x"; os demais, uma URL só.
      for (const candidate of (value ?? '').split(',')) {
        const url = candidate.trim().split(/\s+/)[0] ?? '';
        const name = url.split('?')[0]?.split('/').pop();
        if (name) names.add(name);
      }
    }
  }
  return names;
}

/** Arquivos que nenhum texto cita e que já passaram da carência: só estes podem ser apagados. */
export function orphanFiles(
  stored: readonly StoredFile[],
  htmls: readonly string[],
  { now, graceMs }: { now: number; graceMs: number },
): string[] {
  const used = referencedFiles(htmls);
  return stored
    .filter((f) => !used.has(f.name) && now - f.mtimeMs >= graceMs)
    .map((f) => f.name);
}
// #endregion
