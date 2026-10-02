import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const css = readFileSync('theme.css', 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage();
await page.setContent(`<style>${css}</style>
<style>/* CSS do consumidor SEM camada (deve vencer o da lib) */ .meu-tema { --rte-primary-hover: rgb(1, 2, 3); }</style>
<div id="app" class="app"><div class="rte-root" id="root"><div id="probe"></div></div></div><canvas id="cv" width="1" height="1"></canvas>`);

const out = await page.evaluate(async () => {
  const root = document.getElementById('root'), app = document.getElementById('app'), probe = document.getElementById('probe');
  const ctx = document.getElementById('cv').getContext('2d', { willReadFrequently: true });
  const rgb = (c) => { ctx.clearRect(0,0,1,1); ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.fillRect(0,0,1,1); return [...ctx.getImageData(0,0,1,1).data.slice(0,3)]; };
  const get = (v) => { probe.style.backgroundColor = `var(${v})`; return rgb(getComputedStyle(probe).backgroundColor); };
  const hex = (a) => '#' + a.map(x => x.toString(16).padStart(2,'0')).join('');
  const r = {};

  // 1) valor inválido cai no padrão (graças ao @property <color>)
  const invalid = {};
  for (const bad of ['banana', '', 'var(--nao-existe)', 'rgb(300 0 0 / 5', '12px', 'transparent-ish']) {
    root.style.setProperty('--rte-primary', bad);
    invalid[bad || '(vazio)'] = hex(get('--rte-primary'));
  }
  root.style.removeProperty('--rte-primary');
  r.invalid = invalid; r.defaultPrimary = hex(get('--rte-primary'));

  // 2) formatos de cor aceitos
  const formats = {};
  for (const c of ['#0ea5e9','#0ea','rgb(14 165 233)','hsl(199 89% 48%)','oklch(0.7 0.15 230)','color(display-p3 0.1 0.6 0.9)','lightseagreen','rebeccapurple']) {
    root.style.setProperty('--rte-primary', c); formats[c] = hex(get('--rte-primary')); }
  r.formats = formats; root.style.removeProperty('--rte-primary');

  // 3) prioridade: padrão < :root < ancestral < inline
  const prio = {};
  prio.padrao = hex(get('--rte-primary'));
  document.documentElement.style.setProperty('--rte-primary', '#ff0000'); prio.root = hex(get('--rte-primary'));
  app.style.setProperty('--rte-primary', '#00ff00'); prio.ancestral = hex(get('--rte-primary'));
  root.style.setProperty('--rte-primary', '#0000ff'); prio.instancia = hex(get('--rte-primary'));
  r.prio = prio;
  document.documentElement.style.removeProperty('--rte-primary'); app.style.removeProperty('--rte-primary'); root.style.removeProperty('--rte-primary');

  // 4) CSS do consumidor sem camada vence o da lib (sem !important)
  const before = hex(get('--rte-primary-hover'));
  root.classList.add('meu-tema');
  r.layers = { libDefault: before, comConsumidor: hex(get('--rte-primary-hover')) };
  root.classList.remove('meu-tema');

  // 5) neutros cinza vs tingidos (semente violeta)
  root.style.setProperty('--rte-primary', '#8514f5');
  root.style.colorScheme = 'light';
  const tinted = get('--rte-surface'); root.style.setProperty('--rte-neutral-tint', '0'); const gray = get('--rte-surface');
  r.neutros = { tingido: hex(tinted), cinza: hex(gray), cinzaEhNeutro: gray[0] === gray[1] && gray[1] === gray[2] };
  root.style.removeProperty('--rte-neutral-tint');

  // 6) semente cinza (achromática) não tinge os neutros
  root.style.setProperty('--rte-primary', '#808080'); const g2 = get('--rte-surface');
  r.sementeCinza = { surface: hex(g2), neutro: g2[0] === g2[1] && g2[1] === g2[2] };

  // 7) troca ao vivo: modo claro/escuro e cores
  root.style.setProperty('--rte-primary', '#8514f5');
  root.style.colorScheme = 'light'; const l = hex(get('--rte-surface')); root.style.colorScheme = 'dark'; const d = hex(get('--rte-surface'));
  r.modos = { claro: l, escuro: d };

  // 8) custo de recálculo: 300 trocas de cor com leitura forçada de estilo
  const t0 = performance.now();
  for (let i = 0; i < 300; i++) { root.style.setProperty('--rte-primary', `hsl(${i % 360} 70% 50%)`); getComputedStyle(probe).getPropertyValue('--rte-primary-text'); probe.style.backgroundColor = 'var(--rte-primary-text)'; getComputedStyle(probe).backgroundColor; }
  r.custoMsPorTroca = +((performance.now() - t0) / 300).toFixed(3);

  // 9) suporte a recursos
  r.suporte = {
    corRelativa: CSS.supports('color', 'oklch(from red l c h)'),
    colorSrgbLinearRelativa: CSS.supports('color', 'color(from red srgb-linear calc(r * .5) g b)'),
    colorMix: CSS.supports('color', 'color-mix(in oklch, red, blue)'),
    lightDark: CSS.supports('color', 'light-dark(red, blue)'),
    contrastColor: CSS.supports('color', 'contrast-color(red)'),
    property: !!(window.CSS && CSS.registerProperty),
  };
  return r;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
