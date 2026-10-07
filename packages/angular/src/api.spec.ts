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
import { getRteHtml } from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chooseOption,
  dialogField,
  escapeDialog,
  installDialogShim,
  typeInto,
  waitForDialog,
} from './testing-support/dialog';
import { selectText } from './testing-support/editors';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';
import type { RteDialogController } from './dialogs/controller';

// Spec 05b2a, Tarefas 4 e 6: `openDialog` (R17).

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
  value = DOC;
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

describe('openDialog com toolbar: false (R17)', () => {
  function title(dialog: HTMLElement): string | undefined {
    return dialog.querySelector('.rte-dialog__title')?.textContent?.trim();
  }

  async function submit(
    fixture: ComponentFixture<Host>,
    dialog: HTMLElement,
  ): Promise<void> {
    dialog.querySelector<HTMLButtonElement>('.rte-dialog__apply')?.click();
    await settle(fixture);
  }

  it('link: abre Insert link e aplica', async () => {
    const { fixture, cmp, editor } = await setup((h) => h.toolbar.set(false));
    selectText(editor, 'texto');
    expect(cmp.openDialog('link')).toBe(true);
    const dialog = await waitForDialog(fixture);
    expect(title(dialog)).toBe('Insert link');
    typeInto(dialogField(dialog, 'Address (URL)'), 'site.com');
    await submit(fixture, dialog);
    expect(getRteHtml(editor)).toContain(
      '<p><a href="https://site.com/">texto</a></p>',
    );
  });

  it('lang: abre Mark language e aplica', async () => {
    const { fixture, cmp, editor } = await setup((h) => h.toolbar.set(false));
    selectText(editor, 'texto');
    expect(cmp.openDialog('lang')).toBe(true);
    const dialog = await waitForDialog(fixture);
    expect(title(dialog)).toBe('Mark language');
    chooseOption(
      dialogField(dialog, 'Language') as unknown as HTMLSelectElement,
      'es',
    );
    await settle(fixture);
    await submit(fixture, dialog);
    expect(getRteHtml(editor)).toContain('<p><span lang="es">texto</span></p>');
  });

  it('table: abre Insert table e aplica', async () => {
    const { fixture, cmp, editor } = await setup((h) => h.toolbar.set(false));
    selectText(editor, 'texto', 5);
    expect(cmp.openDialog('table')).toBe(true);
    const dialog = await waitForDialog(fixture);
    expect(title(dialog)).toBe('Insert table');
    await submit(fixture, dialog);
    expect(getRteHtml(editor)).toContain('<table>');
  });

  it('Mod-k no editável abre o diálogo de link', async () => {
    const { fixture, editor } = await setup((h) => h.toolbar.set(false));
    selectText(editor, 'texto');
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      keyCode: 75,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    editor.view.dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const dialog = await waitForDialog(fixture);
    expect(title(dialog)).toBe('Insert link');
  });
});

describe('openDialog de mídia (V2, V9)', () => {
  const MEDIA =
    '<p>texto</p>' +
    '<figure class="rt-figure rt-figure--center"><img src="/a.png" alt="A"></figure>' +
    '<figure class="rt-figure rt-figure--video"><video src="/v.webm" controls=""></video></figure>' +
    '<figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="YouTube"></iframe></figure>';

  function controller(cmp: RteEditor): RteDialogController {
    return (cmp as unknown as { dialogs: RteDialogController }).dialogs;
  }

  function selectNode(editor: Editor, typeName: string): number {
    let found = -1;
    editor.state.doc.descendants((node, pos) => {
      if (found >= 0) return false;
      if (node.type.name === typeName) found = pos;
      return found < 0;
    });
    editor.view.dispatch(
      editor.state.tr.setSelection(
        NodeSelection.create(editor.state.doc, found),
      ),
    );
    return found;
  }

  async function setupMedia(init: (host: Host) => void = () => undefined) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.value = MEDIA;
    init(fixture.componentInstance);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const cmp = fixture.componentInstance.cmp();
    return { fixture, cmp, editor: cmp.editor() as Editor };
  }

  it.each(['image', 'video', 'embed'] as const)(
    '%s: true no editável com o cursor no texto → insert',
    async (kind) => {
      const { cmp, editor } = await setupMedia();
      selectText(editor, 'texto', 2);
      const from = editor.state.selection.from;
      expect(cmp.openDialog(kind)).toBe(true);
      const req = controller(cmp).request();
      expect(req?.kind).toBe(kind);
      expect(req?.mode).toBe('insert');
      expect(req?.range).toEqual({ from, to: from });
    },
  );

  it.each([
    ['image', 'rtImage'],
    ['video', 'rtVideo'],
    ['embed', 'rtEmbed'],
  ] as const)(
    '%s: com o próprio nó selecionado → edit sobre o nó',
    async (kind, typeName) => {
      const { cmp, editor } = await setupMedia();
      const pos = selectNode(editor, typeName);
      expect(cmp.openDialog(kind)).toBe(true);
      const req = controller(cmp).request();
      expect(req?.kind).toBe(kind);
      expect(req?.mode).toBe('edit');
      expect(req?.range).toEqual({ from: pos, to: pos + 1 });
    },
  );

  it.each([
    ['readonly', (h: Host) => h.readonly.set(true)],
    ['disabled', (h: Host) => h.disabled.set(true)],
  ] as const)('false com %s', async (_name, init) => {
    const { cmp, editor } = await setupMedia(init);
    selectText(editor, 'texto', 2);
    for (const kind of ['image', 'video', 'embed'] as const)
      expect(cmp.openDialog(kind)).toBe(false);
    expect(controller(cmp).request()).toBeNull();
  });

  it('false com outro diálogo aberto', async () => {
    const { fixture, cmp, editor } = await setupMedia();
    selectText(editor, 'texto');
    expect(cmp.openDialog('link')).toBe(true);
    await waitForDialog(fixture);
    for (const kind of ['image', 'video', 'embed'] as const)
      expect(cmp.openDialog(kind)).toBe(false);
    expect(controller(cmp).request()?.kind).toBe('link');
  });

  it('false com media: false (image, video); embed segue', async () => {
    const { cmp, editor } = await setupMedia((h) =>
      h.options.set({ features: { media: false } }),
    );
    selectText(editor, 'texto', 2);
    expect(cmp.openDialog('image')).toBe(false);
    expect(cmp.openDialog('video')).toBe(false);
    expect(cmp.openDialog('embed')).toBe(true);
  });

  it('false com embedProviders: [] (embed); image segue', async () => {
    const { cmp, editor } = await setupMedia((h) =>
      h.options.set({ embedProviders: [] }),
    );
    selectText(editor, 'texto', 2);
    expect(cmp.openDialog('embed')).toBe(false);
    expect(cmp.openDialog('image')).toBe(true);
  });

  it('a barra full ganha image/video/embed; sem provedores, sem embed', async () => {
    const { fixture } = await setupMedia((h) =>
      h.options.set({ embedProviders: [] }),
    );
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[aria-label="Insert image"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Insert video"]')).not.toBeNull();
    expect(
      el.querySelector('[aria-label="Insert embedded content"]'),
    ).toBeNull();
  });
});
