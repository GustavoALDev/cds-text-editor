import { expect, test } from '@playwright/test';
import { RTE_THEME_PRESETS } from '../../packages/theme/src/presets';
import { deltaE } from './helpers/delta-e';
import {
  loadThemePage,
  readSupport,
  readTokensBoth,
  type BothCase,
  type Mode,
} from './helpers/page';
import { srgbSeeds, thresholdSeeds } from './helpers/seeds';

type Group = 'linear' | 'text' | 'neutral' | 'border';

/**
 * Limites de ΔE por grupo. Limites da spec (R7): linear ~0, neutro <= 0,019, borda <= 0,041.
 * Medidos aqui (matriz OKLab corrigida), neutros e bordas ficam em ~0,0035 (1 unidade de 8 bits),
 * então 0,019 e 0,041 não detectariam uma constante de neutro alterada; os limites de neutro e de
 * borda abaixo são mais apertados que os da spec de propósito (a spec continua válida com folga).
 * `linear` e `text` ficam no piso de quantização (0 e 1 unidade de 8 bits, ~0,0028).
 */
const LIMITS: Record<Group, number> = {
  linear: 0.002,
  text: 0.004,
  neutral: 0.006,
  border: 0.006,
};

function groupOf(token: string): Group | null {
  if (/^(primary|secondary|tertiary)$/.test(token)) return null; // semente: idêntica nos dois planos
  if (/^on-|-hover$|-active$/.test(token)) return 'linear';
  if (token === 'focus' || token.endsWith('-text')) {
    return token === 'text' ? 'neutral' : 'text';
  }
  if (token.endsWith('-border')) return 'border';
  return 'neutral'; // surface, surface-raised, text, text-muted, border, *-subtle
}

/** 30 sementes de marca/extremos (início da lista do spike) + 30 espalhadas da grade + limiar + extras. */
function sampleSeeds(): string[] {
  const all = srgbSeeds();
  const brand = all.slice(0, 30);
  const rest = all.slice(30);
  const step = Math.floor(rest.length / 30);
  const spread = Array.from({ length: 30 }, (_, i) => rest[i * step]!);
  return [
    ...new Set([
      ...brand,
      ...spread,
      ...thresholdSeeds(),
      '#97687b',
      '#2d870b',
      '#4071d9',
      '#1d8811',
      '#e51e3a',
    ]),
  ];
}

const MODES: Mode[] = ['light', 'dark'];

interface Worst {
  max: number;
  info: string;
}

function emptyWorst(): Record<Group, Worst> {
  return {
    linear: { max: 0, info: '' },
    text: { max: 0, info: '' },
    neutral: { max: 0, info: '' },
    border: { max: 0, info: '' },
  };
}

test.describe('plano B equivale ao CSS nativo (R7)', () => {
  async function run(
    page: import('@playwright/test').Page,
    browserName: string,
    cases: BothCase[],
  ): Promise<void> {
    await loadThemePage(page);
    const support = await readSupport(page);
    test.skip(!support.relativeColors, 'no-native: sem cores relativas');
    const entries = await readTokensBoth(page, cases);
    expect(entries).toHaveLength(cases.length);
    const worst = emptyWorst();
    for (const e of entries) {
      for (const [token, native] of Object.entries(e.native)) {
        const g = groupOf(token);
        if (!g) continue;
        const planB = e.planB[token]!;
        const d = deltaE(native, planB);
        if (d > worst[g].max)
          worst[g] = {
            max: d,
            info: `seed=${e.seeds.join(',')} mode=${e.mode} neutral=${e.neutral} token=${token} native=${native.join(',')} planB=${planB.join(',')}`,
          };
      }
    }
    for (const g of Object.keys(LIMITS) as Group[]) {
      test.info().annotations.push({
        type: 'delta-e-max',
        description: `group=${g} max=${worst[g].max.toFixed(5)} ${worst[g].info.replace(/^seed=/, 'seed=')}`,
      });
      console.log(
        `[${browserName}] ΔE ${g} max=${worst[g].max.toFixed(5)} (limite ${LIMITS[g]}) ${worst[g].info}`,
      );
    }
    for (const g of Object.keys(LIMITS) as Group[])
      expect(worst[g].max, `grupo ${g}: ${worst[g].info}`).toBeLessThanOrEqual(
        LIMITS[g],
      );
  }

  for (const neutral of ['tinted', 'gray'] as const) {
    test(`ΔE por grupo, neutros ${neutral}, sementes iguais nos três papéis`, async ({
      page,
      browserName,
    }) => {
      test.setTimeout(120_000);
      const cases: BothCase[] = sampleSeeds().flatMap((s) =>
        MODES.map((mode) => ({
          seeds: [s, s, s] as [string, string, string],
          mode,
          neutral,
        })),
      );
      await run(page, browserName, cases);
    });
  }

  const trios: [string, string, string][] = [
    ['#8514f5', '#f637e3', '#0546ff'],
    ['#1d8811', '#e51e3a', '#4071d9'],
    ...(['ocean', 'forest', 'sunset', 'monochrome'] as const).map(
      (n): [string, string, string] => [
        RTE_THEME_PRESETS[n].primary,
        RTE_THEME_PRESETS[n].secondary,
        RTE_THEME_PRESETS[n].tertiary,
      ],
    ),
  ];
  const trioCases = (neutral: 'tinted' | 'gray'): BothCase[] =>
    trios.flatMap((seeds) => MODES.map((mode) => ({ seeds, mode, neutral })));

  test('ΔE por grupo com três sementes diferentes, neutros tinted (independência dos papéis)', async ({
    page,
    browserName,
  }) => {
    await run(page, browserName, trioCases('tinted'));
  });

  // Divergência conhecida (aguarda decisão): com neutros `gray` e sementes de papel DIFERENTES, o
  // nativo mistura `*-subtle`/`*-border` com uma superfície de croma 0 que mantém o matiz da primary
  // (os 3 motores interpolam esse matiz, ex.: borda de um vermelho vira amarelada), enquanto o plano B
  // trata a superfície como acromática e usa o matiz do papel. `test.fail` documenta e avisa quando
  // for corrigido (então trocar por `test`).
  test('ΔE por grupo com três sementes diferentes, neutros gray (divergência conhecida)', async ({
    page,
    browserName,
  }) => {
    test.fail(true, 'neutral gray + sementes diferentes: ver comentário acima');
    await run(page, browserName, trioCases('gray'));
  });
});
