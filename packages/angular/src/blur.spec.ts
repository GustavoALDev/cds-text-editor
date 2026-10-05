import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor } from '@cds/rte-angular';
import type { Editor } from '@tiptap/core';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';
import { RTE_TEST_MODE } from './testing-support/test-mode';
import { RteMenu } from './toolbar/menu';

// Spec 05b1, Tarefa 7 (U18, R13): `disabled`/`hidden` com o foco dentro
// emitem `editorBlur`/`touch` uma vez, depois da detecção de mudanças, sem
// `NG0100`. O contador é um campo comum (não signal) lido no template antes
// do editor: mudá-lo durante a detecção daria `NG0100`.

@Component({
  selector: 'rte-test-blur-host',
  imports: [RteEditor],
  template: `<span class="count">{{ count }}</span
    ><span class="blurs">{{ blurs }}</span>
    <rte-editor
      [disabled]="disabled()"
      [readonly]="readonly()"
      [hidden]="hidden()"
      (touch)="count = count + 1"
      (editorBlur)="blurs = blurs + 1; onBlur()"
      (editorFocus)="focuses = focuses + 1"
    />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly disabled = signal(false);
  readonly readonly = signal(false);
  readonly hidden = signal(false);
  count = 0;
  blurs = 0;
  focuses = 0;
  /** Estado do DOM do editor no momento do `editorBlur` (já renderizado?). */
  seenAtBlur: { buttonDisabled: boolean; hostHidden: boolean } | null = null;
  readonly cmp = viewChild.required(RteEditor);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  onBlur(): void {
    const editor = this.el.nativeElement.querySelector('rte-editor');
    this.seenAtBlur = {
      buttonDisabled:
        editor?.querySelector<HTMLButtonElement>('.rte-toolbar__button')
          ?.disabled ?? false,
      hostHidden: editor?.hasAttribute('hidden') ?? false,
    };
  }
}

let restoreShim: () => void;
let error: MockInstance<typeof console.error>;
beforeEach(() => {
  restoreShim = installPopoverShim();
  error = vi.spyOn(console, 'error');
});
afterEach(() => {
  TestBed.resetTestingModule();
  restoreShim();
  vi.restoreAllMocks();
});

async function setup(): Promise<{
  fixture: ComponentFixture<Host>;
  host: Host;
  el: HTMLElement;
  editor: Editor;
}> {
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(Host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const host = fixture.componentInstance;
  return {
    fixture,
    host,
    el: fixture.nativeElement as HTMLElement,
    editor: host.cmp().editor() as Editor,
  };
}

function text(el: HTMLElement, selector: string): string {
  return el.querySelector(selector)?.textContent?.trim() ?? '';
}

function noNg0100(): void {
  const messages = error.mock.calls.map((args: unknown[]) =>
    args.map(String).join(' '),
  );
  expect(messages.filter((m: string) => m.includes('NG0100'))).toEqual([]);
  expect(error).not.toHaveBeenCalled();
}

function toolbarButton(el: HTMLElement, label: string): HTMLButtonElement {
  const found = [
    ...el.querySelectorAll<HTMLButtonElement>(
      '.rte-toolbar .rte-toolbar__button',
    ),
  ].find((b) => b.getAttribute('aria-label') === label);
  if (!found) throw new Error(`botão ${label} ausente`);
  return found;
}

describe('blur de disabled/hidden depois da detecção (U18, R13)', () => {
  it.each(['disabled', 'hidden'] as const)(
    '%s com o foco no editável: touch e editorBlur 1×, sem NG0100',
    async (state) => {
      const { fixture, host, el, editor } = await setup();
      editor.view.dom.focus();
      await settle(fixture);
      expect(
        el.querySelector('rte-editor')?.contains(document.activeElement),
      ).toBe(true);

      host[state].set(true);
      await expect(fixture.whenStable()).resolves.not.toThrow();
      expect(host.count).toBe(1);
      expect(host.blurs).toBe(1);
      // emitido depois da detecção: o DOM do editor já reflete o estado
      expect(host.seenAtBlur).toEqual({
        buttonDisabled: state === 'disabled',
        hostHidden: state === 'hidden',
      });
      await settle(fixture);
      expect(text(el, '.count')).toBe('1');
      expect(text(el, '.blurs')).toBe('1');
      expect(document.activeElement).not.toBe(editor.view.dom);
      noNg0100();
    },
  );

  it('disabled com o menu textColor aberto e o foco num item: menu fechado, touch 1× (Review Focus 3)', async () => {
    const { fixture, host, el } = await setup();
    const trigger = toolbarButton(el, 'Text color');
    trigger.click();
    await settle(fixture);
    const id = trigger.getAttribute('aria-controls');
    const menu = fixture.debugElement
      .queryAll(By.directive(RteMenu))
      .map((d) => d.injector.get(RteMenu))
      .find((m) => m.id === id) as RteMenu;
    expect(menu.isOpen()).toBe(true);
    const item = document
      .getElementById(id ?? '')
      ?.querySelector<HTMLElement>('.rte-menu__item');
    item?.focus();
    await settle(fixture);
    expect(document.activeElement).toBe(item);

    host.disabled.set(true);
    await expect(fixture.whenStable()).resolves.not.toThrow();
    await settle(fixture);
    expect(menu.isOpen()).toBe(false);
    expect(host.count).toBe(1);
    expect(text(el, '.count')).toBe('1');
    noNg0100();
  });

  it('readonly com o foco num item da barra: botão disabled, foco fora da barra, touch 1×', async () => {
    const { fixture, host, el } = await setup();
    const bold = toolbarButton(el, 'Bold');
    bold.focus();
    await settle(fixture);
    expect(document.activeElement).toBe(bold);

    host.readonly.set(true);
    await expect(fixture.whenStable()).resolves.not.toThrow();
    await settle(fixture);
    expect(bold.disabled).toBe(true);
    expect(
      el.querySelector('.rte-toolbar')?.contains(document.activeElement),
    ).toBe(false);
    expect(host.count).toBe(1);
    expect(text(el, '.count')).toBe('1');
    noNg0100();
  });
});

describe('saída adiada do host (D11, revisão final I1)', () => {
  function outside(): HTMLButtonElement {
    const b = document.createElement('button');
    document.body.appendChild(b);
    return b;
  }

  it.each(['toolbar', 'editable'] as const)(
    'blur() + focus() síncronos (%s): nenhuma saída; a próxima saída real emite 1×',
    async (where) => {
      const { fixture, host, el, editor } = await setup();
      const target =
        where === 'toolbar' ? toolbarButton(el, 'Bold') : editor.view.dom;
      target.focus();
      await settle(fixture);
      const rte = el.querySelector('rte-editor') as HTMLElement;
      expect(rte.classList.contains('rte-editor--focused')).toBe(true);

      target.blur();
      target.focus();
      await settle(fixture);
      if (TestBed.inject(RTE_TEST_MODE) === 'zoneless') {
        // a decisão fica para depois do `focus()`: nenhuma saída
        expect([host.focuses, host.blurs, host.count]).toEqual([1, 0, 0]);
      } else {
        // zone.js: o fim da tarefa do `focusout` já roda a detecção (antes do
        // `focus()`), o foco de fato saiu; o `focus()` volta a entrar. O
        // estado fica coerente: uma saída e uma nova entrada.
        expect([host.focuses, host.blurs, host.count]).toEqual([2, 1, 1]);
      }
      expect(rte.classList.contains('rte-editor--focused')).toBe(true);
      const before = host.blurs;

      const out = outside();
      try {
        out.focus();
        await settle(fixture);
        expect(host.blurs).toBe(before + 1);
        expect(host.count).toBe(before + 1);
        expect(rte.classList.contains('rte-editor--focused')).toBe(false);
      } finally {
        out.remove();
      }
      noNg0100();
    },
  );

  it('focusout sem destino com a janela sem foco (alt-tab): sai 1×', async () => {
    const { fixture, host, el } = await setup();
    const bold = toolbarButton(el, 'Bold');
    bold.focus();
    await settle(fixture);
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    // a troca de janela mantém o `activeElement` no item
    bold.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: null }),
    );
    await settle(fixture);
    expect(document.activeElement).toBe(bold);
    expect(host.blurs).toBe(1);
    expect(host.count).toBe(1);
  });
});
