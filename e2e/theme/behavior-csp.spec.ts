import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { themeBundle } from './helpers/bundle';

const THEME_CSS = resolve(__dirname, '../../packages/theme/src/theme.css');
const CSP = "default-src 'none'; style-src 'self'; script-src 'self'";
const ORIGIN = 'http://csp.test';

// Sem <style>, <script> ou style="" inline: tudo vem de recursos do mesmo origin.
const HTML = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/theme.css"><div class="rte-root" id="root"><div id="probe"></div></div><script src="/bundle.js"></script>`;

test('CSP restritiva: applyRteTheme (force) usa style.setProperty sem violações', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __violations: string[] };
    w.__violations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      // O pedido automático de favicon do navegador não tem relação com o tema.
      if (!e.blockedURI.endsWith('/favicon.ico'))
        w.__violations.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  const headers = { 'content-security-policy': CSP };
  await page.route(`${ORIGIN}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/theme.css')
      return route.fulfill({
        status: 200,
        headers,
        contentType: 'text/css',
        body: readFileSync(THEME_CSS, 'utf8'),
      });
    if (pathname === '/bundle.js')
      return route.fulfill({
        status: 200,
        headers,
        contentType: 'text/javascript',
        body: themeBundle(),
      });
    return route.fulfill({
      status: 200,
      headers,
      contentType: 'text/html',
      body: HTML,
    });
  });
  await page.goto(`${ORIGIN}/`);

  const r = await page.evaluate(() => {
    const root = document.getElementById('root')!;
    window.RteTheme.applyRteTheme(root, { primary: '#0ea5e9', force: true });
    const w = window as unknown as { __violations: string[] };
    return {
      primary: root.style.getPropertyValue('--rte-primary'),
      hover: root.style.getPropertyValue('--rte-primary-hover'),
      surface: root.style.getPropertyValue('--rte-surface'),
      violations: [...w.__violations],
    };
  });
  expect(r.primary).toBe('#0ea5e9');
  expect(r.hover).toMatch(/^#[0-9a-f]{6}$/);
  expect(r.surface).toMatch(/^#[0-9a-f]{6}$/);
  expect(r.violations).toEqual([]);

  // Controle: um atributo style="" inline É bloqueado por esta CSP e dispara o evento; sem isto
  // o "nenhuma violação" acima não provaria nada.
  const control = await page.evaluate(
    () =>
      new Promise<string[]>((resolveEvents) => {
        const w = window as unknown as { __violations: string[] };
        w.__violations.length = 0;
        document.getElementById('probe')!.setAttribute('style', 'color: red');
        setTimeout(() => resolveEvents([...w.__violations]), 200);
      }),
  );
  expect(control.length).toBeGreaterThan(0);
});
