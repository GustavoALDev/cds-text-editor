// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parse,
  type AtRule,
  type ChildNode,
  type Declaration,
  type Root,
  type Rule,
} from 'postcss';
import { beforeAll, describe, expect, it } from 'vitest';

// Spec 06 (H12/H13): o `render.css` é lido como texto (postcss).

const CSS_FILE = resolve(import.meta.dirname, '../styles/render.css');
const LAYER_ORDER =
  'rte.reset, rte.base, rte.theme, rte.components, rte.content';
const COLOR_PROPS =
  /^(?:color|background-color|border(?:-[a-z]+)*-color|outline-color|caret-color|text-decoration-color|fill|stroke)$/;
const COLOR_SHORTHANDS = /^(?:background|border(?:-[a-z]+)*|outline)$/;
const TOKEN = /^var\(--rte-[a-z0-9-]+\)$/;
const SYSTEM_COLOR = /^(?:Highlight|CanvasText|LinkText|ButtonText)$/;

let root: Root;

function atRules(node: ChildNode): AtRule[] {
  const found: AtRule[] = [];
  let p = node.parent as { type: string; parent?: unknown } | undefined;
  while (p && p.type !== 'root') {
    if (p.type === 'atrule') found.push(p as unknown as AtRule);
    p = p.parent as typeof p;
  }
  return found;
}

const layerOf = (n: ChildNode) =>
  atRules(n)
    .find((a) => a.name === 'layer')
    ?.params.trim() ?? null;
const inForcedColors = (n: ChildNode) =>
  atRules(n).some(
    (a) => a.name === 'media' && /forced-colors:\s*active/.test(a.params),
  );

function rules(): Rule[] {
  const list: Rule[] = [];
  root.walkRules((r) => {
    list.push(r);
  });
  return list;
}

function decls(): Declaration[] {
  const list: Declaration[] = [];
  root.walkDecls((d) => {
    list.push(d);
  });
  return list;
}

/** Valor de `prop` na regra de `selector` fora de `forced-colors`. */
function value(selector: string, prop: string): string | undefined {
  let found: string | undefined;
  for (const r of rules())
    if (r.selectors.includes(selector) && !inForcedColors(r))
      r.walkDecls(prop, (d) => {
        found = d.value;
      });
  return found;
}

beforeAll(() => {
  root = parse(readFileSync(CSS_FILE, 'utf8'), { from: CSS_FILE });
});

describe('render.css', () => {
  it('começa declarando a ordem das camadas', () => {
    const first = root.nodes.find((n) => n.type !== 'comment') as AtRule;
    expect(first.name).toBe('layer');
    expect(first.nodes).toBeUndefined();
    expect(first.params.replace(/\s+/g, ' ').trim()).toBe(LAYER_ORDER);
  });

  it('as regras ficam só em rte.components ou rte.content', () => {
    expect(rules().length).toBeGreaterThan(5);
    expect(
      rules()
        .filter(
          (r) => !['rte.components', 'rte.content'].includes(layerOf(r) ?? ''),
        )
        .map((r) => r.selector),
    ).toEqual([]);
  });

  it('nenhum !important, animation ou transition', () => {
    expect(decls().filter((d) => d.important)).toEqual([]);
    expect(
      decls().filter((d) => /^(?:animation|transition)/.test(d.prop)),
    ).toEqual([]);
  });

  it('cores só por tokens fora de forced-colors; cores de sistema só dentro', () => {
    const bad: string[] = [];
    for (const d of decls()) {
      if (d.prop.startsWith('--')) continue;
      const v = d.value.trim();
      const isColor = COLOR_PROPS.test(d.prop);
      const isShort = COLOR_SHORTHANDS.test(d.prop);
      if (!isColor && !isShort) continue;
      if (inForcedColors(d)) {
        if (!SYSTEM_COLOR.test(v)) bad.push(`${d.prop}: ${v}`);
      } else if (isColor) {
        if (!TOKEN.test(v)) bad.push(`${d.prop}: ${v}`);
      } else {
        const words = v.replace(/var\([^)]*\)/g, ' ').split(/\s+/);
        if (words.some((t) => /^[a-z]+$/i.test(t) && t !== 'solid'))
          bad.push(`${d.prop}: ${v}`);
      }
    }
    expect(bad).toEqual([]);
    expect(
      decls().filter((d) => inForcedColors(d) && d.prop === 'outline-color'),
    ).not.toEqual([]);
  });

  it('margem de rolagem dos elementos com id', () => {
    const rule = rules().find((r) => r.selectors.includes('.rte-content [id]'));
    expect(rule && layerOf(rule)).toBe('rte.content');
    expect(value('.rte-content [id]', 'scroll-margin-top')).toBe(
      'var(--rte-scroll-margin, 1rem)',
    );
  });

  it('o rolador rola na horizontal e tem foco por outline', () => {
    expect(value('.rte-content .rte-table-scroll', 'overflow-x')).toBe('auto');
    expect(value('.rte-content .rte-table-scroll', 'max-inline-size')).toBe(
      '100%',
    );
    for (const s of [
      '.rte-content .rte-table-scroll:focus-visible',
      '.rte-toc__link:focus-visible',
    ])
      expect(value(s, 'outline')).toBe(
        'var(--rte-focus-width) solid var(--rte-focus)',
      );
  });

  it('o sumário não tem marcadores e o link tem alvo de 24 px', () => {
    expect(value('.rte-toc__list', 'list-style')).toBe('none');
    expect(value('.rte-toc__list .rte-toc__list', 'padding-inline-start')).toBe(
      '1em',
    );
    expect(value('.rte-toc__link', 'min-block-size')).toBe('24px');
  });

  it('há bloco forced-colors com Highlight nos dois focos', () => {
    const selectors = rules()
      .filter(inForcedColors)
      .flatMap((r) => r.selectors);
    expect(selectors).toEqual(
      expect.arrayContaining([
        '.rte-content .rte-table-scroll:focus-visible',
        '.rte-toc__link:focus-visible',
      ]),
    );
  });
});
