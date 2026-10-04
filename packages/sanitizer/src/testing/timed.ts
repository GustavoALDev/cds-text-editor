import { expect } from 'vitest';

/** Teto de R8 (ms): todo caso adversarial termina em menos que isto. */
export const R8_BOUND_MS = 2000;

export interface TimedOptions {
  /** Teto em ms. Padrão {@link R8_BOUND_MS}. */
  bound?: number;
  /** Tentativas no máximo. Padrão `3`. */
  attempts?: number;
  /** Relógio de parede em ms (injetável nos testes). Padrão `performance.now`. */
  now?: () => number;
  /**
   * Tempo de CPU do processo em ms (injetável nos testes). Padrão
   * `process.cpuUsage()` (usuário + sistema); o Vitest roda cada arquivo num
   * processo próprio (`pool: 'forks'`), então só conta este teste.
   */
  cpuNow?: () => number;
}

function processCpuMs(): number {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1000;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Roda `run` cronometrado (R8): a melhor de até `attempts` tentativas precisa
 * ficar abaixo de `bound`. Cada tentativa vale o menor entre o tempo de parede
 * e o tempo de CPU do processo: com os núcleos disputados (`nx run-many` com
 * vários Vitest em paralelo), a parede chega a 20–30× o custo isolado, mas a
 * CPU usada não; e trabalho paralelo do GC, que infla a CPU, não infla a
 * parede. Só repete quando uma tentativa estoura, então o custo normal é uma
 * execução; uma regressão quadrática leva dezenas de segundos de CPU e de
 * parede e estoura em todas. Cada tentativa grava o resultado ou o erro (sem
 * afirmar dentro de `finally`): se o teto falha, a mensagem cita o erro
 * original; senão, o erro original de `run` é relançado intacto.
 */
export function timed<T>(run: () => T, options: TimedOptions = {}): T {
  const {
    bound = R8_BOUND_MS,
    attempts = 3,
    now = () => performance.now(),
    cpuNow = processCpuMs,
  } = options;
  let best = Infinity;
  let outcome: Outcome<T> | undefined;
  for (let i = 0; i < attempts && best >= bound; i++) {
    const start = now();
    const cpuStart = cpuNow();
    try {
      outcome = { ok: true, value: run() };
    } catch (error) {
      outcome = { ok: false, error };
    }
    const elapsed = Math.min(now() - start, cpuNow() - cpuStart);
    best = Math.min(best, elapsed);
  }
  const detail =
    outcome === undefined || outcome.ok
      ? ''
      : ` (erro: ${String(outcome.error)})`;
  expect(
    best,
    `R8: melhor de ${attempts} tentativas abaixo de ${bound} ms${detail}`,
  ).toBeLessThan(bound);
  if (outcome === undefined) throw new Error('timed: nenhuma tentativa');
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

/** Custo de `run` em ms: o menor entre parede e CPU do processo (ver `timed`). */
export function cost(run: () => unknown): number {
  const start = performance.now();
  const cpuStart = processCpuMs();
  run();
  return Math.min(performance.now() - start, processCpuMs() - cpuStart);
}
