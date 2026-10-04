import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { type ComponentFixture } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHost, settle } from './testing-support/render';
import { RteRovingFocus, RteRovingItem } from './toolbar/roving-focus';

afterEach(() => {
  vi.restoreAllMocks();
});

// a, b (aria-disabled), separador, c (disabled), d, e (disabled)
@Component({
  selector: 'rte-test-roving-host',
  imports: [RteRovingFocus, RteRovingItem],
  template: `
    <button type="button" class="outside">fora</button>
    <div [attr.dir]="dir()">
      <div rteRovingFocus>
        @for (id of ids(); track id) {
          <button
            type="button"
            rteRovingItem
            [attr.data-id]="id"
            [attr.aria-disabled]="id === 'b' ? 'true' : null"
            [disabled]="disabled().includes(id)"
          >
            {{ id }}
          </button>
          @if (id === 'b') {
            <div role="separator" aria-orientation="vertical"></div>
          }
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly ids = signal(['a', 'b', 'c', 'd', 'e']);
  readonly disabled = signal(['c', 'e']);
  readonly dir = signal<'ltr' | 'rtl' | null>(null);
  readonly roving = viewChild.required(RteRovingFocus);
}

function item(fixture: ComponentFixture<Host>, id: string): HTMLElement {
  const el = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
    `[data-id="${id}"]`,
  );
  if (!el) throw new Error(`item ${id} ausente`);
  return el;
}

function tabStops(fixture: ComponentFixture<Host>): string[] {
  return [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      '[rteRovingItem][tabindex="0"]',
    ),
  ].map((el) => el.dataset['id'] ?? '');
}

function focusedId(): string | undefined {
  return (document.activeElement as HTMLElement | null)?.dataset?.['id'];
}

async function press(
  fixture: ComponentFixture<Host>,
  key: string,
): Promise<KeyboardEvent> {
  const target = document.activeElement as HTMLElement;
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  await settle(fixture);
  return event;
}

describe('RteRovingFocus (U3)', () => {
  it('um só tabindex="0", no primeiro focável; os outros -1', async () => {
    const fixture = await renderHost(Host);
    expect(tabStops(fixture)).toEqual(['a']);
    for (const id of ['b', 'c', 'd', 'e']) {
      expect(item(fixture, id).getAttribute('tabindex')).toBe('-1');
    }
    expect(fixture.componentInstance.roving().activeIndex()).toBe(0);
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('[role="separator"]')
        ?.hasAttribute('tabindex'),
    ).toBe(false);
  });

  it('→ anda, pula disabled e separador, e volta ao primeiro depois do último', async () => {
    const fixture = await renderHost(Host);
    item(fixture, 'a').focus();
    const seen: (string | undefined)[] = [];
    for (let i = 0; i < 3; i++) {
      const event = await press(fixture, 'ArrowRight');
      expect(event.defaultPrevented).toBe(true);
      seen.push(focusedId());
    }
    // b é aria-disabled (focável); c e e são disabled nativos
    expect(seen).toEqual(['b', 'd', 'a']);
    expect(tabStops(fixture)).toEqual(['a']);
  });

  it('← do primeiro vai ao último focável', async () => {
    const fixture = await renderHost(Host);
    item(fixture, 'a').focus();
    await press(fixture, 'ArrowLeft');
    expect(focusedId()).toBe('d');
    expect(tabStops(fixture)).toEqual(['d']);
    await press(fixture, 'ArrowLeft');
    expect(focusedId()).toBe('b');
  });

  it('Home e End vão às pontas focáveis', async () => {
    const fixture = await renderHost(Host);
    item(fixture, 'b').focus();
    await press(fixture, 'End');
    expect(focusedId()).toBe('d');
    await press(fixture, 'Home');
    expect(focusedId()).toBe('a');
    expect(tabStops(fixture)).toEqual(['a']);
  });

  it('com dir="rtl" num ancestral, → anda para trás e ← para frente', async () => {
    const fixture = await renderHost(Host);
    fixture.componentInstance.dir.set('rtl');
    await settle(fixture);
    item(fixture, 'a').focus();
    await press(fixture, 'ArrowRight');
    expect(focusedId()).toBe('d');
    await press(fixture, 'ArrowLeft');
    expect(focusedId()).toBe('a');
    await press(fixture, 'ArrowLeft');
    expect(focusedId()).toBe('b');
  });

  it('aria-disabled recebe foco; disabled nunca', async () => {
    const fixture = await renderHost(Host);
    item(fixture, 'b').focus();
    await settle(fixture);
    expect(focusedId()).toBe('b');
    expect(tabStops(fixture)).toEqual(['b']);
    // nenhum caminho de teclado chega a c ou e
    const seen = new Set<string | undefined>();
    for (let i = 0; i < 6; i++) {
      await press(fixture, 'ArrowRight');
      seen.add(focusedId());
    }
    expect(seen.has('c')).toBe(false);
    expect(seen.has('e')).toBe(false);
  });

  it('ignora teclas com modificadores e teclas fora dos itens', async () => {
    const fixture = await renderHost(Host);
    item(fixture, 'a').focus();
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    item(fixture, 'a').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(focusedId()).toBe('a');
  });

  it('o último focado (com o mouse) continua com tabindex="0" depois de sair', async () => {
    const fixture = await renderHost(Host);
    item(fixture, 'd').focus();
    await settle(fixture);
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLElement>('.outside')
      ?.focus();
    await settle(fixture);
    expect(focusedId()).toBeUndefined();
    expect(tabStops(fixture)).toEqual(['d']);
    expect(fixture.componentInstance.roving().focusActive()).toBe(true);
    expect(focusedId()).toBe('d');
  });

  it('mudou o conjunto: mantém o mesmo elemento se ainda existe', async () => {
    const fixture = await renderHost(Host);
    item(fixture, 'b').focus();
    await settle(fixture);
    fixture.componentInstance.ids.set(['b', 'c', 'd', 'e']);
    await settle(fixture);
    expect(tabStops(fixture)).toEqual(['b']);
  });

  it('removido o item ativo, o primeiro focável fica ativo e focusActive() recupera o foco', async () => {
    const fixture = await renderHost(Host);
    item(fixture, 'd').focus();
    await settle(fixture);
    fixture.componentInstance.ids.set(['a', 'b', 'c', 'e']);
    await settle(fixture);
    expect(tabStops(fixture)).toEqual(['a']);
    expect(focusedId()).toBeUndefined();
    expect(fixture.componentInstance.roving().focusActive()).toBe(true);
    expect(focusedId()).toBe('a');
  });

  it('sem item focável: focusActive() devolve false e activeIndex é -1', async () => {
    const fixture = await renderHost(Host);
    fixture.componentInstance.ids.set(['c', 'e']);
    await settle(fixture);
    expect(tabStops(fixture)).toEqual([]);
    expect(fixture.componentInstance.roving().activeIndex()).toBe(-1);
    expect(fixture.componentInstance.roving().focusActive()).toBe(false);
  });
});
