import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { getRteHtml } from '@cds/rte-core/extensions';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor } from '@cds/rte-angular';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dialogField,
  installDialogShim,
  typeInto,
  waitForDialog,
} from './testing-support/dialog';
import { selectText } from './testing-support/editors';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';

// Spec 05b2a, Tarefa 5: comportamento comum dos formulários dos diálogos (R13),
// exercitado pelo diálogo de tabela.

@Component({
  selector: 'rte-test-forms-host',
  imports: [RteEditor],
  template: `<rte-editor [value]="value()" toolbar="full" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('<p>antes</p>');
  readonly cmp = viewChild.required(RteEditor);
}

let restoreDialog: () => void;
let restorePopover: () => void;
beforeEach(() => {
  restoreDialog = installDialogShim();
  restorePopover = installPopoverShim();
});
afterEach(() => {
  TestBed.resetTestingModule();
  restorePopover();
  restoreDialog();
  vi.restoreAllMocks();
});

async function setup(): Promise<{
  fixture: ComponentFixture<Host>;
  cmp: RteEditor;
  editor: Editor;
}> {
  const fixture = TestBed.createComponent(Host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const cmp = fixture.componentInstance.cmp();
  const editor = cmp.editor() as Editor;
  selectText(editor, 'antes', 5);
  return { fixture, cmp, editor };
}

async function openTable(
  fixture: ComponentFixture<Host>,
  cmp: RteEditor,
): Promise<{
  dialog: HTMLDialogElement;
  rows: HTMLInputElement;
  cols: HTMLInputElement;
}> {
  expect(cmp.openDialog('table')).toBe(true);
  const dialog = await waitForDialog(fixture);
  return {
    dialog,
    rows: dialogField(dialog, 'Rows'),
    cols: dialogField(dialog, 'Columns'),
  };
}

function errors(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>('.rte-dialog__error')];
}

function blur(input: HTMLInputElement): void {
  input.dispatchEvent(new FocusEvent('blur'));
}

/** Envio pelo botão (focado antes, como num clique). */
function submitByButton(dialog: HTMLElement): void {
  const button = dialog.querySelector<HTMLButtonElement>('.rte-dialog__apply');
  if (!button) throw new Error('botão de envio ausente');
  button.focus();
  button.click();
}

describe('formulários dos diálogos (R13)', () => {
  it('apagar Linhas sem sair do campo: nenhum erro nem aria-invalid', async () => {
    const { fixture, cmp } = await setup();
    const { dialog, rows } = await openTable(fixture, cmp);
    typeInto(rows, '');
    await settle(fixture);
    expect(errors(dialog)).toHaveLength(0);
    expect(rows.hasAttribute('aria-invalid')).toBe(false);
    expect(rows.hasAttribute('aria-describedby')).toBe(false);
  });

  it('blur: erro visível, aria-invalid e aria-describedby com o id do erro', async () => {
    const { fixture, cmp } = await setup();
    const { dialog, rows, cols } = await openTable(fixture, cmp);
    typeInto(rows, '');
    blur(rows);
    await settle(fixture);
    const [error] = errors(dialog);
    expect(errors(dialog)).toHaveLength(1);
    expect(error?.textContent?.trim()).toBe('Fill in this field.');
    expect(error?.id).toBeTruthy();
    expect(
      dialog.ownerDocument.querySelectorAll(`[id="${error?.id}"]`),
    ).toHaveLength(1);
    expect(rows.getAttribute('aria-invalid')).toBe('true');
    expect(rows.getAttribute('aria-describedby')?.split(' ')).toContain(
      error?.id,
    );
    expect(cols.hasAttribute('aria-invalid')).toBe(false);
  });

  it('envio inválido foca o primeiro inválido e não fecha; corrigido, o seguinte', async () => {
    const { fixture, cmp, editor } = await setup();
    const initial = getRteHtml(editor);
    const { dialog, rows, cols } = await openTable(fixture, cmp);
    typeInto(rows, '0');
    typeInto(cols, '50');
    submitByButton(dialog);
    await settle(fixture);
    expect(document.activeElement).toBe(rows);
    expect(dialog.open).toBe(true);
    expect(errors(dialog)).toHaveLength(2);
    expect(cols.getAttribute('aria-invalid')).toBe('true');

    typeInto(rows, '4');
    submitByButton(dialog);
    await settle(fixture);
    expect(document.activeElement).toBe(cols);
    expect(dialog.open).toBe(true);
    expect(rows.hasAttribute('aria-invalid')).toBe(false);
    expect(getRteHtml(editor)).toBe(initial);
  });

  it('Enter num campo válido (submit pelo botão padrão) aplica', async () => {
    const { fixture, cmp, editor } = await setup();
    const { dialog, rows } = await openTable(fixture, cmp);
    typeInto(rows, '2');
    const form = dialog.querySelector<HTMLFormElement>('form.rte-dialog__form');
    form?.requestSubmit();
    await settle(fixture);
    expect(dialog.open).toBe(false);
    expect(getRteHtml(editor)).toContain('<table>');
  });

  it('abrir de novo recria os valores e zera touched', async () => {
    const { fixture, cmp } = await setup();
    const first = await openTable(fixture, cmp);
    typeInto(first.rows, '7');
    typeInto(first.cols, '');
    blur(first.cols);
    await settle(fixture);
    expect(errors(first.dialog)).toHaveLength(1);
    first.dialog
      .querySelector<HTMLButtonElement>('.rte-dialog__cancel')
      ?.click();
    await settle(fixture);
    expect(first.dialog.open).toBe(false);

    const again = await openTable(fixture, cmp);
    expect(again.rows.value).toBe('3');
    expect(again.cols.value).toBe('3');
    expect(errors(again.dialog)).toHaveLength(0);
    expect(again.cols.hasAttribute('aria-invalid')).toBe(false);
    // `touched` zerado: apagar sem sair do campo continua sem erro
    typeInto(again.cols, '');
    await settle(fixture);
    expect(errors(again.dialog)).toHaveLength(0);
  });

  it('cada <label for> aponta um id existente no diálogo', async () => {
    const { fixture, cmp } = await setup();
    const { dialog } = await openTable(fixture, cmp);
    const labels = [
      ...dialog.querySelectorAll<HTMLLabelElement>('.rte-dialog__label'),
    ];
    expect(labels).toHaveLength(4);
    for (const label of labels) {
      expect(label.htmlFor).toBeTruthy();
      const target = dialog.querySelector(`[id="${label.htmlFor}"]`);
      expect(target?.tagName).toBe('INPUT');
      expect(label.control).toBe(target);
    }
  });
});
