import { expect, test } from '@playwright/test';
import { loadThemePage } from './helpers/page';
import { relLuminance, shownOne } from './helpers/behavior';

const isLight = async (page: Parameters<typeof shownOne>[0]) =>
  relLuminance(await shownOne(page, 'surface'));

test.beforeEach(async ({ page }) => {
  await loadThemePage(page);
});

const setMode = (page: Parameters<typeof shownOne>[0], mode: string | null) =>
  page.evaluate((m) => {
    const root = document.getElementById('root')!;
    if (m === null) root.removeAttribute('data-rte-mode');
    else root.setAttribute('data-rte-mode', m);
  }, mode);

const siteScheme = (page: Parameters<typeof shownOne>[0], v: string) =>
  page.evaluate((s) => {
    document.documentElement.style.colorScheme = s;
  }, v);

test('R6: auto ignora o toggle do site (sistema claro, site escuro -> claro)', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await siteScheme(page, 'dark');
  for (const mode of [null, 'auto']) {
    await setMode(page, mode);
    expect(await isLight(page), `auto (${mode})`).toBeGreaterThan(0.5);
  }
});

test('R6: auto segue o sistema escuro', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await siteScheme(page, 'light');
  for (const mode of [null, 'auto']) {
    await setMode(page, mode);
    expect(await isLight(page), `auto (${mode})`).toBeLessThan(0.1);
  }
});

test('R6: inherit segue o site e reage ao toggle em tempo de execução', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await setMode(page, 'inherit');
  await siteScheme(page, 'dark');
  expect(await isLight(page)).toBeLessThan(0.1);
  await siteScheme(page, 'light');
  expect(await isLight(page)).toBeGreaterThan(0.5);
  await siteScheme(page, 'dark');
  expect(await isLight(page)).toBeLessThan(0.1);
});

test('R6: light e dark forçam o modo independentemente de sistema e site', async ({
  page,
}) => {
  for (const system of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: system });
    for (const site of ['light', 'dark']) {
      await siteScheme(page, site);
      await setMode(page, 'light');
      expect(
        await isLight(page),
        `light sys=${system} site=${site}`,
      ).toBeGreaterThan(0.5);
      await setMode(page, 'dark');
      expect(
        await isLight(page),
        `dark sys=${system} site=${site}`,
      ).toBeLessThan(0.1);
    }
  }
});

test('applyRteTheme nativo: define só as sementes do usuário, data-rte-mode e neutral-tint', async ({
  page,
}) => {
  const r = await page.evaluate(() => {
    const root = document.getElementById('root')!;
    window.RteTheme.applyRteTheme(root, {
      primary: '#123456',
      mode: 'dark',
      neutral: 'gray',
    });
    const inline = Array.from(root.style).sort();
    const attr = root.getAttribute('data-rte-mode');
    window.RteTheme.applyRteTheme(root, { secondary: '#abcdef' });
    return {
      inline,
      attr,
      second: Array.from(root.style),
      attr2: root.getAttribute('data-rte-mode'),
    };
  });
  expect(r.inline).toEqual(['--rte-neutral-tint', '--rte-primary']);
  expect(r.attr).toBe('dark');
  // reaplicar descarta a anterior (propriedades e atributo)
  expect(r.second).toEqual(['--rte-secondary']);
  expect(r.attr2).toBeNull();
});

test('applyRteTheme plano B: define todas as variáveis inline e acompanha o sistema no modo auto', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  const names = await page.evaluate(() => {
    const root = document.getElementById('root')!;
    window.RteTheme.applyRteTheme(root, {
      primary: '#8514f5',
      mode: 'auto',
      force: true,
    });
    return Array.from(root.style);
  });
  for (const n of [
    '--rte-primary',
    '--rte-surface',
    '--rte-primary-hover',
    '--rte-on-primary',
    '--rte-danger',
    'color-scheme',
  ])
    expect(names).toContain(n);
  expect(await isLight(page)).toBeGreaterThan(0.5);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => isLight(page)).toBeLessThan(0.1);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => isLight(page)).toBeGreaterThan(0.5);
});

test('applyRteTheme plano B: cleanup remove listener e propriedades; reaplicar descarta a anterior', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  const live = await page.evaluate(() => {
    // Conta listeners vivos de matchMedia (add - remove).
    const w = window as unknown as { __live: number };
    w.__live = 0;
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (q: string): MediaQueryList => {
      const m = orig(q);
      const add = m.addEventListener.bind(m) as (
        t: string,
        l: EventListenerOrEventListenerObject,
      ) => void;
      const rem = m.removeEventListener.bind(m) as typeof add;
      m.addEventListener = ((
        t: string,
        l: EventListenerOrEventListenerObject,
      ) => {
        w.__live++;
        add(t, l);
      }) as typeof m.addEventListener;
      m.removeEventListener = ((
        t: string,
        l: EventListenerOrEventListenerObject,
      ) => {
        w.__live--;
        rem(t, l);
      }) as typeof m.removeEventListener;
      return m;
    };
    const root = document.getElementById('root')!;
    const opts = { primary: '#8514f5', mode: 'auto', force: true } as const;
    window.RteTheme.applyRteTheme(root, opts);
    const afterFirst = w.__live;
    const cleanup = window.RteTheme.applyRteTheme(root, opts); // reaplica no mesmo elemento
    const afterSecond = w.__live;
    (window as unknown as { __cleanup: () => void }).__cleanup = cleanup;
    return { afterFirst, afterSecond };
  });
  // Plano B sob `auto` assina 3 consultas: prefers-color-scheme, forced-colors e prefers-contrast
  // (R8). Reaplicar não acumula: continua 3.
  expect(live).toEqual({ afterFirst: 3, afterSecond: 3 });

  await page.evaluate(() =>
    (window as unknown as { __cleanup: () => void }).__cleanup(),
  );
  const after = await page.evaluate(() => ({
    live: (window as unknown as { __live: number }).__live,
    inline: document.getElementById('root')!.style.length,
    attr: document.getElementById('root')!.getAttribute('data-rte-mode'),
  }));
  expect(after).toEqual({ live: 0, inline: 0, attr: null });

  // mudar o sistema depois do cleanup não reaplica nada (sem vazamento)
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  expect(
    await page.evaluate(() => document.getElementById('root')!.style.length),
  ).toBe(0);
});

// Nota: sob forced-colors o plano B não escreve inline os tokens que o bloco do theme.css troca por
// cores do sistema, e sob prefers-contrast: more usa a borda = texto secundário (behavior-planb.spec.ts).
