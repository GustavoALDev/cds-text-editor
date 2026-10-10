import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor } from '@comodeviaser/rte-angular';
import { getRteHtml } from '@comodeviaser/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import { undoDepth } from '@tiptap/pm/history';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RTE_FLOATING_TABLE_MORE } from './floating/commands';
import { installDialogShim } from './testing-support/dialog';
import { selectText } from './testing-support/editors';
import { fakeCoords, installGeometry } from './testing-support/geometry';
import { installPopoverShim, isPopoverOpen } from './testing-support/popover';
import { settle } from './testing-support/render';
import type { RteRect } from './toolbar/position';
import { readTableOpState, tableGuardProbe } from './toolbar/table-guard';

// Spec 05b2b, Tarefa 6: a guarda de span 100 no menu flutuante de tabela
// (M16, R8) e a contagem de ensaios (pré-voo 16).

const SPAN_LIMIT =
  '— Unavailable: a cell would span more than 100 rows or columns.';

const td = (text: string, attrs = '') => `<td${attrs}><p>${text}</p></td>`;
const tr = (...cells: string[]) => `<tr>${cells.join('')}</tr>`;

/**
 * Tabela 100 × 101 com as duas faixas de span 100 (como os *fixtures* do
 * `table-guard.spec.ts`): X (`colspan` 100, colunas 0–99) e Y (`rowspan`
 * 100, coluna 100) na linha 0; C na linha 1, coluna 0. Com o cursor em C,
 * `addRowAfter`/`addRowBefore` fariam Y passar de 100 e `addColumnAfter`,
 * X (e as células E).
 */
const SPAN_TABLE =
  '<table><tbody>' +
  tr(td('X', ' colspan="100"'), td('Y', ' rowspan="100"')) +
  tr(td('C'), td('D', ' colspan="99"')) +
  Array.from({ length: 98 }, (_, i) => tr(td(`e${i}e`, ' colspan="100"'))).join(
    '',
  ) +
  '</tbody></table>';

@Component({
  selector: 'rte-test-floating-guard-host',
  imports: [RteEditor],
  template: `<rte-editor [value]="value" [options]="options" toolbar="full" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = SPAN_TABLE;
  readonly options = { features: { tables: true } };
  readonly cmp = viewChild.required(RteEditor);
}

let restore: (() => void)[] = [];

beforeEach(() => {
  tableGuardProbe.rehearsals = 0;
  restore = [installDialogShim(), installPopoverShim()];
  const editable: RteRect = { top: 100, left: 100, right: 900, bottom: 700 };
  const block: RteRect = { top: 300, left: 150, right: 450, bottom: 400 };
  restore.push(
    installGeometry({
      viewport: { width: 1000, height: 800 },
      rects: (el) =>
        el.classList.contains('rte-floating')
          ? null
          : el.classList.contains('ProseMirror')
            ? editable
            : block,
      size: (el) =>
        el.classList.contains('rte-floating')
          ? { width: 200, height: 40 }
          : { width: 300, height: 100 },
    }),
  );
});

afterEach(() => {
  TestBed.resetTestingModule();
  for (const r of restore.splice(0).reverse()) r();
  vi.restoreAllMocks();
});

async function setup(): Promise<{
  fixture: ComponentFixture<Host>;
  el: HTMLElement;
  editor: Editor;
}> {
  const fixture = TestBed.createComponent(Host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const editor = fixture.componentInstance.cmp().editor() as Editor;
  restore.push(
    fakeCoords(editor, (pos) => ({
      top: 200,
      bottom: 220,
      left: 100 + (pos % 300),
      right: 100 + (pos % 300),
    })),
  );
  return {
    fixture,
    el: (fixture.nativeElement as HTMLElement).querySelector(
      'rte-editor',
    ) as HTMLElement,
    editor,
  };
}

function tableMenu(el: HTMLElement): HTMLElement {
  const found = el.querySelector<HTMLElement>('.rte-floating--table');
  if (!found) throw new Error('menu de tabela ausente');
  return found;
}

function button(root: ParentNode, name: string): HTMLElement {
  const found = [
    ...root.querySelectorAll<HTMLElement>('button, [role^="menuitem"]'),
  ].find(
    (b) =>
      b.getAttribute('aria-label') === name || b.textContent?.trim() === name,
  );
  if (!found) throw new Error(`item "${name}" ausente`);
  return found;
}

async function showTableMenu(
  fixture: ComponentFixture<Host>,
  editor: Editor,
): Promise<void> {
  editor.view.dom.focus();
  selectText(editor, 'C', 1);
  await settle(fixture);
}

describe('guarda de span 100 no menu de tabela (M16, R8)', () => {
  it('Insert row below / Insert column after: aria-disabled e motivo no title', async () => {
    const { fixture, el, editor } = await setup();
    await showTableMenu(fixture, editor);
    const m = tableMenu(el);
    expect(isPopoverOpen(m)).toBe(true);
    for (const name of ['Insert row below', 'Insert column after']) {
      const b = button(m, name);
      expect(b.getAttribute('aria-disabled')).toBe('true');
      expect(b.getAttribute('title')).toBe(`${name} ${SPAN_LIMIT}`);
    }
    for (const name of ['Delete row', 'Delete column']) {
      expect(button(m, name).getAttribute('aria-disabled')).toBeNull();
    }
  });

  it('clique bloqueado: HTML, estado e histórico inalterados', async () => {
    const { fixture, el, editor } = await setup();
    await showTableMenu(fixture, editor);
    const m = tableMenu(el);
    const html = getRteHtml(editor);
    const state = editor.state;
    const depth = undoDepth(editor.state);
    for (const name of ['Insert row below', 'Insert column after']) {
      button(m, name).click();
      await settle(fixture);
      expect(getRteHtml(editor)).toBe(html);
      expect(editor.state).toBe(state);
      expect(undoDepth(editor.state)).toBe(depth);
    }
  });

  it('submenu: entradas bloqueadas conforme o ensaio', async () => {
    const { fixture, el, editor } = await setup();
    await showTableMenu(fixture, editor);
    const m = tableMenu(el);
    button(m, 'More table operations').click();
    await settle(fixture);
    const sub = m.querySelector<HTMLElement>('.rte-menu');
    if (!sub) throw new Error('submenu ausente');
    expect(isPopoverOpen(sub)).toBe(true);
    const labels: Record<string, string> = {
      addRowBefore: 'Insert row above',
      addColumnBefore: 'Insert column before',
      mergeCells: 'Merge cells',
      splitCell: 'Split cell',
      toggleHeaderRow: 'Header row',
      toggleHeaderColumn: 'Header column',
      deleteTable: 'Delete table',
    };
    expect(
      [...sub.querySelectorAll('[role="menuitem"]')].map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual(RTE_FLOATING_TABLE_MORE.map((op) => labels[op]));
    for (const op of RTE_FLOATING_TABLE_MORE) {
      const name = labels[op] ?? op;
      const expected = readTableOpState(editor, op);
      const entry = button(sub, name);
      expect(entry.getAttribute('aria-disabled')).toBe(
        expected.enabled ? null : 'true',
      );
      expect(entry.getAttribute('title')).toBe(
        expected.spanLimited ? `${name} ${SPAN_LIMIT}` : name,
      );
    }
    // o ensaio do fixture: acima bloqueada pela guarda; sem CellSelection
    // não há o que mesclar
    expect(readTableOpState(editor, 'addRowBefore').spanLimited).toBe(true);
    expect(readTableOpState(editor, 'mergeCells')).toEqual({
      enabled: false,
      spanLimited: false,
    });
    const html = getRteHtml(editor);
    const state = editor.state;
    button(sub, 'Insert row above').click();
    await settle(fixture);
    expect(getRteHtml(editor)).toBe(html);
    expect(editor.state).toBe(state);
  });
});

describe('ensaios só com o menu de tabela visível (M16, pré-voo 16)', () => {
  it('oculto: 10 transações → +0; visível: +2 por transação; submenu fechado não ensaia', async () => {
    const { fixture, el, editor } = await setup();
    selectText(editor, 'C', 1);
    await settle(fixture);
    expect(isPopoverOpen(tableMenu(el))).toBe(false);
    tableGuardProbe.rehearsals = 0;
    for (let i = 0; i < 10; i++) {
      editor.commands.insertContent('x');
      await settle(fixture);
    }
    expect(tableGuardProbe.rehearsals).toBe(0);

    await showTableMenu(fixture, editor);
    expect(isPopoverOpen(tableMenu(el))).toBe(true);
    tableGuardProbe.rehearsals = 0;
    for (let i = 1; i <= 10; i++) {
      editor.commands.insertContent('x');
      await settle(fixture);
      // só addRowAfter e addColumnAfter: as três que crescem no submenu
      // fechado (addRowBefore, addColumnBefore, mergeCells) não ensaiam
      expect(tableGuardProbe.rehearsals).toBe(2 * i);
    }
  });
});
