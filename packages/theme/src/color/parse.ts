import { clamp, from8, toSrgb, type Rgb } from './convert';
import { fromOklch } from './oklab';

const NUM = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?`;
const NUM_RE = new RegExp(`^(${NUM})(%|deg)?$`);
const MAX_INPUT_LENGTH = 200;
const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/;
const FN_RE = /^(rgba?|hsla?|oklch)\(([^()]*)\)$/;

interface Token {
  value: number;
  unit: '' | '%' | 'deg';
}

/** Lê um número CSS (com sinal, decimais, `%` ou `deg`); `null` se malformado ou não finito. */
function token(text: string): Token | null {
  const m = NUM_RE.exec(text);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value)
    ? { value, unit: (m[2] ?? '') as Token['unit'] }
    : null;
}

/**
 * Separa os argumentos (vírgula, espaço ou `/`) e valida a quantidade.
 * O 4º é o alfa: validado e ignorado, exceto alfa exatamente 0, que invalida a cor
 * (sementes precisam ser opacas; totalmente transparente é tratada como inválida).
 */
function args(body: string): Token[] | null {
  const parts = body
    .trim()
    .split(/[\s,/]+/)
    .filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const tokens: Token[] = [];
  for (const part of parts) {
    const t = token(part);
    if (!t) return null;
    tokens.push(t);
  }
  if (tokens[3]?.value === 0) return null;
  return tokens.slice(0, 3);
}

function parseHex(text: string): Rgb | null {
  if (!HEX_RE.test(text)) return null;
  const digits = text.slice(1);
  const full =
    digits.length <= 4 ? [...digits].map((c) => c + c).join('') : digits;
  // Alfa (4º canal) é ignorado, salvo 00 (totalmente transparente), que invalida a cor.
  if (full.length === 8 && full.slice(6) === '00') return null;
  const channel = (i: number): number =>
    parseInt(full.slice(i, i + 2), 16) / 255;
  return [channel(0), channel(2), channel(4)];
}

function parseRgb(body: string): Rgb | null {
  const t = args(body);
  if (!t) return null;
  const [r, g, b] = t;
  if (
    !r ||
    !g ||
    !b ||
    r.unit === 'deg' ||
    g.unit === 'deg' ||
    b.unit === 'deg'
  )
    return null;
  const channel = ({ value, unit }: Token): number =>
    unit === '%' ? value / 100 : value / 255;
  return [channel(r), channel(g), channel(b)];
}

function parseHsl(body: string): Rgb | null {
  const t = args(body);
  if (!t) return null;
  const [h, s, l] = t;
  if (!h || !s || !l || h.unit === '%' || s.unit === 'deg' || l.unit === 'deg')
    return null;
  const hue = (((h.value % 360) + 360) % 360) / 30;
  const sat = clamp(s.value / 100);
  const light = clamp(l.value / 100);
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number): number => {
    const k = (n + hue) % 12;
    return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

function parseOklchBody(body: string): Rgb | null {
  const t = args(body);
  if (!t) return null;
  const [l, c, h] = t;
  if (!l || !c || !h || l.unit === 'deg' || c.unit === 'deg' || h.unit === '%')
    return null;
  const L = l.unit === '%' ? l.value / 100 : l.value;
  const C = c.unit === '%' ? (c.value / 100) * 0.4 : c.value;
  // toSrgb recorta cada canal em [0, 1] (como o clamp(0, canal, 1) do theme.css).
  return toSrgb(fromOklch([L, C, h.value]));
}

/** Garante três canais finitos em [0, 1]; qualquer NaN/Infinity vira `null`. */
function sanitize(rgb: Rgb | null): Rgb | null {
  if (!rgb || !rgb.every(Number.isFinite)) return null;
  return [clamp(rgb[0]), clamp(rgb[1]), clamp(rgb[2])];
}

function parsePure(input: string): Rgb | null {
  const text = input.trim().toLowerCase();
  if (text.startsWith('#')) return sanitize(parseHex(text));
  const m = FN_RE.exec(text);
  if (!m) return null;
  const [, name, body = ''] = m;
  if (name === 'oklch') return sanitize(parseOklchBody(body));
  return sanitize(name?.startsWith('rgb') ? parseRgb(body) : parseHsl(body));
}

interface CanvasLike {
  ctx: CanvasRenderingContext2D | null;
  doc: Document;
}

// Cache preguiçoso do canvas, associado ao `document` que o criou (recriado se o documento mudar).
let canvasCache: CanvasLike | null = null;

function getContext(): CanvasRenderingContext2D | null {
  // Resultado negativo (sem contexto 2d) também fica em cache, por documento.
  if (canvasCache?.doc === document) return canvasCache.ctx;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvasCache = { ctx, doc: document };
  return ctx;
}

/**
 * Resolve nomes de cor, `color(display-p3 …)`, `var()` etc. via canvas (só no navegador).
 * O canvas ignora valores inválidos e mantém o `fillStyle` anterior; por isso a atribuição é feita
 * sobre duas bases (`#000` e `#fff`) e só vale se os dois resultados coincidirem.
 * Cores fora do gamut sRGB saem recortadas pelo próprio canvas.
 */
function parseWithCanvas(input: string): Rgb | null {
  if (typeof document === 'undefined') return null;
  try {
    const ctx = getContext();
    if (!ctx) return null;
    const resolved = ['#000', '#fff'].map((base) => {
      ctx.fillStyle = base;
      ctx.fillStyle = input;
      return String(ctx.fillStyle);
    });
    if (resolved[0] !== resolved[1]) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = input;
    ctx.fillRect(0, 0, 1, 1);
    // Lê o pixel sobre fundo transparente (antes de qualquer mistura com as bases): sementes
    // precisam ser opacas; cores com transparência são tratadas como inválidas.
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (r === undefined || g === undefined || b === undefined) return null;
    if (a !== 255) return null;
    return sanitize(from8([r, g, b]));
  } catch {
    return null;
  }
}

/**
 * Lê uma cor CSS. Em Node e no navegador: `#rgb[a]`, `#rrggbb[aa]`, `rgb()/rgba()`, `hsl()/hsla()`
 * e `oklch()`. O alfa é ignorado. Demais formas só com `document` (via canvas); sem ele, `null`.
 * Nunca lança; o resultado tem sempre três canais finitos em [0, 1].
 */
export function parseColor(input: string): Rgb | null {
  // Teto defensivo: nenhuma cor CSS legítima precisa de mais que isso.
  if (typeof input !== 'string' || input.length > MAX_INPUT_LENGTH) return null;
  return parsePure(input) ?? parseWithCanvas(input);
}
