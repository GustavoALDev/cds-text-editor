import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor, type RteToolbarConfig } from '@cds/rte-angular';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHost, settle } from './testing-support/render';

// Z9/Z11 (spec 05d2): nenhum ouvinte de `document`/`window` nem temporizador
// pendente sobrevive à destruição do editor, nem com recursos ligados.

afterEach(() => {
  vi.restoreAllMocks();
});

@Component({
  selector: 'rte-test-listeners',
  imports: [RteEditor],
  template: `@if (show()) {
    <rte-editor
      [toolbar]="toolbar()"
      draftKey="listeners"
      [showCharCount]="true"
      [showWordCount]="true"
    />
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ToggleHost {
  readonly show = signal(false);
  readonly toolbar = signal<RteToolbarConfig>('full');
}

/** Ouvintes vivos de um alvo global (adicionados e ainda não removidos), por tipo. */
function track(target: EventTarget): () => string[] {
  interface Entry {
    type: string;
    listener: unknown;
    capture: boolean;
  }
  const live: Entry[] = [];
  const entry = (type: string, listener: unknown, options: unknown): Entry => ({
    type,
    listener,
    capture:
      options === true ||
      (typeof options === 'object' &&
        options !== null &&
        'capture' in options &&
        options.capture === true),
  });
  const same = (a: Entry, b: Entry) =>
    a.type === b.type && a.listener === b.listener && a.capture === b.capture;
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  vi.spyOn(target, 'addEventListener').mockImplementation(
    (type: string, listener: unknown, options?: unknown) => {
      const e = entry(type, listener, options);
      if (listener && !live.some((l) => same(l, e))) live.push(e);
      add(type, listener as EventListener, options as AddEventListenerOptions);
    },
  );
  vi.spyOn(target, 'removeEventListener').mockImplementation(
    (type: string, listener: unknown, options?: unknown) => {
      const e = entry(type, listener, options);
      const i = live.findIndex((l) => same(l, e));
      if (i >= 0) live.splice(i, 1);
      remove(
        type,
        listener as EventListener,
        options as AddEventListenerOptions,
      );
    },
  );
  return () => live.map((l) => l.type);
}

describe('RteEditor: ouvintes e temporizadores na destruição', () => {
  it('10 ciclos não acumulam ouvintes de document/window nem temporizadores', async () => {
    const fixture = await renderHost(ToggleHost);
    const host = fixture.componentInstance;
    // aquecimento: chunks preguiçosos e ouvintes únicos por módulo
    for (let i = 0; i < 2; i++) {
      host.show.set(true);
      await settle(fixture);
      host.show.set(false);
      await settle(fixture);
    }
    const doc = track(document);
    const win = track(window);
    const timers = new Map<unknown, number>();
    const realSet = window.setTimeout.bind(window);
    const realClear = window.clearTimeout.bind(window);
    vi.spyOn(window, 'setTimeout').mockImplementation(((
      fn: TimerHandler,
      delay?: number,
      ...a: unknown[]
    ) => {
      const id = realSet(
        (...args: unknown[]) => {
          timers.delete(id);
          return (fn as (...x: unknown[]) => void)(...args);
        },
        delay,
        ...a,
      );
      timers.set(id, delay ?? 0);
      return id;
    }) as typeof window.setTimeout);
    vi.spyOn(window, 'clearTimeout').mockImplementation(((id?: number) => {
      timers.delete(id);
      realClear(id);
    }) as typeof window.clearTimeout);

    for (let i = 0; i < 10; i++) {
      host.show.set(true);
      await settle(fixture);
      host.show.set(false);
      await settle(fixture);
    }
    // deixa o que for adiado de propósito (draft: 1000 ms) fora da conta: nada
    // foi digitado, então nada deve estar pendente
    expect(doc()).toEqual([]);
    expect(win()).toEqual([]);
    // o jsdom agenda os próprios eventos de `storage` com atraso 1; só contam os do editor
    expect([...timers.values()].filter((d) => d > 1)).toEqual([]);
  });
});
