import { describe, expect, it } from 'vitest';
import { timed } from './testing/timed';

/**
 * Relógios falsos: cada chamada de `run` avança `costs[i]` ms de parede e
 * `cpuCosts[i]` ms de CPU (padrão: o mesmo que a parede).
 */
function fakeClock(costs: number[], cpuCosts: number[] = costs) {
  let t = 0;
  let cpu = 0;
  let calls = 0;
  return {
    now: () => t,
    cpuNow: () => cpu,
    run<T>(value: () => T): () => T {
      return () => {
        cpu += cpuCosts[calls] ?? 0;
        t += costs[calls++] ?? 0;
        return value();
      };
    },
    get calls() {
      return calls;
    },
  };
}

describe('timed (R8: melhor de até 3 tentativas)', () => {
  it('uma tentativa dentro do teto basta', () => {
    const c = fakeClock([10, 10, 10]);
    expect(
      timed(
        c.run(() => 'ok'),
        { now: c.now, cpuNow: c.cpuNow },
      ),
    ).toBe('ok');
    expect(c.calls).toBe(1);
  });

  it('repete só quando estoura e aceita a melhor tentativa', () => {
    const c = fakeClock([2500, 2100, 300]);
    expect(
      timed(
        c.run(() => 'ok'),
        { now: c.now, cpuNow: c.cpuNow },
      ),
    ).toBe('ok');
    expect(c.calls).toBe(3);
  });

  it('falha quando as 3 tentativas estouram', () => {
    const c = fakeClock([2500, 2100, 2001]);
    expect(() =>
      timed(
        c.run(() => 'ok'),
        { now: c.now, cpuNow: c.cpuNow },
      ),
    ).toThrow(/R8/);
    expect(c.calls).toBe(3);
  });

  it('propaga o erro original de run (dentro do teto)', () => {
    const c = fakeClock([10]);
    const boom = new Error('boom');
    expect(() =>
      timed(
        c.run(() => {
          throw boom;
        }),
        { now: c.now, cpuNow: c.cpuNow },
      ),
    ).toThrow(boom);
  });

  it('não esconde o erro original quando também estoura', () => {
    const c = fakeClock([2500, 2500, 2500]);
    let caught: unknown;
    try {
      timed(
        c.run(() => {
          throw new Error('boom');
        }),
        { now: c.now, cpuNow: c.cpuNow },
      );
    } catch (error) {
      caught = error;
    }
    expect(String(caught)).toMatch(/R8/);
    expect(String(caught)).toMatch(/boom/);
  });

  it('parede inflada por CPU disputada não conta: vale o tempo de CPU', () => {
    const c = fakeClock([9000], [300]);
    expect(
      timed(
        c.run(() => 'ok'),
        { now: c.now, cpuNow: c.cpuNow },
      ),
    ).toBe('ok');
    expect(c.calls).toBe(1);
  });

  it('CPU acima do teto com parede curta passa (vale o menor: GC em paralelo)', () => {
    const c = fakeClock([300], [2500]);
    expect(
      timed(
        c.run(() => 'ok'),
        { now: c.now, cpuNow: c.cpuNow },
      ),
    ).toBe('ok');
  });

  it('parede e CPU acima do teto nas 3 tentativas falham (regressão real)', () => {
    const c = fakeClock([9000, 9000, 9000], [5000, 5000, 5000]);
    expect(() =>
      timed(
        c.run(() => 'ok'),
        { now: c.now, cpuNow: c.cpuNow },
      ),
    ).toThrow(/R8/);
    expect(c.calls).toBe(3);
  });
});
