import { checkRteTheme, RTE_THEME_PRESETS } from '@cds/rte-theme';
import { describe, expect, it } from 'vitest';
import { applyPreset, DEFAULT_STATE, PRESET_NAMES } from './model';
import { buildContrastReport, summaryText } from './report';

describe('buildContrastReport', () => {
  it('tem 72 verificações, 36 por modo, em todos os presets', () => {
    for (const name of PRESET_NAMES) {
      const r = buildContrastReport(applyPreset(DEFAULT_STATE, name));
      expect(r.total, name).toBe(72);
      expect(r.modes.map((m) => [m.mode, m.total])).toEqual([
        ['light', 36],
        ['dark', 36],
      ]);
      expect(r.failed, name).toBe(0);
      expect(r.summary).toBe('72 verificações: 0 reprovadas');
      expect(r.suggestions).toEqual([]);
    }
  });

  it('raio e densidade não entram no relatório', () => {
    const a = buildContrastReport(DEFAULT_STATE);
    const b = buildContrastReport({ ...DEFAULT_STATE, radius: 0, density: 1.2 });
    expect(b).toEqual(a);
  });

  it('com reprovadas: resumo, contagem por modo, label, ratio com 2 casas e min', () => {
    const real = checkRteTheme().checks;
    const forced = real.map((c, i) =>
      i === 0 || i === 40 ? { ...c, pass: false, ratio: 3.456, min: 4.5 } : c,
    );
    const r = buildContrastReport(
      DEFAULT_STATE,
      () => ({ ok: false, invalid: [], checks: forced }),
      () => null,
    );
    expect(r.total).toBe(72);
    expect(r.failed).toBe(2);
    expect(r.summary).toBe('72 verificações: 2 reprovadas');
    const bad = forced.filter((c) => !c.pass);
    expect(r.modes.map((m) => m.failed)).toEqual([
      bad.filter((c) => c.mode === 'light').length,
      bad.filter((c) => c.mode === 'dark').length,
    ]);
    expect(r.failedChecks[0]).toEqual({
      id: real[0]!.id,
      mode: real[0]!.mode,
      label: real[0]!.label,
      ratio: '3.46',
      min: 4.5,
    });
    expect(r.suggestions).toEqual([]);
  });

  it('singular quando há uma reprovada', () => {
    expect(summaryText(72, 1)).toBe('72 verificações: 1 reprovada');
    expect(summaryText(72, 0)).toBe('72 verificações: 0 reprovadas');
  });

  it('campo inválido aparece em invalid; sugestão é omitida quando a lib devolve null', () => {
    const r = buildContrastReport({ ...DEFAULT_STATE, secondary: 'banana' });
    expect(r.invalid).toEqual(['secondary']);
    expect(r.suggestions).toEqual([]);
  });

  it('usa as funções injetadas (null esconde a sugestão)', () => {
    const calls: string[] = [];
    const r = buildContrastReport(
      DEFAULT_STATE,
      () => ({
        ok: false,
        invalid: ['primary'],
        checks: [
          { id: 'C1', mode: 'dark', label: 'x', ratio: 2.345, min: 4.5, pass: false },
          { id: 'C1:tertiary', mode: 'light', label: 'y', ratio: 1, min: 4.5, pass: false },
          { id: 'static:danger:surface', mode: 'light', label: 'z', ratio: 1, min: 3, pass: false },
        ],
      }),
      (c) => {
        calls.push(c);
        return c === RTE_THEME_PRESETS.angular.primary ? '#123456' : null;
      },
    );
    expect(calls).toEqual([RTE_THEME_PRESETS.angular.primary]);
    expect(r.suggestions).toEqual([{ field: 'primary', color: '#123456' }]);
    expect(r.failedChecks[0]!.ratio).toBe('2.35');
    expect(r.modes).toEqual([
      { mode: 'light', label: 'Claro', total: 2, failed: 2 },
      { mode: 'dark', label: 'Escuro', total: 1, failed: 1 },
    ]);
  });
});
