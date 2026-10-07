/**
 * Propriedades CSS que o esquema emite em `style`, por *tag* (as chaves de
 * `styles` e a `styleFrom.property` de `getHtmlSchema` com todos os recursos).
 * Constante literal, não derivada em tempo de execução (bytes e CPU na
 * exibição); `style-properties.spec.ts` confere a igualdade com o esquema, então
 * um recurso novo com estilo quebra o teste. Usada pela exibição (`@cds/rte-render`,
 * Ruling 23) para reaplicar por CSSOM só o que o esquema permite.
 */
export const RTE_STYLE_PROPERTIES: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    p: Object.freeze(['text-align']),
    h2: Object.freeze(['text-align']),
    h3: Object.freeze(['text-align']),
    h4: Object.freeze(['text-align']),
    col: Object.freeze(['width']),
    iframe: Object.freeze(['aspect-ratio']),
    span: Object.freeze(['color']),
    mark: Object.freeze(['background-color']),
  });
