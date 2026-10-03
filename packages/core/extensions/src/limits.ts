/**
 * Corta `value` em `max` unidades UTF-16 sem deixar um substituto alto solto
 * no fim (metade de um par vira U+FFFD no navegador e o sanitizador descarta
 * o atributo). Abaixo do limite devolve o mesmo texto.
 */
export function truncateText(value: string, max: number): string {
  if (value.length <= max) return value;
  let end = Math.max(0, max);
  const last = value.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return value.slice(0, end);
}
