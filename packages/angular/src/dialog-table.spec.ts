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
  setChecked,
  typeInto,
  waitForDialog,
} from './testing-support/dialog';
import { selectText } from './testing-support/editors';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';

// Spec 05b2a, Tarefa 5: diálogo de tabela nova (R11).

const START = '<p>antes</p>';

@Component({
  selector: 'rte-test-table-host',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    (valueChange)="changes = changes + 1"
    toolbar="full"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal(START);
  changes = 0;
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

interface Opened {
  fixture: ComponentFixture<Host>;
  host: Host;
  editor: Editor;
  dialog: HTMLDialogElement;
  rows: HTMLInputElement;
  cols: HTMLInputElement;
  headerRow: HTMLInputElement;
  headerColumn: HTMLInputElement;
  initial: string;
}

async function setup(): Promise<{
  fixture: ComponentFixture<Host>;
  host: Host;
  el: HTMLElement;
  editor: Editor;
}> {
  const fixture = TestBed.createComponent(Host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const host = fixture.componentInstance;
  const editor = host.cmp().editor() as Editor;
  selectText(editor, 'antes', 5);
  host.changes = 0;
  return {
    fixture,
    host,
    el: (fixture.nativeElement as HTMLElement).querySelector(
      'rte-editor',
    ) as HTMLElement,
    editor,
  };
}

async function opened(
  fixture: ComponentFixture<Host>,
  host: Host,
  editor: Editor,
): Promise<Opened> {
  const initial = getRteHtml(editor);
  const dialog = await waitForDialog(fixture);
  return {
    fixture,
    host,
    editor,
    dialog,
    rows: dialogField(dialog, 'Rows'),
    cols: dialogField(dialog, 'Columns'),
    headerRow: dialogField(dialog, 'Header row'),
    headerColumn: dialogField(dialog, 'Header column'),
    initial,
  };
}

async function open(): Promise<Opened> {
  const { fixture, host, editor } = await setup();
  expect(host.cmp().openDialog('table')).toBe(true);
  return opened(fixture, host, editor);
}

function insert(dialog: HTMLElement): HTMLButtonElement {
  const button = dialog.querySelector<HTMLButtonElement>('.rte-dialog__apply');
  if (!button) throw new Error('botão de envio ausente');
  return button;
}

/** Tabela do HTML do editor (pelo parser do jsdom). */
function tableOf(editor: Editor): HTMLTableElement {
  const doc = new DOMParser().parseFromString(getRteHtml(editor), 'text/html');
  const table = doc.querySelector('table');
  if (!table) throw new Error('tabela ausente');
  return table;
}

function cell(
  table: HTMLTableElement,
  row: number,
  col: number,
): HTMLTableCellElement {
  const found = table.rows[row]?.cells[col];
  if (!found) throw new Error(`célula [${row}][${col}] ausente`);
  return found;
}

const EMPTY_TH = '<th scope="col"><p></p></th>';
const EMPTY_TD = '<td><p></p></td>';
const DEFAULT_TABLE =
  '<table><tbody>' +
  `<tr>${EMPTY_TH.repeat(3)}</tr>` +
  `<tr>${EMPTY_TD.repeat(3)}</tr>`.repeat(2) +
  '</tbody></table>';

describe('tabela nova (R11)', () => {
  it('pelo menu Insert table…: título, valores padrão e botão Insert', async () => {
    const { fixture, host, el, editor } = await setup();
    const trigger = [
      ...el.querySelectorAll<HTMLButtonElement>(
        '.rte-toolbar .rte-toolbar__button',
      ),
    ].find((b) => b.getAttribute('aria-label') === 'Table');
    trigger?.click();
    await settle(fixture);
    const id = trigger?.getAttribute('aria-controls');
    const menu = id ? document.getElementById(id) : null;
    const entry = [
      ...(menu?.querySelectorAll<HTMLElement>('.rte-menu__item') ?? []),
    ].find((i) => i.textContent?.trim() === 'Insert table…');
    if (!entry) throw new Error('entrada Insert table… ausente');
    entry.click();
    const { dialog, rows, cols, headerRow, headerColumn } = await opened(
      fixture,
      host,
      editor,
    );
    expect(
      dialog.querySelector('.rte-dialog__title')?.textContent?.trim(),
    ).toBe('Insert table');
    expect(rows.type).toBe('number');
    expect(cols.type).toBe('number');
    expect(rows.value).toBe('3');
    expect(cols.value).toBe('3');
    expect(headerRow.type).toBe('checkbox');
    expect(headerRow.checked).toBe(true);
    expect(headerColumn.checked).toBe(false);
    expect(insert(dialog).textContent?.trim()).toBe('Insert');
  });

  it('aplicar o padrão: linha de cabeçalho com scope="col", 1 emissão, 1 undo', async () => {
    const { fixture, host, editor, dialog, initial } = await open();
    insert(dialog).click();
    await settle(fixture);
    expect(dialog.open).toBe(false);
    expect(getRteHtml(editor)).toContain(DEFAULT_TABLE);
    expect(host.changes).toBe(1);
    editor.commands.undo();
    expect(getRteHtml(editor)).toBe(initial);
  });

  it('2 × 2 com as duas opções: [0][0] col, [0][1] col, [1][0] row', async () => {
    const { fixture, editor, dialog, rows, cols, headerColumn } = await open();
    typeInto(rows, '2');
    typeInto(cols, '2');
    setChecked(headerColumn, true);
    insert(dialog).click();
    await settle(fixture);
    const table = tableOf(editor);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.cells).toHaveLength(2);
    expect(cell(table, 0, 0).outerHTML).toBe(EMPTY_TH);
    expect(cell(table, 0, 1).outerHTML).toBe(EMPTY_TH);
    expect(cell(table, 1, 0).outerHTML).toBe('<th scope="row"><p></p></th>');
    expect(cell(table, 1, 1).outerHTML).toBe(EMPTY_TD);
  });

  it('sem linha de cabeçalho e com coluna: só th scope="row" na 1ª coluna', async () => {
    const { fixture, editor, dialog, headerRow, headerColumn } = await open();
    setChecked(headerRow, false);
    setChecked(headerColumn, true);
    insert(dialog).click();
    await settle(fixture);
    const table = tableOf(editor);
    for (let r = 0; r < 3; r++) {
      expect(cell(table, r, 0).outerHTML).toBe('<th scope="row"><p></p></th>');
      expect(cell(table, r, 1).outerHTML).toBe(EMPTY_TD);
      expect(cell(table, r, 2).outerHTML).toBe(EMPTY_TD);
    }
  });

  it('100 × 20 aceito (limites inclusivos)', async () => {
    const { fixture, editor, dialog, rows, cols } = await open();
    typeInto(rows, '100');
    typeInto(cols, '20');
    insert(dialog).click();
    await settle(fixture);
    const table = tableOf(editor);
    expect(table.rows).toHaveLength(100);
    expect(table.rows[0]?.cells).toHaveLength(20);
  });

  it.each([
    ['Rows', '0', 'Enter a whole number from 1 to 100.'],
    ['Rows', '101', 'Enter a whole number from 1 to 100.'],
    ['Rows', '2.5', 'Enter a whole number from 1 to 100.'],
    ['Columns', '0', 'Enter a whole number from 1 to 20.'],
    ['Columns', '21', 'Enter a whole number from 1 to 20.'],
    ['Columns', '1.5', 'Enter a whole number from 1 to 20.'],
    ['Rows', '', 'Fill in this field.'],
    ['Columns', '', 'Fill in this field.'],
  ] as const)(
    '%s = "%s" → %s, nada aplicado',
    async (label, value, message) => {
      const { fixture, host, editor, dialog, initial } = await open();
      const input = dialogField(dialog, label);
      typeInto(input, value);
      insert(dialog).click();
      await settle(fixture);
      const error = dialog.querySelector<HTMLElement>('.rte-dialog__error');
      expect(error?.textContent?.trim()).toBe(message);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(dialog.open).toBe(true);
      expect(getRteHtml(editor)).toBe(initial);
      expect(host.changes).toBe(0);
    },
  );

  it('campos com min/max nativos', async () => {
    const { rows, cols } = await open();
    expect([rows.min, rows.max]).toEqual(['1', '100']);
    expect([cols.min, cols.max]).toEqual(['1', '20']);
  });

  it('openDialog("table") dentro de tabela → false', async () => {
    const { fixture, host, editor } = await setup();
    host.value.set(
      DEFAULT_TABLE.replace('<td><p></p></td>', '<td><p>x</p></td>'),
    );
    await settle(fixture);
    selectText(editor, 'x', 1);
    expect(host.cmp().openDialog('table')).toBe(false);
  });
});
