import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const css = readFileSync('theme.css', 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const res = {};
for (const os of ['light', 'dark']) {
  const page = await browser.newPage({ colorScheme: os });
  await page.setContent(`<style>${css}</style><body><div class="rte-root" id="auto"><i></i></div><div class="rte-root" id="inherit" data-rte-mode="inherit"><i></i></div><div class="rte-root" id="forcedDark" data-rte-mode="dark"><i></i></div></body>`);
  const read = (id) => page.evaluate((i) => { const el = document.querySelector(`#${i} i`); el.style.backgroundColor = 'var(--rte-surface)'; return getComputedStyle(el).backgroundColor; }, id);
  const luma = (c) => { const m = c.match(/[\d.]+/g).map(Number); return +(m[0] > 1 ? m[0] : m[0] * 255).toFixed(0); };
  const row = { auto: luma(await read('auto')), inherit_pagina_sem_toggle: luma(await read('inherit')), forcado_dark: luma(await read('forcedDark')) };
  // o site tem um toggle próprio: força color-scheme dark na página, independente do sistema
  await page.addStyleTag({ content: 'html { color-scheme: dark; }' });
  row.inherit_com_toggle_dark = luma(await read('inherit'));
  row.auto_com_toggle_dark = luma(await read('auto'));
  res[`sistema=${os}`] = row;
  await page.close();
}
console.log(JSON.stringify(res, null, 1));
await browser.close();
