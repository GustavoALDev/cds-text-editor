/** Prefixo padrão dos ids de título (A4). */
export const DEFAULT_ID_PREFIX = 'rt-';

const ID_PREFIX = /^[a-z][a-z0-9-]{0,15}$/;

/** Lança `RangeError` se o prefixo não casar `^[a-z][a-z0-9-]{0,15}$`. */
export function assertIdPrefix(prefix: string): void {
  if (typeof prefix !== 'string' || !ID_PREFIX.test(prefix)) {
    throw new RangeError(
      `idPrefix "${String(prefix)}" inválido: precisa casar ^[a-z][a-z0-9-]{0,15}$.`,
    );
  }
}
