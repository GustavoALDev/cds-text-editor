import { expect, test } from '@playwright/test';
import { RTE_THEME_PRESETS } from '../../packages/theme/src/presets';
import { from8, to8, toLinear } from '../../packages/theme/src/color/convert';
import { toOklch } from '../../packages/theme/src/color/oklab';
import { parseColor } from '../../packages/theme/src/color/parse';
import { deltaE, hueOffset } from './helpers/delta-e';
import {
  loadThemePage,
  readSupport,
  readTokensBoth,
  type BothCase,
  type Mode,
} from './helpers/page';
import { HUE_LIMITS, LIMITS, groupOf, type Group } from './helpers/limits';
import { srgbSeeds, thresholdSeeds } from './helpers/seeds';

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
    const hueWorst: Record<string, number> = {};
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
    // Não vacuidade: o nativo não deixa variáveis derivadas inline; o plano B as deixa iguais a createRteTheme.
    for (const e of entries)
      for (const n of ['surface', 'primary-hover', 'on-primary']) {
        const label = `${e.seeds} ${e.mode} ${e.neutral} --rte-${n}`;
        expect(e.nativeInline[n], `nativo: ${label}`).toBe('');
        expect(e.planBInline[n], `plano B: ${label}`).toBe(e.expected[n]);
      }
    // Matiz de subtle/border (só com sementes de papel diferentes), nos dois planos. Medido como
    // distância (a, b) do OKLab até o raio de matiz da semente, que não depende do croma: um degrau de
    // 8 bits vale 0,0015 a 0,004 em OKLab, mas em graus chega a 10 a 14 quando o croma é ~0,012.
    // Máximos medidos (3 motores iguais): cinza 0,0018, borda tingida 0,0068, subtle tingido 0,0112;
    // limites = máximo + >= 1 degrau de 8 bits. Cinza: a superfície é acromática, o desvio é só ruído. Tingido: a superfície carrega o matiz da primary
    // por desenho; `border` (45%) desvia pouco e `subtle` (12%, quase só superfície) mais. Antes
    // (mistura polar) o desvio chegava a 0,1 em OKLab (150 graus). Em graus só se checa croma >= 0,03.
    for (const e of entries) {
      if (e.seeds[0] === e.seeds[1] && e.seeds[1] === e.seeds[2]) continue;
      e.seeds.forEach((seed, i) => {
        const role = ['primary', 'secondary', 'tertiary'][i]!;
        const seedRgb = to8(parseColor(seed)!);
        if (toOklch(toLinear(from8(seedRgb)))[1] < 0.05) return; // semente quase acromática
        for (const kind of ['subtle', 'border'] as const)
          for (const [plan, toks] of [
            ['native', e.native],
            ['planB', e.planB],
          ] as const) {
            const h = hueOffset(toks[`${role}-${kind}`]!, seedRgb);
            const key = `${e.neutral}-${kind}` as keyof typeof HUE_LIMITS;
            const label = `${plan} ${e.seeds} ${e.mode} ${e.neutral} ${role}-${kind} offset=${h.offset.toFixed(4)} C=${h.chroma.toFixed(3)} deg=${h.degrees.toFixed(1)}`;
            hueWorst[key] = Math.max(hueWorst[key] ?? 0, h.offset);
            expect(h.offset, label).toBeLessThanOrEqual(HUE_LIMITS[key]);
            if (h.chroma >= 0.03 && (e.neutral === 'gray' || kind === 'border'))
              expect(h.degrees, label).toBeLessThanOrEqual(6);
          }
      });
    }
    console.log(`[${browserName}] hue offset max`, JSON.stringify(hueWorst));
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
    ['#00bcd4', '#ff5722', '#8bc34a'],
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

  test('ΔE por grupo com três sementes diferentes, neutros gray (matiz do papel preservado)', async ({
    page,
    browserName,
  }) => {
    await run(page, browserName, trioCases('gray'));
  });
});
