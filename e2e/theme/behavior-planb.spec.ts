import { expect, test, type Page } from '@playwright/test';
import { parseColor } from '../../packages/theme/src/color/parse';
import { contrastRatio, to8 } from '../../packages/theme/src/color/convert';
import { createRteTheme } from '../../packages/theme/src/create-theme';
import type { ApplyRteThemeOptions } from '../../packages/theme/src/apply-theme';
import { loadThemePage } from './helpers/page';
import { addCss, computed, shown, trackErrors } from './helpers/behavior';

/*
 * Plano B (`force: true`) com sementes vindas da cascata e de `var()`, e R8 (forced-colors /
 * prefers-contrast) no plano B. Os três motores têm suporte nativo, então `force: true` é a única
 * forma de exercitar o plano B aqui; o caminho é o mesmo de um navegador sem suporte.
 */

const ROLE_TOKENS = (r: string): string[] => [
  r,
  `on-${r}`,
  `${r}-hover`,
  `${r}-active`,
  `${r}-text`,
  `${r}-subtle`,
  `${r}-border`,
];

/** 8 bits de um hex de `createRteTheme` (calculado no Node). */
const rgb8 = (hex: string | undefined) => to8(parseColor(hex ?? '')!);

/** Aplica no #root e registra quantos filhos foram inseridos (sondas) durante a aplicação. */
function apply(
  page: Page,
  options: ApplyRteThemeOptions,
): Promise<{ before: number; after: number; added: number }> {
  return page.evaluate(async (o) => {
    const root = document.getElementById('root')!;
    const before = root.children.length;
    let added = 0;
    const mo = new MutationObserver((records) => {
      for (const r of records) added += r.addedNodes.length;
    });
    mo.observe(root, { childList: true });
    const w = window as unknown as {
      __cleanup?: () => void;
      RteTheme: typeof window.RteTheme;
    };
    w.__cleanup = w.RteTheme.applyRteTheme(root, o);
    await Promise.resolve(); // entrega os registros do MutationObserver
    mo.disconnect();
    return { before, after: root.children.length, added };
  }, options);
}

const cleanup = (page: Page): Promise<number> =>
  page.evaluate(() => {
    (window as unknown as { __cleanup: () => void }).__cleanup();
    return document.getElementById('root')!.children.length;
  });

const inline = (page: Page, names: string[]): Promise<Record<string, string>> =>
  page.evaluate((list) => {
    const s = document.getElementById('root')!.style;
    return Object.fromEntries(
      list.map((n) => [n, s.getPropertyValue(`--rte-${n}`)]),
    );
  }, names);

test.beforeEach(async ({ page }) => {
  await loadThemePage(page);
});

test('plano B: var() dado nas opções é resolvido no contexto do elemento', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await addCss(page, ':root{--marca:#0ea5e9}');
  for (const mode of ['light', 'dark'] as const) {
    const r = await apply(page, { primary: 'var(--marca)', mode, force: true });
    const want = createRteTheme({ primary: '#0ea5e9', mode });
    const got = await inline(page, ['primary', 'primary-hover', 'on-primary']);
    expect(got['primary-hover'], mode).toBe(want['--rte-primary-hover']);
    expect(got['on-primary'], mode).toBe(want['--rte-on-primary']);
    expect(got['primary'], mode).toBe('#0ea5e9');
    expect((await shown(page, ['primary']))['primary'], mode).toEqual([
      14, 165, 233,
    ]);
    // A sonda foi usada (um filho inserido) e não ficou no DOM.
    expect(r.added, mode).toBe(1);
    expect(r.after, mode).toBe(r.before);
    expect(await cleanup(page), mode).toBe(r.before);
  }
  expect(errors).toEqual([]);
});

test('plano B: papel omitido segue a semente do :root (não o padrão Angular)', async ({
  page,
}) => {
  await addCss(page, ':root{--rte-secondary:#10b981}');
  for (const mode of ['light', 'dark'] as const) {
    const r = await apply(page, { primary: '#8514f5', mode, force: true });
    const want = createRteTheme({
      primary: '#8514f5',
      secondary: '#10b981',
      mode,
    });
    const names = ROLE_TOKENS('secondary');
    const got = await shown(page, names);
    for (const n of names)
      expect(got[n], `${mode} ${n}`).toEqual(rgb8(want[`--rte-${n}`]));
    // Prova de que o plano B rodou (derivado inline). A semente lida da cascata agora TAMBÉM é
    // gravada inline (antes esperávamos '' aqui): semente viva + derivados congelados saíam de
    // compasso quando a cascata mudava depois. Agora o par semente+derivados é uma foto coerente.
    const raw = await inline(page, ['secondary', 'secondary-hover']);
    expect(raw['secondary-hover'], mode).toBe(want['--rte-secondary-hover']);
    expect(raw['secondary'], mode).toBe(want['--rte-secondary']);
    expect(raw['secondary'], mode).toBe('#10b981');
    expect(r.added, mode).toBe(0); // tudo legível: nenhuma sonda
    await cleanup(page);
  }
});

/** Troca o valor de `--rte-primary` no :root por uma folha nova (vence a anterior, mesma especificidade). */
const setRootPrimary = (page: Page, value: string): Promise<void> =>
  addCss(page, `:root{--rte-primary:${value}}`);

test('plano B: a foto da cascata é consistente; mudar o :root depois não quebra o contraste até reaplicar', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await setRootPrimary(page, '#ffff00');
  await apply(page, { mode: 'light', force: true });
  const yellow = createRteTheme({ primary: '#ffff00', mode: 'light' });
  expect((await inline(page, ['primary']))['primary']).toBe('#ffff00');

  // A cascata muda depois da aplicação: o par exibido continua o amarelo (foto consistente).
  await setRootPrimary(page, '#000080');
  let t = await shown(page, ['primary', 'on-primary']);
  expect(t['primary']).toEqual(rgb8(yellow['--rte-primary']));
  expect(t['on-primary']).toEqual(rgb8(yellow['--rte-on-primary']));
  expect(contrastRatio(t['primary']!, t['on-primary']!)).toBeGreaterThanOrEqual(
    4.5,
  );

  // Reaplicar relê a cascata: o par passa ao azul-marinho com texto branco.
  await apply(page, { mode: 'light', force: true });
  const navy = createRteTheme({ primary: '#000080', mode: 'light' });
  t = await shown(page, ['primary', 'on-primary', 'primary-hover']);
  expect(t['primary']).toEqual([0, 0, 128]);
  expect(t['on-primary']).toEqual([255, 255, 255]);
  expect(t['primary-hover']).toEqual(rgb8(navy['--rte-primary-hover']));
  expect(contrastRatio(t['primary']!, t['on-primary']!)).toBeGreaterThanOrEqual(
    4.5,
  );
  await cleanup(page);
  // O cleanup remove a semente gravada: volta a valer a cascata.
  expect((await inline(page, ['primary']))['primary']).toBe('');
  expect(errors).toEqual([]);
});

test('plano B: semente inline do próprio usuário no #root sobrevive à aplicação e ao cleanup', async ({
  page,
}) => {
  await setRootPrimary(page, '#ffff00');
  await page.evaluate(() =>
    document
      .getElementById('root')!
      .style.setProperty('--rte-primary', '#000080'),
  );
  await apply(page, { mode: 'light', force: true });
  const navy = createRteTheme({ primary: '#000080', mode: 'light' });
  expect((await inline(page, ['primary']))['primary']).toBe('#000080');
  const t = await shown(page, ['primary', 'on-primary', 'primary-hover']);
  expect(t['primary']).toEqual([0, 0, 128]);
  expect(t['on-primary']).toEqual(rgb8(navy['--rte-on-primary']));
  expect(t['primary-hover']).toEqual(rgb8(navy['--rte-primary-hover']));
  expect(contrastRatio(t['primary']!, t['on-primary']!)).toBeGreaterThanOrEqual(
    4.5,
  );
  await cleanup(page);
  const after = await inline(page, ['primary', 'on-primary']);
  expect(after['primary']).toBe('#000080');
  expect(after['on-primary']).toBe('');
});

test('plano B: valor inválido cai no valor herdado e, sem nada acima, no padrão', async ({
  page,
}) => {
  const errors = trackErrors(page);
  const derived = ['primary', 'primary-hover', 'on-primary', 'primary-border'];
  // Sem nada acima: padrão Angular.
  let r = await apply(page, { primary: 'banana', mode: 'light', force: true });
  const def = createRteTheme({ mode: 'light' });
  let got = await shown(page, derived);
  for (const n of derived)
    expect(got[n], `padrão ${n}`).toEqual(rgb8(def[`--rte-${n}`]));
  expect(r.after).toBe(r.before);
  await cleanup(page);

  // Com :root válido: derivado do vermelho.
  await addCss(page, ':root{--rte-primary:#ff0000}');
  r = await apply(page, { primary: 'banana', mode: 'light', force: true });
  const red = createRteTheme({ primary: '#ff0000', mode: 'light' });
  got = await shown(page, derived);
  for (const n of derived)
    expect(got[n], `herdado ${n}`).toEqual(rgb8(red[`--rte-${n}`]));
  expect((await inline(page, ['primary-hover']))['primary-hover']).toBe(
    red['--rte-primary-hover'],
  );
  expect(r.added).toBe(1); // 'banana' passou pela sonda (rejeitada)
  expect(r.after).toBe(r.before);
  expect(await cleanup(page)).toBe(r.before);
  expect(errors).toEqual([]);
});

test('plano B: nome de cor e currentcolor resolvidos; nenhuma sonda fica no DOM', async ({
  page,
}) => {
  const r = await apply(page, {
    primary: 'rebeccapurple',
    mode: 'light',
    force: true,
  });
  const want = createRteTheme({ primary: '#663399', mode: 'light' });
  expect((await inline(page, ['primary-hover']))['primary-hover']).toBe(
    want['--rte-primary-hover'],
  );
  expect((await shown(page, ['primary']))['primary']).toEqual([102, 51, 153]);
  expect(r.after).toBe(r.before);
  expect(await cleanup(page)).toBe(r.before);

  // currentcolor é a cor do texto do elemento (não a do canvas, que seria preto).
  await addCss(page, '#root{color:#15803d}');
  const c = await apply(page, {
    primary: 'currentcolor',
    mode: 'light',
    force: true,
  });
  const green = createRteTheme({ primary: '#15803d', mode: 'light' });
  expect((await inline(page, ['primary-hover']))['primary-hover']).toBe(
    green['--rte-primary-hover'],
  );
  expect(c.added).toBe(1);
  expect(c.after).toBe(c.before);
  expect(await cleanup(page)).toBe(c.before);
});

test('plano B R8: forced-colors deixa borda/foco/superfície/texto para as cores do sistema', async ({
  page,
  browserName,
}) => {
  await page.emulateMedia({ forcedColors: 'active' });
  // Firefox não reavalia @media de folhas já carregadas ao mudar a emulação: recarrega o conteúdo.
  await loadThemePage(page);
  const active = await page.evaluate(
    () => matchMedia('(forced-colors: active)').matches,
  );
  test.skip(
    !active,
    `${browserName}: emulateMedia({forcedColors}) não ativa (forced-colors: active) neste motor`,
  );
  await apply(page, { primary: '#0ea5e9', mode: 'light', force: true });
  const raw = await inline(page, [
    'border',
    'focus',
    'surface',
    'surface-raised',
    'text',
    'text-muted',
    'primary-border',
    'primary-hover',
  ]);
  for (const n of [
    'border',
    'focus',
    'surface',
    'surface-raised',
    'text',
    'text-muted',
    'primary-border',
  ])
    expect(raw[n], `inline --rte-${n}`).toBe('');
  // Prova de que o plano B rodou.
  expect(raw['primary-hover']).toBe(
    createRteTheme({ primary: '#0ea5e9', mode: 'light' })[
      '--rte-primary-hover'
    ],
  );
  expect(await computed(page, '--rte-border')).toBe('CanvasText');
  expect(await computed(page, '--rte-focus')).toBe('Highlight');
  expect(await computed(page, '--rte-surface')).toBe('Canvas');
  const t = await shown(page, ['border', 'focus', 'surface', 'text']);
  expect(t['border']).not.toEqual(t['surface']);
  expect(t['focus']).not.toEqual(t['surface']);
  expect(contrastRatio(t['text']!, t['surface']!)).toBeGreaterThanOrEqual(7);
});

test('plano B R8: prefers-contrast: more faz a borda igual ao texto secundário', async ({
  page,
  browserName,
}) => {
  await page.emulateMedia({ contrast: 'more' });
  await loadThemePage(page);
  const active = await page.evaluate(
    () => matchMedia('(prefers-contrast: more)').matches,
  );
  test.skip(
    !active,
    `${browserName}: emulateMedia({contrast:'more'}) não ativa (prefers-contrast: more) neste motor`,
  );
  for (const mode of ['light', 'dark'] as const) {
    await apply(page, { primary: '#0ea5e9', mode, force: true });
    const raw = await inline(page, ['border', 'text-muted']);
    expect(raw['border'], mode).toMatch(/^#[0-9a-f]{6}$/);
    expect(raw['border'], mode).toBe(raw['text-muted']);
    const t = await shown(page, ['border', 'text-muted', 'surface']);
    expect(t['border'], mode).toEqual(t['text-muted']);
    expect(
      contrastRatio(t['border']!, t['surface']!),
      mode,
    ).toBeGreaterThanOrEqual(3);
    expect(await computed(page, '--rte-focus-width'), mode).toBe('3px');
    await cleanup(page);
  }
});

test('plano B: override de nível 3 do consumidor (.rte-root) vale como no nativo, e subtle/border saem da superfície dele', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await addCss(
    page,
    '.rte-root{--rte-surface:#fffdf7;--rte-danger:#c62828;--rte-primary-text:#123456}',
  );
  const names = [
    'surface',
    'danger',
    'primary-text',
    'focus',
    'primary-subtle',
    'primary-border',
    'secondary-subtle',
    'text',
    'warning',
  ];
  for (const mode of ['light', 'dark'] as const) {
    // Referência: o caminho nativo, com o mesmo CSS do consumidor.
    await apply(page, { primary: '#0ea5e9', mode });
    const native = await shown(page, names);
    await cleanup(page);
    await apply(page, { primary: '#0ea5e9', mode, force: true });
    const planB = await shown(page, names);
    expect(planB['surface'], mode).toEqual([255, 253, 247]);
    expect(planB['danger'], mode).toEqual([198, 40, 40]);
    expect(planB['primary-text'], mode).toEqual([18, 52, 86]);
    // --rte-focus = var(--rte-primary-text) também segue o override, como no CSS.
    expect(planB['focus'], mode).toEqual([18, 52, 86]);
    for (const n of names)
      for (let i = 0; i < 3; i++)
        expect(
          Math.abs(planB[n]![i]! - native[n]![i]!),
          `${mode} ${n} nativo=${native[n]} planoB=${planB[n]}`,
        ).toBeLessThanOrEqual(2);
    // Os overrides não foram gravados inline; os demais tokens, sim (o plano B rodou).
    const raw = await inline(page, [
      'surface',
      'danger',
      'focus',
      'text',
      'warning',
    ]);
    expect(raw['surface'], mode).toBe('');
    expect(raw['danger'], mode).toBe('');
    expect(raw['focus'], mode).toBe('');
    expect(raw['text'], mode).not.toBe('');
    expect(raw['warning'], mode).not.toBe('');
    await cleanup(page);
  }
  expect(errors).toEqual([]);
});
