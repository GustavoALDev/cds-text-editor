import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import {
  DeferBlockBehavior,
  DeferBlockState,
  TestBed,
  type ComponentFixture,
  type DeferBlockFixture,
} from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor } from '@cds/rte-angular';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dialogField, installDialogShim } from './testing-support/dialog';
import { selectText } from './testing-support/editors';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';

// Spec 05b2a, Tarefa 7: o `@defer` dos diálogos com carga manual (R12 unitário,
// G7, pré-voo 5, Review Focus 1 e 4).

const DEFER_FAILED =
  '[rte-editor] não foi possível carregar os diálogos; o pedido foi descartado.';

@Component({
  selector: 'rte-test-defer-host',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value"
    toolbar="full"
    [disabled]="disabled()"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = '<p>abcd efgh</p>';
  readonly disabled = signal(false);
  readonly cmp = viewChild.required(RteEditor);
}

interface Setup {
  fixture: ComponentFixture<Host>;
  host: Host;
  root: HTMLElement;
  cmp: RteEditor;
  editor: Editor;
  block: DeferBlockFixture;
}

let restoreDialog: () => void;
let restorePopover: () => void;
beforeEach(() => {
  restoreDialog = installDialogShim();
  restorePopover = installPopoverShim();
  TestBed.configureTestingModule({
    deferBlockBehavior: DeferBlockBehavior.Manual,
  });
});
afterEach(() => {
  TestBed.resetTestingModule();
  restorePopover();
  restoreDialog();
  vi.restoreAllMocks();
});

async function setup(): Promise<Setup> {
  const fixture = TestBed.createComponent(Host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const host = fixture.componentInstance;
  const cmp = host.cmp();
  const editor = cmp.editor() as Editor;
  selectText(editor, 'abcd');
  const blocks = await fixture.getDeferBlocks();
  expect(blocks).toHaveLength(1);
  return {
    fixture,
    host,
    root: fixture.nativeElement as HTMLElement,
    cmp,
    editor,
    block: blocks[0] as DeferBlockFixture,
  };
}

/** `Mod-k` como o jsdom o vê fora do Mac (`Mod` = Ctrl). */
function modK(): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: 'k',
    keyCode: 75,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
}

function linkButton(root: HTMLElement): HTMLButtonElement {
  const found = [
    ...root.querySelectorAll<HTMLButtonElement>('.rte-toolbar__button'),
  ].find((b) => b.getAttribute('aria-label') === 'Link');
  if (!found) throw new Error('botão Link ausente');
  return found;
}

function pending(editor: Editor): Element | null {
  return editor.view.dom.querySelector('.rte-pending-selection');
}

async function render(s: Setup, state: DeferBlockState): Promise<void> {
  await s.block.render(state);
  await settle(s.fixture);
}

describe('@defer dos diálogos (R12 unitário, G7)', () => {
  it('antes da carga: um bloco, nenhum rte-dialogs; o pedido abre na chegada com foco na URL', async () => {
    const s = await setup();
    expect(s.root.querySelector('rte-dialogs')).toBeNull();
    expect(s.cmp.openDialog('link')).toBe(true);
    await settle(s.fixture);
    expect(s.root.querySelector('dialog')).toBeNull();
    expect(pending(s.editor)?.textContent).toBe('abcd');

    await render(s, DeferBlockState.Complete);
    const dialog = s.root.querySelector<HTMLDialogElement>('.rte-dialog');
    expect(dialog?.open).toBe(true);
    const url = dialogField(dialog as HTMLDialogElement, 'Address (URL)');
    expect(document.activeElement).toBe(url);
  });

  it('Mod-K antes da carga: consumido e aberto depois dela', async () => {
    const s = await setup();
    const key = modK();
    s.editor.view.dom.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    await settle(s.fixture);
    expect(s.root.querySelector('dialog')).toBeNull();

    await render(s, DeferBlockState.Complete);
    expect(s.root.querySelector('.rte-dialog[open]')).not.toBeNull();
  });

  it('ativação dupla antes da carga: o segundo pedido → false, um só diálogo (Review Focus 4)', async () => {
    const s = await setup();
    const first = modK();
    s.editor.view.dom.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    const second = modK();
    s.editor.view.dom.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
    expect(s.cmp.openDialog('link')).toBe(false);

    await render(s, DeferBlockState.Complete);
    expect(s.root.querySelectorAll('.rte-dialog[open]')).toHaveLength(1);
  });

  it('pedido cancelado por disabled antes da carga: nada abre depois e sem decoração (Review Focus 1)', async () => {
    const s = await setup();
    expect(s.cmp.openDialog('link')).toBe(true);
    await settle(s.fixture);
    expect(pending(s.editor)).not.toBeNull();
    s.host.disabled.set(true);
    await settle(s.fixture);

    await render(s, DeferBlockState.Complete);
    expect(s.root.querySelector('rte-dialogs')).not.toBeNull();
    expect(s.root.querySelector('.rte-dialog[open]')).toBeNull();
    expect(pending(s.editor)).toBeNull();
  });

  it('prefetch (bloco carregado sem pedido): nenhum diálogo aberto', async () => {
    const s = await setup();
    await render(s, DeferBlockState.Complete);
    expect(s.root.querySelector('rte-dialogs')).not.toBeNull();
    expect(s.root.querySelector('.rte-dialog[open]')).toBeNull();
    expect(pending(s.editor)).toBeNull();
  });

  it('@error: descarta o pedido, devolve o foco ao botão, avisa e é terminal (pré-voo 5)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = await setup();
    const origin = linkButton(s.root);
    origin.focus();
    origin.click();
    await settle(s.fixture);
    expect(pending(s.editor)).not.toBeNull();

    await render(s, DeferBlockState.Error);
    expect(document.activeElement).toBe(origin);
    expect(pending(s.editor)).toBeNull();
    expect(s.root.querySelector('dialog')).toBeNull();
    expect(warn.mock.calls.filter(([m]) => m === DEFER_FAILED)).toHaveLength(1);

    expect(s.cmp.openDialog('link')).toBe(false);
    const key = modK();
    s.editor.view.dom.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    await settle(s.fixture);
    expect(pending(s.editor)).toBeNull();
  });
});
