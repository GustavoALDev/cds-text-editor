/** Prefixo padrão dos ids de título (A4). */
export const RTE_DEFAULT_ID_PREFIX = 'rt-';

const ID_PREFIX = /^[a-z][a-z0-9-]{0,14}-$/;

/**
 * Lança `RangeError` se o prefixo não casar `^[a-z][a-z0-9-]{0,14}-$`. O hífen final é obrigatório:
 * sem ele um título como "location" viraria `id="location"` e o nome da página (`window.location`,
 * `document.cookie`…) seria sobrescrito por um elemento (_DOM clobbering_).
 */
export function assertIdPrefix(prefix: string): void {
  if (typeof prefix !== 'string' || !ID_PREFIX.test(prefix)) {
    throw new RangeError(
      `idPrefix "${String(prefix)}" inválido: precisa casar ^[a-z][a-z0-9-]{0,14}-$ (minúsculas e terminar em hífen, como "rt-").`,
    );
  }
}
