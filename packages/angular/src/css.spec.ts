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
