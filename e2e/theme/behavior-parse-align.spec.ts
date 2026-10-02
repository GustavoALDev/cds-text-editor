import { expect, test } from '@playwright/test';
import { parseColor } from '../../packages/theme/src/color/parse';

/*
 * O parser puro (`parseColor` sem `document`, aqui rodando no Node do Playwright) precisa aceitar
 * exatamente o que o CSS aceita dentro da gramática que ele cobre (#hex, rgb/rgba, hsl/hsla, oklch
 * com números, %, deg): o plano B não pode usar uma cor que o CSS nativo rejeitaria.
 * Medido em Chromium 153, Firefox 155 e WebKit 26.6: os três motores concordam em todas as
 * strings abaixo (nenhuma precisou sair da lista por divergência entre motores).
 */

/** Gramática do caminho puro: `parseColor(s) !== null` se e somente se `CSS.supports('color', s)`. */
const GRAMMAR = [
  // válidas (inclui as formas do README: #hex de 3/4/6/8 dígitos, rgb(), hsl(), oklch())
  '#f00',
  '#F00',
  '#f00c',
  '#ff0000',
  '#ff000080',
  'rgb(255, 0, 0)',
  'rgb(255,0,0)',
  'rgb( 255 , 0 , 0 )',
  'rgba(255, 0, 0, 0.5)',
  'rgb(255, 0, 0, 50%)',
  'rgb(100%, 0%, 0%)',
  'rgba(100%, 0%, 0%, 50%)',
  'rgb(255 0 0)',
  'rgba(255 0 0)',
  'rgb(255 0 0 / 0.5)',
  'rgb(255 0 0 / 50%)',
  'rgb(255 0 0/0.5)',
  'rgb(100% 0% 0%)',
  'rgb(255 50% 0)',
  'rgb(127.5 0 0)',
  'rgb(1e2 0 0)',
  'rgb(1E+2 0 0)',
  'rgb(.5 0 0)',
  'rgb(+5 0 0)',
  'rgb(300 -5 0)',
  'hsl(120 100% 25%)',
  'hsl(120, 100%, 25%)',
  'hsla(120, 100%, 25%, 0.3)',
  'hsl(240deg 100% 50%)',
  'hsl(240deg, 100%, 50%)',
  'hsl(120 100 25)',
  'hsl(-120 100% 50%)',
  'hsl(120 100% 25% / 50%)',
  'oklch(0.7 0.15 150)',
  'oklch(70% 0.15 150)',
  'oklch(0.7 40% 150)',
  'oklch(0.7 0.15 150deg / 0.5)',
  'OKLCH(0 0 0)',
  // inválidas no CSS (as do revisor primeiro)
  'rgb(255 0 0 0.5)',
  'rgb(1,,2,3)',
  'rgb(1,2,3,)',
  'rgb(,1,2,3)',
  'rgb(1, 2 3)',
  'rgb(1 2, 3)',
  'rgb(255, 0, 0 / 0.5)',
  'rgb(255 0 0 / 0.5deg)',
  'rgb(255, 0, 0, 0.5deg)',
  'rgb(255, 50%, 0)',
  'rgb(255deg 0 0)',
  'rgb(5. 0 0)',
  'rgb(1 2)',
  'rgb(1 2 3 / )',
  'rgb(1 2 3 / 0.5 / 1)',
  'rgb(/ 1 2 3)',
  'rgb(1 2 3 4 / 5)',
  'hsl(120, 100, 25)',
  'hsl(120, 100%, 25)',
  'hsl(120% 100% 25%)',
  'hsl(120 100% 25% 0.5)',
  'hsl(120deg 100deg 25%)',
  'oklch(0.7, 0.15, 150)',
  'oklch(0.7 0.15 150%)',
  'oklch(0.7 0.15 150 0.5)',
  'oklch(0.7deg 0.15 150)',
  '#12',
  '#12345',
  'banana',
];

/**
 * Válidas no CSS mas fora do iff: nomes, `color()`, `none`, outras unidades de ângulo e `var()`
 * ficam para o canvas (o puro devolve `null`); alfa exatamente 0 é rejeitado de propósito
 * (sementes precisam ser opacas). Para elas vale só a direção segura: puro aceita => CSS aceita.
 */
const OUTSIDE = [
  'rebeccapurple',
  'color(display-p3 1 0 0)',
  'hsl(1turn 50% 50%)',
  'hsl(1rad 50% 50%)',
  'rgb(none 0 0)',
  'var(--x)',
  'rgba(0, 0, 0, 0)',
  'rgb(0 0 0 / 0%)',
];

test('parseColor puro aceita exatamente o que CSS.supports aceita (gramática pura)', async ({
  page,
  browserName,
}) => {
  expect(typeof document).toBe('undefined'); // Node: só o caminho puro
  await page.setContent('<p>x</p>');
  const all = [...GRAMMAR, ...OUTSIDE];
  const supported = await page.evaluate(
    (list) => list.map((s) => CSS.supports('color', s)),
    all,
  );
  const mismatches: string[] = [];
  all.forEach((s, i) => {
    const pure = parseColor(s) !== null;
    const css = supported[i]!;
    if (GRAMMAR.includes(s) ? pure !== css : pure && !css)
      mismatches.push(`${s}: puro=${pure} CSS.supports=${css}`);
  });
  expect(mismatches, browserName).toEqual([]);
  // As de fora do iff são CSS válido (senão estariam na lista de cima).
  for (const s of OUTSIDE)
    expect(supported[all.indexOf(s)], `${browserName}: ${s}`).toBe(true);
  // Não-vacuidade: a lista tem válidas e inválidas.
  const g = supported.slice(0, GRAMMAR.length);
  expect(g.filter(Boolean).length).toBeGreaterThan(30);
  expect(g.filter((v) => !v).length).toBeGreaterThan(25);
});
