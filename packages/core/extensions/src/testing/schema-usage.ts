// Cobertura do fixture (fora do build; spec 03b, §7.3): o que o HTML usa e o
// que o esquema permite, no mesmo formato de chave.
import { Parser } from 'htmlparser2';
import { getHtmlSchema } from '../../../src/schema/get-html-schema';
import type { RteHtmlSchema } from '../../../src/schema/types';

/**
 * Chaves: `tag`, `tag@attr`, `tag.classe` (de `classes.values`),
 * `tag~<padrão>` (padrão de classe) e `tag{prop}` (de `styles`/`styleFrom`).
 */
export function schemaUsage(schema: RteHtmlSchema): Set<string> {
  const keys = new Set<string>();
  for (const [tag, spec] of Object.entries(schema.elements)) {
    keys.add(tag);
    for (const attr of Object.keys(spec.attributes)) keys.add(`${tag}@${attr}`);
    for (const value of spec.classes?.values ?? []) keys.add(`${tag}.${value}`);
    for (const pattern of spec.classes?.patterns ?? [])
      keys.add(`${tag}~${pattern}`);
    for (const prop of Object.keys(spec.styles ?? {}))
      keys.add(`${tag}{${prop}}`);
    if (spec.styleFrom) keys.add(`${tag}{${spec.styleFrom.property}}`);
  }
  return keys;
}

/**
 * Chaves (como `schemaUsage`) do que `html` usa. Classe fora de `values` e de
 * todo padrão de `schema` (padrão: o esquema padrão) vira `tag.classe`, para
 * aparecer como sobra na comparação.
 */
export function collectUsage(
  html: string,
  schema: RteHtmlSchema = getHtmlSchema(),
): Set<string> {
  const keys = new Set<string>();
  const parser = new Parser(
    {
      onopentag(tag, attrs) {
        keys.add(tag);
        const spec = Object.hasOwn(schema.elements, tag)
          ? schema.elements[tag]
          : undefined;
        for (const [name, value] of Object.entries(attrs)) {
          if (name === 'class') {
            for (const cls of value.split(/[ \t\n\r\f]+/)) {
              if (cls === '') continue;
              const pattern = spec?.classes?.patterns?.find((p) =>
                new RegExp(p).test(cls),
              );
              if (spec?.classes?.values?.includes(cls) || !pattern)
                keys.add(`${tag}.${cls}`);
              else keys.add(`${tag}~${pattern}`);
            }
          } else if (name === 'style') {
            for (const decl of value.split(';')) {
              const colon = decl.indexOf(':');
              if (colon > 0)
                keys.add(
                  `${tag}{${decl.slice(0, colon).trim().toLowerCase()}}`,
                );
            }
          } else {
            keys.add(`${tag}@${name}`);
          }
        }
      },
    },
    {
      decodeEntities: true,
      lowerCaseTags: true,
      lowerCaseAttributeNames: true,
    },
  );
  parser.write(html);
  parser.end();
  return keys;
}
