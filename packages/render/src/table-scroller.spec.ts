import { Component, NgZone, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { RTE_RENDER_LABELS_PT_BR } from '@cds/rte-render/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RteContent } from './content/rte-content';
import { createTableScrollers } from './content/table-scroller';
import { provideRteRender } from './provide';
import { renderHost, settle } from './testing-support/render';
import {
  installFakeResizeObserver,
  type FakeResizeObserverControl,
  type FakeSize,
} from './testing-support/resize-observer';
import { RTE_TEST_MODE } from './testing-support/test-mode';
import type { RteRenderLabels } from './types';

const TABLE = '<table><tbody><tr><td><p>a</p></td></tr></tbody></table>';
const TWO_TABLES = TABLE + '<p>meio</p>' + TABLE;
const WIDE: FakeSize = { scrollWidth: 900, clientWidth: 400 };
const FITS: FakeSize = { scrollWidth: 400, clientWidth: 400 };
const ATTRS = ['tabindex', 'role', 'aria-label'] as const;

@Component({
  selector: 'rte-test-host',
  imports: [RteContent],
  template: `<div
    [rteContent]="html()"
    [mode]="'trusted'"
    [labels]="labels()"
  ></div>`,
})
class Host {
  readonly html = signal(TWO_TABLES);
  readonly labels = signal<Partial<RteRenderLabels> | undefined>(undefined);
}

function scrollers(fixture: ComponentFixture<unknown>): HTMLElement[] {
  return [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      'div.rte-table-scroll',
    ),
  ];
}

function attrs(el: Element): (string | null)[] {
  return ATTRS.map((a) => el.getAttribute(a));
}

const NONE = [null, null, null];
const marked = (label: string) => ['0', 'region', label];

let ro: FakeResizeObserverControl;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  ro = installFakeResizeObserver();
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  ro.restore();
  TestBed.resetTestingModule();
  expect(consoleError).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('RteContent: rolador de tabela (H7, R6)', () => {
  it('sem transbordo o rolador fica sem tabindex/role/aria-label', async () => {
    const fixture = await renderHost(Host);
    const [a, b] = scrollers(fixture);
    expect(attrs(a!)).toEqual(NONE);
    ro.trigger(new Map([[a!, FITS]]));
    expect(attrs(a!)).toEqual(NONE);
    expect(attrs(b!)).toEqual(NONE);
  });

  it('a primeira inserção já é observada: rolador e table (Ruling 7)', async () => {
    const fixture = await renderHost(Host);
    const [a, b] = scrollers(fixture);
    const observed = ro.observed();
    for (const s of [a!, b!]) {
      expect(observed).toContain(s);
      expect(observed).toContain(s.querySelector('table'));
    }
  });

  it('transborda → marca; volta a caber → desmarca; o outro não é tocado', async () => {
    const fixture = await renderHost(Host);
    const [a, b] = scrollers(fixture);
    ro.trigger(new Map([[a!, WIDE]]));
    expect(attrs(a!)).toEqual(marked('Scrollable table'));
    expect(attrs(b!)).toEqual(NONE);
    ro.trigger(new Map([[a!, FITS]]));
    expect(attrs(a!)).toEqual(NONE);
  });

  describe('Home/End no rolador marcado (R6, L5)', () => {
    const KEYS = { Home: 36, End: 35 } as const;

    function press(
      target: Element,
      key: keyof typeof KEYS,
      init: KeyboardEventInit = {},
    ): KeyboardEvent {
      const event = new KeyboardEvent('keydown', {
        key,
        keyCode: KEYS[key],
        bubbles: true,
        cancelable: true,
        ...init,
      });
      target.dispatchEvent(event);
      return event;
    }

    /** `scrollLeft` controlável (o jsdom não rola). */
    function trackScroll(el: HTMLElement, start = 0): { value: number } {
      const state = { value: start };
      Object.defineProperty(el, 'scrollLeft', {
        configurable: true,
        get: () => state.value,
        set: (v: number) => {
          state.value = v;
        },
      });
      return state;
    }

    it('End leva ao fim e Home ao início, sem rolar a página', async () => {
      const fixture = await renderHost(Host);
      const [a] = scrollers(fixture);
      ro.trigger(new Map([[a!, WIDE]]));
      const scroll = trackScroll(a!, 40);
      const end = press(a!, 'End');
      expect(scroll.value).toBe(500);
      expect(end.defaultPrevented).toBe(true);
      const home = press(a!, 'Home');
      expect(scroll.value).toBe(0);
      expect(home.defaultPrevented).toBe(true);
    });

    it('em rtl o fim fica no negativo', async () => {
      const fixture = await renderHost(Host);
      const [a] = scrollers(fixture);
      ro.trigger(new Map([[a!, WIDE]]));
      a!.style.direction = 'rtl';
      const scroll = trackScroll(a!);
      press(a!, 'End');
      expect(scroll.value).toBe(-500);
      press(a!, 'Home');
      expect(scroll.value).toBe(0);
    });

    it('não age em rolador desmarcado, com modificador ou vindo de dentro', async () => {
      const fixture = await renderHost(Host);
      const [a, b] = scrollers(fixture);
      ro.trigger(new Map([[a!, WIDE]]));
      const scrollA = trackScroll(a!, 40);
      const scrollB = trackScroll(b!, 0);
      expect(press(b!, 'End').defaultPrevented).toBe(false);
      expect(scrollB.value).toBe(0);
      for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'])
        expect(press(a!, 'End', { [mod]: true }).defaultPrevented).toBe(false);
      expect(press(a!.querySelector('td')!, 'End').defaultPrevented).toBe(
        false,
      );
      expect(scrollA.value).toBe(40);
    });

    it('depois do destroy a tecla não é tratada', async () => {
      const fixture = await renderHost(Host);
      const [a] = scrollers(fixture);
      ro.trigger(new Map([[a!, WIDE]]));
      fixture.destroy();
      // O nó guarda os atributos antigos; o evento ainda sobe pela árvore desligada.
      const scroll = trackScroll(a!, 40);
      expect(press(a!, 'End').defaultPrevented).toBe(false);
      expect(scroll.value).toBe(40);
    });
  });

  it('mudança de tamanho só da table reavalia o rolador', async () => {
    const fixture = await renderHost(Host);
    const [a] = scrollers(fixture);
    const table = a!.querySelector('table')!;
    // A table alarga (H8 reaplicou colunas) e o rolador mantém a largura.
    ro.trigger(new Map<Element, FakeSize>([[table, WIDE]]));
    expect(attrs(a!)).toEqual(NONE);
    // As medidas do rolador mudam junto com a entrada da table.
    ro.trigger(
      new Map<Element, FakeSize>([
        [a!, WIDE],
        [table, WIDE],
      ]),
    );
    expect(attrs(a!)).toEqual(marked('Scrollable table'));
  });

  it('rótulo ao vivo reescreve só o marcado; o provider pt-BR vale', async () => {
    const fixture = await renderHost(Host);
    const [a, b] = scrollers(fixture);
    ro.trigger(new Map([[a!, WIDE]]));
    fixture.componentInstance.labels.set({ tableScroller: 'Rolável' });
    await settle(fixture);
    expect(a!.getAttribute('aria-label')).toBe('Rolável');
    expect(attrs(b!)).toEqual(NONE);
    // Marcado depois da troca já nasce com o rótulo novo.
    ro.trigger(new Map([[b!, WIDE]]));
    expect(attrs(b!)).toEqual(marked('Rolável'));
  });

  it('provider pt-BR → "Tabela com rolagem horizontal"', async () => {
    const fixture = await renderHost(Host, [
      provideRteRender({ labels: RTE_RENDER_LABELS_PT_BR }),
    ]);
    const [a] = scrollers(fixture);
    ro.trigger(new Map([[a!, WIDE]]));
    expect(attrs(a!)).toEqual(marked('Tabela com rolagem horizontal'));
  });

  it('Review Focus 3: trocar o HTML com o rolador marcado e focado desliga o antigo', async () => {
    const fixture = await renderHost(Host);
    const [old] = scrollers(fixture);
    ro.trigger(new Map([[old!, WIDE]]));
    old!.focus();
    expect(document.activeElement).toBe(old);
    const before = ro.disconnects();

    fixture.componentInstance.html.set(TABLE);
    await settle(fixture);

    expect(ro.disconnects()).toBeGreaterThan(before);
    const [fresh] = scrollers(fixture);
    expect(fresh).not.toBe(old);
    expect(ro.observed()).toContain(fresh);
    expect(ro.observed()).toContain(fresh!.querySelector('table'));
    expect(ro.observed()).not.toContain(old);

    const setAttribute = vi.spyOn(old!, 'setAttribute');
    const removeAttribute = vi.spyOn(old!, 'removeAttribute');
    ro.trigger(new Map([[old!, FITS]]));
    ro.trigger(new Map([[old!, WIDE]]));
    expect(setAttribute).not.toHaveBeenCalled();
    expect(removeAttribute).not.toHaveBeenCalled();

    ro.trigger(new Map([[fresh!, WIDE]]));
    expect(attrs(fresh!)).toEqual(marked('Scrollable table'));
  });

  it('destroy desconecta, sem erro; triggers depois não escrevem', async () => {
    const fixture = await renderHost(Host);
    const [a] = scrollers(fixture);
    const before = ro.disconnects();
    fixture.destroy();
    expect(ro.disconnects()).toBeGreaterThan(before);
    expect(ro.observed()).toEqual([]);
    ro.trigger(new Map([[a!, WIDE]]));
    expect(attrs(a!)).toEqual(NONE);
  });

  it('o callback roda fora da zona Angular (H18, Ruling 6)', async () => {
    const fixture = await renderHost(Host);
    const [a] = scrollers(fixture);
    const zone = TestBed.inject(NgZone);
    const inside: boolean[] = [];
    const spy = vi.spyOn(a!, 'setAttribute').mockImplementation(function (
      this: Element,
      name,
      value,
    ) {
      inside.push(NgZone.isInAngularZone());
      Element.prototype.setAttribute.call(this, name, value);
    });
    // O teste dispara de dentro da zona: só a zona capturada na criação
    // do observador decide onde o callback roda (calço, Ruling 6). Os
    // ganchos de render do Angular já rodam fora da zona; a diretiva ainda
    // cria o observador em `runOutsideAngular` (H18), e o caso seguinte
    // prova que criar dentro da zona deixaria o callback nela.
    zone.run(() => ro.trigger(new Map([[a!, WIDE]])));
    expect(spy).toHaveBeenCalled();
    expect(inside.length).toBeGreaterThan(0);
    expect(inside.every((v) => v === false)).toBe(true);
    if (TestBed.inject(RTE_TEST_MODE) === 'zone') {
      expect(zone.run(() => NgZone.isInAngularZone())).toBe(true);
    }
  });
});

describe('calço do ResizeObserver (Ruling 6)', () => {
  it('o callback roda na zona em que o observador foi criado', () => {
    const zone = TestBed.inject(NgZone);
    const root = document.createElement('div');
    root.innerHTML = '<div class="rte-table-scroll">' + TABLE + '</div>';
    const scroller = root.firstElementChild as HTMLElement;
    const inside: boolean[] = [];
    const win = document.defaultView as Window & typeof globalThis;
    // Criado DENTRO da zona Angular e disparado de fora: no build zone o
    // callback volta para a zona Angular. Prova que o caso acima não é
    // vazio: só a criação fora da zona deixa o callback fora dela.
    const handle = zone.run(() =>
      createTableScrollers(root, win, () => {
        inside.push(NgZone.isInAngularZone());
        return 'L';
      }),
    )!;
    handle.refresh();
    ro.trigger(new Map([[scroller, WIDE]]));
    expect(inside).toEqual([TestBed.inject(RTE_TEST_MODE) === 'zone']);
    expect(attrs(scroller)).toEqual(marked('L'));
    handle.destroy();
  });

  it('createTableScrollers sem ResizeObserver devolve null', () => {
    ro.restore();
    const win = document.defaultView as Window & typeof globalThis;
    expect(
      createTableScrollers(document.createElement('div'), win, () => 'L'),
    ).toBeNull();
  });
});

describe('RteContent: sem ResizeObserver (motor antigo)', () => {
  it('nenhum atributo e nenhum erro', async () => {
    ro.restore();
    const view = document.defaultView as unknown as Record<string, unknown>;
    expect(view['ResizeObserver']).toBeUndefined();
    expect(
      (globalThis as unknown as Record<string, unknown>)['ResizeObserver'],
    ).toBeUndefined();
    const fixture = await renderHost(Host);
    const all = scrollers(fixture);
    expect(all).toHaveLength(2);
    for (const s of all) expect(attrs(s)).toEqual(NONE);
    fixture.componentInstance.labels.set({ tableScroller: 'X' });
    fixture.componentInstance.html.set(TABLE);
    await settle(fixture);
    for (const s of scrollers(fixture)) expect(attrs(s)).toEqual(NONE);
    fixture.destroy();
    // `afterEach` chama `restore` de novo: precisa ser idempotente.
  });
});
