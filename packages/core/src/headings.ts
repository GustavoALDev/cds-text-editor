import { RTE_DEFAULT_ID_PREFIX, assertIdPrefix } from './schema/id-prefix';

/** Comprimento máximo do atributo `id` no esquema. */
const ID_MAX_LENGTH = 80;

/**
 * Converte texto em slug ASCII (`a-z0-9` separados por `-`): remove acentos,
 * descarta o que não for letra latina ou dígito e corta em `maxLength`
 * (padrão 60). Pode devolver `''`.
 */
export function slugify(text: string, maxLength = 60): string {
  const slug = String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, Math.max(0, maxLength)).replace(/-+$/g, '');
}

/**
 * Cria um gerador de ids de título únicos por instância. O id sempre casa a
 * regra de `id` do esquema (prefixo + slug + sufixo `-N`, até 80 caracteres).
 */
export function createHeadingIds(
  options: { prefix?: string; fallback?: string } = {},
): (text: string) => string {
  const prefix = options.prefix ?? RTE_DEFAULT_ID_PREFIX;
  const fallback = options.fallback ?? 'section';
  assertIdPrefix(prefix);
  if (fallback === '' || slugify(fallback) !== fallback) {
    throw new RangeError(
      `fallback "${fallback}" inválido: precisa ser não vazio e igual a slugify(fallback).`,
    );
  }
  const used = new Set<string>();
  const next = new Map<string, number>();
  return (text: string): string => {
    const base = prefix + (slugify(text) || fallback);
    let id = base;
    for (let n = next.get(base) ?? 2; used.has(id); n++) {
      next.set(base, n + 1);
      const suffix = `-${n}`;
      id =
        base.slice(0, ID_MAX_LENGTH - suffix.length).replace(/-+$/g, '') +
        suffix;
    }
    used.add(id);
    return id;
  };
}
