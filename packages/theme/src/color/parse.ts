import { clamp, from8, toSrgb, type RteRgb } from './convert';
import { fromOklch } from './oklab';

// Número CSS: sem "." final (`5.` é inválido), expoente opcional.
const NUM = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?`;
const NUM_RE = new RegExp(`^(${NUM})(%|deg)?$`);
const MAX_INPUT_LENGTH = 200;
const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/;
const FN_RE = /^(rgba?|hsla?|oklch)\(([^()]*)\)$/;

type Unit = '' | '%' | 'deg';

interface Token {
  value: number;
  unit: Unit;
}

/** Lê um número CSS (com sinal, decimais, `%` ou `deg`); `null` se malformado ou não finito. */
function token(text: string): Token | null {
  const m = NUM_RE.exec(text);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? { value, unit: (m[2] ?? '') as Unit } : null;
}

interface Args {
  /** Os três componentes de cor (o alfa é validado e descartado). */
  c: [Token, Token, Token];
  /** Sintaxe com vírgulas (legada). */
  legacy: boolean;
}

/** Lê uma lista de componentes, cada um um único número CSS. */
function tokens(parts: string[]): Token[] | null {
  const out: Token[] = [];
  for (const part of parts) {
    const t = token(part);
    if (!t) return null;
    out.push(t);
  }
  return out;
}

/**
 * Separa os argumentos como o CSS Color 4: legada `a, b, c[, alfa]` (só vírgulas, sem `/`) ou
 * moderna `a b c[ / alfa]` (só espaços, alfa só depois de `/`). Sem posições vazias nem mistura de
 * separadores. O alfa (número ou %) é validado e ignorado, exceto alfa exatamente 0, que invalida
 * a cor (sementes precisam ser opacas; totalmente transparente é tratada como inválida).
 */
function args(body: string): Args | null {
  const text = body.trim();
  const legacy = text.includes(',');
  let parts: string[];
  let alpha: string | undefined;
  if (legacy) {
    if (text.includes('/')) return null;
    parts = text.split(',').map((p) => p.trim());
    if (parts.length === 4) alpha = parts.pop();
  } else {
    const slash = text.split('/');
    if (slash.length > 2) return null;
    alpha = slash[1]?.trim();
    parts = (slash[0] ?? '').trim().split(/\s+/);
  }
  if (parts.length !== 3 || alpha === '') return null;
  if (parts.some((p) => p === '' || /\s/.test(p))) return null;
  const c = tokens(parts);
  if (!c) return null;
  if (alpha !== undefined) {
    const a = /\s/.test(alpha) ? null : token(alpha);
    // Alfa <= 0 é transparente (o CSS recorta negativos para 0): cor inválida como semente.
    if (!a || a.unit === 'deg' || a.value <= 0) return null;
  }
  return { c: c as Args['c'], legacy };
}

/** `true` se a unidade de cada componente está entre as permitidas na mesma posição. */
const units = (c: Token[], allowed: Unit[][]): boolean =>
  c.every((t, i) => allowed[i]?.includes(t.unit));

function parseHex(text: string): RteRgb | null {
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

function parseRgb(body: string): RteRgb | null {
  const parsed = args(body);
  if (!parsed) return null;
  const { c, legacy } = parsed;
  const nums: Unit[] = ['', '%'];
  if (!units(c, [nums, nums, nums])) return null;
  // Na sintaxe com vírgulas os três canais são todos números ou todos porcentagens.
  if (legacy && !c.every((t) => t.unit === c[0].unit)) return null;
  const channel = ({ value, unit }: Token): number =>
    unit === '%' ? value / 100 : value / 255;
  return [channel(c[0]), channel(c[1]), channel(c[2])];
}

function parseHsl(body: string): RteRgb | null {
  const parsed = args(body);
  if (!parsed) return null;
  const { c, legacy } = parsed;
  // Com vírgulas, S e L precisam de %; na sintaxe moderna também aceitam número (= %).
  const sl: Unit[] = legacy ? ['%'] : ['', '%'];
  if (!units(c, [['', 'deg'], sl, sl])) return null;
  const [h, s, l] = c;
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

function parseOklchBody(body: string): RteRgb | null {
  const parsed = args(body);
  // oklch() só tem a sintaxe moderna (sem vírgulas).
  if (!parsed || parsed.legacy) return null;
  const { c } = parsed;
  if (
    !units(c, [
      ['', '%'],
      ['', '%'],
      ['', 'deg'],
    ])
  )
    return null;
  const [l, C0, h] = c;
  const L = l.unit === '%' ? l.value / 100 : l.value;
  const C = C0.unit === '%' ? (C0.value / 100) * 0.4 : C0.value;
  // toSrgb recorta cada canal em [0, 1] (como o clamp(0, canal, 1) do theme.css).
  return toSrgb(fromOklch([L, C, h.value]));
}

/** Garante três canais finitos em [0, 1]; qualquer NaN/Infinity vira `null`. */
function sanitize(rgb: RteRgb | null): RteRgb | null {
  if (!rgb || !rgb.every(Number.isFinite)) return null;
  return [clamp(rgb[0]), clamp(rgb[1]), clamp(rgb[2])];
}

function parsePure(input: string): RteRgb | null {
  const text = input.trim().toLowerCase();
  if (text.startsWith('#')) return sanitize(parseHex(text));
  const m = FN_RE.exec(text);
  if (!m) return null;
  const [, name, body = ''] = m;
  if (name === 'oklch') return sanitize(parseOklchBody(body));
  return sanitize(name?.startsWith('rgb') ? parseRgb(body) : parseHsl(body));
}

/**
 * Só o caminho puro (sem canvas), que não depende de contexto. Uso interno do plano B, que resolve
 * as demais formas no contexto do elemento; não é exportado por `index.ts`.
 */
export function parseColorPure(input: string): RteRgb | null {
  if (typeof input !== 'string' || input.length > MAX_INPUT_LENGTH) return null;
  return parsePure(input);
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
function parseWithCanvas(input: string): RteRgb | null {
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
 * e `oklch()` com a gramática do CSS Color 4 (sintaxe com vírgulas ou com espaços e `/ alfa`; ângulo
 * só em `deg`; `none` e outras unidades de ângulo ficam para o canvas). No caminho puro, o alfa parcial é ignorado e alfa exatamente 0 invalida a cor. Demais
 * formas só com `document` (via canvas); sem ele, `null`. No canvas, qualquer cor com alfa < 255
 * (não totalmente opaca) é rejeitada.
 * Nunca lança; o resultado tem sempre três canais finitos em [0, 1].
 */
export function parseColor(input: string): RteRgb | null {
  // Teto defensivo: nenhuma cor CSS legítima precisa de mais que isso.
  if (typeof input !== 'string' || input.length > MAX_INPUT_LENGTH) return null;
  return parsePure(input) ?? parseWithCanvas(input);
}
