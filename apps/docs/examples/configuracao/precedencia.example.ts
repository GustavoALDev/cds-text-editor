// #region precedencia
/**
 * A regra das opções com várias origens: a primeira definida vence.
 * Ordem de chamada: entrada do componente, provider da rota, provider da raiz, padrão.
 */
export function resolveOption<T>(
  input: T | undefined,
  route: T | undefined,
  root: T | undefined,
  fallback: T,
): T {
  return input ?? route ?? root ?? fallback;
}
// #endregion
