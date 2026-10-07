import {
  ChangeDetectionStrategy,
  Component,
  InjectionToken,
  inject,
  signal,
  viewChild,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  FormField,
  debounce,
  disabled,
  form,
  hidden,
  readonly,
  type SchemaFn,
} from '@angular/forms/signals';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor } from '@cds/rte-angular';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { rteMaxChars, rteRequired } from '@cds/rte-angular/validators';
import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { settle } from './testing-support/render';

afterEach(() => {
  document.body
    .querySelectorAll('[data-test-outside]')
    .forEach((el) => el.remove());
});

interface Model {
  body: string;
}

interface Flags {
  dis: Signal<boolean>;
  ro: Signal<boolean>;
  hid: Signal<boolean>;
}

type SchemaFactory = (flags: Flags) => SchemaFn<Model>;

const SCHEMA = new InjectionToken<SchemaFactory>('SCHEMA');

const FULL: SchemaFactory =
  ({ dis, ro, hid }) =>
  (p) => {
    rteRequired(p.body);
    rteMaxChars(p.body, 10);
    disabled(p.body, () => (dis() ? 'bloqueado' : false));
    readonly(p.body, () => ro());
    hidden(p.body, () => hid());
  };

@Component({
  selector: 'rte-test-signal-forms',
  imports: [RteEditor, FormField],
  template: '<rte-editor [formField]="f.body" />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly dis = signal(false);
  readonly ro = signal(false);
  readonly hid = signal(false);
  readonly model: WritableSignal<Model> = signal({ body: '' });
  readonly f = form(
    this.model,
    inject(SCHEMA)({ dis: this.dis, ro: this.ro, hid: this.hid }),
  );
  readonly cmp = viewChild.required(RteEditor);
}

async function setup(schema: SchemaFactory = FULL) {
  TestBed.configureTestingModule({
    providers: [{ provide: SCHEMA, useValue: schema }],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.autoDetectChanges();
  await settle(fixture);
  const host = fixture.componentInstance;
  const cmp = host.cmp();
  const editor = cmp.editor() as Editor;
  const probe = { writes: 0, loads: 0 };
  cmp.value.subscribe(() => probe.writes++);
  editor.on('transaction', ({ transaction }: { transaction: Transaction }) => {
    if (transaction.docChanged && transaction.getMeta('addToHistory') === false)
      probe.loads++;
  });
  return {
    fixture,
    host,
    cmp,
    editor,
    probe,
    el: fixture.nativeElement.querySelector('rte-editor') as HTMLElement,
    dom: editor.view.dom,
  };
}

function outsideButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.setAttribute('data-test-outside', '');
  document.body.appendChild(button);
  return button;
}

function focusEvent(type: 'focusin' | 'focusout', related: Element | null) {
  return new FocusEvent(type, { bubbles: true, relatedTarget: related });
}

/** Digita como o teclado: uma transação de texto por caractere, na seleção. */
function typeText(editor: Editor, text: string): void {
  for (const ch of text) {
    editor.view.dispatch(editor.state.tr.insertText(ch));
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe('Signal Forms: [formField] no rte-editor (D5, R5)', () => {
  it('required e maxLength do schema chegam às entradas', async () => {
    const { cmp } = await setup();
    expect(cmp.required()).toBe(true);
    expect(cmp.maxLength()).toBe(10);
  });

  it('digitar escreve o modelo e deixa o campo dirty', async () => {
    const { fixture, host, editor } = await setup();
    typeText(editor, 'abc');
    await settle(fixture);
    expect(host.model().body).toBe('<p>abc</p>');
    expect(host.f.body().dirty()).toBe(true);
  });

  it('carga acima do limite: inválido; aria-invalid só depois do focusout para fora', async () => {
    const { fixture, host, el, dom } = await setup();
    host.model.set({ body: '<p>abcdefghijkl</p>' });
    await settle(fixture);
    expect(dom.textContent).toBe('abcdefghijkl');
    expect(host.f.body().invalid()).toBe(true);
    expect(host.f.body().errors()).toEqual([
      expect.objectContaining({ kind: 'rteMaxChars', max: 10, actual: 12 }),
    ]);
    expect(dom.hasAttribute('aria-invalid')).toBe(false);

    dom.dispatchEvent(focusEvent('focusin', null));
    dom.dispatchEvent(focusEvent('focusout', outsideButton()));
    await settle(fixture);
    expect(host.f.body().touched()).toBe(true);
    expect(dom.getAttribute('aria-invalid')).toBe('true');
    expect(el.classList.contains('rte-editor--invalid')).toBe(true);
  });

  it('focusout para um botão dentro do host não toca', async () => {
    const { fixture, host, el, dom } = await setup();
    const inner = document.createElement('button');
    el.appendChild(inner);
    dom.dispatchEvent(focusEvent('focusin', null));
    dom.dispatchEvent(focusEvent('focusout', inner));
    await settle(fixture);
    expect(host.f.body().touched()).toBe(false);
  });

  it('disabled com motivo, readonly e hidden refletidos', async () => {
    const { fixture, host, cmp, editor, el, dom } = await setup();

    host.dis.set(true);
    await settle(fixture);
    expect(cmp.disabled()).toBe(true);
    expect(editor.isEditable).toBe(false);
    expect(dom.getAttribute('aria-disabled')).toBe('true');
    expect(host.f.body().disabledReasons()).toEqual([
      expect.objectContaining({ message: 'bloqueado' }),
    ]);
    host.dis.set(false);
    await settle(fixture);
    expect(editor.isEditable).toBe(true);

    host.ro.set(true);
    await settle(fixture);
    expect(cmp.readonly()).toBe(true);
    expect(dom.getAttribute('aria-readonly')).toBe('true');
    expect(editor.isEditable).toBe(false);
    host.ro.set(false);

    host.hid.set(true);
    await settle(fixture);
    expect(cmp.hidden()).toBe(true);
    expect(el.hasAttribute('hidden')).toBe(true);
  });

  it('focusBoundControl() foca o editável', async () => {
    const { host, dom } = await setup();
    host.f.body().focusBoundControl({ preventScroll: true }); // jsdom sem getClientRects
    await nextFrame();
    expect(document.activeElement).toBe(dom);
  });

  it("reset leva o editor a '' sem escrever e sem touched", async () => {
    const { fixture, host, editor, dom, probe } = await setup();
    typeText(editor, 'abc');
    dom.dispatchEvent(focusEvent('focusin', null));
    dom.dispatchEvent(focusEvent('focusout', outsideButton()));
    await settle(fixture);
    expect(host.f.body().touched()).toBe(true);
    probe.writes = 0;

    host.f().reset({ body: '' });
    await settle(fixture);
    expect(editor.isEmpty).toBe(true);
    expect(dom.textContent).toBe('');
    expect(probe.writes).toBe(0);
    expect(host.f.body().touched()).toBe(false);
  });

  it("debounce(path, 'blur'): digitar mantém as letras e a seleção; o modelo muda no focusout (Review Focus 1)", async () => {
    const { fixture, host, editor, dom, probe } = await setup(
      () => (p) => debounce(p.body, 'blur'),
    );
    dom.dispatchEvent(focusEvent('focusin', null));
    typeText(editor, 'a');
    await settle(fixture);
    typeText(editor, 'b');
    await settle(fixture);

    expect(editor.getHTML()).toBe('<p>ab</p>');
    expect(editor.state.selection.from).toBe(editor.state.doc.content.size - 1);
    expect(probe.loads).toBe(0);
    expect(host.model().body).toBe('');

    dom.dispatchEvent(focusEvent('focusout', outsideButton()));
    await settle(fixture);
    expect(host.model().body).toBe('<p>ab</p>');
    expect(editor.getHTML()).toBe('<p>ab</p>');
    expect(probe.loads).toBe(0);
  });
});
