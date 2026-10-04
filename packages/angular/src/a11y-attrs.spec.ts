import { NgZone } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor } from '@cds/rte-angular';
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { editableAttributes, type RteEditableState } from './editor/attributes';
import { settle } from './testing-support/render';
import { RTE_TEST_MODE } from './testing-support/test-mode';

afterEach(() => {
  vi.restoreAllMocks();
  document.body
    .querySelectorAll('[data-test-outside]')
    .forEach((el) => el.remove());
});

const BASE: RteEditableState = {
  fallbackLabel: 'Rich text editor',
  required: false,
  invalid: false,
  touched: false,
  disabled: false,
  readonly: false,
};

describe('editableAttributes (D10, D13)', () => {
  it('base: classe, multiline e o nome padrão', () => {
    expect(editableAttributes(BASE)).toEqual({
      class: 'rte-content',
      'aria-multiline': 'true',
      'aria-label': 'Rich text editor',
    });
  });

  it('ariaLabel vence o padrão; ariaLabelledBy vence ariaLabel', () => {
    expect(editableAttributes({ ...BASE, ariaLabel: 'Corpo' })).toMatchObject({
      'aria-label': 'Corpo',
    });
    const both = editableAttributes({
      ...BASE,
      ariaLabel: 'Corpo',
      ariaLabelledBy: 'rot',
    });
    expect(both['aria-labelledby']).toBe('rot');
    expect(both).not.toHaveProperty('aria-label');
  });

  it('ariaLabel/ariaLabelledBy vazios ou só espaços valem como ausentes', () => {
    for (const blank of ['', '   ']) {
      const attrs = editableAttributes({
        ...BASE,
        ariaLabel: blank,
        ariaLabelledBy: blank,
        ariaDescribedBy: blank,
      });
      expect(attrs['aria-label']).toBe('Rich text editor');
      expect(attrs).not.toHaveProperty('aria-labelledby');
      expect(attrs).not.toHaveProperty('aria-describedby');
    }
  });

  it('describedby e required', () => {
    expect(
      editableAttributes({ ...BASE, ariaDescribedBy: 'erros', required: true }),
    ).toMatchObject({ 'aria-describedby': 'erros', 'aria-required': 'true' });
  });

  it('aria-invalid só com invalid && touched', () => {
    for (const [invalid, touched, expected] of [
      [false, false, false],
      [true, false, false],
      [false, true, false],
      [true, true, true],
    ] as const) {
      const attrs = editableAttributes({ ...BASE, invalid, touched });
      expect(attrs['aria-invalid'] === 'true').toBe(expected);
    }
  });

  it('disabled: aria-disabled, sem tabindex (vence readonly)', () => {
    for (const readonly of [false, true]) {
      const attrs = editableAttributes({ ...BASE, disabled: true, readonly });
      expect(attrs['aria-disabled']).toBe('true');
      expect(attrs).not.toHaveProperty('tabindex');
      expect(attrs).not.toHaveProperty('aria-readonly');
    }
  });

  it('readonly: aria-readonly e tabindex="0"', () => {
    const attrs = editableAttributes({ ...BASE, readonly: true });
    expect(attrs['aria-readonly']).toBe('true');
    expect(attrs['tabindex']).toBe('0');
    expect(attrs).not.toHaveProperty('aria-disabled');
  });
});

interface Probe {
  focus: boolean[];
  blur: boolean[];
  touch: boolean[];
  values: number;
  transactions: number;
}

async function setup(init?: (fixture: ComponentFixture<RteEditor>) => void) {
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(RteEditor);
  init?.(fixture);
  const cmp = fixture.componentInstance;
  const probe: Probe = {
    focus: [],
    blur: [],
    touch: [],
    values: 0,
    transactions: 0,
  };
  cmp.editorFocus.subscribe(() => probe.focus.push(NgZone.isInAngularZone()));
  cmp.editorBlur.subscribe(() => probe.blur.push(NgZone.isInAngularZone()));
  cmp.touch.subscribe(() => probe.touch.push(NgZone.isInAngularZone()));
  cmp.value.subscribe(() => probe.values++);
  fixture.autoDetectChanges();
  await settle(fixture);
  const editor = cmp.editor() as Editor;
  editor.on('transaction', () => probe.transactions++);
  const host = fixture.nativeElement as HTMLElement;
  return { fixture, cmp, editor, probe, host, dom: editor.view.dom };
}

async function set(
  fixture: ComponentFixture<RteEditor>,
  name: string,
  value: unknown,
) {
  fixture.componentRef.setInput(name, value);
  await settle(fixture);
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

describe('RteEditor: atributos do editável (D10, D13)', () => {
  it('role, multiline e o nome padrão', async () => {
    const { dom } = await setup();
    expect(dom.getAttribute('role')).toBe('textbox');
    expect(dom.getAttribute('aria-multiline')).toBe('true');
    expect(dom.getAttribute('aria-label')).toBe('Rich text editor');
    expect(dom.classList.contains('rte-content')).toBe(true);
  });

  it('ariaLabel muda sem transação', async () => {
    const { fixture, dom, probe } = await setup();
    await set(fixture, 'ariaLabel', 'Corpo');
    expect(dom.getAttribute('aria-label')).toBe('Corpo');
    expect(probe.transactions).toBe(0);
  });

  it('ariaLabel vazio ou só espaços cai no nome padrão (editável e casca)', async () => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(RteEditor);
    fixture.componentRef.setInput('ariaLabel', '  ');
    fixture.componentRef.changeDetectorRef.detectChanges();
    const shell = (fixture.nativeElement as HTMLElement).querySelector(
      '.rte-editor__shell',
    );
    expect(shell?.getAttribute('aria-label')).toBe('Rich text editor');
    fixture.autoDetectChanges();
    await settle(fixture);
    const dom = (fixture.componentInstance.editor() as Editor).view.dom;
    expect(dom.getAttribute('aria-label')).toBe('Rich text editor');
    await set(fixture, 'ariaLabel', '');
    expect(dom.getAttribute('aria-label')).toBe('Rich text editor');
  });

  it('ariaLabelledBy, ariaDescribedBy, required e invalid+touched', async () => {
    const { fixture, dom, probe } = await setup();
    await set(fixture, 'ariaLabelledBy', 'rot');
    expect(dom.getAttribute('aria-labelledby')).toBe('rot');
    expect(dom.hasAttribute('aria-label')).toBe(false);
    await set(fixture, 'ariaDescribedBy', 'erros');
    expect(dom.getAttribute('aria-describedby')).toBe('erros');
    await set(fixture, 'required', true);
    expect(dom.getAttribute('aria-required')).toBe('true');

    await set(fixture, 'invalid', true);
    expect(dom.hasAttribute('aria-invalid')).toBe(false);
    expect(
      fixture.nativeElement.classList.contains('rte-editor--invalid'),
    ).toBe(false);
    await set(fixture, 'touched', true);
    expect(dom.getAttribute('aria-invalid')).toBe('true');
    expect(
      fixture.nativeElement.classList.contains('rte-editor--invalid'),
    ).toBe(true);
    expect(probe.transactions).toBe(0);
  });

  it('disabled: não editável, sem tabindex, aria-disabled e a classe', async () => {
    const { fixture, dom, editor, host, probe } = await setup((f) =>
      f.componentRef.setInput('placeholder', 'Escreva'),
    );
    await set(fixture, 'disabled', true);
    expect(dom.getAttribute('contenteditable')).toBe('false');
    expect(dom.hasAttribute('tabindex')).toBe(false);
    expect(dom.getAttribute('aria-disabled')).toBe('true');
    expect(editor.isEditable).toBe(false);
    expect(host.classList.contains('rte-editor--disabled')).toBe(true);
    expect(dom.querySelector('.rte-placeholder')).not.toBeNull();

    await set(fixture, 'disabled', false);
    expect(dom.getAttribute('contenteditable')).toBe('true');
    expect(dom.hasAttribute('aria-disabled')).toBe(false);
    expect(host.classList.contains('rte-editor--disabled')).toBe(false);
    expect(probe.transactions).toBe(0);
  });

  it('readonly: tabindex="0", aria-readonly, não editável e placeholder visível', async () => {
    const { fixture, dom, editor, host } = await setup((f) =>
      f.componentRef.setInput('placeholder', 'Escreva'),
    );
    await set(fixture, 'readonly', true);
    expect(dom.getAttribute('tabindex')).toBe('0');
    expect(dom.getAttribute('aria-readonly')).toBe('true');
    expect(dom.getAttribute('contenteditable')).toBe('false');
    expect(editor.isEditable).toBe(false);
    expect(host.classList.contains('rte-editor--readonly')).toBe(true);
    expect(dom.querySelector('.rte-placeholder')).not.toBeNull();
  });

  it('hidden: atributo hidden no host', async () => {
    const { fixture, host } = await setup();
    expect(host.hasAttribute('hidden')).toBe(false);
    await set(fixture, 'hidden', true);
    expect(host.getAttribute('hidden')).toBe('');
    await set(fixture, 'hidden', false);
    expect(host.hasAttribute('hidden')).toBe(false);
  });
});

describe('RteEditor: foco do host (D11)', () => {
  it('focusout para fora emite editorBlur e touch 1×; para dentro, nada', async () => {
    const { fixture, dom, host, probe } = await setup();
    dom.dispatchEvent(focusEvent('focusin', null));
    await settle(fixture);
    expect(probe.focus).toHaveLength(1);

    const inner = document.createElement('button');
    host.appendChild(inner);
    dom.dispatchEvent(focusEvent('focusout', inner));
    await settle(fixture);
    expect(probe.blur).toHaveLength(0);
    expect(probe.touch).toHaveLength(0);
    expect(host.classList.contains('rte-editor--focused')).toBe(true);

    inner.dispatchEvent(focusEvent('focusout', outsideButton()));
    await settle(fixture);
    expect(probe.blur).toHaveLength(1);
    expect(probe.touch).toHaveLength(1);
    expect(host.classList.contains('rte-editor--focused')).toBe(false);
  });

  it('focusin de fora emite editorFocus 1× e liga --focused; de dentro, nada', async () => {
    const { fixture, dom, host, probe } = await setup();
    dom.dispatchEvent(focusEvent('focusin', outsideButton()));
    await settle(fixture);
    expect(probe.focus).toHaveLength(1);
    expect(host.classList.contains('rte-editor--focused')).toBe(true);

    const inner = document.createElement('button');
    host.appendChild(inner);
    inner.dispatchEvent(focusEvent('focusin', dom));
    await settle(fixture);
    expect(probe.focus).toHaveLength(1);
  });

  it('as saídas de foco chegam dentro da zona no modo zone.js', async () => {
    const { fixture, dom, probe } = await setup();
    dom.dispatchEvent(focusEvent('focusin', null));
    dom.dispatchEvent(focusEvent('focusout', null));
    await settle(fixture);
    expect([probe.focus, probe.blur, probe.touch].map((p) => p.length)).toEqual(
      [1, 1, 1],
    );
    if (TestBed.inject(RTE_TEST_MODE) === 'zone') {
      expect([...probe.focus, ...probe.blur, ...probe.touch]).toEqual([
        true,
        true,
        true,
      ]);
    }
  });

  it('disabled com o foco no editável: touch 1×, sem valor e sem prender o foco (Review Focus 4)', async () => {
    const { fixture, dom, host, probe } = await setup();
    dom.focus();
    await settle(fixture);
    expect(document.activeElement).toBe(dom);
    expect(probe.focus).toHaveLength(1);

    await set(fixture, 'disabled', true);
    // Se o navegador já tiver tirado o foco, o focusout sem relatedTarget
    // chega de novo e não pode duplicar as saídas.
    dom.dispatchEvent(focusEvent('focusout', null));
    await settle(fixture);
    expect(probe.touch).toHaveLength(1);
    expect(probe.blur).toHaveLength(1);
    expect(probe.values).toBe(0);
    expect(document.activeElement).not.toBe(dom);
    expect(host.classList.contains('rte-editor--focused')).toBe(false);
  });

  it('hidden com o foco no editável: touch 1× e sem prender o foco', async () => {
    const { fixture, dom, probe } = await setup();
    dom.focus();
    await settle(fixture);
    await set(fixture, 'hidden', true);
    expect(probe.touch).toHaveLength(1);
    expect(probe.values).toBe(0);
    expect(document.activeElement).not.toBe(dom);
  });
});
