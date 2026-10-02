import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FORCED_COLORS_TOKENS } from './apply-theme';
import { ANGULAR_DEFAULTS } from './defaults';
import { createRteTheme, NEUTRAL_SPEC } from './create-theme';
import {
  MIX_PCT,
  STATE_AMOUNTS,
  STEP_GAIN,
  TEXT_TARGETS,
  WHITE_Y,
} from './derive';
import { STATIC_TOKENS } from './static-tokens';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, 'theme.css'), 'utf8');
const SEEDS = ['--rte-primary', '--rte-secondary', '--rte-tertiary'];
const ROLES = ['primary', 'secondary', 'tertiary'] as const;
/** Variáveis declaradas só no CSS (nível 2/3 e entrada do matiz), fora do que o plano B emite. */
const CSS_ONLY = ['--rte-neutral-tint', '--rte-focus-width'];

/** CSS sem comentários e com espaços normalizados (o Prettier quebra as linhas longas). */
const code = css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .replace(/\( /g, '(')
  .replace(/ \)/g, ')');

/** Devolve o texto de cada bloco `{...}` do nível superior, com o prefixo que o antecede. */
function topLevel(src: string): { head: string; body: string }[] {
  const out: { head: string; body: string }[] = [];
  let depth = 0;
  let start = 0;
  let bodyStart = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      if (depth === 0) bodyStart = i + 1;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        out.push({
          head: src.slice(start, bodyStart - 1).trim(),
          body: src.slice(bodyStart, i),
        });
        start = i + 1;
      }
    } else if (ch === ';' && depth === 0) {
      out.push({ head: src.slice(start, i).trim(), body: '' });
      start = i + 1;
    }
  }
  return out;
}

const blocks = topLevel(code);
const properties = new Map(
  blocks
    .filter((b) => b.head.startsWith('@property'))
    .map((b) => [b.head.replace('@property', '').trim(), b.body] as const),
);
const nonProperty = code.replace(/@property[^{]*\{[^}]*\}/g, '');

/** Remove blocos `@media {...}` (aninhados) de um texto. */
function stripMedia(src: string): string {
  let out = src;
  for (;;) {
    const i = out.indexOf('@media');
    if (i < 0) return out;
    const open = out.indexOf('{', i);
    let depth = 0;
    let k = open;
    for (; k < out.length; k++) {
      if (out[k] === '{') depth++;
      else if (out[k] === '}' && --depth === 0) break;
    }
    out = out.slice(0, i) + out.slice(k + 1);
  }
}
/** Corpo das regras principais de `@layer rte.theme`, sem os blocos @media. */
const mainTheme = stripMedia(
  blocks
    .filter((b) => b.head === '@layer rte.theme')
    .map((b) => b.body)
    .join(' '),
);

describe('theme.css', () => {
  it('abre com a ordem das camadas', () => {
    expect(blocks[0]?.head).toBe(
      '@layer rte.reset, rte.base, rte.theme, rte.components, rte.content',
    );
  });

  it('declara as sementes como @property <color> com o padrão Angular', () => {
    for (const role of ['primary', 'secondary', 'tertiary'] as const) {
      const body = properties.get(`--rte-${role}`) ?? '';
      expect(body).toContain("syntax: '<color>'");
      expect(body).toContain('inherits: true');
      expect(body).toContain(`initial-value: ${ANGULAR_DEFAULTS[role]}`);
    }
    const tint = properties.get('--rte-neutral-tint') ?? '';
    expect(tint).toContain("syntax: '<number>'");
    expect(tint).toContain('initial-value: 1');
  });

  it('declara as variáveis de nível 2 e 3 como @property com initial-value', () => {
    const expected: Record<string, [string, string]> = {
      '--rte-radius': ['<length>', '6px'],
      '--rte-density': ['<number>', '1'],
      '--rte-font-size': ['<length>', '1rem'],
      '--rte-line-height': ['<number>', '1.6'],
      '--rte-focus-width': ['<length>', '2px'],
    };
    for (const [name, [syntax, initial]] of Object.entries(expected)) {
      const body = properties.get(name) ?? '';
      expect(body, name).toContain(`syntax: '${syntax}'`);
      expect(body, name).toContain('inherits: true');
      expect(body, name).toContain(`initial-value: ${initial}`);
    }
    for (const name of ['--rte-font-sans', '--rte-font-mono']) {
      const body = properties.get(name) ?? '';
      expect(body, name).toContain("syntax: '*'");
      expect(body, name).toContain('inherits: true');
      expect(body, name).toMatch(/initial-value:\s*\S/);
    }
  });

  it('tokens estáticos: light-dark() com os mesmos hex de STATIC_TOKENS', () => {
    for (const key of Object.keys(STATIC_TOKENS.light) as Array<
      keyof typeof STATIC_TOKENS.light
    >) {
      const light = STATIC_TOKENS.light[key];
      const dark = STATIC_TOKENS.dark[key];
      expect(code, key).toContain(
        `--rte-${key}: light-dark(${light}, ${dark});`,
      );
    }
  });

  it('tem os blocos de contraste e de cores forçadas dentro de @layer rte.theme', () => {
    expect(code).toMatch(/@media \(prefers-contrast: more\)/);
    expect(code).toMatch(/@media \(forced-colors: active\)/);
    const forced = code.slice(code.indexOf('@media (forced-colors: active)'));
    for (const decl of [
      '--rte-border: CanvasText',
      '--rte-focus: Highlight',
      '--rte-surface: Canvas',
      '--rte-text: CanvasText',
      '--rte-surface-raised: Canvas',
      '--rte-text-muted: GrayText',
      '--rte-primary-border: ButtonBorder',
      '--rte-secondary-border: ButtonBorder',
      '--rte-tertiary-border: ButtonBorder',
    ])
      expect(forced, decl).toContain(decl);
    const more = code.slice(code.indexOf('@media (prefers-contrast: more)'));
    expect(more).toContain('--rte-border: var(--rte-text-muted)');
    expect(more).toContain('--rte-focus-width: 3px');
    const themeBodies = blocks
      .filter((b) => b.head === '@layer rte.theme')
      .map((b) => b.body);
    for (const media of [
      '@media (prefers-contrast: more)',
      '@media (forced-colors: active)',
    ])
      expect(
        themeBodies.some((body) => body.includes(media)),
        media,
      ).toBe(true);
  });

  it('modos: auto equivale ao padrão; inherit/light/dark conforme o contrato', () => {
    expect(code).toMatch(/\.rte-root\s*\{\s*color-scheme: light dark;/);
    expect(code).toMatch(
      /\.rte-root\[data-rte-mode='auto'\]\s*\{\s*color-scheme: light dark;/,
    );
    expect(code).toMatch(
      /\[data-rte-mode='inherit'\]\s*\{\s*color-scheme: inherit;/,
    );
    expect(code).toMatch(
      /\[data-rte-mode='light'\]\s*\{\s*color-scheme: light;/,
    );
    expect(code).toMatch(/\[data-rte-mode='dark'\]\s*\{\s*color-scheme: dark;/);
  });

  it('sem !important e sem regra fora de @layer (exceto @property)', () => {
    expect(code).not.toContain('!important');
    for (const b of blocks) {
      if (b.head.startsWith('@property')) continue;
      expect(b.head.startsWith('@layer'), b.head).toBe(true);
    }
  });

  it('sem variáveis --_* públicas', () => {
    expect(css).not.toMatch(/--_/);
    for (const f of ['../README.md', '../../../README.md']) {
      let text = '';
      try {
        text = readFileSync(resolve(here, f), 'utf8');
      } catch {
        continue;
      }
      expect(text, f).not.toMatch(/--_/);
    }
  });

  it('degrau on-*/hover/active exato: ganho == STEP_GAIN, limiar == WHITE_Y', () => {
    expect(css).not.toMatch(/\*\s*1000\s*,/);
    const gains = [...code.matchAll(/\)\s*\*\s*(\d+)\s*,\s*1\)/g)].map((m) =>
      Number(m[1]),
    );
    expect(gains).toHaveLength(45);
    for (const g of gains) expect(g).toBe(STEP_GAIN);
    expect(WHITE_Y).toBe(0.1791005);
    // O limiar do degrau aparece como `(<WHITE_Y> - (0.2126 ...`; nenhum outro valor pode restar.
    const thresholds = [...code.matchAll(/\(0\.1791\d* - \(0\.2126/g)].map(
      (m) => m[0],
    );
    expect(thresholds).toHaveLength(45);
    for (const t of thresholds) expect(t).toBe(`(${WHITE_Y} - (0.2126`);
    expect(code).not.toMatch(/0\.1791 /);
    expect(code.split(String(WHITE_Y)).length - 1).toBe(45);
  });

  describe('constantes de calibração: literais do CSS == tabelas do TS', () => {
    /** Valor (texto) da declaração `--rte-<nome>: …;` nas regras principais; exige exatamente uma. */
    const decl = (name: string): string => {
      const found = [
        ...mainTheme.matchAll(new RegExp(`--rte-${name}: ([^;]*);`, 'g')),
      ];
      expect(found, name).toHaveLength(1);
      return found[0]?.[1] ?? '';
    };
    const nums = (text: string, re: RegExp): number[] =>
      [...text.matchAll(re)].map((m) => Number(m[1]));
    const NUM = String.raw`(\d+(?:\.\d+)?)`;

    it('neutros: L e teto de C (claro e escuro) == NEUTRAL_SPEC', () => {
      const one = String.raw`oklch\(from var\(--rte-primary\) ${NUM} calc\(min\(c, ${NUM}\) \* var\(--rte-neutral-tint\)\) h\)`;
      const re = new RegExp(`^light-dark\\(${one}, ${one}\\)$`);
      for (const [name, spec] of Object.entries(NEUTRAL_SPEC)) {
        const m = re.exec(decl(name));
        expect(m, name).not.toBeNull();
        const [, lL, cL, lD, cD] = (m ?? []).map(Number);
        expect([lL, cL], `${name} claro`).toEqual([...spec.light]);
        expect([lD, cD], `${name} escuro`).toEqual([...spec.dark]);
      }
    });

    it('hover/active: quantidade == STATE_AMOUNTS (6 ocorrências por declaração)', () => {
      for (const role of ROLES)
        for (const state of ['hover', 'active'] as const) {
          const text = decl(`${role}-${state}`);
          const scale = nums(
            text,
            new RegExp(`\\(1 - ${NUM} \\* clamp\\(0, \\(${WHITE_Y} - `, 'g'),
          );
          const lift = nums(
            text,
            new RegExp(
              `\\+ ${NUM} \\* \\(1 - clamp\\(0, \\(${WHITE_Y} - `,
              'g',
            ),
          );
          expect(scale, `${role}-${state}`).toHaveLength(3);
          expect(lift, `${role}-${state}`).toHaveLength(3);
          for (const v of [...scale, ...lift])
            expect(v, `${role}-${state}`).toBe(STATE_AMOUNTS[state]);
        }
    });

    it('*-text: alvos claro/escuro == TEXT_TARGETS', () => {
      for (const role of ROLES) {
        const text = decl(`${role}-text`);
        expect(text.startsWith('light-dark('), role).toBe(true);
        const light = nums(
          text,
          new RegExp(`min\\(1, ${NUM} / \\(0\\.2126`, 'g'),
        );
        const dark = nums(
          text,
          new RegExp(`clamp\\(0, \\(${NUM} - \\(0\\.2126`, 'g'),
        );
        expect(light, `${role} claro`).toHaveLength(3);
        expect(dark, `${role} escuro`).toHaveLength(3);
        for (const v of light)
          expect(v, `${role} claro`).toBe(TEXT_TARGETS.light);
        for (const v of dark)
          expect(v, `${role} escuro`).toBe(TEXT_TARGETS.dark);
        // O alvo claro é o 1º argumento de light-dark() e o escuro, o 2º.
        expect(text.indexOf('min(1,')).toBeLessThan(
          text.indexOf('clamp(0, (0.'),
        );
      }
    });

    it('subtle/border: porcentagem da mistura em oklab == MIX_PCT', () => {
      for (const role of ROLES)
        for (const kind of ['subtle', 'border'] as const) {
          const m = new RegExp(
            `^color-mix\\(in oklab, var\\(--rte-${role}\\) (\\d+)%, var\\(--rte-surface\\)\\)$`,
          ).exec(decl(`${role}-${kind}`));
          expect(m, `${role}-${kind}`).not.toBeNull();
          expect(Number(m?.[1]), `${role}-${kind}`).toBe(MIX_PCT[kind]);
        }
    });
  });

  it('sincronia com createRteTheme: mesmas variáveis derivadas', () => {
    const declared = new Set(
      [...mainTheme.matchAll(/(--rte-[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
    );
    const ts = Object.keys(createRteTheme()).filter((k) => !SEEDS.includes(k));
    for (const key of ts) expect(declared.has(key), key).toBe(true);
    for (const key of declared) {
      expect(
        ts.includes(key as string) || CSS_ONLY.includes(key as string),
        key,
      ).toBe(true);
    }
    for (const seed of SEEDS) expect(declared.has(seed), seed).toBe(false);
  });
});

describe('theme.css x plano B (R8)', () => {
  it('FORCED_COLORS_TOKENS == variáveis do bloco @media (forced-colors: active)', () => {
    const i = code.indexOf('@media (forced-colors: active)');
    const block = code.slice(i, code.indexOf('}', i));
    const declared = [...block.matchAll(/(--rte-[a-z0-9-]+)\s*:/g)].map(
      (m) => m[1],
    );
    expect(declared.length).toBeGreaterThan(0);
    expect([...FORCED_COLORS_TOKENS].sort()).toEqual(declared.sort());
  });
});
