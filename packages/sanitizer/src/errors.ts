/** Limite de S8 que interrompeu a sanitização. */
export type RteSanitizeErrorCode = 'input-too-long' | 'max-depth';

/** Erro tipado dos limites de S8 (nunca há truncamento). */
export class RteSanitizeError extends Error {
  /**
   * Sempre `'RteSanitizeError'`; permite reconhecer o erro sem `instanceof`.
   */
  override readonly name = 'RteSanitizeError';
  /** Qual limite foi excedido. */
  readonly code: RteSanitizeErrorCode;
  /** Valor configurado do limite excedido. */
  readonly limit: number;

  constructor(code: RteSanitizeErrorCode, limit: number) {
    super(
      code === 'input-too-long'
        ? `HTML acima de maxInputLength (${limit} unidades UTF-16).`
        : `Aninhamento acima de maxDepth (${limit}).`,
    );
    this.code = code;
    this.limit = limit;
  }
}
