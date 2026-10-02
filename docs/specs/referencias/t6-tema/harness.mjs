import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'fs';
const HS = process.env.CHROME;
const css = readFileSync(process.argv[2] ?? 'theme.css', 'utf8');
const seedsFile = JSON.parse(readFileSync('seeds.json', 'utf8'));

const browser = await chromium.launch({ executablePath: HS });
const page = await browser.newPage();
await page.setContent(`<style>${css}</style><div class="rte-root" id="root"><div id="probe"></div></div><canvas id="cv" width="1" height="1"></canvas>`);

// resolve qualquer cor CSS para sRGB 8-bit como o navegador a exibiria
const results = await page.evaluate((seeds) => {
  const root = document.getElementById('root');
  const probe = document.getElementById('probe');
  const ctx = document.getElementById('cv').getContext('2d', { willReadFrequently: true });
  const rgb = (cssColor) => { ctx.clearRect(0,0,1,1); ctx.fillStyle = '#000'; ctx.fillStyle = cssColor; ctx.fillRect(0,0,1,1); const d = ctx.getImageData(0,0,1,1).data; return [d[0], d[1], d[2]]; };
  const get = (v) => { probe.style.backgroundColor = `var(${v})`; return rgb(getComputedStyle(probe).backgroundColor); };
  const out = [];
  const roles = ['primary', 'secondary', 'tertiary'];
  const vars = ['surface','surface-raised','text','text-muted','border','focus'];
  for (const seed of seeds) {
    for (const mode of ['light', 'dark']) {
      root.style.colorScheme = mode;
      root.style.setProperty('--rte-primary', seed);
      root.style.setProperty('--rte-secondary', seed);
      root.style.setProperty('--rte-tertiary', seed);
      const r = { seed, mode, base: {}, roles: {} };
      for (const v of vars) r.base[v] = get('--rte-' + v);
      for (const role of roles.slice(0, 1)) {
        r.roles[role] = { seed: get('--rte-' + role) };
        for (const v of ['hover','active','on-' + role,'text','subtle','border'].map(x => x.startsWith('on-') ? x : `${role}-${x}`)) r.roles[role][v] = get('--rte-' + v);
        r.roles[role]['on'] = r.roles[role]['on-' + role];
      }
      out.push(r);
    }
  }
  return out;
}, seedsFile);
writeFileSync('results.json', JSON.stringify(results));
await browser.close();
console.log('ok', results.length);
