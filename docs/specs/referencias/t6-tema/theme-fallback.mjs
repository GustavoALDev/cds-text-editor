/**
 * SPIKE T6 — Plano B em JavaScript: replica as fórmulas de theme.v3.css para navegadores sem
 * cores relativas / light-dark(). Mesma matemática (luminância em srgb-linear, mistura em OKLCH).
 * Em Node aceita #hex/rgb(); no navegador o parse de qualquer cor CSS viria de um <canvas>.
 */
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const enc = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

export function parseColor(input) {
  const s = String(input).trim().toLowerCase();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  m = /^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/.exec(s);
  if (m) return [m[1], m[2], m[3]].map((v) => clamp(Number(v) / 255));
  throw new Error(`Cor não suportada no plano B (use #hex ou rgb()): ${input}`);
}

const toLinear = (rgb) => rgb.map(lin);
const toSrgb = (l) => l.map((v) => enc(clamp(v)));
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// ---- OKLab/OKLCH ----
export function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.0883024619 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
export function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const toOklch = (lin3) => { const [L, a, b] = linearToOklab(lin3); return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360]; };
const fromOklch = ([L, C, h]) => oklabToLinear([L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)]);
const oklchColor = (L, C, h) => toSrgb(fromOklch([L, C, h]));

/** color-mix(in oklch, a p%, b): interpola L, C e H (arco curto); matiz de cor acromática é "ausente". */
function mixOklch(a, pA, b) {
  const [La, Ca, ha] = a, [Lb, Cb, hb] = b, t = 1 - pA;
  const achA = Ca < 1e-4, achB = Cb < 1e-4;
  let h;
  if (achA && achB) h = 0; else if (achA) h = hb; else if (achB) h = ha;
  else { let d = hb - ha; if (d > 180) d -= 360; if (d < -180) d += 360; h = (ha + d * t + 360) % 360; }
  return [La * pA + Lb * t, Ca * pA + Cb * t, h];
}

const WHITE_Y = 0.1791;
export function deriveRole(seedLin, surfaceOklch, dark) {
  const y = luminance(seedLin);
  const s = clamp((WHITE_Y - y) * 1000);             // 1 = semente escura (texto branco), 0 = clara (texto preto)
  const on = [s, s, s];
  const state = (amt) => seedLin.map((c) => c * (1 - amt * s) + amt * (1 - s) * (1 - c));
  const text = dark
    ? seedLin.map((c) => c + (1 - c) * clamp((0.28 - y) / (1 - y)))
    : seedLin.map((c) => c * Math.min(1, 0.13 / y));
  const seedOk = toOklch(seedLin);
  return {
    seed: toSrgb(seedLin), on: toSrgb(on), hover: toSrgb(state(0.14)), active: toSrgb(state(0.26)), text: toSrgb(text),
    subtle: toSrgb(fromOklch(mixOklch(seedOk, 0.12, surfaceOklch))), border: toSrgb(fromOklch(mixOklch(seedOk, 0.45, surfaceOklch))),
  };
}

export function createRteTheme({ primary = '#8514f5', secondary = '#f637e3', tertiary = '#0546ff', mode = 'light', neutralTint = 1 } = {}) {
  const dark = mode === 'dark';
  const p = toLinear(parseColor(primary)), [, c, h] = toOklch(p);
  const k = neutralTint;
  const L = (light, drk) => (dark ? drk : light);
  const neutral = (lL, cL, lD, cD) => oklchColor(L(lL, lD), Math.min(c, L(cL, cD)) * k, h);
  const surfaceOk = [L(0.985, 0.18), Math.min(c, L(0.006, 0.012)) * k, h];
  const tokens = {
    surface: neutral(0.985, 0.006, 0.18, 0.012), 'surface-raised': neutral(1, 0.003, 0.23, 0.014),
    text: neutral(0.22, 0.02, 0.97, 0.006), 'text-muted': neutral(0.45, 0.02, 0.72, 0.015), border: neutral(0.88, 0.02, 0.32, 0.02),
  };
  const roles = { primary, secondary, tertiary };
  for (const [name, color] of Object.entries(roles)) {
    const d = deriveRole(toLinear(parseColor(color)), surfaceOk, dark);
    Object.assign(tokens, { [`${name}`]: d.seed, [`on-${name}`]: d.on, [`${name}-hover`]: d.hover, [`${name}-active`]: d.active, [`${name}-text`]: d.text, [`${name}-subtle`]: d.subtle, [`${name}-border`]: d.border });
  }
  tokens.focus = tokens['primary-text'];
  const to8 = (a) => a.map((v) => Math.round(clamp(v) * 255));
  const hex = (a) => '#' + to8(a).map((v) => v.toString(16).padStart(2, '0')).join('');
  return { rgb: Object.fromEntries(Object.entries(tokens).map(([k2, v]) => [k2, to8(v)])), hex: Object.fromEntries(Object.entries(tokens).map(([k2, v]) => [k2, hex(v)])) };
}
