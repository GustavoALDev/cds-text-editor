import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { form, FormField } from '@angular/forms/signals';
import { getRteHtml } from '@cds/rte-core/extensions';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor, type RteToolbarConfig } from '@cds/rte-angular';
import type { Editor } from '@tiptap/core';
import { EditorState, NodeSelection } from '@tiptap/pm/state';
import { documentDialogBusy } from './dialogs/controller';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import {
  escapeDialog,
  installDialogShim,
  waitForDialog,
} from './testing-support/dialog';
import {
  createTestEditor,
  destroyTestEditors,
  selectText,
} from './testing-support/editors';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';

// Spec 05b2a, Tarefa 4: base dos diálogos (R3) e foco/D11 (R4).

const QUOTE =
  '<p>antes</p><figure class="rt-pullquote"><blockquote><p>Uma frase marcante.</p></blockquote>' +
  '<figcaption><cite>Fulana de Tal</cite>, editora</figcaption></figure><p>depois</p>';

@Component({
  selector: 'rte-test-dialog-host',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    (valueChange)="changes = changes + 1"
    [toolbar]="toolbar()"
    [disabled]="disabled()"
    [readonly]="readonly()"
    [hidden]="hidden()"
    (editorBlur)="blurs = blurs + 1"
    (editorFocus)="focuses = focuses + 1"
    (touch)="touches = touches + 1"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal(QUOTE);
  readonly toolbar = signal<RteToolbarConfig | undefined>('full');
  readonly disabled = signal(false);
  readonly readonly = signal(false);
  readonly hidden = signal(false);
  changes = 0;
  blurs = 0;
  focuses = 0;
  touches = 0;
  readonly cmp = viewChild.required(RteEditor);
}

@Component({
  selector: 'rte-test-dialog-two',
  imports: [RteEditor],
  template: `<rte-editor class="a" [value]="value" toolbar="full" /><rte-editor
      class="b"
      [value]="value"
      toolbar="full"
    />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TwoHosts {
  readonly value = QUOTE;
  readonly cmps = viewChildren(RteEditor);
}

@Component({
  selector: 'rte-test-dialog-form',
  imports: [RteEditor, FormField],
  template: `<rte-editor [formField]="f.body" toolbar="full" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class FormHost {
  readonly f = form(signal({ body: QUOTE }));
  readonly cmp = viewChild.required(RteEditor);
}

let restoreDialog: () => void;
let restorePopover: () => void;
let error: MockInstance<typeof console.error>;
beforeEach(() => {
  restoreDialog = installDialogShim();
  restorePopover = installPopoverShim();
  error = vi.spyOn(console, 'error');
});
afterEach(() => {
  TestBed.resetTestingModule();
  restorePopover();
  restoreDialog();
  vi.restoreAllMocks();
  document.body
    .querySelectorAll('[data-test-outside]')
    .forEach((el) => el.remove());
});

async function setup(init: (host: Host) => void = () => undefined): Promise<{
  fixture: ComponentFixture<Host>;
  host: Host;
  el: HTMLElement;
  cmp: RteEditor;
  editor: Editor;
}> {
  const fixture = TestBed.createComponent(Host);
  init(fixture.componentInstance);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const host = fixture.componentInstance;
  const cmp = host.cmp();
  return {
    fixture,
    host,
    el: (fixture.nativeElement as HTMLElement).querySelector(
      'rte-editor',
    ) as HTMLElement,
    cmp,
    editor: cmp.editor() as Editor,
  };
}

function button(el: ParentNode, label: string): HTMLButtonElement {
  const found = [
    ...el.querySelectorAll<HTMLButtonElement>(
      '.rte-toolbar .rte-toolbar__button',
    ),
  ].find((b) => b.getAttribute('aria-label') === label);
  if (!found) throw new Error(`botão ${label} ausente`);
  return found;
}

function field(dialog: HTMLElement, label: string): HTMLInputElement {
  const found = [
    ...dialog.querySelectorAll<HTMLLabelElement>('.rte-dialog__label'),
  ].find((l) => l.textContent?.trim() === label);
  const input = found?.htmlFor
    ? dialog.ownerDocument.getElementById(found.htmlFor)
    : null;
  if (!input) throw new Error(`campo ${label} ausente`);
  return input as HTMLInputElement;
}

function action(dialog: HTMLElement, label: string): HTMLButtonElement {
  const found = [
    ...dialog.querySelectorAll<HTMLButtonElement>(
      '.rte-dialog__actions button',
    ),
  ].find((b) => b.textContent?.trim() === label);
  if (!found) throw new Error(`ação ${label} ausente`);
  return found;
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** O `focus()` do Tiptap foca o editável no quadro seguinte. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function inQuote(editor: Editor): void {
  selectText(editor, 'marcante', 3);
}

/** Conta as transações que mudam o documento. */
function docChanges(editor: Editor): { count: number } {
  const seen = { count: 0 };
  editor.on('transaction', ({ transaction }) => {
    if (transaction.docChanged) seen.count++;
  });
  return seen;
}

/** Foca o editável e zera os contadores do host (a entrada emite 1 foco). */
async function focusEditor(
  fixture: ComponentFixture<Host>,
  editor: Editor,
): Promise<void> {
  editor.view.dom.focus();
  await settle(fixture);
  const host = fixture.componentInstance;
  host.blurs = host.focuses = host.touches = 0;
}

/** Abre o diálogo da citação pelo botão da barra (com foco nele). */
async function openByButton(
  fixture: ComponentFixture<Host>,
  el: HTMLElement,
): Promise<{ dialog: HTMLDialogElement; origin: HTMLButtonElement }> {
  const origin = button(el, 'Quote author');
  origin.focus();
  origin.click();
  return { dialog: await waitForDialog(fixture), origin };
}

describe('base do diálogo (R3)', () => {
  it('abre como modal dentro do host, título, foco no Autor e ações na ordem', async () => {
    const { fixture, el, cmp, editor } = await setup();
    inQuote(editor);
    expect(cmp.openDialog('quoteAuthor')).toBe(true);
    const dialog = await waitForDialog(fixture);

    expect(dialog.classList.contains('rte-dialog')).toBe(true);
    expect(el.contains(dialog)).toBe(true);
    expect(el.querySelector('.rte-editor__frame')?.contains(dialog)).toBe(
      false,
    );
    const titleId = dialog.getAttribute('aria-labelledby');
    const title = titleId ? document.getElementById(titleId) : null;
    expect(title?.tagName).toBe('H2');
    expect(title?.classList.contains('rte-dialog__title')).toBe(true);
    expect(title?.textContent?.trim()).toBe('Quote author');

    const author = field(dialog, 'Author');
    expect(document.activeElement).toBe(author);
    expect(author.value).toBe('Fulana de Tal');
    expect([author.selectionStart, author.selectionEnd]).toEqual([
      0,
      'Fulana de Tal'.length,
    ]);

    const actions = [
      ...dialog.querySelectorAll<HTMLButtonElement>(
        '.rte-dialog__actions button',
      ),
    ];
    expect(actions.map((b) => b.textContent?.trim())).toEqual([
      'Cancel',
      'Apply',
    ]);
    expect(actions.map((b) => b.type)).toEqual(['button', 'submit']);
    expect(actions[1]?.classList.contains('rte-dialog__apply')).toBe(true);
    expect(dialog.querySelector('form.rte-dialog__form')).not.toBeNull();
  });

  it('fecha os menus da barra ao abrir', async () => {
    const { fixture, el, cmp, editor } = await setup();
    inQuote(editor);
    const color = button(el, 'Text color');
    color.click();
    await settle(fixture);
    expect(color.getAttribute('aria-expanded')).toBe('true');
    expect(cmp.openDialog('quoteAuthor')).toBe(true);
    await waitForDialog(fixture);
    expect(color.getAttribute('aria-expanded')).toBe('false');
  });

  it('um diálogo por vez: segundo openDialog → false', async () => {
    const { fixture, cmp, editor } = await setup();
    inQuote(editor);
    expect(cmp.openDialog('quoteAuthor')).toBe(true);
    expect(cmp.openDialog('quoteAuthor')).toBe(false);
    await waitForDialog(fixture);
    expect(cmp.openDialog('quoteAuthor')).toBe(false);
  });

  it('duas instâncias: com o modal de A aberto, B.openDialog → false (Review Focus 2)', async () => {
    const fixture = TestBed.createComponent(TwoHosts);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const [a, b] = fixture.componentInstance.cmps();
    if (!a || !b) throw new Error('instâncias ausentes');
    inQuote(a.editor() as Editor);
    expect(a.openDialog('quoteAuthor')).toBe(true);
    await waitForDialog(fixture);
    const editorB = b.editor() as Editor;
    selectText(editorB, 'antes');
    expect(b.openDialog('link')).toBe(false);
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.rte-dialog[open]',
      ),
    ).toHaveLength(1);
  });

  it('duas instâncias antes do chunk: A e B pedem no mesmo tique → B false (G6)', async () => {
    const fixture = TestBed.createComponent(TwoHosts);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const [a, b] = fixture.componentInstance.cmps();
    if (!a || !b) throw new Error('instâncias ausentes');
    inQuote(a.editor() as Editor);
    inQuote(b.editor() as Editor);
    expect(a.openDialog('quoteAuthor')).toBe(true);
    expect(b.openDialog('quoteAuthor')).toBe(false);
    const dialog = await waitForDialog(fixture);
    action(dialog, 'Cancel').click();
    await settle(fixture);
    // encerrado o pedido de A, B pode abrir
    expect(b.openDialog('quoteAuthor')).toBe(true);
    await waitForDialog(fixture);
  });

  it('documentDialogBusy: reativo, por documento, igual nas duas instâncias (pré-voo 3)', async () => {
    const fixture = TestBed.createComponent(TwoHosts);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const [a, b] = fixture.componentInstance.cmps();
    if (!a || !b) throw new Error('instâncias ausentes');
    const busy = documentDialogBusy(document);
    expect(documentDialogBusy(document)).toBe(busy);
    // lido por um `computed`: só muda se o signal notificar
    const seen = computed(() => busy());
    expect(seen()).toBe(false);
    expect(busy()).toBe(false);
    inQuote(a.editor() as Editor);
    expect(a.openDialog('quoteAuthor')).toBe(true);
    expect(busy()).toBe(true);
    const dialog = await waitForDialog(fixture);
    expect(busy()).toBe(true);
    expect(seen()).toBe(true);
    action(dialog, 'Cancel').click();
    await settle(fixture);
    expect(busy()).toBe(false);
    expect(seen()).toBe(false);
    inQuote(b.editor() as Editor);
    expect(b.openDialog('quoteAuthor')).toBe(true);
    expect(busy()).toBe(true);
    expect(documentDialogBusy(document)()).toBe(true);
    escapeDialog(await waitForDialog(fixture));
    await settle(fixture);
    expect(busy()).toBe(false);
  });

  it('hidden: openDialog → false e nenhum modal', async () => {
    const { fixture, cmp, editor } = await setup((h) => h.hidden.set(true));
    inQuote(editor);
    expect(cmp.openDialog('quoteAuthor')).toBe(false);
    await settle(fixture);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.rte-dialog[open]'),
    ).toBeNull();
  });

  it('close atrasado do diálogo anterior não cancela o novo', async () => {
    const { fixture, cmp, editor } = await setup();
    inQuote(editor);
    cmp.openDialog('quoteAuthor');
    const dialog = await waitForDialog(fixture);
    action(dialog, 'Cancel').click();
    await settle(fixture);
    inQuote(editor);
    expect(cmp.openDialog('quoteAuthor')).toBe(true);
    await waitForDialog(fixture);
    // no navegador o `close` do fechamento anterior chega numa tarefa
    dialog.dispatchEvent(new Event('close'));
    await settle(fixture);
    expect(dialog.open).toBe(true);
    expect(cmp.openDialog('quoteAuthor')).toBe(false);
    type(field(dialog, 'Author'), 'Ana');
    action(dialog, 'Apply').click();
    await settle(fixture);
    expect(getRteHtml(editor)).toContain('<cite>Ana</cite>');
  });

  it.each(['cancel', 'escape'] as const)(
    '%s fecha sem transação de documento',
    async (how) => {
      const { fixture, cmp, editor } = await setup();
      inQuote(editor);
      const before = getRteHtml(editor);
      const changes = docChanges(editor);
      cmp.openDialog('quoteAuthor');
      const dialog = await waitForDialog(fixture);
      type(field(dialog, 'Author'), 'Ana');
      if (how === 'cancel') action(dialog, 'Cancel').click();
      else escapeDialog(dialog);
      await settle(fixture);
      expect(dialog.open).toBe(false);
      expect(getRteHtml(editor)).toBe(before);
      expect(changes.count).toBe(0);
    },
  );

  describe('G5: fecha como cancelamento sem mudar o documento', () => {
    it.each([
      ['carga externa', (h: Host) => h.value.set('<p>outro</p>')],
      ['disabled', (h: Host) => h.disabled.set(true)],
      ['readonly', (h: Host) => h.readonly.set(true)],
      ['hidden', (h: Host) => h.hidden.set(true)],
      ['toolbar false', (h: Host) => h.toolbar.set(false)],
    ] as const)('%s', async (name, change) => {
      const { fixture, host, el, editor } = await setup();
      await focusEditor(fixture, editor);
      inQuote(editor);
      const { dialog } = await openByButton(fixture, el);
      type(field(dialog, 'Author'), 'Ana');
      const before = getRteHtml(editor);
      change(host);
      await settle(fixture);
      expect(dialog.open).toBe(false);
      expect(getRteHtml(editor)).toBe(
        name === 'carga externa' ? '<p>outro</p>' : before,
      );
      expect(getRteHtml(editor)).not.toContain('Ana');
      expect(error).not.toHaveBeenCalled();
    });

    it('destroy', async () => {
      const { fixture, el, editor } = await setup();
      inQuote(editor);
      const { dialog } = await openByButton(fixture, el);
      expect(() => fixture.destroy()).not.toThrow();
      expect(dialog.open).toBe(false);
      expect(error).not.toHaveBeenCalled();
    });

    it('Aplicar com outro doc no estado não roda o comando e fecha', async () => {
      const { fixture, cmp, editor } = await setup();
      inQuote(editor);
      cmp.openDialog('quoteAuthor');
      const dialog = await waitForDialog(fixture);
      type(field(dialog, 'Author'), 'Ana');
      const { state, view } = editor;
      view.updateState(
        EditorState.create({
          doc: state.schema.nodeFromJSON(state.doc.toJSON()),
          plugins: state.plugins,
        }),
      );
      const swapped = getRteHtml(editor);
      const update = vi.spyOn(
        editor.extensionManager.commands,
        'updatePullquote',
      );
      action(dialog, 'Apply').click();
      await settle(fixture);
      expect(update).not.toHaveBeenCalled();
      expect(getRteHtml(editor)).toBe(swapped);
      expect(getRteHtml(editor)).not.toContain('Ana');
      expect(dialog.open).toBe(false);
    });
  });
});

describe('foco e D11 (R4)', () => {
  it('abrir pelo botão, aplicar e cancelar: 0 editorBlur/editorFocus/touch', async () => {
    const { fixture, host, el, editor } = await setup();
    await focusEditor(fixture, editor);
    inQuote(editor);
    let { dialog } = await openByButton(fixture, el);
    action(dialog, 'Apply').click();
    await nextFrame();
    await settle(fixture);
    ({ dialog } = await openByButton(fixture, el));
    action(dialog, 'Cancel').click();
    await nextFrame();
    await settle(fixture);
    expect([host.blurs, host.focuses, host.touches]).toEqual([0, 0, 0]);
  });

  it('o touched do [formField] não muda', async () => {
    const fixture = TestBed.createComponent(FormHost);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const editor = fixture.componentInstance.cmp().editor() as Editor;
    editor.view.dom.focus();
    inQuote(editor);
    await settle(fixture);
    const origin = button(el, 'Quote author');
    origin.focus();
    origin.click();
    let dialog = await waitForDialog(fixture);
    action(dialog, 'Apply').click();
    await nextFrame();
    await settle(fixture);
    origin.focus();
    origin.click();
    dialog = await waitForDialog(fixture);
    action(dialog, 'Cancel').click();
    await nextFrame();
    await settle(fixture);
    expect(fixture.componentInstance.f.body().touched()).toBe(false);
  });

  it('aplicar devolve o foco ao editável e o texto digitado cai no trecho', async () => {
    const { fixture, el, editor } = await setup();
    await focusEditor(fixture, editor);
    inQuote(editor);
    const { dialog } = await openByButton(fixture, el);
    type(field(dialog, 'Author'), 'Ana');
    action(dialog, 'Apply').click();
    await nextFrame();
    await settle(fixture);
    expect(document.activeElement).toBe(editor.view.dom);
    expect(editor.view.dom.classList.contains('ProseMirror')).toBe(true);
    editor.commands.insertContent('x');
    expect(getRteHtml(editor)).toContain('marxcante');
    expect(getRteHtml(editor)).toContain('<cite>Ana</cite>');
  });

  it('cancelar devolve o foco ao botão de origem', async () => {
    const { fixture, el, editor } = await setup();
    await focusEditor(fixture, editor);
    inQuote(editor);
    const { dialog, origin } = await openByButton(fixture, el);
    action(dialog, 'Cancel').click();
    await nextFrame();
    await settle(fixture);
    expect(document.activeElement).toBe(origin);
  });

  it('cancelar depois de openDialog com foco no editável → editável', async () => {
    const { fixture, cmp, editor } = await setup();
    await focusEditor(fixture, editor);
    inQuote(editor);
    cmp.openDialog('quoteAuthor');
    const dialog = await waitForDialog(fixture);
    expect(document.activeElement).not.toBe(editor.view.dom);
    action(dialog, 'Cancel').click();
    await nextFrame();
    await settle(fixture);
    expect(document.activeElement).toBe(editor.view.dom);
  });

  it('origem removida (toolbar minimal) → editável', async () => {
    const { fixture, host, el, editor } = await setup();
    await focusEditor(fixture, editor);
    inQuote(editor);
    const { dialog } = await openByButton(fixture, el);
    host.toolbar.set('minimal');
    await settle(fixture);
    await nextFrame();
    await settle(fixture);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(editor.view.dom);
  });

  it('disabled com o diálogo aberto: nenhum foco movido e touch 1×', async () => {
    const { fixture, host, el, editor } = await setup();
    await focusEditor(fixture, editor);
    inQuote(editor);
    const { dialog, origin } = await openByButton(fixture, el);
    host.disabled.set(true);
    await settle(fixture);
    await nextFrame();
    await settle(fixture);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).not.toBe(origin);
    expect(document.activeElement).not.toBe(editor.view.dom);
    expect(host.touches).toBe(1);
    expect(host.blurs).toBe(1);
  });

  it('foco sai do host com o diálogo fechado → editorBlur 1×', async () => {
    const { fixture, host, el, editor } = await setup();
    await focusEditor(fixture, editor);
    inQuote(editor);
    const { dialog } = await openByButton(fixture, el);
    action(dialog, 'Cancel').click();
    await settle(fixture);
    const outside = document.createElement('button');
    outside.setAttribute('data-test-outside', '');
    document.body.append(outside);
    outside.focus();
    await settle(fixture);
    expect(host.blurs).toBe(1);
    expect(host.touches).toBe(1);
  });
});

// Spec 05c1, Tarefa 6: R7 — a base dos diálogos (G2–G6) nos três diálogos
// de mídia.

const MEDIA_IMAGE =
  '<figure class="rt-figure rt-figure--center"><img src="/a.png" alt="A" loading="lazy" decoding="async"></figure>';
const MEDIA_VIDEO =
  '<figure class="rt-figure rt-figure--video"><video src="/v.webm" controls="" preload="metadata" playsinline=""></video></figure>';
const VIMEO = 'https://vimeo.com/76979871';

/** Documento com as três mídias (o *embed* montado pelo core). */
function mediaDoc(): string {
  const control = createTestEditor('<p></p>');
  expect(control.commands.setEmbed(VIMEO, { caption: 'Old' })).toBe(true);
  const embed = getRteHtml(control);
  destroyTestEditors();
  return `<p>ab</p>${MEDIA_IMAGE}${MEDIA_VIDEO}${embed}<p>cd</p>`;
}

interface MediaCase {
  kind: 'image' | 'video' | 'embed';
  node: string;
  insert: string;
  edit: string;
  /** Primeiro campo nos modos inserir e editar (G4). */
  first: string;
  editFirst: string;
  command: string;
  fill(dialog: HTMLElement): void;
}

const MEDIA: readonly MediaCase[] = [
  {
    kind: 'image',
    node: 'rtImage',
    insert: 'Insert image',
    edit: 'Edit image',
    first: 'Image address (URL)',
    editFirst: 'Image address (URL)',
    command: 'setImage',
    fill: (d) => {
      type(field(d, 'Image address (URL)'), '/n.png');
      type(field(d, 'Alternative text'), 'N');
    },
  },
  {
    kind: 'video',
    node: 'rtVideo',
    insert: 'Insert video',
    edit: 'Edit video',
    first: 'Video address (URL)',
    editFirst: 'Video address (URL)',
    command: 'setVideo',
    fill: (d) => type(field(d, 'Video address (URL)'), '/n.webm'),
  },
  {
    kind: 'embed',
    node: 'rtEmbed',
    insert: 'Insert embedded content',
    edit: 'Edit embedded content',
    first: 'Page address (URL)',
    editFirst: 'Caption',
    command: 'setEmbed',
    fill: (d) => type(field(d, 'Page address (URL)'), VIMEO),
  },
];

function selectMedia(editor: Editor, typeName: string): void {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === typeName) found = pos;
    return found < 0;
  });
  if (found < 0) throw new Error(`${typeName} ausente`);
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, found)),
  );
}

/** `Escape` com `key` e `keyCode` (o `captureKeyDown` do ProseMirror lê o código). */
function pressEscape(dialog: HTMLDialogElement): void {
  const target = (document.activeElement as HTMLElement | null) ?? dialog;
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      keyCode: 27,
      bubbles: true,
      cancelable: true,
    }),
  );
  escapeDialog(dialog);
}

@Component({
  selector: 'rte-test-media-form',
  imports: [RteEditor, FormField],
  template: `<rte-editor [formField]="f.body" toolbar="full" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class MediaFormHost {
  readonly model = signal({ body: '<p></p>' });
  readonly f = form(this.model);
  readonly cmp = viewChild.required(RteEditor);
}

describe.each(MEDIA)('R7: diálogo $kind (05c1)', (m) => {
  async function mediaSetup(): ReturnType<typeof setup> {
    const doc = mediaDoc();
    return setup((h) => h.value.set(doc));
  }

  it('inserir: showModal() e foco no primeiro campo', async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    const { fixture, cmp, editor } = await mediaSetup();
    selectText(editor, 'ab', 1);
    expect(cmp.openDialog(m.kind)).toBe(true);
    const dialog = await waitForDialog(fixture);
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(field(dialog, m.first));
  });

  it('editar: foco no primeiro campo do modo', async () => {
    const { fixture, cmp, editor } = await mediaSetup();
    selectMedia(editor, m.node);
    expect(cmp.openDialog(m.kind)).toBe(true);
    const dialog = await waitForDialog(fixture);
    expect(dialog.querySelector('.rte-dialog__remove')).not.toBeNull();
    expect(document.activeElement).toBe(field(dialog, m.editFirst));
  });

  it.each(['cancel', 'escape'] as const)(
    '%s fecha sem transação de documento',
    async (how) => {
      const { fixture, cmp, editor } = await mediaSetup();
      selectText(editor, 'ab', 1);
      const before = getRteHtml(editor);
      const changes = docChanges(editor);
      cmp.openDialog(m.kind);
      const dialog = await waitForDialog(fixture);
      m.fill(dialog);
      if (how === 'cancel') action(dialog, 'Cancel').click();
      else pressEscape(dialog);
      await settle(fixture);
      expect(dialog.open).toBe(false);
      expect(getRteHtml(editor)).toBe(before);
      expect(changes.count).toBe(0);
    },
  );

  it('um por vez: segundo pedido (do mesmo tipo ou de outro) → false', async () => {
    const { fixture, cmp, editor } = await mediaSetup();
    selectText(editor, 'ab', 1);
    expect(cmp.openDialog(m.kind)).toBe(true);
    expect(cmp.openDialog(m.kind)).toBe(false);
    await waitForDialog(fixture);
    expect(cmp.openDialog(m.kind)).toBe(false);
    expect(cmp.openDialog('link')).toBe(false);
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.rte-dialog[open]',
      ),
    ).toHaveLength(1);
  });

  describe('G5: fecha como cancelamento sem mudar o documento', () => {
    it.each([
      ['setValue externo', (h: Host) => h.value.set('<p>outro</p>')],
      ['disabled', (h: Host) => h.disabled.set(true)],
      ['readonly', (h: Host) => h.readonly.set(true)],
      ['hidden', (h: Host) => h.hidden.set(true)],
    ] as const)('%s', async (name, change) => {
      const { fixture, host, editor } = await mediaSetup();
      selectText(editor, 'ab', 1);
      const changes = docChanges(editor);
      host.cmp().openDialog(m.kind);
      const dialog = await waitForDialog(fixture);
      m.fill(dialog);
      const before = getRteHtml(editor);
      change(host);
      await settle(fixture);
      expect(dialog.open).toBe(false);
      if (name === 'setValue externo') {
        expect(getRteHtml(editor)).toBe('<p>outro</p>');
      } else {
        expect(getRteHtml(editor)).toBe(before);
        expect(changes.count).toBe(0);
      }
      expect(error).not.toHaveBeenCalled();
    });

    it('fixture.destroy()', async () => {
      const { fixture, cmp, editor } = await mediaSetup();
      selectText(editor, 'ab', 1);
      cmp.openDialog(m.kind);
      const dialog = await waitForDialog(fixture);
      expect(() => fixture.destroy()).not.toThrow();
      expect(dialog.open).toBe(false);
      expect(error).not.toHaveBeenCalled();
    });

    it('"Aplicar" com o documento trocado não roda o comando e fecha', async () => {
      const { fixture, cmp, editor } = await mediaSetup();
      selectText(editor, 'ab', 1);
      cmp.openDialog(m.kind);
      const dialog = await waitForDialog(fixture);
      m.fill(dialog);
      await settle(fixture);
      const { state, view } = editor;
      view.updateState(
        EditorState.create({
          doc: state.schema.nodeFromJSON(state.doc.toJSON()),
          plugins: state.plugins,
        }),
      );
      const swapped = getRteHtml(editor);
      const command = vi.spyOn(
        editor.extensionManager.commands as unknown as Record<
          string,
          (...args: unknown[]) => unknown
        >,
        m.command,
      );
      action(dialog, 'Apply').click();
      await settle(fixture);
      expect(command).not.toHaveBeenCalled();
      expect(getRteHtml(editor)).toBe(swapped);
      expect(dialog.open).toBe(false);
    });
  });

  it('abrir, aplicar e cancelar pela barra: 0 editorBlur/editorFocus/touch', async () => {
    const { fixture, host, el, editor } = await mediaSetup();
    await focusEditor(fixture, editor);
    selectText(editor, 'ab', 1);
    const before = getRteHtml(editor);
    let origin = button(el, m.insert);
    origin.focus();
    origin.click();
    let dialog = await waitForDialog(fixture);
    m.fill(dialog);
    action(dialog, 'Apply').click();
    await nextFrame();
    await settle(fixture);
    expect(dialog.open).toBe(false);
    expect(getRteHtml(editor)).not.toBe(before);
    // A mídia nova fica selecionada (V12): o item vira "Editar".
    origin = button(el, m.edit);
    origin.focus();
    origin.click();
    dialog = await waitForDialog(fixture);
    action(dialog, 'Cancel').click();
    await nextFrame();
    await settle(fixture);
    expect(document.activeElement).toBe(origin);
    expect([host.blurs, host.focuses, host.touches]).toEqual([0, 0, 0]);
  });

  it('o touched do [formField] continua false', async () => {
    const doc = mediaDoc();
    const fixture = TestBed.createComponent(MediaFormHost);
    fixture.componentInstance.model.set({ body: doc });
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const editor = fixture.componentInstance.cmp().editor() as Editor;
    editor.view.dom.focus();
    selectText(editor, 'ab', 1);
    await settle(fixture);
    const origin = button(el, m.insert);
    origin.focus();
    origin.click();
    let dialog = await waitForDialog(fixture);
    m.fill(dialog);
    action(dialog, 'Apply').click();
    await nextFrame();
    await settle(fixture);
    selectText(editor, 'cd', 1);
    await settle(fixture);
    origin.focus();
    origin.click();
    dialog = await waitForDialog(fixture);
    action(dialog, 'Cancel').click();
    await nextFrame();
    await settle(fixture);
    expect(fixture.componentInstance.f.body().touched()).toBe(false);
  });

  it('cancelar devolve o foco ao item da barra (origem)', async () => {
    const { fixture, el, editor } = await mediaSetup();
    await focusEditor(fixture, editor);
    selectMedia(editor, m.node);
    await settle(fixture);
    const origin = button(el, m.edit);
    origin.focus();
    origin.click();
    const dialog = await waitForDialog(fixture);
    action(dialog, 'Cancel').click();
    await nextFrame();
    await settle(fixture);
    expect(document.activeElement).toBe(origin);
  });

  it('cancelar depois de openDialog com foco no editável → editável', async () => {
    const { fixture, cmp, editor } = await mediaSetup();
    await focusEditor(fixture, editor);
    selectText(editor, 'ab', 1);
    cmp.openDialog(m.kind);
    const dialog = await waitForDialog(fixture);
    expect(document.activeElement).not.toBe(editor.view.dom);
    action(dialog, 'Cancel').click();
    await nextFrame();
    await settle(fixture);
    expect(document.activeElement).toBe(editor.view.dom);
  });
});
