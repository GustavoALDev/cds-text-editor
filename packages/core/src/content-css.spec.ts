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
import { DEFAULT_EMBED_PROVIDERS } from './embeds/providers';
import { RTE_HIGHLIGHT_COLORS, RTE_TEXT_COLORS } from './schema/palette';
import { getHtmlSchema } from './schema/get-html-schema';

// R11 (spec 05b1): o `content.css` é lido como texto (postcss) e conferido em
// camadas, escopo, cobertura do esquema e da paleta, `!important` e tokens.

const CSS_FILE = resolve(import.meta.dirname, '../styles/content.css');
const LAYER_ORDER =
  'rte.reset, rte.base, rte.theme, rte.components, rte.content';

const COLOR_PROPS =
  /^(?:color|background-color|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?-color|outline-color|caret-color|text-decoration-color|fill|stroke)$/;
const COLOR_SHORTHANDS =
  /^(?:background|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|outline|text-decoration)$/;
const COLOR_VALUE =
  /^(?:var\(--rte-[a-z0-9-]+\)|transparent|currentcolor|inherit)$/i;
const NON_COLOR_TOKEN =
  /^(?:-?[\d.]+(?:px|em|rem|%)?|none|solid|dashed|dotted|double|auto|underline|wavy|calc\(.*\))$/;
const LIGHT_DARK = /^light-dark\(\s*#[0-9a-f]{3,8}\s*,\s*#[0-9a-f]{3,8}\s*\)$/i;
/** `color-mix(...)` cujas cores são todas tokens `var(--rte-*)`. */
const TOKEN_MIX =
  /^color-mix\(\s*in\s+[a-z]+\s*,\s*var\(--rte-[a-z0-9-]+\)\s+[\d.]+%\s*,\s*var\(--rte-[a-z0-9-]+\)\s*\)$/i;

let root: Root;

function enclosingAtRules(node: ChildNode): AtRule[] {
  const found: AtRule[] = [];
  let p = node.parent as { type: string; parent?: unknown } | undefined;
  while (p && p.type !== 'root') {
    if (p.type === 'atrule') found.push(p as unknown as AtRule);
    p = p.parent as typeof p;
  }
  return found;
}

function layerOf(node: ChildNode): string | null {
  const at = enclosingAtRules(node).find((a) => a.name === 'layer');
  return at ? at.params.trim() : null;
}

function insideKeyframes(node: ChildNode): boolean {
  return enclosingAtRules(node).some((a) => /keyframes$/.test(a.name));
}

function firstCompound(selector: string): string {
  let depth = 0;
  const s = selector.trim();
  for (let i = 0; i < s.length; i++) {
    const c = s[i] as string;
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0 && /[\s>+~]/.test(c)) return s.slice(0, i);
  }
  return s;
}

function hasClass(selector: string, cls: string): boolean {
  const escaped = cls.replace(/-/g, '\\-');
  return new RegExp(`\\.${escaped}(?![\\w-])`).test(selector);
}

function styleRules(): Rule[] {
  const rules: Rule[] = [];
  root.walkRules((rule) => {
    if (!insideKeyframes(rule)) rules.push(rule);
  });
  return rules;
}

function allDecls(): Declaration[] {
  const decls: Declaration[] = [];
  root.walkDecls((d) => {
    decls.push(d);
  });
  return decls;
}

/** Todas as classes `rt-*` do esquema com todos os recursos ligados. */
function schemaClasses(): string[] {
  const schema = getHtmlSchema({
    features: {
      colors: true,
      code: true,
      tables: true,
      tasks: true,
      media: true,
      embeds: true,
      newsBlocks: true,
    },
    embedProviders: DEFAULT_EMBED_PROVIDERS,
  });
  const values = new Set<string>();
  for (const spec of Object.values(schema.elements))
    for (const v of spec.classes?.values ?? []) values.add(v);
  return [...values].sort();
}

/** Declaração `prop` da regra cujo seletor é exatamente `selector`. */
function paletteDecl(selector: string, prop: string): Declaration | undefined {
  const rule = styleRules().find((r) => r.selectors.includes(selector));
  let found: Declaration | undefined;
  rule?.walkDecls(prop, (d) => {
    found = d;
  });
  return found;
}

beforeAll(() => {
  root = parse(readFileSync(CSS_FILE, 'utf8'), { from: CSS_FILE });
});

describe('content.css (R11)', () => {
  it('começa declarando a ordem das camadas do tema', () => {
    const first = root.nodes.find((n) => n.type !== 'comment');
    expect(first?.type).toBe('atrule');
    const at = first as AtRule;
    expect(at.name).toBe('layer');
    expect(at.nodes).toBeUndefined();
    expect(at.params.replace(/\s+/g, ' ').trim()).toBe(LAYER_ORDER);
  });

  it('toda regra (fora @keyframes) está em @layer rte.content', () => {
    const rules = styleRules();
    expect(rules.length).toBeGreaterThan(20);
    expect(
      rules.filter((r) => layerOf(r) !== 'rte.content').map((r) => r.selector),
    ).toEqual([]);
    const keyframes: string[] = [];
    root.walkAtRules(/keyframes$/, (at) => {
      if (layerOf(at) !== 'rte.content') keyframes.push(at.params);
    });
    expect(keyframes).toEqual([]);
  });

  it('todo seletor começa por .rte-content', () => {
    const bad: string[] = [];
    for (const rule of styleRules())
      for (const selector of rule.selectors)
        if (!hasClass(firstCompound(selector), 'rte-content'))
          bad.push(selector);
    expect(bad).toEqual([]);
  });

  it('a raiz .rte-content usa os tokens de tipografia', () => {
    const rule = styleRules().find((r) => r.selectors.includes('.rte-content'));
    const props = new Map<string, string>();
    rule?.walkDecls((d) => {
      props.set(d.prop, d.value);
    });
    expect(Object.fromEntries(props)).toMatchObject({
      color: 'var(--rte-text)',
      'font-family': 'var(--rte-font-sans)',
      'font-size': 'var(--rte-font-size)',
      'line-height': 'var(--rte-line-height)',
    });
  });

  it('cada classe rt-* do esquema (todos os recursos) tem regra', () => {
    const classes = schemaClasses();
    expect(classes).toEqual(
      expect.arrayContaining([
        'rt-tasks',
        'rt-task',
        'rt-figure--video',
        'rt-embed--spotify',
        'rt-callout--danger',
        'rt-read-also__title',
      ]),
    );
    const missing = classes.filter(
      (cls) =>
        !styleRules().some((r) => r.selectors.some((s) => hasClass(s, cls))),
    );
    expect(missing).toEqual([]);
  });

  it('tarefas da exibição (label em flex) e legenda de tabela têm regra', () => {
    const value = (selector: string, prop: string) => {
      let found: string | undefined;
      styleRules()
        .find((r) => r.selectors.includes(selector))
        ?.walkDecls(prop, (d) => {
          found = d.value;
        });
      return found;
    };
    expect(value('.rte-content .rt-task > label', 'display')).toBe('flex');
    expect(value('.rte-content .rt-task > label > input', 'accent-color')).toBe(
      'var(--rte-primary)',
    );
    expect(value('.rte-content caption', 'caption-side')).toBe('top');
    expect(value('.rte-content caption', 'color')).toBe(
      'var(--rte-text-muted)',
    );
  });

  it.each([
    ['span', RTE_TEXT_COLORS, '--rte-content-color'],
    ['mark', RTE_HIGHLIGHT_COLORS, '--rte-content-highlight'],
  ] as const)(
    'cada cor de %s da paleta tem regra com light-dark e os literais do esquema',
    (tag, palette, variable) => {
      for (const color of palette) {
        const decl = paletteDecl(
          `.rte-content ${tag}[data-rt-color='${color.name}']`,
          variable,
        );
        expect(decl, `${tag} ${color.name}`).toBeDefined();
        expect(decl?.value.replace(/\s+/g, ' ')).toBe(
          `light-dark(${color.light}, ${color.dark})`,
        );
      }
    },
  );

  it('!important só em color de span[data-rt-color] e background-color de mark[data-rt-color]', () => {
    const important = allDecls()
      .filter((d) => d.important)
      .map((d) => [(d.parent as Rule).selector, d.prop]);
    expect(important).toEqual([
      ['.rte-content span[data-rt-color]', 'color'],
      ['.rte-content mark[data-rt-color]', 'background-color'],
    ]);
  });

  it('cores só por var(--rte-*), transparent, currentColor, inherit ou color-mix de tokens', () => {
    const bad: string[] = [];
    for (const d of allDecls()) {
      const value = d.value.trim();
      if (d.prop.startsWith('--')) continue;
      if (COLOR_PROPS.test(d.prop)) {
        if (!COLOR_VALUE.test(value) && !TOKEN_MIX.test(value))
          bad.push(`${d.prop}: ${d.value}`);
      } else if (COLOR_SHORTHANDS.test(d.prop)) {
        const tokens = value
          .replace(/(?:var|calc|color-mix)\((?:[^()]|\([^)]*\))*\)/g, (v) =>
            v.replace(/\s+/g, ''),
          )
          .split(/\s+/);
        const ok = tokens.every(
          (t) =>
            COLOR_VALUE.test(t) || TOKEN_MIX.test(t) || NON_COLOR_TOKEN.test(t),
        );
        if (!ok) bad.push(`${d.prop}: ${d.value}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('literais de cor só aparecem como light-dark(#hex, #hex) nas regras da paleta', () => {
    const outside: string[] = [];
    for (const d of allDecls()) {
      const rule = d.parent as Rule;
      const palette = rule.selectors?.every((s) => /\[data-rt-color/.test(s));
      if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(d.value)) {
        if (!palette || !d.prop.startsWith('--') || !LIGHT_DARK.test(d.value))
          outside.push(`${rule.selector} { ${d.prop}: ${d.value} }`);
      }
    }
    expect(outside).toEqual([]);
  });

  it('toda declaração com color-mix tem antes, na mesma regra, a mesma propriedade sem color-mix', () => {
    const mixes = allDecls().filter((d) => d.value.includes('color-mix('));
    expect(mixes.length).toBeGreaterThan(0);
    for (const d of mixes) {
      const rule = d.parent as Rule;
      const before: Declaration[] = [];
      for (const n of rule.nodes) {
        if (n === d) break;
        if (n.type === 'decl') before.push(n);
      }
      expect(
        before.some(
          (b) => b.prop === d.prop && !b.value.includes('color-mix('),
        ),
        `${rule.selector} { ${d.prop} }`,
      ).toBe(true);
    }
  });

  // Revisão final da 05b1 (minor 3): a barra lateral de citação, destaque,
  // caixa e "leia também" segue o `dir` (`rtl` põe a barra à direita).
  it('bordas e recuos laterais só por propriedades lógicas (inline-start/end)', () => {
    const physical: string[] = [];
    root.walkDecls((d) => {
      if (/^(?:border|padding)-(?:left|right)(?:-|$)/.test(d.prop))
        physical.push(`${(d.parent as Rule).selector} { ${d.prop} }`);
    });
    expect(physical).toEqual([]);
  });

  it('só declara --rte-content-color e --rte-content-highlight como propriedades customizadas', () => {
    const custom = new Set(
      allDecls()
        .filter((d) => d.prop.startsWith('--'))
        .map((d) => d.prop),
    );
    expect([...custom].sort()).toEqual([
      '--rte-content-color',
      '--rte-content-highlight',
    ]);
  });
});
