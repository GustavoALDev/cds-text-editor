// compara o plano B (JS) com o resultado NATIVO do navegador, token a token
import { readFileSync, writeFileSync } from 'fs';
import { createRteTheme, linearToOklab } from './theme-fallback.mjs';
const native = JSON.parse(readFileSync('results.json', 'utf8'));
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lab = (rgb) => linearToOklab(rgb.map(lin));
const dE = (a, b) => { const x = lab(a), y = lab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const worst = {}; let n = 0; const sums = {}; const jsResults = [];
for (const r of native) {
  const js = createRteTheme({ primary: r.seed, secondary: r.seed, tertiary: r.seed, mode: r.mode }).rgb;
  const pairs = { ...Object.fromEntries(Object.entries(r.base).map(([k, v]) => [k, [v, js[k]]])) };
  for (const [k, v] of Object.entries(r.roles.primary)) { if (k === 'on') continue; pairs[k.replace('primary-', 'primary-')] = [v, js[k === 'seed' ? 'primary' : k]]; }
  for (const [k, [a, b]] of Object.entries(pairs)) { const d = dE(a, b); (worst[k] ??= { d: 0 }); if (d > worst[k].d) worst[k] = { d, seed: r.seed, mode: r.mode, nat: a, js: b }; sums[k] = (sums[k] ?? 0) + d; }
  n++;
  // reaproveita a análise de contraste do harness para o plano B
  jsResults.push({ seed: r.seed, mode: r.mode, base: Object.fromEntries(Object.keys(r.base).map((k) => [k, js[k]])),
    roles: { primary: { seed: js.primary, 'primary-hover': js['primary-hover'], 'primary-active': js['primary-active'], 'on-primary': js['on-primary'], on: js['on-primary'], 'primary-text': js['primary-text'], 'primary-subtle': js['primary-subtle'], 'primary-border': js['primary-border'] } } });
}
console.log(`token                    ΔE médio   ΔE máximo   (pior caso)`);
for (const [k, w] of Object.entries(worst)) console.log(k.padEnd(24), (sums[k] / n).toFixed(4).padStart(8), w.d.toFixed(4).padStart(11), '  ', w.seed, w.mode);
writeFileSync('results_js.json', JSON.stringify(jsResults));
