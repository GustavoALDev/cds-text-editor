import { contrastRatio, toHex, toLinear, type Rgb8 } from './color/convert';
import { oklchToSrgb, toOklch } from './color/oklab';
import { parseColor } from './color/parse';
import type { ColorParser } from './defaults';
import { createRteTheme } from './create-theme';
import { STATIC_TOKENS } from './static-tokens';
import type { RteTheme } from './types';

export interface RteThemeCheck {
  /** Identificador estável: `C1`..`C6b` (primária), `C1:secondary`, `static:danger:surface`... */
  id: string;
  label: string;
  mode: 'light' | 'dark';
  ratio: number;
  min: number;
  /** Sempre `ratio >= min`. */
  pass: boolean;
}

export interface RteThemeReport {
  ok: boolean;
  checks: RteThemeCheck[];
  /** Campos (`primary` | `secondary` | `tertiary`) cujo valor não pôde ser lido e caíram no padrão. */
  invalid: string[];
}

export type CheckThemeOptions = RteTheme & { parseColor?: ColorParser };

const FIELDS = ['primary', 'secondary', 'tertiary'] as const;
const MODES = ['light', 'dark'] as const;

/** Hex `#rrggbb` (sempre bem formado por contrato de `createRteTheme`) para canais de 8 bits. */
const hexToRgb8 = (hex: string): Rgb8 => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** Verificações por papel: [sufixo do id, token de cima, token de baixo, mínimo, rótulo]. */
type Spec = readonly [string, string, string, number, string];

const roleSpecs = (role: string): Spec[] => [
  ['C1', `on-${role}`, role, 4.5, `on-${role} sobre ${role}`],
  ['C2a', `on-${role}`, `${role}-hover`, 4.5, `on-${role} sobre ${role}-hover`],
  [
    'C2b',
    `on-${role}`,
    `${role}-active`,
    4.5,
    `on-${role} sobre ${role}-active`,
  ],
  ['C3a', `${role}-text`, 'surface', 4.5, `${role}-text sobre surface`],
  [
    'C3b',
    `${role}-text`,
    'surface-raised',
    4.5,
    `${role}-text sobre surface-raised`,
  ],
  ['C6a', 'text', `${role}-subtle`, 4.5, `text sobre ${role}-subtle`],
  [
    'C6b',
    `${role}-text`,
    `${role}-subtle`,
    4.5,
    `${role}-text sobre ${role}-subtle`,
  ],
];

/** Verificações da base (independem do papel), idênticas às do spike (`analyze.py`). */
const BASE_SPECS: Spec[] = [
  ['C4', 'focus', 'surface', 3, 'focus sobre surface'],
  ['C5a', 'text', 'surface', 7, 'text sobre surface'],
  ['C5b', 'text-muted', 'surface', 4.5, 'text-muted sobre surface'],
];

const STATIC_SPECS: Spec[] = [
  ...['danger', 'warning', 'success'].flatMap((name): Spec[] =>
    ['surface', 'surface-raised'].map((bg): Spec => [
      `static:${name}:${bg}`,
      name,
      bg,
      4.5,
      `${name} sobre ${bg}`,
    ]),
  ),
  ...Object.keys(STATIC_TOKENS.light)
    .filter((name) => name.startsWith('code-') && name !== 'code-bg')
    .map((name): Spec => [
      `static:${name}:code-bg`,
      name,
      'code-bg',
      4.5,
      `${name} sobre code-bg`,
    ]),
];

function readable(parse: ColorParser, value: string): boolean {
  try {
    const rgb = parse(value);
    return rgb !== null && rgb.every(Number.isFinite);
  } catch {
    return false;
  }
}

/**
 * Roda as verificações de contraste (as 10 do spike para a primária, os mesmos C1/C2/C3/C6 para
 * secundária e terciária, e os tokens estáticos) nos dois modos sobre `createRteTheme`.
 * Nunca lança nem acessa o DOM. Campo omitido usa o padrão sem ser inválido; um valor ilegível
 * (parser devolve `null` ou lança) entra em `invalid`.
 */
export function checkRteTheme(options: CheckThemeOptions = {}): RteThemeReport {
  const parse = options.parseColor ?? parseColor;
  const invalid = FIELDS.filter((f) => {
    const value = options[f];
    return value !== undefined && !readable(parse, value);
  });

  const checks: RteThemeCheck[] = [];
  for (const mode of MODES) {
    const tokens = createRteTheme({ ...options, dark: mode === 'dark' });
    const ratio = (a: string, b: string): number =>
      contrastRatio(
        hexToRgb8(tokens[`--rte-${a}`] as string),
        hexToRgb8(tokens[`--rte-${b}`] as string),
      );
    const run = (id: string, spec: Spec, label: string): void => {
      const [, top, bottom, min] = spec;
      const r = ratio(top, bottom);
      checks.push({ id, label, mode, ratio: r, min, pass: r >= min });
    };
    for (const spec of [...roleSpecs('primary'), ...BASE_SPECS])
      run(spec[0], spec, `${spec[0]} ${spec[4]} (≥ ${spec[3]})`);
    for (const role of ['secondary', 'tertiary'])
      for (const spec of roleSpecs(role))
        run(`${spec[0]}:${role}`, spec, `${spec[0]} ${spec[4]} (≥ ${spec[3]})`);
    for (const spec of STATIC_SPECS)
      run(spec[0], spec, `${spec[4]} (≥ ${spec[3]})`);
  }
  return { ok: checks.every((c) => c.pass), checks, invalid };
}

export interface SuggestRteColorOptions {
  /** Leitor de cores (padrão: `parseColor`). */
  parseColor?: ColorParser;
  /**
   * Avaliador de uma semente (`true` = passa). Para testes e extensão; o padrão aprova a semente
   * quando todas as verificações do papel `primary` passam em `checkRteTheme`.
   */
  check?: (color: string) => boolean;
}

const MAX_L_DISTANCE = 0.5;
const L_STEP = 0.01;

/**
 * Semente mais próxima (menor mudança de L em OKLCH, passo 0,01, até 0,5) que passa as verificações
 * do papel `primary`, como `#rrggbb`. `null` se a própria cor passa, se não pôde ser lida ou se
 * nada dentro do limite passa.
 */
export function suggestRteColor(
  color: string,
  options: SuggestRteColorOptions = {},
): string | null {
  const parse = options.parseColor ?? parseColor;
  let rgb: ReturnType<ColorParser> = null;
  try {
    rgb = parse(color);
  } catch {
    rgb = null;
  }
  if (!rgb || !rgb.every(Number.isFinite)) return null;

  const check =
    options.check ??
    ((seed: string): boolean =>
      checkRteTheme({
        primary: seed,
        ...(options.parseColor && { parseColor: options.parseColor }),
      })
        .checks.filter((c) => !c.id.includes(':'))
        .every((c) => c.pass));
  if (check(color)) return null;

  const [L, C, h] = toOklch(toLinear(rgb));
  const tried = new Set<string>();
  for (let i = 1; i * L_STEP <= MAX_L_DISTANCE + 1e-9; i++) {
    for (const sign of [1, -1]) {
      const l = L + sign * i * L_STEP;
      if (l < 0 || l > 1) continue;
      const candidate = toHex(oklchToSrgb(l, C, h));
      if (tried.has(candidate)) continue;
      tried.add(candidate);
      if (check(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Avisa (pt-BR) sobre campos ilegíveis e verificações reprovadas; devolve o relatório.
 * Idempotente, sem efeitos além de chamar `warn`, sem acesso ao DOM. A análise nunca lança;
 * se o `warn` fornecido lançar, o erro propaga (problema de quem o forneceu).
 */
export function warnIfPoorTheme(
  options: CheckThemeOptions = {},
  warn: (message: string) => void = (m) => console.warn(m),
): RteThemeReport {
  const report = checkRteTheme(options);
  for (const field of report.invalid)
    warn(
      `[rte-theme] valor inválido em \`${field}\`: "${String(options[field as (typeof FIELDS)[number]])}"; usando o padrão do Angular.`,
    );
  for (const c of report.checks.filter((x) => !x.pass)) {
    const suggestion = options.primary
      ? suggestRteColor(
          options.primary,
          options.parseColor ? { parseColor: options.parseColor } : {},
        )
      : null;
    warn(
      `[rte-theme] contraste insuficiente (${c.mode}) em ${c.id}: ${c.label}; razão ${c.ratio.toFixed(2)} < ${c.min}.` +
        (suggestion ? ` Sugestão para \`primary\`: ${suggestion}.` : ''),
    );
  }
  return report;
}
