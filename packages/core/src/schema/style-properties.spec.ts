import { describe, expect, it } from 'vitest';
import { getHtmlSchema } from './get-html-schema';
import { RTE_STYLE_PROPERTIES } from './style-properties';
import type { RteFeatures } from './types';

/** Todos os recursos ligados (o padrão já liga os 9 do esquema; explícito aqui). */
const ALL_FEATURES: RteFeatures = {
  colors: true,
  code: true,
  tables: true,
  tasks: true,
  media: true,
  embeds: true,
  newsBlocks: true,
  search: true,
  slashCommands: true,
};

/** Por *tag*: as chaves de `styles` mais a `styleFrom.property`, ordenadas. */
function fromSchema(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const schema = getHtmlSchema({ features: ALL_FEATURES });
  for (const [tag, spec] of Object.entries(schema.elements)) {
    const props = new Set(Object.keys(spec.styles ?? {}));
    if (spec.styleFrom) props.add(spec.styleFrom.property);
    if (props.size > 0) out[tag] = [...props].sort();
  }
  return out;
}

describe('RTE_STYLE_PROPERTIES', () => {
  it('é igual às propriedades de estilo do esquema com todos os recursos', () => {
    const constant = Object.fromEntries(
      Object.entries(RTE_STYLE_PROPERTIES).map(([tag, props]) => [
        tag,
        [...props].sort(),
      ]),
    );
    expect(constant).toEqual(fromSchema());
  });

  it('é congelada, inclusive as listas', () => {
    expect(Object.isFrozen(RTE_STYLE_PROPERTIES)).toBe(true);
    for (const props of Object.values(RTE_STYLE_PROPERTIES)) {
      expect(Object.isFrozen(props)).toBe(true);
    }
  });

  it('não dá propriedades a tags fora da lista', () => {
    expect(Object.hasOwn(RTE_STYLE_PROPERTIES, 'div')).toBe(false);
    expect(Object.hasOwn(RTE_STYLE_PROPERTIES, 'table')).toBe(false);
  });
});
