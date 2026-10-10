import { createRteTheme, RTE_THEME_PRESETS } from '@comodeviaser/rte-theme';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  applyPreset,
  DEFAULT_STATE,
  PRESET_NAMES,
  type PlaygroundState,
  toRteTheme,
} from './model';
import { buildTs } from './ts-snippet';

/** Transpila o snippet, avalia com um `provideRichText` falso e devolve o argumento capturado. */
function evaluate(snippet: string): { called: boolean; arg: unknown } {
  const { outputText } = transpileModule(snippet, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  });
  const captured = { called: false, arg: undefined as unknown };
  const fake = (arg?: unknown): unknown => {
    captured.called = true;
    captured.arg = arg;
    return {};
  };
  const exports: Record<string, unknown> = {};
  const require = (id: string): unknown => {
    if (id !== '@comodeviaser/rte-angular') throw new Error(`import inesperado: ${id}`);
    return { provideRichText: fake };
  };
  new Function('exports', 'require', outputText)(exports, require);
  return captured;
}

const custom: PlaygroundState = {
  ...DEFAULT_STATE,
  primary: 'oklch(0.6 0.2 250)',
  secondary: 'banana',
  mode: 'dark',
  neutral: 'gray',
  radius: 2,
  density: 0.9,
};

describe('buildTs', () => {
  it('estado padrão: import e provideRichText() sem argumento', () => {
    const ts = buildTs(DEFAULT_STATE);
    expect(ts).toContain(
      "import { provideRichText } from '@comodeviaser/rte-angular';",
    );
    expect(ts).toContain('provideRichText()');
    expect(ts).not.toContain('theme');
    expect(ts).not.toMatch(/raio e densidade/i);
  });

  it('só as chaves fora do padrão', () => {
    const ts = buildTs({ ...DEFAULT_STATE, tertiary: '#ff0000' });
    expect(ts).toContain("tertiary: '#ff0000',");
    for (const key of ['primary', 'secondary', 'mode', 'neutral'])
      expect(ts).not.toContain(`${key}:`);
  });

  it('comentário de raio e densidade só quando mudam', () => {
    for (const patch of [{ radius: 3 }, { density: 1.1 }])
      expect(buildTs({ ...DEFAULT_STATE, ...patch })).toMatch(
        /Raio e densidade são CSS do nível 2/,
      );
    expect(buildTs({ ...DEFAULT_STATE, mode: 'light' })).not.toMatch(/Raio/);
  });

  it('semente inválida fica fora com comentário', () => {
    const ts = buildTs({ ...DEFAULT_STATE, secondary: 'banana' });
    expect(ts).toContain('// secondary inválida: vale o padrão');
    expect(ts).not.toContain('banana');
  });

  it('escapa aspas e barras', () => {
    const ts = buildTs({ ...DEFAULT_STATE, primary: "rgb(1 2 3) /* ' */" });
    expect(() => evaluate(ts)).not.toThrow();
  });

  describe('transpila, avalia e gera o mesmo tema (W13)', () => {
    const cases: [string, PlaygroundState][] = [
      ...PRESET_NAMES.map((n): [string, PlaygroundState] => [
        `preset ${n}`,
        applyPreset(DEFAULT_STATE, n),
      ]),
      ['tema próprio', custom],
    ];
    for (const [name, state] of cases) {
      for (const dark of [false, true]) {
        it(`${name} (${dark ? 'escuro' : 'claro'})`, () => {
          const { called, arg } = evaluate(buildTs(state));
          expect(called).toBe(true);
          const theme = (arg as { theme?: object } | undefined)?.theme;
          expect(createRteTheme({ ...theme, dark })).toEqual(
            createRteTheme({ ...toRteTheme(state), dark }),
          );
        });
      }
    }

    it('os presets só levam as cores do pacote', () => {
      const { arg } = evaluate(buildTs(applyPreset(DEFAULT_STATE, 'sunset')));
      expect((arg as { theme: object }).theme).toEqual(
        RTE_THEME_PRESETS.sunset,
      );
    });
  });
});
