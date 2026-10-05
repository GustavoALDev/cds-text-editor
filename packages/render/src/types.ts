/** Modo de exibição: `sanitize` passa o HTML pelo sanitizador; `trusted` o usa como veio (H4). */
export type RteRenderMode = 'sanitize' | 'trusted';

/** Rótulos do pacote de renderização. */
export interface RteRenderLabels {
  /** Nome acessível do sumário. */
  toc: string;
  /** Nome acessível do contêiner com rolagem horizontal de uma tabela. */
  tableScroller: string;
}

export interface RteRenderOptions {
  /** Sanitizador do modo `sanitize`: `createSanitizer(opçõesDoEditor)` do `@cds/rte-sanitizer` (H4). */
  sanitize?: (html: string) => string;
  /** `href="#x"` vira `<caminho do documento>#x` (padrão) ou é mantido (H6). */
  fragmentLinks?: 'document' | 'keep';
  labels?: Partial<RteRenderLabels>;
}

/** Forma estrutural do `RteSanitizeError` (H5), sem importar o código do sanitizador. */
export interface RteSanitizeErrorLike {
  readonly name: 'RteSanitizeError';
  readonly code: 'input-too-long' | 'max-depth';
  readonly limit: number;
  readonly message: string;
}
