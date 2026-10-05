import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import {
  RteEditor,
  type RteDialogKind,
  type RteEditorConfig,
  type RteToolbarConfig,
} from '@cds/rte-angular';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  escapeDialog,
  installDialogShim,
  waitForDialog,
} from './testing-support/dialog';
import { selectText } from './testing-support/editors';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';

// Spec 05b2a, Tarefa 4: `openDialog` (R17). Os demais tipos com `toolbar:
// false` entram na Tarefa 6.

const DOC =
  '<p>texto</p><figure class="rt-pullquote"><blockquote><p>Uma frase.</p></blockquote></figure>';

@Component({
  selector: 'rte-test-api-host',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value"
    [toolbar]="toolbar()"
    [options]="options()"
    [disabled]="disabled()"
    [readonly]="readonly()"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = DOC;
  readonly toolbar = signal<RteToolbarConfig | undefined>('full');
  readonly options = signal<RteEditorConfig | undefined>(undefined);
  readonly disabled = signal(false);
  readonly readonly = signal(false);
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

async function setup(init: (host: Host) => void = () => undefined): Promise<{
  fixture: ComponentFixture<Host>;
  cmp: RteEditor;
  editor: Editor;
}> {
  const fixture = TestBed.createComponent(Host);
  init(fixture.componentInstance);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const cmp = fixture.componentInstance.cmp();
  return { fixture, cmp, editor: cmp.editor() as Editor };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe('openDialog (R17)', () => {
  it('false antes da criação do editor', () => {
    const fixture = TestBed.createComponent(RteEditor);
    expect(fixture.componentInstance.openDialog('link')).toBe(false);
  });

  it.each([
    ['disabled', (h: Host) => h.disabled.set(true)],
    ['readonly', (h: Host) => h.readonly.set(true)],
  ] as const)('false com %s', async (_name, init) => {
    const { cmp, editor } = await setup(init);
    selectText(editor, 'texto');
    expect(cmp.openDialog('link')).toBe(false);
    expect(cmp.openDialog('lang')).toBe(false);
  });

  it('false com newsBlocks: false (lang, quoteAuthor)', async () => {
    const { cmp, editor } = await setup((h) =>
      h.options.set({ features: { newsBlocks: false } }),
    );
    selectText(editor, 'texto');
    expect(cmp.openDialog('lang')).toBe(false);
    expect(cmp.openDialog('quoteAuthor')).toBe(false);
  });

  it('false com tables: false (table)', async () => {
    const { cmp } = await setup((h) =>
      h.options.set({ features: { tables: false } }),
    );
    expect(cmp.openDialog('table')).toBe(false);
  });

  it('false quando inaplicável (lang sem seleção, quoteAuthor fora da citação)', async () => {
    const { cmp, editor } = await setup();
    selectText(editor, 'texto', 2);
    expect(cmp.openDialog('lang')).toBe(false);
    expect(cmp.openDialog('quoteAuthor')).toBe(false);
  });

  it('false com outro diálogo aberto', async () => {
    const { fixture, cmp, editor } = await setup();
    selectText(editor, 'texto');
    expect(cmp.openDialog('link')).toBe(true);
    await waitForDialog(fixture);
    expect(cmp.openDialog('lang')).toBe(false);
  });

  it.each<[RteDialogKind, (editor: Editor) => void]>([
    ['link', (e) => selectText(e, 'texto')],
    ['lang', (e) => selectText(e, 'texto')],
    ['quoteAuthor', (e) => selectText(e, 'Uma frase.', 2)],
    ['table', (e) => selectText(e, 'texto', 2)],
  ])('true quando aplicável: %s', async (kind, select) => {
    const { fixture, cmp, editor } = await setup();
    select(editor);
    expect(cmp.openDialog(kind)).toBe(true);
    const dialog = await waitForDialog(fixture);
    escapeDialog(dialog);
    await settle(fixture);
    expect(dialog.open).toBe(false);
  });

  it('toolbar: false — quoteAuthor abre e cancelar devolve o foco ao editável', async () => {
    const { fixture, cmp, editor } = await setup((h) => h.toolbar.set(false));
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.rte-toolbar'),
    ).toBeNull();
    selectText(editor, 'Uma frase.', 2);
    expect(cmp.openDialog('quoteAuthor')).toBe(true);
    const dialog = await waitForDialog(fixture);
    const cancel = [
      ...dialog.querySelectorAll<HTMLButtonElement>(
        '.rte-dialog__actions button',
      ),
    ].find((b) => b.textContent?.trim() === 'Cancel');
    cancel?.click();
    await nextFrame();
    await settle(fixture);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(editor.view.dom);
  });
});
