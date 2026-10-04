import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installPopoverShim } from './testing-support/popover';
import { renderHost, settle } from './testing-support/render';
import { RteMenu, RteMenuTrigger } from './toolbar/menu';
import { positionMenu, RTE_MENU_MARGIN } from './toolbar/position';

describe('positionMenu (U7)', () => {
  const viewport = { width: 1000, height: 800 };
  const trigger = { top: 100, bottom: 130, left: 200, right: 240 };

  it('margem de 8 px', () => {
    expect(RTE_MENU_MARGIN).toBe(8);
  });

  it('abaixo do botão, alinhado ao início', () => {
    expect(
      positionMenu({
        trigger,
        menu: { width: 160, height: 200 },
        viewport,
        rtl: false,
      }),
    ).toEqual({
      left: 200,
      top: 130,
      maxHeight: 800 - 130 - 8,
      placement: 'below',
    });
  });

  it('sem espaço abaixo e mais espaço acima → above', () => {
    const t = { top: 700, bottom: 730, left: 200, right: 240 };
    expect(
      positionMenu({
        trigger: t,
        menu: { width: 160, height: 200 },
        viewport,
        rtl: false,
      }),
    ).toEqual({ left: 200, top: 500, maxHeight: 700 - 8, placement: 'above' });
  });

  it('sem espaço abaixo mas menos espaço acima → continua abaixo', () => {
    const t = { top: 300, bottom: 330, left: 200, right: 240 };
    const r = positionMenu({
      trigger: t,
      menu: { width: 160, height: 600 },
      viewport,
      rtl: false,
    });
    expect(r.placement).toBe('below');
    expect(r.top).toBe(330);
    expect(r.maxHeight).toBe(800 - 330 - 8);
  });

  it('perto da borda direita → left = viewport.width - 8 - width', () => {
    const t = { top: 100, bottom: 130, left: 950, right: 990 };
    const r = positionMenu({
      trigger: t,
      menu: { width: 160, height: 100 },
      viewport,
      rtl: false,
    });
    expect(r.left).toBe(1000 - 8 - 160);
  });

  it('perto da borda esquerda → left = 8', () => {
    const t = { top: 100, bottom: 130, left: 2, right: 40 };
    expect(
      positionMenu({
        trigger: t,
        menu: { width: 160, height: 100 },
        viewport,
        rtl: false,
      }).left,
    ).toBe(8);
  });

  it('rtl alinha pelo right do botão', () => {
    const r = positionMenu({
      trigger,
      menu: { width: 160, height: 100 },
      viewport,
      rtl: true,
    });
    expect(r.left).toBe(240 - 160);
    // em rtl perto da borda esquerda também respeita a margem
    expect(
      positionMenu({
        trigger: { top: 100, bottom: 130, left: 10, right: 50 },
        menu: { width: 160, height: 100 },
        viewport,
        rtl: true,
      }).left,
    ).toBe(8);
  });

  it('menu mais alto que a viewport → maxHeight = espaço − 8', () => {
    const r = positionMenu({
      trigger: { top: 10, bottom: 40, left: 200, right: 240 },
      menu: { width: 160, height: 5000 },
      viewport,
      rtl: false,
    });
    expect(r).toEqual({
      left: 200,
      top: 40,
      maxHeight: 800 - 40 - 8,
      placement: 'below',
    });
  });

  it('para cima com menu mais alto que o espaço acima: top na margem', () => {
    const r = positionMenu({
      trigger: { top: 500, bottom: 790, left: 200, right: 240 },
      menu: { width: 160, height: 5000 },
      viewport,
      rtl: false,
    });
    expect(r).toEqual({
      left: 200,
      top: 8,
      maxHeight: 500 - 8,
      placement: 'above',
    });
  });
});

@Component({
  selector: 'rte-test-menu-host',
  imports: [RteMenu, RteMenuTrigger],
  template: `
    <button type="button" class="t1" [rteMenuTrigger]="m1">Um</button>
    <div rteMenu #m1="rteMenu" (tabOut)="tabOuts.push($event)">
      @for (label of labels; track label) {
        <button
          type="button"
          role="menuitem"
          [attr.data-label]="label"
          (click)="clicks.set(clicks() + 1)"
        >
          {{ label }}
        </button>
      }
      <button type="button" role="menuitem" disabled data-label="Off">
        Off
      </button>
    </div>
    <button type="button" class="t2" [rteMenuTrigger]="m2">Dois</button>
    <div rteMenu #m2="rteMenu">
      <button type="button" role="menuitemradio" aria-checked="false">X</button>
    </div>
    <button type="button" class="t3" disabled [rteMenuTrigger]="m3">
      Três
    </button>
    <button type="button" class="t4" aria-disabled="true" [rteMenuTrigger]="m3">
      Quatro
    </button>
    <div rteMenu #m3="rteMenu">
      <button type="button" role="menuitem">Y</button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly labels = ['Alpha', 'Beta', 'Pi', 'Gamma', 'Phi'];
  readonly clicks = signal(0);
  readonly tabOuts: string[] = [];
  readonly m1 = viewChild.required<RteMenu>('m1');
  readonly m2 = viewChild.required<RteMenu>('m2');
  readonly m3 = viewChild.required<RteMenu>('m3');
}

let restoreShim: () => void;
beforeEach(() => {
  restoreShim = installPopoverShim();
});
afterEach(() => {
  // destrói os fixtures (menus abertos chamam hidePopover) antes de tirar o calço
  TestBed.resetTestingModule();
  restoreShim();
  vi.restoreAllMocks();
});

function q(fixture: ComponentFixture<Host>, selector: string): HTMLElement {
  const el = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
    selector,
  );
  if (!el) throw new Error(`${selector} ausente`);
  return el;
}

function menuEl(fixture: ComponentFixture<Host>, n: 1 | 2 | 3): HTMLElement {
  return q(fixture, `#${fixture.componentInstance[`m${n}`]().id}`);
}

function focusedLabel(): string | undefined {
  const el = document.activeElement as HTMLElement | null;
  return el?.dataset?.['label'] ?? el?.className;
}

async function press(
  fixture: ComponentFixture<Host>,
  key: string,
  init: KeyboardEventInit = {},
  target = document.activeElement as HTMLElement,
): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  await settle(fixture);
  return event;
}

async function openWith(
  fixture: ComponentFixture<Host>,
  key: string,
): Promise<void> {
  const t1 = q(fixture, '.t1');
  t1.focus();
  await press(fixture, key, {}, t1);
}

describe('RteMenu e RteMenuTrigger (U6, U7)', () => {
  it('atributos: popover auto, role menu, classe, id único; nenhum style inicial; dentro do host', async () => {
    const fixture = await renderHost(Host);
    const host = fixture.nativeElement as HTMLElement;
    const m1 = menuEl(fixture, 1);
    const m2 = menuEl(fixture, 2);
    expect(m1.getAttribute('popover')).toBe('auto');
    expect(m1.getAttribute('role')).toBe('menu');
    expect(m1.classList.contains('rte-menu')).toBe(true);
    expect(m1.id).toMatch(/^rte-menu-\d+$/);
    expect(m1.id).not.toBe(m2.id);
    expect(host.contains(m1)).toBe(true);
    expect(host.innerHTML).not.toContain('style=');
    const t1 = q(fixture, '.t1');
    expect(t1.getAttribute('aria-haspopup')).toBe('menu');
    expect(t1.getAttribute('aria-expanded')).toBe('false');
    expect(t1.getAttribute('aria-controls')).toBe(m1.id);
  });

  it.each(['Enter', ' ', 'ArrowDown'])(
    '%j no gatilho abre com foco no primeiro item',
    async (key) => {
      const fixture = await renderHost(Host);
      await openWith(fixture, key);
      expect(fixture.componentInstance.m1().isOpen()).toBe(true);
      expect(focusedLabel()).toBe('Alpha');
      expect(q(fixture, '.t1').getAttribute('aria-expanded')).toBe('true');
    },
  );

  it('↑ no gatilho abre com foco no último item focável', async () => {
    const fixture = await renderHost(Host);
    await openWith(fixture, 'ArrowUp');
    expect(focusedLabel()).toBe('Phi');
  });

  it('a tecla que abre tem o padrão cancelado (sem clique sintético)', async () => {
    const fixture = await renderHost(Host);
    const t1 = q(fixture, '.t1');
    t1.focus();
    const event = await press(fixture, 'Enter', {}, t1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('clique alterna', async () => {
    const fixture = await renderHost(Host);
    const t1 = q(fixture, '.t1');
    t1.click();
    await settle(fixture);
    expect(fixture.componentInstance.m1().isOpen()).toBe(true);
    expect(focusedLabel()).toBe('Alpha');
    t1.click();
    await settle(fixture);
    expect(fixture.componentInstance.m1().isOpen()).toBe(false);
    expect(t1.getAttribute('aria-expanded')).toBe('false');
  });

  it('pointerdown com o menu aberto: o clique seguinte fecha, mesmo que o light dismiss feche antes', async () => {
    const fixture = await renderHost(Host);
    const t1 = q(fixture, '.t1');
    t1.click();
    await settle(fixture);
    t1.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    menuEl(fixture, 1).hidePopover(); // light dismiss antes do click
    t1.click();
    await settle(fixture);
    expect(fixture.componentInstance.m1().isOpen()).toBe(false);
  });

  it('nada abre com o gatilho disabled ou aria-disabled', async () => {
    const fixture = await renderHost(Host);
    const t3 = q(fixture, '.t3');
    const t4 = q(fixture, '.t4');
    t3.click();
    await press(fixture, 'Enter', {}, t3);
    await press(fixture, 'ArrowDown', {}, t3);
    t4.click();
    await press(fixture, 'Enter', {}, t4);
    await press(fixture, 'ArrowUp', {}, t4);
    await settle(fixture);
    expect(fixture.componentInstance.m3().isOpen()).toBe(false);
  });

  it('↑/↓ circulares e Home/End, pulando item disabled', async () => {
    const fixture = await renderHost(Host);
    await openWith(fixture, 'ArrowDown');
    const seen: (string | undefined)[] = [];
    for (let i = 0; i < 5; i++) {
      await press(fixture, 'ArrowDown');
      seen.push(focusedLabel());
    }
    expect(seen).toEqual(['Beta', 'Pi', 'Gamma', 'Phi', 'Alpha']);
    await press(fixture, 'ArrowUp');
    expect(focusedLabel()).toBe('Phi');
    await press(fixture, 'Home');
    expect(focusedLabel()).toBe('Alpha');
    await press(fixture, 'End');
    expect(focusedLabel()).toBe('Phi');
  });

  it('primeira letra: p foca o próximo item que começa com P (sem caixa)', async () => {
    const fixture = await renderHost(Host);
    await openWith(fixture, 'ArrowDown');
    await press(fixture, 'p');
    expect(focusedLabel()).toBe('Pi');
    await press(fixture, 'P');
    expect(focusedLabel()).toBe('Phi');
    await press(fixture, 'p');
    expect(focusedLabel()).toBe('Pi');
    await press(fixture, 'g');
    expect(focusedLabel()).toBe('Gamma');
    await press(fixture, 'z');
    expect(focusedLabel()).toBe('Gamma');
  });

  it('Enter/Espaço no item ficam com a ativação nativa (padrão não cancelado)', async () => {
    const fixture = await renderHost(Host);
    await openWith(fixture, 'ArrowDown');
    expect((await press(fixture, 'Enter')).defaultPrevented).toBe(false);
    expect((await press(fixture, ' ')).defaultPrevented).toBe(false);
  });

  it('Escape fecha e foca o gatilho, sem propagar', async () => {
    const fixture = await renderHost(Host);
    await openWith(fixture, 'ArrowDown');
    const outer = vi.fn();
    (fixture.nativeElement as HTMLElement).addEventListener('keydown', outer);
    const event = await press(fixture, 'Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(outer).not.toHaveBeenCalled();
    expect(fixture.componentInstance.m1().isOpen()).toBe(false);
    expect(document.activeElement).toBe(q(fixture, '.t1'));
    expect(q(fixture, '.t1').getAttribute('aria-expanded')).toBe('false');
  });

  it('Tab fecha e emite tabOut("forward")', async () => {
    const fixture = await renderHost(Host);
    await openWith(fixture, 'ArrowDown');
    const event = await press(fixture, 'Tab');
    expect(event.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.m1().isOpen()).toBe(false);
    expect(fixture.componentInstance.tabOuts).toEqual(['forward']);
    expect(document.activeElement).not.toBe(q(fixture, '.t1'));
  });

  it('Shift+Tab fecha e foca o gatilho', async () => {
    const fixture = await renderHost(Host);
    await openWith(fixture, 'ArrowDown');
    const event = await press(fixture, 'Tab', { shiftKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.m1().isOpen()).toBe(false);
    expect(fixture.componentInstance.tabOuts).toEqual([]);
    expect(document.activeElement).toBe(q(fixture, '.t1'));
  });

  it('abrir o segundo menu fecha o primeiro', async () => {
    const fixture = await renderHost(Host);
    await openWith(fixture, 'ArrowDown');
    const t2 = q(fixture, '.t2');
    t2.focus();
    await press(fixture, 'ArrowDown', {}, t2);
    expect(fixture.componentInstance.m1().isOpen()).toBe(false);
    expect(fixture.componentInstance.m2().isOpen()).toBe(true);
    expect(q(fixture, '.t1').getAttribute('aria-expanded')).toBe('false');
    expect(t2.getAttribute('aria-expanded')).toBe('true');
    expect(menuEl(fixture, 2).contains(document.activeElement)).toBe(true);
  });

  it('hidePopover() externo (light dismiss) com o foco dentro → foco no gatilho, nenhum clique de item', async () => {
    const fixture = await renderHost(Host);
    await openWith(fixture, 'ArrowDown');
    await press(fixture, 'ArrowDown');
    menuEl(fixture, 1).hidePopover();
    await settle(fixture);
    expect(fixture.componentInstance.m1().isOpen()).toBe(false);
    expect(document.activeElement).toBe(q(fixture, '.t1'));
    expect(fixture.componentInstance.clicks()).toBe(0);
  });

  it('light dismiss com o foco fora do menu não rouba o foco', async () => {
    const fixture = await renderHost(Host);
    await openWith(fixture, 'ArrowDown');
    const t2 = q(fixture, '.t2');
    t2.focus();
    menuEl(fixture, 1).hidePopover();
    await settle(fixture);
    expect(document.activeElement).toBe(t2);
  });

  it('posição gravada por CSSOM (left, top, max-height em px) ao abrir', async () => {
    const fixture = await renderHost(Host);
    const m1 = menuEl(fixture, 1);
    expect(m1.hasAttribute('style')).toBe(false);
    const spy = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty');
    await openWith(fixture, 'ArrowDown');
    expect(m1.style.left).toMatch(/^-?\d+(\.\d+)?px$/);
    expect(m1.style.top).toMatch(/^-?\d+(\.\d+)?px$/);
    expect(m1.style.maxHeight).toMatch(/^-?\d+(\.\d+)?px$/);
    expect(spy.mock.calls.map((c) => c[0]).sort()).toEqual([
      'left',
      'max-height',
      'top',
    ]);
  });

  it('scroll (captura) e resize no defaultView só enquanto aberto; removidos ao fechar', async () => {
    const fixture = await renderHost(Host);
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const kinds = (spy: typeof add) =>
      spy.mock.calls
        .filter(([type]) => type === 'scroll' || type === 'resize')
        .map(([type, , opts]) => [type, opts]);
    expect(kinds(add)).toEqual([]);
    await openWith(fixture, 'ArrowDown');
    expect(kinds(add)).toEqual([
      ['scroll', true],
      ['resize', undefined],
    ]);
    expect(kinds(remove)).toEqual([]);
    const listener = add.mock.calls.find(([t]) => t === 'scroll')?.[1];
    await press(fixture, 'Escape');
    expect(kinds(remove)).toEqual([
      ['scroll', true],
      ['resize', undefined],
    ]);
    expect(remove.mock.calls.find(([t]) => t === 'scroll')?.[1]).toBe(listener);
  });

  it('reposiciona em scroll e resize enquanto aberto', async () => {
    const fixture = await renderHost(Host);
    await openWith(fixture, 'ArrowDown');
    const spy = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty');
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new Event('scroll'));
    expect(spy.mock.calls.filter((c) => c[0] === 'top')).toHaveLength(2);
    // rolagem interna do próprio menu não reposiciona
    menuEl(fixture, 1).dispatchEvent(new Event('scroll'));
    expect(spy.mock.calls.filter((c) => c[0] === 'top')).toHaveLength(2);
  });

  it('destruir com o menu aberto tira os ouvintes e esconde', async () => {
    const fixture = await renderHost(Host);
    await openWith(fixture, 'ArrowDown');
    const m1 = menuEl(fixture, 1);
    const hide = vi.spyOn(m1, 'hidePopover');
    const remove = vi.spyOn(window, 'removeEventListener');
    fixture.destroy();
    expect(hide).toHaveBeenCalled();
    expect(
      remove.mock.calls
        .filter(([type]) => type === 'scroll' || type === 'resize')
        .map(([type]) => type),
    ).toEqual(['scroll', 'resize']);
  });
});
