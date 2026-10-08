/**
 * Lê o parâmetro `preset` da query (spec 07d, L7): devolve o id só se estiver na lista fechada
 * `ids`; ausente, vazio, desconhecido, de outra caixa ou repetido dá `null`. Nada da URL vira
 * texto de CSS/TS: o valor devolvido é sempre um dos `ids`.
 */
export function readPresetParam<T extends string>(
  search: string,
  ids: readonly T[],
): T | null {
  const values = new URLSearchParams(search).getAll('preset');
  if (values.length !== 1) return null;
  const value = values[0];
  return ids.find((id) => id === value) ?? null;
}
