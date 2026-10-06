// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parse,
  type AtRule,
  type ChildNode,
  type Container,
  type Declaration,
  type Root,
  type Rule,
} from 'postcss';
import { RTE_HIGHLIGHT_COLORS, RTE_TEXT_COLORS } from '@cds/rte-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { workspacePath } from './testing-support/workspace';

// R10 (spec 05a, D16–D18): o `editor.css` é lido como texto (postcss) e
// conferido em camadas, escopo, cobertura das classes do core e tokens.

const CSS_FILE = workspacePath('packages/angular/styles/editor.css');
const CONTENT_CSS_FILE = workspacePath('packages/core/styles/content.css');
const CORE_EXTENSIONS = workspacePath('packages/core/extensions/src');
const LAYER_ORDER =
  'rte.reset, rte.base, rte.theme, rte.components, rte.content';
const ALLOWED_LAYERS = new Set(['rte.components', 'rte.content']);
const SCOPES = ['rte-root', 'rte-editor', 'rte-content'];

/** Classes de R10 e as do ProseMirror/Tiptap que o editor emite (D17). */
const REQUIRED_CLASSES = [
  'rte-placeholder',
  'rte-placeholder--doc',
  'rte-image--selected',
  'rte-image__handle',
  'rte-image__handle--nw',
  'rte-image__handle--ne',
  'rte-image__handle--sw',
  'rte-image__handle--se',
  'rte-task__check',
  'rte-task__text',
  'rte-search-match',
  'rte-search-match--active',
  'rte-slash-query',
  'ProseMirror-selectednode',
  'ProseMirror-gapcursor',
  'tableWrapper',
  'selectedCell',
  'column-resize-handle',
  'resize-cursor',
  'hljs-keyword',
  'hljs-string',
  'hljs-number',
  'hljs-comment',
  'hljs-title',
];

const COLOR_PROPS =
  /^(?:color|background-color|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?-color|outline-color|caret-color|text-decoration-color|fill|stroke)$/;
const COLOR_SHORTHANDS =
  /^(?:background|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|outline|text-decoration)$/;
const COLOR_VALUE =
  /^(?:var\(--rte-[a-z0-9-]+\)|transparent|currentcolor|inherit)$/i;
/** Literal da paleta (`light-dark(#claro, #escuro)`), só nas amostras. */
const PALETTE_VALUE = /^light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\)$/i;
/** Cores do sistema, só dentro de `@media (forced-colors: active)`. */
const SYSTEM_COLOR =
  /^(?:Canvas|CanvasText|ButtonFace|ButtonText|ButtonBorder|Highlight|HighlightText|GrayText|LinkText)$|^\d+px (?:solid|dashed|double) (?:Canvas|CanvasText|ButtonText|ButtonBorder|Highlight|GrayText)$/;
/** Fichas aceitas num atalho de borda/contorno/fundo além da cor. */
const NON_COLOR_TOKEN =
  /^(?:-?[\d.]+(?:px|em|rem|%)?|none|solid|dashed|dotted|double|auto|underline|wavy|calc\(.*\))$/;

/**
 * Propriedades que o `editor.css` pode declarar em regras de `rt-*`, `table`,
 * `td`, `th` e `pre` (R11, spec 05b1): só o funcional da edição; a aparência é
 * do `content.css`.
 */
const FUNCTIONAL_PROPS = [
  'position',
  'white-space',
  'table-layout',
  'min-width',
  'cursor',
  'user-select',
  'pointer-events',
  'touch-action',
  'z-index',
  'box-sizing',
  'display',
  'align-items',
  'gap',
  'flex',
  'overflow-x',
];

let root: Root;

/** Regras `@` que envolvem um nó, da mais próxima para a mais externa. */
function enclosingAtRules(node: ChildNode): AtRule[] {
  const found: AtRule[] = [];
  let p = node.parent as { type: string; parent?: unknown } | undefined;
  while (p && p.type !== 'root') {
    if (p.type === 'atrule') found.push(p as unknown as AtRule);
    p = p.parent as typeof p;
  }
  return found;
}

/** Camada `@layer` mais próxima de um nó (ou `null`). */
function layerOf(node: ChildNode): string | null {
  const at = enclosingAtRules(node).find((a) => a.name === 'layer');
  return at ? at.params.trim() : null;
}

function insideKeyframes(node: ChildNode): boolean {
  return enclosingAtRules(node).some((a) => /keyframes$/.test(a.name));
}

/** Primeiro composto de um seletor complexo (até o primeiro combinador). */
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
  const escaped = cls.replace(/[-]/g, '\\-');
  return new RegExp(`\\.${escaped}(?![\\w-])`).test(selector);
}

function styleRules(): Rule[] {
  const rules: Rule[] = [];
  root.walkRules((rule) => {
    if (!insideKeyframes(rule)) rules.push(rule);
  });
  return rules;
}

function declarations(container: Container = root): Declaration[] {
  const decls: Declaration[] = [];
  container.walkDecls((d) => {
    decls.push(d);
  });
  return decls;
}

const BACKDROP_FALLBACK = 'rgb(0 0 0 / 0.4)';
const BACKDROP_MIX = 'color-mix(in oklab, var(--rte-text) 40%, transparent)';

/** Regra só de `.rte-dialog::backdrop` (spec 05b2a, G20). */
function isBackdropRule(node: Container | undefined): node is Rule {
  return (
    node?.type === 'rule' &&
    (node as Rule).selectors.every((s) => /\.rte-dialog::backdrop$/.test(s))
  );
}

/** O `background-color` com `color-mix` do `::backdrop`. */
function isBackdropMix(d: Declaration): boolean {
  return (
    isBackdropRule(d.parent) &&
    d.prop === 'background-color' &&
    d.value === BACKDROP_MIX
  );
}

/**
 * A cor literal do `::backdrop` só vale como recuo: um `background-color`
 * seguido, na mesma regra, do `color-mix` sobre `--rte-text`.
 */
function isBackdropFallback(d: Declaration): boolean {
  if (!isBackdropRule(d.parent)) return false;
  if (d.prop !== 'background-color' || d.value !== BACKDROP_FALLBACK)
    return false;
  const decls = d.parent.nodes.filter(
    (n): n is Declaration => n.type === 'decl',
  );
  return decls.slice(decls.indexOf(d) + 1).some(isBackdropMix);
}

/** Tokens `rte-*` nas fontes publicadas das extensões do core. */
function coreClassTokens(): string[] {
  const tokens = new Set<string>();
  for (const file of readdirSync(CORE_EXTENSIONS)) {
    if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue;
    const text = readFileSync(join(CORE_EXTENSIONS, file), 'utf8');
    for (const [token] of text.matchAll(/rte-[a-z0-9_-]+/g)) {
      // `rte-image__handle--${corner}`: prefixo de modelo, não uma classe.
      if (!token.endsWith('-')) tokens.add(token);
    }
  }
  return [...tokens].sort();
}

beforeAll(() => {
  root = parse(readFileSync(CSS_FILE, 'utf8'), { from: CSS_FILE });
});

describe('editor.css (R10)', () => {
  it('começa declarando a ordem das camadas do tema', () => {
    const first = root.nodes.find((n) => n.type !== 'comment');
    expect(first?.type).toBe('atrule');
    const at = first as AtRule;
    expect(at.name).toBe('layer');
    expect(at.nodes).toBeUndefined();
    expect(at.params.replace(/\s+/g, ' ').trim()).toBe(LAYER_ORDER);
  });

  it('não usa !important nem ::ng-deep', () => {
    // Comentários podem citar as palavras; só o código conta.
    const css = root.toString().replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/!\s*important/i);
    expect(css).not.toMatch(/::?ng-deep/);
    expect(declarations().filter((d) => d.important)).toEqual([]);
  });

  it('toda regra está em @layer rte.components ou rte.content', () => {
    const outside = styleRules()
      .filter((r) => !ALLOWED_LAYERS.has(layerOf(r) ?? ''))
      .map((r) => r.selector);
    expect(outside).toEqual([]);
    const keyframesOutside: string[] = [];
    root.walkAtRules(/keyframes$/, (at) => {
      if (!ALLOWED_LAYERS.has(layerOf(at) ?? ''))
        keyframesOutside.push(at.params);
    });
    expect(keyframesOutside).toEqual([]);
  });

  it('todo seletor começa por .rte-root, .rte-editor ou .rte-content (nada global)', () => {
    const global: string[] = [];
    for (const rule of styleRules()) {
      for (const selector of rule.selectors) {
        const compound = firstCompound(selector);
        if (!SCOPES.some((cls) => hasClass(compound, cls)))
          global.push(selector);
      }
    }
    expect(global).toEqual([]);
  });

  it('regras sob .rte-content ficam só em rte.content', () => {
    const misplaced = styleRules()
      .filter((r) => r.selectors.some((s) => hasClass(s, 'rte-content')))
      .filter((r) => layerOf(r) !== 'rte.content')
      .map((r) => r.selector);
    expect(misplaced).toEqual([]);
  });

  it('a moldura fica em rte.components com position: relative e cor do tema', () => {
    const frame = styleRules().filter((r) =>
      r.selectors.some((s) => hasClass(s, 'rte-editor__frame')),
    );
    expect(frame.length).toBeGreaterThan(0);
    expect(frame.every((r) => layerOf(r) === 'rte.components')).toBe(true);
    const decls = frame.flatMap((r) => declarations(r));
    expect(
      decls.some((d) => d.prop === 'position' && d.value === 'relative'),
    ).toBe(true);
    expect(
      decls.some((d) => d.prop === 'color' && d.value === 'var(--rte-text)'),
    ).toBe(true);
  });

  it.each(REQUIRED_CLASSES)('tem regra para %s', (cls) => {
    expect(
      styleRules().some((r) => r.selectors.some((s) => hasClass(s, cls))),
    ).toBe(true);
  });

  it('tem regra para toda classe rte-* que as extensões do core emitem', () => {
    const tokens = coreClassTokens();
    expect(tokens.length).toBeGreaterThan(5);
    const missing = tokens.filter(
      (cls) =>
        !styleRules().some((r) => r.selectors.some((s) => hasClass(s, cls))),
    );
    expect(missing).toEqual([]);
  });

  it('cores só por var(--rte-*), transparent, currentColor ou inherit', () => {
    const bad: string[] = [];
    for (const d of declarations()) {
      // exceções da 05b1: literais da paleta só nas amostras; cores do
      // sistema só em forced-colors
      const rule = d.parent as Rule | undefined;
      const swatch =
        rule?.type === 'rule' &&
        rule.selectors.every((s) => /\.rte-swatch\[data-rte-palette=/.test(s));
      const forced = enclosingAtRules(d as unknown as ChildNode).some(
        (a) => a.name === 'media' && /forced-colors:\s*active/.test(a.params),
      );
      if (swatch && PALETTE_VALUE.test(d.value.trim())) continue;
      if (forced && SYSTEM_COLOR.test(d.value.trim())) continue;
      // exceção da 05b2a (G20): o `::backdrop` do diálogo, com o recuo
      // literal seguido do `color-mix` sobre `--rte-text`
      if (isBackdropFallback(d) || isBackdropMix(d)) continue;
      if (d.prop.startsWith('--')) {
        bad.push(`${d.prop}: ${d.value}`);
      } else if (COLOR_PROPS.test(d.prop)) {
        if (!COLOR_VALUE.test(d.value.trim()))
          bad.push(`${d.prop}: ${d.value}`);
      } else if (COLOR_SHORTHANDS.test(d.prop)) {
        const tokens = d.value
          .replace(/var\([^)]*\)/g, (v) => v.replace(/\s+/g, ''))
          .trim()
          .split(/\s+/);
        const ok = tokens.every(
          (t) => COLOR_VALUE.test(t) || NON_COLOR_TOKEN.test(t),
        );
        if (!ok) bad.push(`${d.prop}: ${d.value}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('o foco visível do editável usa outline com --rte-focus e --rte-focus-width', () => {
    const focus = styleRules().filter((r) =>
      r.selectors.some((s) => /\.rte-content:focus-visible(?![\w-])/.test(s)),
    );
    expect(focus.length).toBeGreaterThan(0);
    const decls = focus.flatMap((r) => declarations(r));
    expect(
      decls.some(
        (d) =>
          /^outline(?:-width)?$/.test(d.prop) &&
          d.value.includes('var(--rte-focus-width)'),
      ),
    ).toBe(true);
    expect(
      decls.some(
        (d) =>
          /^outline(?:-color)?$/.test(d.prop) &&
          d.value.includes('var(--rte-focus)'),
      ),
    ).toBe(true);
  });

  it('o placeholder mostra attr(data-placeholder) com --rte-text-muted', () => {
    const before = styleRules().filter((r) =>
      r.selectors.some((s) => /\.rte-placeholder::before/.test(s)),
    );
    const decls = before.flatMap((r) => declarations(r));
    expect(
      decls.some(
        (d) => d.prop === 'content' && d.value === 'attr(data-placeholder)',
      ),
    ).toBe(true);
    expect(
      decls.some(
        (d) => d.prop === 'color' && d.value === 'var(--rte-text-muted)',
      ),
    ).toBe(true);
  });

  it('as alças da imagem têm touch-action: none', () => {
    const handles = styleRules().filter((r) =>
      r.selectors.some((s) => hasClass(s, 'rte-image__handle')),
    );
    expect(
      handles
        .flatMap((r) => declarations(r))
        .some((d) => d.prop === 'touch-action' && d.value === 'none'),
    ).toBe(true);
  });

  it('prefers-reduced-motion desliga transições e animações', () => {
    const media: AtRule[] = [];
    root.walkAtRules('media', (at) => {
      if (/prefers-reduced-motion:\s*reduce/.test(at.params)) media.push(at);
    });
    expect(media.length).toBeGreaterThan(0);
    const decls = media.flatMap((m) => declarations(m));
    expect(decls.some((d) => /^transition(?:-duration)?$/.test(d.prop))).toBe(
      true,
    );
    expect(decls.some((d) => /^animation(?:-name)?$/.test(d.prop))).toBe(true);
  });

  it('nenhum seletor em comum com o content.css', () => {
    const normalize = (selector: string) =>
      selector.replace(/\s+/g, ' ').trim();
    const content = parse(readFileSync(CONTENT_CSS_FILE, 'utf8'), {
      from: CONTENT_CSS_FILE,
    });
    const contentSelectors = new Set<string>();
    content.walkRules((rule) => {
      if (!insideKeyframes(rule))
        for (const selector of rule.selectors)
          contentSelectors.add(normalize(selector));
    });
    expect(contentSelectors.size).toBeGreaterThan(20);
    const shared = styleRules()
      .flatMap((rule) => rule.selectors.map(normalize))
      .filter((selector) => contentSelectors.has(selector));
    expect(shared).toEqual([]);
  });

  it('regras com rt-*, table, td, th ou pre só declaram propriedades funcionais', () => {
    const appearance: string[] = [];
    for (const rule of styleRules()) {
      const touches = rule.selectors.some((selector) =>
        /\.rt-[\w-]+|(?:^|[\s>+~])(?:table|td|th|pre)(?![\w-])/.test(selector),
      );
      if (!touches) continue;
      for (const decl of declarations(rule))
        if (!FUNCTIONAL_PROPS.includes(decl.prop))
          appearance.push(`${rule.selector} { ${decl.prop} }`);
    }
    expect(appearance).toEqual([]);
  });
});

describe('editor.css: barra, menus e amostras (spec 05b1)', () => {
  const SWATCH =
    /\.rte-swatch(?:\[[^\]]*\])*\[data-rte-color=(['"])([\w-]+)\1\]/;

  function rulesWith(cls: string): Rule[] {
    return styleRules().filter((r) =>
      r.selectors.some((s) => hasClass(s, cls)),
    );
  }

  function declsOf(rules: Rule[]): Declaration[] {
    return rules.flatMap((r) => declarations(r));
  }

  it.each([
    'rte-toolbar',
    'rte-toolbar__button',
    'rte-toolbar__button--pressed',
    'rte-toolbar__button--active',
    'rte-toolbar__button--menu',
    'rte-toolbar__separator',
    'rte-menu',
    'rte-menu__item',
    'rte-menu__item--checked',
    'rte-swatch',
    'rte-icon',
  ])('tem regra para %s', (cls) => {
    expect(rulesWith(cls).length).toBeGreaterThan(0);
  });

  it('barra e menus ficam em rte.components', () => {
    const misplaced = ['rte-toolbar', 'rte-menu', 'rte-swatch']
      .flatMap(rulesWith)
      .filter((r) => layerOf(r) !== 'rte.components')
      .map((r) => r.selector);
    expect(misplaced).toEqual([]);
  });

  it('a barra quebra linha e tem borda inferior do tema', () => {
    const decls = declsOf(
      styleRules().filter((r) =>
        r.selectors.some((s) => /\.rte-toolbar$/.test(s.trim())),
      ),
    );
    expect(decls).toContainEqual(
      expect.objectContaining({ prop: 'flex-wrap', value: 'wrap' }),
    );
    expect(
      decls.some(
        (d) =>
          /^border-(?:bottom|block-end)$/.test(d.prop) &&
          d.value.includes('var(--rte-border)'),
      ),
    ).toBe(true);
  });

  it('o menu é fixo, sem inset/margem do UA e com rolagem interna', () => {
    const decls = declsOf(
      styleRules().filter((r) =>
        r.selectors.some((s) => /\.rte-menu$/.test(s.trim())),
      ),
    );
    for (const [prop, value] of [
      ['position', 'fixed'],
      ['inset', 'auto'],
      ['margin', '0'],
      ['overflow-y', 'auto'],
    ])
      expect(decls).toContainEqual(expect.objectContaining({ prop, value }));
  });

  /** Menor valor em px que a declaração garante (`max(24px, …)` ou `Npx`). */
  function minPx(value: string): number {
    const max = /^max\(\s*([\d.]+)px\s*,/.exec(value);
    if (max) return Number(max[1]);
    const px = /^([\d.]+)px$/.exec(value);
    return px ? Number(px[1]) : 0;
  }

  it.each(['rte-toolbar__button', 'rte-menu__item'])(
    '%s tem alvo ≥ 24 px em qualquer densidade',
    (cls) => {
      const decls = declsOf(
        styleRules().filter((r) =>
          r.selectors.some((s) => s.trim().endsWith(`.${cls}`)),
        ),
      );
      for (const prop of ['min-block-size', 'min-inline-size']) {
        const decl = decls.find((d) => d.prop === prop);
        expect(decl, prop).toBeDefined();
        expect(minPx(decl?.value ?? '')).toBeGreaterThanOrEqual(24);
      }
    },
  );

  it.each(['rte-toolbar__button', 'rte-menu__item'])(
    '%s tem foco visível com --rte-focus-width e --rte-focus',
    (cls) => {
      const decls = declsOf(
        styleRules().filter((r) =>
          r.selectors.some((s) => s.trim().endsWith(`.${cls}:focus-visible`)),
        ),
      );
      expect(decls).toContainEqual(
        expect.objectContaining({
          prop: 'outline',
          value: 'var(--rte-focus-width) solid var(--rte-focus)',
        }),
      );
    },
  );

  it('ativo (diálogo): fundo --rte-primary-subtle e borda --rte-primary-border', () => {
    const decls = declsOf(rulesWith('rte-toolbar__button--active'));
    expect(
      decls.some(
        (d) =>
          d.prop === 'background-color' &&
          d.value === 'var(--rte-primary-subtle)',
      ),
    ).toBe(true);
    expect(
      decls.some(
        (d) =>
          d.prop === 'border-color' && d.value === 'var(--rte-primary-border)',
      ),
    ).toBe(true);
  });

  it('pressionado: fundo --rte-primary-subtle e borda --rte-primary-border', () => {
    const decls = declsOf(rulesWith('rte-toolbar__button--pressed'));
    expect(
      decls.some(
        (d) =>
          d.prop === 'background-color' &&
          d.value === 'var(--rte-primary-subtle)',
      ),
    ).toBe(true);
    expect(
      decls.some(
        (d) =>
          d.prop === 'border-color' && d.value === 'var(--rte-primary-border)',
      ),
    ).toBe(true);
  });

  it('inaplicável e desabilitado usam --rte-text-muted', () => {
    const rules = styleRules().filter((r) =>
      r.selectors.some(
        (s) =>
          /\[aria-disabled=['"]?true['"]?\]/.test(s) || /:disabled/.test(s),
      ),
    );
    const selectors = rules.flatMap((r) => r.selectors).join(' ');
    expect(selectors).toMatch(/rte-toolbar__button\[aria-disabled/);
    expect(selectors).toMatch(/rte-toolbar__button:disabled/);
    expect(selectors).toMatch(/rte-menu__item\[aria-disabled/);
    expect(
      declsOf(rules).some(
        (d) => d.prop === 'color' && d.value === 'var(--rte-text-muted)',
      ),
    ).toBe(true);
  });

  it('amostras: literais da paleta iguais aos do core (texto em color, marca-texto em background-color)', () => {
    const found = new Map<string, string>();
    for (const rule of styleRules()) {
      for (const selector of rule.selectors) {
        const m = SWATCH.exec(selector);
        if (!m) continue;
        const palette = /data-rte-palette=(['"])(text|highlight)\1/.exec(
          selector,
        )?.[2];
        for (const d of declarations(rule))
          found.set(`${palette}:${m[2]}:${d.prop}`, d.value);
      }
    }
    for (const c of RTE_TEXT_COLORS)
      expect(found.get(`text:${c.name}:color`), c.name).toBe(
        `light-dark(${c.light}, ${c.dark})`,
      );
    for (const c of RTE_HIGHLIGHT_COLORS)
      expect(found.get(`highlight:${c.name}:background-color`), c.name).toBe(
        `light-dark(${c.light}, ${c.dark})`,
      );
    expect(found.size).toBe(
      RTE_TEXT_COLORS.length + RTE_HIGHLIGHT_COLORS.length,
    );
  });

  it('forced-colors: pressionado e marcado com cores do sistema', () => {
    const media: AtRule[] = [];
    root.walkAtRules('media', (at) => {
      if (/forced-colors:\s*active/.test(at.params)) media.push(at);
    });
    expect(media.length).toBeGreaterThan(0);
    const rules: Rule[] = [];
    for (const m of media) m.walkRules((r) => void rules.push(r));
    const text = rules
      .map((r) => `${r.selector}{${declarations(r).map((d) => d.value)}}`)
      .join('\n');
    expect(text).toMatch(/rte-toolbar__button--pressed[^{]*\{[^}]*Highlight/);
    expect(text).toMatch(/rte-toolbar__button--active[^{]*\{[^}]*Highlight/);
    expect(text).toMatch(/rte-menu__item--checked[^{]*\{[^}]*Highlight/);
  });

  // Revisão final (minor 2): pressionado/marcado e inaplicável ao mesmo tempo
  // ficaria GrayText sobre CanvasText; o GrayText exclui o par invertido.
  it('forced-colors: GrayText só no inaplicável não pressionado/marcado', () => {
    const rules: Rule[] = [];
    root.walkAtRules('media', (at) => {
      if (/forced-colors:\s*active/.test(at.params))
        at.walkRules((r) => void rules.push(r));
    });
    const gray = rules.filter((r) =>
      declarations(r).some((d) => d.value === 'GrayText' && d.prop === 'color'),
    );
    expect(gray.length).toBeGreaterThan(0);
    const selectors = gray.flatMap((r) => r.selectors);
    expect(selectors.length).toBe(2);
    for (const selector of selectors) {
      expect(selector).toContain("[aria-disabled='true']");
      const own = selector.includes('rte-toolbar__button')
        ? 'rte-toolbar__button--pressed,.rte-toolbar__button--active'
        : 'rte-menu__item--checked';
      expect(selector.replace(/\s+/g, '')).toContain(`:not(.${own})`);
    }
  });

  // Navegador real (N14): o par Highlight/HighlightText do Firefox e do
  // WebKit emulados fica abaixo de 4,5:1 (axe `color-contrast`); o
  // pressionado/marcado usa o par principal invertido, cujo contraste é o do
  // próprio tema do sistema, e o Highlight só na borda.
  it('forced-colors: pressionado e marcado com o par principal invertido', () => {
    const rules: Rule[] = [];
    root.walkAtRules('media', (at) => {
      if (/forced-colors:\s*active/.test(at.params))
        at.walkRules((r) => void rules.push(r));
    });
    const rule = rules.find((r) =>
      r.selector.includes('rte-toolbar__button--pressed'),
    );
    expect(rule?.selector).toContain('rte-menu__item--checked');
    const decls = Object.fromEntries(
      declarations(rule as Rule).map((d) => [d.prop, d.value]),
    );
    expect(decls).toEqual({
      color: 'Canvas',
      'background-color': 'CanvasText',
      'border-color': 'Highlight',
    });
  });
});

describe('editor.css: diálogos (spec 05b2a, G20)', () => {
  function dialogRules(): Rule[] {
    return styleRules().filter((r) =>
      r.selectors.some((s) => /\.rte-dialog(?:__[\w-]+)?(?![\w-])/.test(s)),
    );
  }

  /** Declarações das regras cujo seletor termina exatamente em `suffix`. */
  function declsEndingWith(suffix: string): Declaration[] {
    return styleRules()
      .filter((r) => r.selectors.some((s) => s.trim().endsWith(suffix)))
      .flatMap((r) => declarations(r));
  }

  function minPx(value: string): number {
    const max = /^max\(\s*([\d.]+)px\s*,/.exec(value);
    if (max) return Number(max[1]);
    const px = /^([\d.]+)px$/.exec(value);
    return px ? Number(px[1]) : 0;
  }

  it.each([
    'rte-dialog',
    'rte-dialog__title',
    'rte-dialog__form',
    'rte-dialog__field',
    'rte-dialog__label',
    'rte-dialog__hint',
    'rte-dialog__error',
    'rte-dialog__actions',
    'rte-dialog__apply',
    'rte-dialog__remove',
    'rte-dialog__cancel',
    'rte-dialog__input',
    'rte-dialog__select',
    'rte-dialog__checkbox',
    'rte-pending-selection',
  ])('tem regra para %s', (cls) => {
    expect(
      styleRules().some((r) => r.selectors.some((s) => hasClass(s, cls))),
    ).toBe(true);
  });

  it('regras dos diálogos e da seleção pendente ficam em rte.components, sob .rte-editor', () => {
    const rules = [
      ...dialogRules(),
      ...styleRules().filter((r) =>
        r.selectors.some((s) => hasClass(s, 'rte-pending-selection')),
      ),
    ];
    expect(rules.length).toBeGreaterThan(5);
    const misplaced = rules
      .filter(
        (r) =>
          layerOf(r) !== 'rte.components' ||
          !r.selectors.every((s) => /^\.rte-editor\s/.test(s.trim())),
      )
      .map((r) => r.selector);
    expect(misplaced).toEqual([]);
  });

  it('o diálogo: largura min(32rem, 100vw - 32px), rolagem interna e cores do tema', () => {
    const decls = declsEndingWith('.rte-dialog');
    for (const [prop, value] of [
      ['inline-size', 'min(32rem, 100vw - 32px)'],
      ['overflow-y', 'auto'],
      ['color', 'var(--rte-text)'],
      ['background-color', 'var(--rte-surface)'],
      ['border', '1px solid var(--rte-border)'],
      ['border-radius', 'var(--rte-radius)'],
    ])
      expect(decls).toContainEqual(expect.objectContaining({ prop, value }));
    expect(decls.some((d) => d.prop === 'max-block-size')).toBe(true);
  });

  it('::backdrop: cor literal de recuo antes do color-mix sobre --rte-text', () => {
    const rule = styleRules().find((r) => isBackdropRule(r));
    expect(rule).toBeDefined();
    const decls = declarations(rule as Rule).filter(
      (d) => d.prop === 'background-color',
    );
    expect(decls.map((d) => d.value)).toEqual([
      BACKDROP_FALLBACK,
      BACKDROP_MIX,
    ]);
  });

  it('dica em --rte-text-muted, erro em --rte-danger e Aplicar em --rte-primary/--rte-on-primary', () => {
    expect(declsEndingWith('.rte-dialog__hint')).toContainEqual(
      expect.objectContaining({
        prop: 'color',
        value: 'var(--rte-text-muted)',
      }),
    );
    expect(declsEndingWith('.rte-dialog__error')).toContainEqual(
      expect.objectContaining({ prop: 'color', value: 'var(--rte-danger)' }),
    );
    const apply = declsEndingWith('.rte-dialog__apply');
    expect(apply).toContainEqual(
      expect.objectContaining({
        prop: 'background-color',
        value: 'var(--rte-primary)',
      }),
    );
    expect(apply).toContainEqual(
      expect.objectContaining({
        prop: 'color',
        value: 'var(--rte-on-primary)',
      }),
    );
  });

  it.each([
    'rte-dialog__input',
    'rte-dialog__select',
    'rte-dialog__checkbox',
    'rte-dialog__apply',
    'rte-dialog__cancel',
    'rte-dialog__remove',
  ])('%s: alvo ≥ 24 px e foco visível com --rte-focus', (cls) => {
    const decls = declsEndingWith(`.${cls}`);
    for (const prop of ['min-block-size', 'min-inline-size']) {
      const decl = decls.find((d) => d.prop === prop);
      expect(decl, prop).toBeDefined();
      expect(minPx(decl?.value ?? '')).toBeGreaterThanOrEqual(24);
    }
    expect(declsEndingWith(`.${cls}:focus-visible`)).toContainEqual(
      expect.objectContaining({
        prop: 'outline',
        value: 'var(--rte-focus-width) solid var(--rte-focus)',
      }),
    );
  });

  it('forced-colors: borda CanvasText no diálogo', () => {
    const rules: Rule[] = [];
    root.walkAtRules('media', (at) => {
      if (/forced-colors:\s*active/.test(at.params))
        at.walkRules((r) => void rules.push(r));
    });
    const dialog = rules.filter((r) =>
      r.selectors.some((s) => s.trim().endsWith('.rte-dialog')),
    );
    expect(
      dialog
        .flatMap((r) => declarations(r))
        .some(
          (d) =>
            (d.prop === 'border-color' && d.value === 'CanvasText') ||
            (d.prop === 'border' && d.value.endsWith('CanvasText')),
        ),
    ).toBe(true);
  });

  // A dica e a URL somente leitura (05c1, N31 no WebKit) não são texto
  // inaplicável: em CanvasText, porque o GrayText do --rte-text-muted fica
  // abaixo de 4,5:1 nos motores que não forçam as cores.
  it.each(['.rte-dialog__hint', '.rte-dialog__readonly'])(
    'forced-colors: %s do diálogo em CanvasText (o GrayText do --rte-text-muted fica abaixo de 4,5:1)',
    (selector) => {
      const rules: Rule[] = [];
      root.walkAtRules('media', (at) => {
        if (/forced-colors:\s*active/.test(at.params))
          at.walkRules((r) => void rules.push(r));
      });
      const matched = rules.filter((r) =>
        r.selectors.some((s) => s.trim().endsWith(selector)),
      );
      expect(matched.flatMap((r) => declarations(r))).toContainEqual(
        expect.objectContaining({ prop: 'color', value: 'CanvasText' }),
      );
    },
  );

  it('sem animation/transition nas regras dos diálogos', () => {
    const moving = dialogRules()
      .flatMap((r) => declarations(r))
      .filter((d) => /^(?:animation|transition)(?:-|$)/.test(d.prop))
      .map((d) => `${d.prop}: ${d.value}`);
    expect(moving).toEqual([]);
  });

  it('seleção pendente com fundo --rte-primary-subtle', () => {
    expect(declsEndingWith('.rte-pending-selection')).toContainEqual(
      expect.objectContaining({
        prop: 'background-color',
        value: 'var(--rte-primary-subtle)',
      }),
    );
  });
});

describe('editor.css: menus flutuantes (spec 05b2b, M18)', () => {
  function floatingRules(): Rule[] {
    return styleRules().filter((r) =>
      r.selectors.some((s) =>
        /\.rte-floating(?:__[\w-]+|--[\w-]+)?(?![\w-])/.test(s),
      ),
    );
  }

  function declsEndingWith(suffix: string): Declaration[] {
    return styleRules()
      .filter((r) => r.selectors.some((s) => s.trim().endsWith(suffix)))
      .flatMap((r) => declarations(r));
  }

  it.each(['rte-floating', 'rte-floating--measuring', 'rte-floating__link'])(
    'tem regra para %s',
    (cls) => {
      expect(
        styleRules().some((r) => r.selectors.some((s) => hasClass(s, cls))),
      ).toBe(true);
    },
  );

  it('as regras ficam em rte.components, sob .rte-editor, com cores só de --rte-*/CanvasText', () => {
    const rules = floatingRules();
    expect(rules.length).toBeGreaterThan(2);
    const misplaced = rules
      .filter(
        (r) =>
          layerOf(r) !== 'rte.components' ||
          !r.selectors.every((s) => /^\.rte-editor\s/.test(s.trim())),
      )
      .map((r) => r.selector);
    expect(misplaced).toEqual([]);
    const colors = rules
      .flatMap((r) => declarations(r))
      .filter((d) => COLOR_PROPS.test(d.prop))
      .filter((d) => !COLOR_VALUE.test(d.value) && !SYSTEM_COLOR.test(d.value))
      .map((d) => `${d.prop}: ${d.value}`);
    expect(colors).toEqual([]);
  });

  it('o menu é fixo, sem inset/margem do UA, em linha que quebra e com cores do tema', () => {
    const decls = declsEndingWith('.rte-floating');
    for (const [prop, value] of [
      ['position', 'fixed'],
      ['inset', 'auto'],
      ['margin', '0'],
      ['display', 'flex'],
      ['flex-wrap', 'wrap'],
      ['max-inline-size', 'calc(100vw - 16px)'],
      ['color', 'var(--rte-text)'],
      ['background-color', 'var(--rte-surface)'],
      ['border', '1px solid var(--rte-border)'],
      ['border-radius', 'var(--rte-radius)'],
    ])
      expect(decls).toContainEqual(expect.objectContaining({ prop, value }));
    expect(decls.some((d) => d.prop === 'gap')).toBe(true);
    expect(decls.some((d) => d.prop === 'padding')).toBe(true);
  });

  it('o menu fechado fica fora do leiaute (o display do autor vence o display:none do UA)', () => {
    const closed = styleRules().filter((r) =>
      r.selectors.some((s) =>
        /\.rte-floating:not\(:popover-open\)\s*$/.test(s.trim()),
      ),
    );
    expect(closed.flatMap((r) => declarations(r))).toContainEqual(
      expect.objectContaining({ prop: 'display', value: 'none' }),
    );
  });

  it('--measuring esconde sem tirar do leiaute', () => {
    expect(declsEndingWith('.rte-floating--measuring')).toContainEqual(
      expect.objectContaining({ prop: 'visibility', value: 'hidden' }),
    );
  });

  it('o endereço do link trunca com reticências, em --rte-primary-text (contraste de texto no escuro), alvo ≥ 24 px e foco visível', () => {
    const decls = declsEndingWith('.rte-floating__link');
    for (const [prop, value] of [
      ['max-inline-size', '20rem'],
      ['overflow', 'hidden'],
      ['color', 'var(--rte-primary-text)'],
      ['min-block-size', '24px'],
    ])
      expect(decls).toContainEqual(expect.objectContaining({ prop, value }));
    expect(decls).not.toContainEqual(
      expect.objectContaining({ prop: 'text-overflow' }),
    );
    // As reticências ficam no `span` do endereço (filho de um contêiner flex).
    expect(declsEndingWith('.rte-floating__address')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ prop: 'text-overflow', value: 'ellipsis' }),
        expect.objectContaining({ prop: 'overflow', value: 'hidden' }),
        expect.objectContaining({ prop: 'white-space', value: 'nowrap' }),
        expect.objectContaining({ prop: 'min-inline-size', value: '0' }),
      ]),
    );
    expect(declsEndingWith('.rte-floating__link:focus-visible')).toContainEqual(
      expect.objectContaining({
        prop: 'outline',
        value: 'var(--rte-focus-width) solid var(--rte-focus)',
      }),
    );
  });

  it('forced-colors: borda CanvasText no menu flutuante', () => {
    const rules: Rule[] = [];
    root.walkAtRules('media', (at) => {
      if (/forced-colors:\s*active/.test(at.params))
        at.walkRules((r) => void rules.push(r));
    });
    const floating = rules.filter((r) =>
      r.selectors.some((s) => s.trim().endsWith('.rte-floating')),
    );
    expect(
      floating
        .flatMap((r) => declarations(r))
        .some((d) => d.prop === 'border-color' && d.value === 'CanvasText'),
    ).toBe(true);
  });

  it('sem animation/transition', () => {
    const moving = floatingRules()
      .flatMap((r) => declarations(r))
      .filter((d) => /^(?:animation|transition)(?:-|$)/.test(d.prop))
      .map((d) => `${d.prop}: ${d.value}`);
    expect(moving).toEqual([]);
  });
});

describe('editor.css: mídia (spec 05c1, V11, V15)', () => {
  const rulesEnding = (cls: string): Rule[] =>
    styleRules().filter((r) =>
      r.selectors.some((s) => new RegExp(`\\.${cls}$`).test(s.trim())),
    );
  const declsOf = (rules: Rule[]): Declaration[] =>
    rules.flatMap((r) => declarations(r));

  it.each([
    'rte-dialog__fieldset',
    'rte-dialog__legend',
    'rte-dialog__readonly',
    'rte-dialog__tracks',
    'rte-dialog__subtitle',
    'rte-dialog__track-add',
    'rte-dialog__track-remove',
  ])('%s: regra em rte.components sob .rte-editor', (cls) => {
    const rules = rulesEnding(cls);
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(layerOf(r)).toBe('rte.components');
      expect(
        r.selectors.every((s) => s.trim().startsWith('.rte-editor ')),
      ).toBe(true);
    }
  });

  it('o fieldset tem borda, raio e grade em tokens', () => {
    const decls = declsOf(rulesEnding('rte-dialog__fieldset'));
    expect(decls).toContainEqual(
      expect.objectContaining({
        prop: 'border',
        value: '1px solid var(--rte-border)',
      }),
    );
    expect(decls).toContainEqual(
      expect.objectContaining({
        prop: 'border-radius',
        value: 'var(--rte-radius)',
      }),
    );
    expect(decls).toContainEqual(
      expect.objectContaining({ prop: 'display', value: 'grid' }),
    );
  });

  it('a legenda tem o peso do rótulo e o texto de leitura usa --rte-text-muted', () => {
    expect(declsOf(rulesEnding('rte-dialog__legend'))).toContainEqual(
      expect.objectContaining({ prop: 'font-weight', value: '500' }),
    );
    const readonly = declsOf(rulesEnding('rte-dialog__readonly'));
    expect(readonly).toContainEqual(
      expect.objectContaining({ prop: 'overflow-wrap', value: 'anywhere' }),
    );
    expect(readonly).toContainEqual(
      expect.objectContaining({
        prop: 'color',
        value: 'var(--rte-text-muted)',
      }),
    );
  });

  it('os botões de faixa têm alvo de pelo menos 24 px', () => {
    for (const cls of ['rte-dialog__track-add', 'rte-dialog__track-remove']) {
      const decls = declsOf(rulesEnding(cls));
      expect(
        decls.some(
          (d) => d.prop === 'min-block-size' && d.value.includes('24px'),
        ),
      ).toBe(true);
    }
  });

  it('pointer-events: none no vídeo e no iframe só com o editável (V11)', () => {
    const withNone = styleRules().filter((r) =>
      declarations(r).some(
        (d) => d.prop === 'pointer-events' && d.value === 'none',
      ),
    );
    const media = withNone.filter((r) =>
      r.selectors.some((s) => /rt-figure--video|rt-embed/.test(s)),
    );
    expect(media.length).toBeGreaterThan(0);
    for (const r of media)
      for (const s of r.selectors)
        expect(s).toContain(".rte-content[contenteditable='true']");
    const content = readFileSync(CONTENT_CSS_FILE, 'utf8');
    expect(content).not.toMatch(/pointer-events/);
  });

  it('forced-colors: .rte-dialog__fieldset { border-color: CanvasText }', () => {
    const rules: Rule[] = [];
    root.walkAtRules('media', (at) => {
      if (/forced-colors:\s*active/.test(at.params))
        at.walkRules((r) => void rules.push(r));
    });
    const fieldset = rules.filter((r) =>
      r.selectors.some((s) => s.trim().endsWith('.rte-dialog__fieldset')),
    );
    expect(
      declsOf(fieldset).some(
        (d) => d.prop === 'border-color' && d.value === 'CanvasText',
      ),
    ).toBe(true);
  });
});

describe('editor.css: envio de arquivos (spec 05c2a, E21)', () => {
  /** Regras cujo seletor termina na classe (com pseudo-elemento opcional). */
  const rulesOf = (cls: string): Rule[] =>
    styleRules().filter((r) =>
      r.selectors.some((s) =>
        new RegExp(`\\.${cls}(?:::?[\\w-]+)*$`).test(s.trim()),
      ),
    );
  const outsideForced = (rules: Rule[]): Rule[] =>
    rules.filter(
      (r) =>
        !enclosingAtRules(r).some(
          (a) => a.name === 'media' && /forced-colors/.test(a.params),
        ),
    );
  const declsOf = (rules: Rule[]): Declaration[] =>
    rules.flatMap((r) => declarations(r));
  const has = (cls: string, prop: string, value: string): boolean =>
    declsOf(outsideForced(rulesOf(cls))).some(
      (d) => d.prop === prop && d.value === value,
    );
  const forcedRules = (): Rule[] => {
    const rules: Rule[] = [];
    root.walkAtRules('media', (at) => {
      if (/forced-colors:\s*active/.test(at.params))
        at.walkRules((r) => void rules.push(r));
    });
    return rules;
  };

  const CLASSES = [
    'rte-uploads',
    'rte-uploads__list',
    'rte-uploads__item',
    'rte-uploads__name',
    'rte-uploads__progress',
    'rte-uploads__cancel',
    'rte-uploads__status',
    'rte-upload-marker',
    'rte-upload-marker__name',
    'rte-upload-marker__progress',
    'rte-upload-marker__preview',
    'rte-upload-marker--queued',
    'rte-dialog__source',
  ];

  it.each(CLASSES)('%s: regras em rte.components, sob .rte-editor', (cls) => {
    const rules = rulesOf(cls);
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(layerOf(r)).toBe('rte.components');
      for (const s of r.selectors) expect(s.trim()).toMatch(/^\.rte-editor /);
    }
  });

  it('nenhuma regra do envio no content.css (spec 06)', () => {
    const content = readFileSync(CONTENT_CSS_FILE, 'utf8');
    expect(content).not.toMatch(/rte-upload|rte-dialog__source/);
  });

  it('cores do envio só em --rte-* (CanvasText/Highlight em forced-colors), inclusive accent-color', () => {
    const rules = CLASSES.flatMap(rulesOf);
    for (const d of declsOf(rules)) {
      if (!/color|^border|^background|^outline/.test(d.prop)) continue;
      const forced = enclosingAtRules(d).some(
        (a) => a.name === 'media' && /forced-colors/.test(a.params),
      );
      const colors = d.value
        .split(/\s+/)
        .filter((t) => !NON_COLOR_TOKEN.test(t));
      for (const c of colors) {
        if (forced)
          expect(c, `${d.prop}: ${d.value}`).toMatch(
            /^(?:CanvasText|Highlight|var\(--rte-[a-z0-9-]+\)|transparent)$/,
          );
        else expect(c, `${d.prop}: ${d.value}`).toMatch(COLOR_VALUE);
      }
    }
  });

  it('bandeja: borda superior --rte-border, lista sem marcadores, item em grade, nome que quebra', () => {
    expect(
      has('rte-uploads', 'border-block-start', '1px solid var(--rte-border)'),
    ).toBe(true);
    expect(has('rte-uploads__list', 'list-style', 'none')).toBe(true);
    expect(has('rte-uploads__item', 'display', 'grid')).toBe(true);
    expect(has('rte-uploads__name', 'overflow-wrap', 'anywhere')).toBe(true);
  });

  it('progresso: accent-color e barra em tokens, altura ≥ 8 px, borda legível', () => {
    expect(
      has('rte-uploads__progress', 'accent-color', 'var(--rte-primary-text)'),
    ).toBe(true);
    const decls = declsOf(outsideForced(rulesOf('rte-uploads__progress')));
    expect(
      decls.some((d) => d.prop === 'block-size' && /8px/.test(d.value)),
    ).toBe(true);
    expect(
      decls.some(
        (d) =>
          d.prop === 'border' && d.value === '1px solid var(--rte-text-muted)',
      ),
    ).toBe(true);
    // a barra preenchida dos três motores (sem o verde do UA com borda de autor)
    const value = styleRules().filter((r) =>
      r.selectors.some((s) => /progress-value$|progress-bar$/.test(s)),
    );
    expect(value.length).toBeGreaterThanOrEqual(3);
  });

  it('botão cancelar com alvo ≥ 24 × 24 px e foco visível', () => {
    const decls = declsOf(outsideForced(rulesOf('rte-uploads__cancel')));
    expect(
      decls.some((d) => d.prop === 'min-inline-size' && d.value === '24px'),
    ).toBe(true);
    expect(
      decls.some(
        (d) => d.prop === 'min-block-size' && d.value.includes('24px'),
      ),
    ).toBe(true);
    expect(
      styleRules().some((r) =>
        r.selectors.some((s) => /rte-uploads__cancel:focus-visible$/.test(s)),
      ),
    ).toBe(true);
  });

  it('região de status visualmente oculta (fora da tela, ainda no leitor)', () => {
    expect(has('rte-uploads__status', 'position', 'absolute')).toBe(true);
    expect(has('rte-uploads__status', 'clip-path', 'inset(50%)')).toBe(true);
    expect(has('rte-uploads__status', 'overflow', 'hidden')).toBe(true);
    expect(has('rte-uploads__status', 'display', 'none')).toBe(false);
  });

  it('marcador: inline-flex, borda tracejada, raio, sem seleção; miniatura contida; fila', () => {
    expect(has('rte-upload-marker', 'display', 'inline-flex')).toBe(true);
    expect(
      has('rte-upload-marker', 'border', '1px dashed var(--rte-border)'),
    ).toBe(true);
    expect(has('rte-upload-marker', 'border-radius', 'var(--rte-radius)')).toBe(
      true,
    );
    expect(has('rte-upload-marker', 'user-select', 'none')).toBe(true);
    expect(has('rte-upload-marker__preview', 'object-fit', 'contain')).toBe(
      true,
    );
    expect(
      declsOf(rulesOf('rte-upload-marker__preview')).some(
        (d) => d.prop === 'max-block-size' && /var\(--rte-/.test(d.value),
      ),
    ).toBe(true);
    expect(
      has('rte-upload-marker--queued', 'color', 'var(--rte-text-muted)'),
    ).toBe(true);
  });

  it('origem do diálogo em linha com espaçamento', () => {
    expect(has('rte-dialog__source', 'display', 'flex')).toBe(true);
    expect(
      declsOf(rulesOf('rte-dialog__source')).some((d) => d.prop === 'gap'),
    ).toBe(true);
  });

  it('forced-colors: progresso em Highlight com borda CanvasText; marcador CanvasText', () => {
    const forced = forcedRules();
    const decls = (cls: string) =>
      declsOf(
        forced.filter((r) =>
          r.selectors.some((s) => new RegExp(`\\.${cls}$`).test(s.trim())),
        ),
      );
    expect(decls('rte-uploads__progress')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ prop: 'accent-color', value: 'Highlight' }),
        expect.objectContaining({ prop: 'border-color', value: 'CanvasText' }),
      ]),
    );
    expect(decls('rte-upload-marker')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ prop: 'border-color', value: 'CanvasText' }),
      ]),
    );
  });
});
