import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { parseColor } from '../../packages/theme/src/color/parse';
import { to8 } from '../../packages/theme/src/color/convert';
import { loadThemePage } from './helpers/page';
import {
  DEFAULT_SEEDS,
  addCss,
  addCssFirst,
  computed,
  sameColor,
  shown,
  shownOne,
  trackErrors,
  wrapRoot,
} from './helpers/behavior';

const THEME_CSS = resolve(__dirname, '../../packages/theme/src/theme.css');
// Referência calculada em Node com as próprias funções do pacote (oklab -> sRGB, recortado).
const OKLCH_REF = to8(parseColor('oklch(0.7 0.15 150)')!);
const tolerance = (v: string): number =>
  v.startsWith('oklch') || v.startsWith('color(') ? 3 : 2;
const ROLES = ['primary', 'secondary', 'tertiary'] as const;

test.beforeEach(async ({ page }) => {
  await loadThemePage(page);
});

// "Inválido cai no padrão" vale só quando nenhum valor válido está acima na cascata: um valor
// inválido é descartado (como `unset`) e a semente herda o `:root`/ancestral válido primeiro.
test('R3: valor inválido inline cai no padrão Angular em cada semente', async ({
  page,
}) => {
  const errors = trackErrors(page);
  const setInline = (role: string, v: string, viaAttribute: boolean) =>
    page.evaluate(
      ([r, val, attr]) => {
        const root = document.getElementById('root')!;
        // `setProperty(nome, '')` REMOVE a propriedade; o valor vazio de verdade só existe via atributo.
        if (attr === '1') root.setAttribute('style', `--rte-${r}: ;`);
        else root.style.setProperty(`--rte-${r}`, val as string);
      },
      [role, v, viaAttribute ? '1' : '0'],
    );
  const clear = () =>
    page.evaluate(() =>
      document.getElementById('root')!.removeAttribute('style'),
    );
  const bads: [string, boolean][] = [
    ['banana', false],
    ['', true],
    ['var(--inexistente)', false],
    ['12px', false],
  ];
  for (const [bad, attr] of bads) {
    for (const role of ROLES) {
      await setInline(role, bad, attr);
      expect(await shownOne(page, role), `--rte-${role}: "${bad}"`).toEqual(
        DEFAULT_SEEDS[role],
      );
    }
    await clear();
  }
  // Com um valor válido acima (:root), o inválido na instância herda esse valor, não o padrão.
  await addCss(
    page,
    ':root{--rte-primary:#ff0000;--rte-secondary:#00ff00;--rte-tertiary:#0000ff}',
  );
  const expected = {
    primary: [255, 0, 0],
    secondary: [0, 255, 0],
    tertiary: [0, 0, 255],
  };
  for (const [bad, attr] of bads) {
    for (const role of ROLES) {
      await setInline(role, bad, attr);
      expect(
        await shownOne(page, role),
        `herdado --rte-${role}: "${bad}"`,
      ).toEqual(expected[role]);
    }
    await clear();
  }
  expect(errors).toEqual([]);
});

test('R3: applyRteTheme com semente inválida (nativo e plano B) termina no padrão sem lançar', async ({
  page,
}) => {
  const errors = trackErrors(page);
  const defaults = await shown(page, ['primary', 'primary-hover', 'surface']);
  for (const force of [false, true]) {
    await page.evaluate(
      (f) =>
        window.RteTheme.applyRteTheme(document.getElementById('root')!, {
          primary: 'banana',
          force: f,
        }),
      force,
    );
    const got = await shown(page, ['primary', 'primary-hover', 'surface']);
    expect(got['primary'], `force=${force}`).toEqual(DEFAULT_SEEDS.primary);
    // derivados iguais aos do tema padrão (Angular)
    expect(got['primary-hover'], `force=${force}`).toEqual(
      defaults['primary-hover'],
    );
    expect(got['surface'], `force=${force}`).toEqual(defaults['surface']);
  }
  expect(errors).toEqual([]);
});

test('R4: prioridade padrão < :root < ancestral < instância (sementes e nível 2)', async ({
  page,
}) => {
  expect(await shownOne(page, 'primary')).toEqual(DEFAULT_SEEDS.primary);
  expect(await computed(page, '--rte-radius')).toBe('6px');

  await addCss(page, ':root{--rte-primary:#ff0000;--rte-radius:10px}');
  expect(await shownOne(page, 'primary')).toEqual([255, 0, 0]);
  expect(await computed(page, '--rte-radius')).toBe('10px');

  await wrapRoot(page);
  await addCss(page, '#wrap{--rte-primary:#00ff00;--rte-radius:12px}');
  expect(await shownOne(page, 'primary')).toEqual([0, 255, 0]);
  expect(await computed(page, '--rte-radius')).toBe('12px');

  await page.evaluate(() => {
    const s = document.getElementById('root')!.style;
    s.setProperty('--rte-primary', '#0000ff');
    s.setProperty('--rte-radius', '14px');
  });
  expect(await shownOne(page, 'primary')).toEqual([0, 0, 255]);
  expect(await computed(page, '--rte-radius')).toBe('14px');

  // inválido na instância é descartado (como `unset`): cai no valor herdado do ancestral (12px)
  await page.evaluate(() =>
    document
      .getElementById('root')!
      .style.setProperty('--rte-radius', 'banana'),
  );
  expect(await computed(page, '--rte-radius')).toBe('12px');
  // sem nenhum valor válido acima, cai no padrão (6px)
  await page.evaluate(() => {
    const root = document.getElementById('root')!;
    document.body.append(root);
    document.getElementById('wrap')!.remove();
  });
  await page.evaluate(() => {
    for (const s of Array.from(document.querySelectorAll('style')).slice(1))
      s.remove();
  });
  expect(await computed(page, '--rte-radius')).toBe('6px');
});

test('R4: camadas — CSS do consumidor sem camada vence sem !important; derivadas não vêm de :root', async ({
  page,
}) => {
  expect(readFileSync(THEME_CSS, 'utf8')).not.toContain('!important');

  const before = await shownOne(page, 'primary-hover');
  expect(before).not.toEqual([1, 2, 3]);

  // Contrato: token DERIVADO (nível 3) declarado em :root/ancestral NÃO vence a regra da própria
  // .rte-root (a declaração direta ganha da herança); só sementes funcionam a partir de :root.
  await addCss(
    page,
    ':root{--rte-primary-hover:rgb(1,2,3);--rte-primary:#ff0000}',
  );
  expect(await shownOne(page, 'primary')).toEqual([255, 0, 0]);
  const fromRoot = await shownOne(page, 'primary-hover');
  expect(fromRoot).not.toEqual([1, 2, 3]);
  expect(fromRoot).not.toEqual(before); // derivou da nova semente, não do valor em :root

  // Para sobrescrever o derivado: CSS do consumidor mirando .rte-root, sem camada e sem !important.
  // A regra vem ANTES do theme.css no documento e tem a mesma especificidade: só a camada
  // (CSS sem camada vence qualquer camada) faz ela vencer; a ordem no arquivo favoreceria o tema.
  await addCssFirst(page, '.rte-root{--rte-primary-hover:rgb(1,2,3)}');
  expect(await shownOne(page, 'primary-hover')).toEqual([1, 2, 3]);

  // A ordem declarada em theme.css (rte.reset, rte.base, rte.theme, rte.components, ...) vale:
  // regra em rte.components (depois de rte.theme) vence o tema; em rte.reset (antes) perde.
  await addCss(
    page,
    '@layer rte.components{.rte-root{--rte-secondary-hover:rgb(4,5,6)}} @layer rte.reset{.rte-root{--rte-tertiary-hover:rgb(7,8,9)}}',
  );
  expect(await shownOne(page, 'secondary-hover')).toEqual([4, 5, 6]);
  expect(await shownOne(page, 'tertiary-hover')).not.toEqual([7, 8, 9]);
});

test('R5: formatos de cor aceitos como semente', async ({ page }) => {
  await addCss(page, ':root{--marca:#123456}');
  const cases: [string, readonly [number, number, number] | null][] = [
    ['#f00', [255, 0, 0]],
    ['#00ff00', [0, 255, 0]],
    ['rgb(0 0 255)', [0, 0, 255]],
    ['rgb(10, 20, 30)', [10, 20, 30]],
    ['hsl(120 100% 25%)', [0, 128, 0]],
    ['rebeccapurple', [102, 51, 153]],
    ['var(--marca)', [18, 52, 86]],
    ['oklch(0.7 0.15 150)', OKLCH_REF],
    ['color(display-p3 1 0 0)', [255, 0, 0]],
  ];
  for (const [value, expected] of cases) {
    await page.evaluate(
      (v) =>
        document.getElementById('root')!.style.setProperty('--rte-primary', v),
      value,
    );
    const got = await shownOne(page, 'primary');
    expect(got.every(Number.isFinite), value).toBe(true);
    expect(
      sameColor(got, DEFAULT_SEEDS.primary),
      `${value} caiu no padrão`,
    ).toBe(false);
    if (expected)
      expect(
        sameColor(got, expected, tolerance(value)),
        `${value} -> ${got}`,
      ).toBe(true);
  }
});

test('R5: parseColor no navegador (caminho puro e canvas)', async ({
  page,
}) => {
  const r = await page.evaluate(() => {
    const p = window.RteTheme.parseColor;
    return {
      hex: p('#fff'),
      oklch: p('oklch(0.7 0.15 150)'),
      named: p('rebeccapurple'),
      p3: p('color(display-p3 1 0 0)'),
      transparent: p('transparent'),
      banana: p('banana'),
    };
  });
  for (const k of ['hex', 'oklch', 'named', 'p3'] as const) {
    const c = r[k];
    expect(c, k).not.toBeNull();
    expect(c!.length).toBe(3);
    for (const v of c!) {
      expect(Number.isFinite(v), k).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  }
  expect(r.named![0]).toBeCloseTo(0.4, 2);
  expect(r.named![2]).toBeCloseTo(0.6, 2);
  expect(r.transparent).toBeNull();
  expect(r.banana).toBeNull();
});

test('Neutros: tinted tinge a superfície, gray a deixa neutra, semente cinza nunca tinge', async ({
  page,
}) => {
  const surfaceFor = async (
    primary: string,
    neutral: 'tinted' | 'gray',
    mode: 'light' | 'dark',
    force: boolean,
  ) => {
    await page.evaluate(
      (o) => window.RteTheme.applyRteTheme(document.getElementById('root')!, o),
      { primary, neutral, mode, force },
    );
    return shownOne(page, 'surface');
  };
  for (const force of [false, true]) {
    for (const mode of ['light', 'dark'] as const) {
      const ctx = `force=${force} ${mode}`;
      const tinted = await surfaceFor('#8514f5', 'tinted', mode, force);
      const spread = Math.max(...tinted) - Math.min(...tinted);
      expect(spread, `tinted ${ctx} ${tinted}`).toBeGreaterThanOrEqual(2);

      const gray = await surfaceFor('#8514f5', 'gray', mode, force);
      expect(
        Math.max(...gray) - Math.min(...gray),
        `gray ${ctx} ${gray}`,
      ).toBeLessThanOrEqual(1);

      const graySeed = await surfaceFor('#808080', 'tinted', mode, force);
      expect(
        Math.max(...graySeed) - Math.min(...graySeed),
        `semente cinza ${ctx} ${graySeed}`,
      ).toBeLessThanOrEqual(1);
    }
  }
});
