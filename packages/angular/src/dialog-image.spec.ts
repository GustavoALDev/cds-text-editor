import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import {
  getHtmlSchema,
  normalizeAttribute,
  type RteAttrRule,
} from '@cds/rte-core';
import { getRteHtml } from '@cds/rte-core/extensions';
import { RTE_LABELS_PT_BR } from '@cds/rte-angular/i18n';
import { validateHtml } from '@cds/rte-core/html';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import {
  RteEditor,
  type RteEditorConfig,
  type RteLabelsSource,
  type RteMediaChange,
  type RteUploadConfig,
  type RteUploadErrorEvent,
} from '@cds/rte-angular';
import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaUrlValidator } from './dialogs/media-validate';
import {
  chooseOption,
  dialogField,
  installDialogShim,
  setChecked,
  typeInto,
  waitForDialog,
} from './testing-support/dialog';
import { selectText } from './testing-support/editors';
import { anyMediaUrl, fcOptions } from './testing-support/media-urls';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';
import {
  chooseFile,
  drainUploads,
  markerPositions,
  openKind,
  pngFile,
  setupUploadDialog,
  uploadHtml,
  webmFile,
  type UploadDialogHost,
  type UploadDialogSetup,
} from './testing-support/upload-dialog';
import { createFakeUploadAdapter } from './testing-support/fake-upload-adapter';
import { resolveUploadConfig } from './upload/config';
import { createDialogUploads, fileRules } from './upload/dialog-port';

// Spec 05c1, Tarefa 4: diálogo de imagem (R3, R6 imagem; V4, V6, V7, V12).

const SRC = 'Image address (URL)';
const ALT = 'Alternative text';
const DECORATIVE = 'Decorative image';
const CAPTION = 'Caption';
const CREDIT = 'Credit';
const ALIGN = 'Alignment';
const WIDTH = 'Width (px)';
const REQUIRED = 'Fill in this field.';
const MEDIA_URL =
  'Address not accepted. Use https:// or a path starting with /, on an allowed host.';
const RANGE = 'Enter a whole number from 1 to 10000.';
const REFUSED = '[rte-editor] o editor recusou a mídia; nada foi aplicado.';

const IMG = (attrs: string, figure = 'center', caption = '') =>
  `<figure class="rt-figure rt-figure--${figure}"><img ${attrs} loading="lazy" decoding="async">${caption}</figure>`;
const EDIT_DOC = `<p>ab</p>${IMG('src="/a.png" alt="A" width="800" height="600"')}<p>cd</p>`;
const VIDEO =
  '<figure class="rt-figure rt-figure--video"><video src="/v.webm" controls="" preload="metadata" playsinline=""></video></figure>';

@Component({
  selector: 'rte-test-image-host',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    (valueChange)="changes = changes + 1"
    (mediaChange)="media.push($event)"
    [options]="options()"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('<p></p>');
  readonly options = signal<RteEditorConfig | undefined>(undefined);
  changes = 0;
  readonly media: RteMediaChange[] = [];
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

interface Setup {
  fixture: ComponentFixture<Host>;
  host: Host;
  editor: Editor;
  config: RteEditorConfig;
}

async function setup(
  doc: string,
  config: RteEditorConfig = {},
): Promise<Setup> {
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  host.value.set(doc);
  host.options.set(config);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  return { fixture, host, editor: host.cmp().editor() as Editor, config };
}

interface Opened extends Setup {
  dialog: HTMLDialogElement;
  initial: string;
}

/** Abre o diálogo de imagem sobre a seleção atual (zera as emissões). */
async function openImage(s: Setup): Promise<Opened> {
  s.host.changes = 0;
  const initial = html(s);
  expect(s.host.cmp().openDialog('image')).toBe(true);
  const dialog = await waitForDialog(s.fixture);
  return { ...s, dialog, initial };
}

/**
 * HTML do editor; todo HTML produzido no arquivo passa pelo contrato (R6):
 * 0 violações de `validateHtml` no modo `canonical`.
 */
function html(s: Setup): string {
  const out = getRteHtml(s.editor);
  expect(
    validateHtml(out, getHtmlSchema(s.config), { mode: 'canonical' }),
  ).toEqual([]);
  return out;
}

function field(o: Opened, label: string): HTMLInputElement {
  return dialogField(o.dialog, label);
}

function button(dialog: HTMLElement, selector: string): HTMLButtonElement {
  const found = dialog.querySelector<HTMLButtonElement>(selector);
  if (!found) throw new Error(`${selector} ausente`);
  return found;
}

async function submit(o: Opened): Promise<void> {
  button(o.dialog, '.rte-dialog__apply').click();
  await settle(o.fixture);
}

function title(dialog: HTMLElement): string | undefined {
  return dialog.querySelector('.rte-dialog__title')?.textContent?.trim();
}

function labelsOf(dialog: HTMLElement): string[] {
  return [...dialog.querySelectorAll('.rte-dialog__label')].map(
    (l) => l.textContent?.trim() ?? '',
  );
}

/** Texto do erro ligado ao campo por `aria-describedby` (G8). */
function errorOf(input: HTMLElement): string | null {
  const ids = (input.getAttribute('aria-describedby') ?? '').split(/\s+/);
  for (const id of ids) {
    const el = id ? input.ownerDocument.getElementById(id) : null;
    if (el?.classList.contains('rte-dialog__error')) {
      return el.textContent?.trim() ?? '';
    }
  }
  return null;
}

/** Seleciona (NodeSelection) o primeiro nó do tipo; devolve a posição. */
function selectNode(editor: Editor, typeName: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === typeName) found = pos;
    return found < 0;
  });
  expect(found).toBeGreaterThanOrEqual(0);
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, found)),
  );
  return found;
}

function cursorAt(editor: Editor, pos: number): void {
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)),
  );
}

/** A seleção é a `NodeSelection` de uma imagem. */
function expectImageSelected(editor: Editor): void {
  const sel = editor.state.selection;
  expect(sel).toBeInstanceOf(NodeSelection);
  expect((sel as NodeSelection).node.type.name).toBe('rtImage');
}

/** "Um passo de desfazer, uma emissão" (D8/D9). */
function expectOneStep(o: Opened): void {
  expect(o.host.changes).toBe(1);
  o.editor.commands.undo();
  expect(html(o)).toBe(o.initial);
}

/** Nada aplicado: diálogo aberto, HTML igual, nenhuma emissão. */
function expectNothingApplied(o: Opened): void {
  expect(o.dialog.open).toBe(true);
  expect(html(o)).toBe(o.initial);
  expect(o.host.changes).toBe(0);
}

describe('inserir imagem (R3, V6, V12)', () => {
  it('parágrafo vazio: substitui, alt, seleção na imagem, 1 passo', async () => {
    const s = await setup('<p></p>');
    const o = await openImage(s);
    expect(title(o.dialog)).toBe('Insert image');
    expect(labelsOf(o.dialog)).toEqual([SRC, ALT, DECORATIVE, CAPTION, CREDIT]);
    expect(o.dialog.querySelector('.rte-dialog__remove')).toBeNull();
    expect(document.activeElement).toBe(field(o, SRC));
    typeInto(field(o, SRC), '/e2e.png');
    typeInto(field(o, ALT), 'Gato');
    await submit(o);
    expect(o.dialog.open).toBe(false);
    expect(html(o)).toBe(IMG('src="/e2e.png" alt="Gato"'));
    expectImageSelected(o.editor);
    expectOneStep(o);
  });

  it('cursor no meio do texto → figura depois do parágrafo', async () => {
    const s = await setup('<p>abc</p>');
    selectText(s.editor, 'abc', 1);
    const o = await openImage(s);
    typeInto(field(o, SRC), '/e2e.png');
    typeInto(field(o, ALT), 'Gato');
    await submit(o);
    expect(html(o)).toBe(`<p>abc</p>${IMG('src="/e2e.png" alt="Gato"')}`);
    expectImageSelected(o.editor);
    expectOneStep(o);
  });

  it('cursor numa célula → figura dentro da célula', async () => {
    const s = await setup(
      '<table><tbody><tr><td><p>cel</p></td></tr></tbody></table>',
    );
    selectText(s.editor, 'cel', 1);
    const o = await openImage(s);
    typeInto(field(o, SRC), '/e2e.png');
    typeInto(field(o, ALT), 'Gato');
    await submit(o);
    expect(html(o)).toBe(
      `<table><tbody><tr><td><p>cel</p>${IMG('src="/e2e.png" alt="Gato"')}</td></tr></tbody></table>`,
    );
    expectOneStep(o);
  });

  it('legenda e crédito → <figcaption> com <small>', async () => {
    const s = await setup('<p></p>');
    const o = await openImage(s);
    typeInto(field(o, SRC), '/e2e.png');
    typeInto(field(o, ALT), 'Gato');
    typeInto(field(o, CAPTION), 'Um gato');
    typeInto(field(o, CREDIT), 'Foto: Ana');
    await submit(o);
    expect(html(o)).toBe(
      IMG(
        'src="/e2e.png" alt="Gato"',
        'center',
        '<figcaption>Um gato <small class="rt-credit">Foto: Ana</small></figcaption>',
      ),
    );
    expectOneStep(o);
  });

  it('decorativa → alt=""', async () => {
    const s = await setup('<p></p>');
    const o = await openImage(s);
    typeInto(field(o, SRC), '/e2e.png');
    setChecked(field(o, DECORATIVE), true);
    await settle(o.fixture);
    await submit(o);
    expect(html(o)).toBe(IMG('src="/e2e.png" alt=""'));
    expect(o.editor.state.doc.firstChild?.attrs['alt']).toBe('');
    expectOneStep(o);
  });

  it('Review Focus 1: endereço com espaço e LF nas pontas é aparado', async () => {
    const s = await setup('<p></p>');
    const o = await openImage(s);
    typeInto(field(o, SRC), '  /e2e.png\n');
    typeInto(field(o, ALT), 'Gato');
    await submit(o);
    expect(html(o)).toBe(IMG('src="/e2e.png" alt="Gato"'));
  });

  it('Review Focus 2: vídeo selecionado → inserir; imagem depois do vídeo e selecionada', async () => {
    const s = await setup(`<p>ab</p>${VIDEO}<p>cd</p>`);
    selectNode(s.editor, 'rtVideo');
    const o = await openImage(s);
    expect(title(o.dialog)).toBe('Insert image');
    expect(o.dialog.querySelector('.rte-dialog__remove')).toBeNull();
    expect(field(o, SRC).value).toBe('');
    typeInto(field(o, SRC), '/e2e.png');
    typeInto(field(o, ALT), 'Gato');
    await submit(o);
    expect(html(o)).toBe(
      `<p>ab</p>${VIDEO}${IMG('src="/e2e.png" alt="Gato"')}<p>cd</p>`,
    );
    expectImageSelected(o.editor);
    expectOneStep(o);
  });

  it('Review Focus 3: dois requestSubmit() no mesmo turno → uma transação', async () => {
    const s = await setup('<p></p>');
    const o = await openImage(s);
    let changed = 0;
    o.editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged) changed++;
    });
    typeInto(field(o, SRC), '/e2e.png');
    typeInto(field(o, ALT), 'Gato');
    const formEl = o.dialog.querySelector('form') as HTMLFormElement;
    formEl.requestSubmit();
    formEl.requestSubmit();
    await settle(o.fixture);
    expect(changed).toBe(1);
    expectOneStep(o);
  });
});

describe('editar imagem (R3, V6, V12)', () => {
  async function openEdit(doc = EDIT_DOC): Promise<Opened & { pos: number }> {
    const s = await setup(doc);
    const pos = selectNode(s.editor, 'rtImage');
    return { ...(await openImage(s)), pos };
  }

  it('abre com os valores do nó, Alinhamento e Largura, e "Remover"', async () => {
    const o = await openEdit();
    expect(title(o.dialog)).toBe('Image details');
    expect(labelsOf(o.dialog)).toEqual([
      SRC,
      ALT,
      DECORATIVE,
      CAPTION,
      CREDIT,
      ALIGN,
      WIDTH,
    ]);
    expect(field(o, SRC).value).toBe('/a.png');
    expect(field(o, ALT).value).toBe('A');
    expect(field(o, DECORATIVE).checked).toBe(false);
    expect(field(o, ALIGN).value).toBe('center');
    expect(field(o, WIDTH).value).toBe('800');
    const options = [
      ...(field(o, ALIGN) as unknown as HTMLSelectElement).options,
    ].map((opt) => [opt.value, opt.textContent?.trim()]);
    expect(options).toEqual([
      ['left', 'Align left'],
      ['center', 'Center'],
      ['right', 'Align right'],
      ['full', 'Full width'],
    ]);
    expect(button(o.dialog, '.rte-dialog__remove').textContent?.trim()).toBe(
      'Remove',
    );
  });

  it('trocar alt, legenda e crédito → um passo, NodeSelection mantida', async () => {
    const o = await openEdit();
    typeInto(field(o, ALT), 'B');
    typeInto(field(o, CAPTION), 'Leg');
    typeInto(field(o, CREDIT), 'Cred');
    await submit(o);
    expect(html(o)).toBe(
      `<p>ab</p>${IMG(
        'src="/a.png" alt="B" width="800" height="600"',
        'center',
        '<figcaption>Leg <small class="rt-credit">Cred</small></figcaption>',
      )}<p>cd</p>`,
    );
    expectImageSelected(o.editor);
    expect(o.editor.state.selection.from).toBe(o.pos);
    expectOneStep(o);
  });

  it('alinhamento left → rt-figure--left', async () => {
    const o = await openEdit();
    chooseOption(field(o, ALIGN) as unknown as HTMLSelectElement, 'left');
    await submit(o);
    expect(html(o)).toBe(
      `<p>ab</p>${IMG('src="/a.png" alt="A" width="800" height="600"', 'left')}<p>cd</p>`,
    );
    expectImageSelected(o.editor);
    expectOneStep(o);
  });

  it('largura 400 → width="400" height="300" (proporção)', async () => {
    const o = await openEdit();
    typeInto(field(o, WIDTH), '400');
    await submit(o);
    expect(html(o)).toBe(
      `<p>ab</p>${IMG('src="/a.png" alt="A" width="400" height="300"')}<p>cd</p>`,
    );
    expectImageSelected(o.editor);
    expectOneStep(o);
  });

  it('largura apagada → sem width nem height', async () => {
    const o = await openEdit();
    typeInto(field(o, WIDTH), '');
    await submit(o);
    expect(html(o)).toBe(`<p>ab</p>${IMG('src="/a.png" alt="A"')}<p>cd</p>`);
    expectImageSelected(o.editor);
    expectOneStep(o);
  });

  const SRCSET_DOC = `<p>ab</p>${IMG(
    'src="/a.png" srcset="/a.png 1x, /a2.png 2x" sizes="100vw" alt="A" width="800" height="600"',
  )}<p>cd</p>`;

  it('Fix 1: trocar o endereço limpa srcset, sizes e height antigos (largura fica)', async () => {
    const o = await openEdit(SRCSET_DOC);
    typeInto(field(o, SRC), '/b.png');
    await submit(o);
    expect(html(o)).toBe(
      `<p>ab</p>${IMG('src="/b.png" alt="A" width="800"')}<p>cd</p>`,
    );
    expectImageSelected(o.editor);
    expectOneStep(o);
  });

  it('Fix 1: mudar só o alt preserva srcset, sizes e height', async () => {
    const o = await openEdit(SRCSET_DOC);
    typeInto(field(o, ALT), 'B');
    await submit(o);
    expect(html(o)).toBe(
      '<p>ab</p><figure class="rt-figure rt-figure--center"><img src="/a.png" alt="B" width="800" height="600" loading="lazy" decoding="async" srcset="/a.png 1x, /a2.png 2x" sizes="100vw"></figure><p>cd</p>',
    );
    expectOneStep(o);
  });

  it('Fix 1: trocar o endereço → mediaChange tira os URLs antigos do srcset da sessão', async () => {
    const o = await openEdit(SRCSET_DOC);
    o.host.media.length = 0;
    typeInto(field(o, SRC), '/b.png');
    await submit(o);
    expect(o.host.media).toEqual([
      { added: ['/b.png'], removed: ['/a.png', '/a2.png'] },
    ]);
    expect(o.host.cmp().mediaSession().current).toEqual(['/b.png']);
  });

  it('"Remover" → imagem fora, cursor onde ela estava, um passo', async () => {
    const o = await openEdit();
    button(o.dialog, '.rte-dialog__remove').click();
    await settle(o.fixture);
    expect(o.dialog.open).toBe(false);
    expect(html(o)).toBe('<p>ab</p><p>cd</p>');
    const sel = o.editor.state.selection;
    expect(sel).toBeInstanceOf(TextSelection);
    expect(sel.empty).toBe(true);
    // Fim de "ab" ou começo de "cd": a lacuna onde o nó estava.
    expect([o.pos - 1, o.pos + 1]).toContain(sel.from);
    expectOneStep(o);
  });
});

describe('texto alternativo explícito (V7)', () => {
  it('alt: null → alt vazio, decorativa desmarcada; Aplicar exige escolher', async () => {
    const s = await setup(`<p>ab</p>${IMG('src="/a.png"')}`);
    expect(s.editor.state.doc.lastChild?.attrs['alt']).toBeNull();
    selectNode(s.editor, 'rtImage');
    const o = await openImage(s);
    expect(field(o, ALT).value).toBe('');
    expect(field(o, ALT).disabled).toBe(false);
    expect(field(o, DECORATIVE).checked).toBe(false);
    await submit(o);
    expect(errorOf(field(o, ALT))).toBe(REQUIRED);
    expect(document.activeElement).toBe(field(o, ALT));
    expectNothingApplied(o);
  });

  it('alt="" → decorativa marcada e alt desabilitado', async () => {
    const s = await setup(`<p>ab</p>${IMG('src="/a.png" alt=""')}`);
    selectNode(s.editor, 'rtImage');
    const o = await openImage(s);
    expect(field(o, DECORATIVE).checked).toBe(true);
    expect(field(o, ALT).disabled).toBe(true);
    expect(field(o, ALT).value).toBe('');
  });

  it('alt só de espaços sem decorativa → errorRequired', async () => {
    const s = await setup('<p></p>');
    const o = await openImage(s);
    typeInto(field(o, SRC), '/e2e.png');
    typeInto(field(o, ALT), '   ');
    await submit(o);
    expect(errorOf(field(o, ALT))).toBe(REQUIRED);
    expectNothingApplied(o);
  });

  it('marcar decorativa esvazia e desabilita o alt; desmarcar reabilita vazio', async () => {
    const s = await setup('<p></p>');
    const o = await openImage(s);
    typeInto(field(o, ALT), 'Gato');
    // No navegador há detecção de mudanças entre digitar e clicar; o
    // `[formField]` só escreve no `<input>` um valor diferente do último
    // que ele mesmo vinculou.
    await settle(o.fixture);
    setChecked(field(o, DECORATIVE), true);
    await settle(o.fixture);
    expect(field(o, ALT).value).toBe('');
    expect(field(o, ALT).disabled).toBe(true);
    setChecked(field(o, DECORATIVE), false);
    await settle(o.fixture);
    expect(field(o, ALT).value).toBe('');
    expect(field(o, ALT).disabled).toBe(false);
  });

  it('alt de 1001 caracteres → Use at most 1000 characters.', async () => {
    const s = await setup('<p></p>');
    const o = await openImage(s);
    typeInto(field(o, SRC), '/e2e.png');
    typeInto(field(o, ALT), 'a'.repeat(1001));
    await submit(o);
    expect(errorOf(field(o, ALT))).toBe('Use at most 1000 characters.');
    expectNothingApplied(o);
  });

  it.each([CAPTION, CREDIT])(
    '%s com 301 caracteres → Use at most 300 characters.',
    async (label) => {
      const s = await setup('<p></p>');
      const o = await openImage(s);
      typeInto(field(o, SRC), '/e2e.png');
      typeInto(field(o, ALT), 'Gato');
      typeInto(field(o, label), 'a'.repeat(301));
      await submit(o);
      expect(errorOf(field(o, label))).toBe('Use at most 300 characters.');
      expect(document.activeElement).toBe(field(o, label));
      expectNothingApplied(o);
    },
  );
});

describe('recusas (R3, V4)', () => {
  it.each<[string, string, RteEditorConfig]>([
    ['http:', 'http://x.test/a.png', {}],
    ['data:', 'data:image/png;base64,AA==', {}],
    ['blob:', 'blob:https://x.test/1', {}],
    ['javascript:', 'javascript:alert(1)', {}],
    ['//host', '//host/a.png', {}],
    ['sem esquema', 'site.com/a.png', {}],
    [
      'fora de mediaHosts',
      'https://other.test/a.png',
      { mediaHosts: ['media.example.test'] },
    ],
    [
      'relativo sem allowRelativeMedia',
      '/a.png',
      { allowRelativeMedia: false },
    ],
    ['2049 caracteres', `/${'a'.repeat(2048)}`, {}],
  ])(
    'endereço %s → errorMediaUrl, nada aplica, foco no campo',
    async (_, url, config) => {
      const s = await setup('<p></p>', config);
      const o = await openImage(s);
      typeInto(field(o, SRC), url);
      typeInto(field(o, ALT), 'Gato');
      await submit(o);
      expect(errorOf(field(o, SRC))).toBe(MEDIA_URL);
      expect(field(o, SRC).getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(field(o, SRC));
      expectNothingApplied(o);
    },
  );

  it('host de mediaHosts e https aceito', async () => {
    const s = await setup('<p></p>', { mediaHosts: ['media.example.test'] });
    const o = await openImage(s);
    typeInto(field(o, SRC), 'https://media.example.test/a.png');
    typeInto(field(o, ALT), 'Gato');
    await submit(o);
    expect(html(o)).toBe(
      IMG('src="https://media.example.test/a.png" alt="Gato"'),
    );
  });

  it('endereço vazio → errorRequired', async () => {
    const s = await setup('<p></p>');
    const o = await openImage(s);
    typeInto(field(o, ALT), 'Gato');
    await submit(o);
    expect(errorOf(field(o, SRC))).toBe(REQUIRED);
    expectNothingApplied(o);
  });

  it('Fix 2: endereço só de espaços → errorRequired, nada aplicado', async () => {
    const s = await setup('<p></p>');
    const o = await openImage(s);
    typeInto(field(o, SRC), '   ');
    typeInto(field(o, ALT), 'Gato');
    await submit(o);
    expect(errorOf(field(o, SRC))).toBe(REQUIRED);
    expect(document.activeElement).toBe(field(o, SRC));
    expectNothingApplied(o);
  });

  it.each(['0', '10001', '2.5'])('largura %s → errorRange', async (width) => {
    const s = await setup(EDIT_DOC);
    selectNode(s.editor, 'rtImage');
    const o = await openImage(s);
    typeInto(field(o, WIDTH), width);
    await submit(o);
    expect(errorOf(field(o, WIDTH))).toBe(RANGE);
    expect(document.activeElement).toBe(field(o, WIDTH));
    expectNothingApplied(o);
  });
});

describe('comando recusado (V9, Ruling 4)', () => {
  it('setImage devolve false → fecha como cancelamento, doc igual, aviso 1×, foco na origem', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = await setup('<p>ab</p>');
    s.editor.view.dom.focus();
    selectText(s.editor, 'ab', 1);
    const raw = (
      s.editor as unknown as {
        commandManager: {
          rawCommands: Record<string, (...args: unknown[]) => unknown>;
        };
      }
    ).commandManager.rawCommands;
    vi.spyOn(raw, 'setImage').mockReturnValue(() => false);
    const root = s.fixture.nativeElement as HTMLElement;
    const origin = [
      ...root.querySelectorAll<HTMLButtonElement>('.rte-toolbar__button'),
    ].find((b) => b.getAttribute('aria-label') === 'Insert image');
    if (!origin) throw new Error('botão Insert image ausente');
    s.host.changes = 0;
    const initial = html(s);
    origin.focus();
    origin.click();
    const dialog = await waitForDialog(s.fixture);
    const o: Opened = { ...s, dialog, initial };
    typeInto(field(o, SRC), '/e2e.png');
    typeInto(field(o, ALT), 'Gato');
    await submit(o);
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    await settle(o.fixture);
    expect(dialog.open).toBe(false);
    expect(html(o)).toBe(initial);
    expect(o.host.changes).toBe(0);
    expect(warn.mock.calls.filter(([m]) => m === REFUSED)).toHaveLength(1);
    expect(document.activeElement).toBe(origin);
  });
});

const ANY_URL = anyMediaUrl('png');

function imageRule(config: RteEditorConfig): RteAttrRule {
  const rule = getHtmlSchema(config).elements['img']?.attributes['src']?.rule;
  if (!rule) throw new Error('regra img[src] ausente');
  return rule;
}

describe('propriedade R6: o diálogo aceita ⇔ a regra img[src] do esquema aceita', () => {
  it.each<[string, RteEditorConfig]>([
    ['padrão', {}],
    ['mediaHosts', { mediaHosts: ['media.example.test'] }],
    ['allowRelativeMedia: false', { allowRelativeMedia: false }],
  ])('validador do formulário (%s)', (_, config) => {
    const rule = imageRule(config);
    const model = signal({ src: '' });
    const f = TestBed.runInInjectionContext(() =>
      form(model, (p) => mediaUrlValidator(p.src, () => rule)),
    );
    fc.assert(
      fc.property(ANY_URL, (s) => {
        model.set({ src: s });
        const refused = f
          .src()
          .errors()
          .some((e) => e.kind === 'rteMediaUrl');
        // Vazio nunca dá `rteMediaUrl` (Ruling 10: é do `required`).
        const expected =
          s.trim() !== '' && normalizeAttribute(rule, s.trim()) === null;
        expect(refused).toBe(expected);
      }),
      fcOptions(),
    );
  });

  it('pelo DOM do diálogo (20 execuções): aceito ⇒ src canônico; recusado ⇒ HTML igual', async () => {
    const config: RteEditorConfig = { mediaHosts: ['media.example.test'] };
    const s = await setup('<p></p>', config);
    const rule = imageRule(config);
    await fc.assert(
      fc.asyncProperty(ANY_URL, async (value) => {
        cursorAt(s.editor, 1);
        const o = await openImage(s);
        const src = field(o, SRC);
        typeInto(src, value);
        // O que a pessoa entregou é o valor do campo (o `<input>` tira LF/CR).
        const canonical = normalizeAttribute(rule, src.value.trim());
        typeInto(field(o, ALT), 'Gato');
        await submit(o);
        if (canonical === null) {
          expect(o.dialog.open).toBe(true);
          expect(html(o)).toBe(o.initial);
          button(o.dialog, '.rte-dialog__cancel').click();
          await settle(o.fixture);
          return;
        }
        expect(o.dialog.open).toBe(false);
        const parsed = new DOMParser().parseFromString(html(o), 'text/html');
        expect(parsed.querySelector('img')?.getAttribute('src')).toBe(
          canonical,
        );
        o.editor.commands.undo();
        expect(html(o)).toBe(o.initial);
      }),
      fcOptions(20),
    );
  });
});

@Component({
  selector: 'rte-test-upload-dialog-host',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    [upload]="upload()"
    [labels]="labels()"
    (valueChange)="changes = changes + 1"
    (uploadError)="errors.push($event)"
    toolbar="full"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class UploadHost implements UploadDialogHost {
  readonly value = signal('<p></p>');
  readonly upload = signal<RteUploadConfig | null>(null);
  readonly labels = signal<RteLabelsSource | undefined>(undefined);
  changes = 0;
  readonly errors: RteUploadErrorEvent[] = [];
  readonly cmp = viewChild.required(RteEditor);
}

// Spec 05c2a, Tarefa 10: origem "Arquivo" ou "Endereço" (E14; R9, R7).

const SOURCE = 'Source';
const FILE = 'File';
const URL_SOURCE = 'Address (URL)';
const IMAGE_FILE = 'Image file';
const IMAGE_ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,image/avif,.png,.jpg,.jpeg,.gif,.webp,.avif';
const IMAGE_HINT = 'Accepted: PNG, JPEG, GIF, WebP, AVIF. Up to 10 MB.';

function sourceOf(dialog: HTMLElement): HTMLFieldSetElement | null {
  return dialog.querySelector<HTMLFieldSetElement>(
    'fieldset.rte-dialog__fieldset.rte-dialog__source',
  );
}

function fileInput(dialog: HTMLElement): HTMLInputElement {
  const input = dialog.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('campo de arquivo ausente');
  return input;
}

function hiddenField(input: HTMLElement): boolean | undefined {
  return input.closest('.rte-dialog__field')?.hasAttribute('hidden');
}

async function applyUpload(
  s: UploadDialogSetup,
  d: HTMLDialogElement,
): Promise<void> {
  button(d, '.rte-dialog__apply').click();
  await settle(s.fixture);
}

describe('origem do diálogo de imagem (05c2a E14, R9)', () => {
  it('sem adaptador: diálogo da 05c1, sem "Origem" nem campo de arquivo', async () => {
    const s = await setup('<p></p>');
    const o = await openImage(s);
    expect(sourceOf(o.dialog)).toBeNull();
    expect(o.dialog.querySelector('input[type="file"]')).toBeNull();
  });

  it('com adaptador, inserir: "Origem" com "Arquivo" marcado, accept e dica', async () => {
    const s = await setupUploadDialog(UploadHost, '<p></p>');
    const d = await openKind(s, 'image');
    const source = sourceOf(d);
    expect(source).not.toBeNull();
    expect(
      source?.querySelector('legend.rte-dialog__legend')?.textContent?.trim(),
    ).toBe(SOURCE);
    const radios = [
      ...(source?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ??
        []),
    ];
    expect(radios.map((r) => r.id)).toEqual([
      expect.stringMatching(/-image-source-file$/),
      expect.stringMatching(/-image-source-url$/),
    ]);
    expect(radios.map((r) => r.checked)).toEqual([true, false]);
    expect(dialogField(d, FILE)).toBe(radios[0]);
    expect(dialogField(d, URL_SOURCE)).toBe(radios[1]);
    expect(radios[0]?.name).toBe(radios[1]?.name);
    // "Arquivo" é o primeiro foco do `show()`.
    expect(document.activeElement).toBe(radios[0]);
    const input = fileInput(d);
    expect(input.id).toMatch(/-image-file$/);
    expect(dialogField(d, IMAGE_FILE)).toBe(input);
    expect(input.accept).toBe(IMAGE_ACCEPT);
    expect(input.multiple).toBe(false);
    const hint = d.ownerDocument.getElementById(`${input.id}-hint`);
    expect(hint?.textContent?.trim()).toBe(IMAGE_HINT);
    expect(input.getAttribute('aria-describedby')).toBe(`${input.id}-hint`);
    // O grupo do endereço fica no DOM, oculto.
    expect(hiddenField(dialogField(d, SRC))).toBe(true);
    expect(hiddenField(input)).toBe(false);
  });

  it('editar: sem "Origem" (só endereço)', async () => {
    const s = await setupUploadDialog(UploadHost, EDIT_DOC);
    selectNode(s.editor, 'rtImage');
    const d = await openKind(s, 'image');
    expect(sourceOf(d)).toBeNull();
    expect(d.querySelector('input[type="file"]')).toBeNull();
    expect(hiddenField(dialogField(d, SRC))).toBe(false);
  });

  it('erros no campo, sem uploadError e sem fechar; foco no arquivo', async () => {
    const s = await setupUploadDialog(UploadHost, '<p></p>');
    const d = await openKind(s, 'image');
    const before = uploadHtml(s);
    const input = fileInput(d);
    typeInto(dialogField(d, ALT), 'Gato');
    await applyUpload(s, d);
    expect(d.open).toBe(true);
    expect(errorOf(input)).toBe('Choose a file.');
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(
      `${input.id}-hint ${input.id}-error`,
    );

    chooseFile(input, new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }));
    await settle(s.fixture);
    expect(errorOf(input)).toBe('This file type is not accepted.');
    await applyUpload(s, d);
    expect(d.open).toBe(true);

    chooseFile(input, pngFile('big.png', 11 * 1024 * 1024));
    await settle(s.fixture);
    expect(errorOf(input)).toBe('The file is larger than 10 MB.');
    await applyUpload(s, d);
    expect(d.open).toBe(true);

    await drainUploads(s.fixture);
    expect(s.host.errors).toEqual([]);
    expect(s.adapter.calls).toHaveLength(0);
    expect(uploadHtml(s)).toBe(before);
    expect(s.host.changes).toBe(0);
  });

  it('texto alternativo continua obrigatório com "Arquivo" (V7)', async () => {
    const s = await setupUploadDialog(UploadHost, '<p></p>');
    const d = await openKind(s, 'image');
    chooseFile(fileInput(d), pngFile());
    await settle(s.fixture);
    await applyUpload(s, d);
    expect(d.open).toBe(true);
    const alt = dialogField(d, ALT);
    expect(errorOf(alt)).toBe(REQUIRED);
    expect(document.activeElement).toBe(alt);
    await drainUploads(s.fixture);
    expect(s.adapter.calls).toHaveLength(0);
  });

  it('"Aplicar" válido: fecha, foco no editável, marcador no parágrafo, sem transação; chegada com alt, legenda e crédito', async () => {
    const s = await setupUploadDialog(UploadHost, '<p></p>');
    const d = await openKind(s, 'image');
    const before = uploadHtml(s);
    const doc = s.editor.state.doc;
    const file = pngFile('gato.png');
    chooseFile(fileInput(d), file);
    typeInto(dialogField(d, ALT), ' Gato ');
    typeInto(dialogField(d, CAPTION), 'Um gato');
    typeInto(dialogField(d, CREDIT), 'Foto: Ana');
    await settle(s.fixture);
    await applyUpload(s, d);
    expect(d.open).toBe(false);
    expect(document.activeElement).toBe(s.editor.view.dom);
    expect(markerPositions(s.editor)).toEqual([1]);
    expect(s.editor.state.doc).toBe(doc);
    expect(uploadHtml(s)).toBe(before);
    expect(s.host.changes).toBe(0);
    await drainUploads(s.fixture);
    expect(s.adapter.calls).toHaveLength(1);
    expect(s.adapter.calls[0]?.file).toBe(file);
    expect(s.adapter.calls[0]?.type).toBe('image');
    s.adapter.resolve(0, { url: '/gato.png' });
    await drainUploads(s.fixture);
    expect(uploadHtml(s)).toBe(
      IMG(
        'src="/gato.png" alt="Gato"',
        'center',
        '<figcaption>Um gato <small class="rt-credit">Foto: Ana</small></figcaption>',
      ),
    );
    expect(s.host.changes).toBe(1);
    expect(s.host.errors).toEqual([]);
  });

  it('"Decorativa" com arquivo → alt=""', async () => {
    const s = await setupUploadDialog(UploadHost, '<p></p>');
    const d = await openKind(s, 'image');
    chooseFile(fileInput(d), pngFile());
    setChecked(dialogField(d, DECORATIVE), true);
    await settle(s.fixture);
    await applyUpload(s, d);
    await drainUploads(s.fixture);
    s.adapter.resolve(0, { url: '/a.png' });
    await drainUploads(s.fixture);
    expect(uploadHtml(s)).toBe(IMG('src="/a.png" alt=""'));
  });

  it('NodeSelection de vídeo → marcador depois do vídeo', async () => {
    const s = await setupUploadDialog(UploadHost, `<p>ab</p>${VIDEO}<p>cd</p>`);
    const pos = selectNode(s.editor, 'rtVideo');
    const size = s.editor.state.doc.nodeAt(pos)?.nodeSize ?? 0;
    const d = await openKind(s, 'image');
    expect(sourceOf(d)).not.toBeNull();
    chooseFile(fileInput(d), pngFile());
    typeInto(dialogField(d, ALT), 'Gato');
    await settle(s.fixture);
    await applyUpload(s, d);
    expect(d.open).toBe(false);
    expect(markerPositions(s.editor)).toEqual([pos + size]);
  });

  it('"Endereço" valida como na 05c1; voltar a "Arquivo" mantém o arquivo', async () => {
    const s = await setupUploadDialog(UploadHost, '<p></p>');
    const d = await openKind(s, 'image');
    const input = fileInput(d);
    const file = pngFile('mantido.png');
    chooseFile(input, file);
    typeInto(dialogField(d, ALT), 'Gato');
    setChecked(dialogField(d, URL_SOURCE), true);
    await settle(s.fixture);
    const src = dialogField(d, SRC);
    expect(hiddenField(src)).toBe(false);
    expect(hiddenField(input)).toBe(true);
    typeInto(src, 'http://example.com/a.png');
    await settle(s.fixture);
    await applyUpload(s, d);
    expect(d.open).toBe(true);
    expect(errorOf(src)).toBe(MEDIA_URL);
    expect(document.activeElement).toBe(src);

    setChecked(dialogField(d, FILE), true);
    await settle(s.fixture);
    expect(hiddenField(input)).toBe(false);
    expect(input.files?.[0]).toBe(file);
    await applyUpload(s, d);
    expect(d.open).toBe(false);
    await drainUploads(s.fixture);
    expect(s.adapter.calls[0]?.file).toBe(file);
  });

  it('"Endereço" válido insere pela URL, sem envio', async () => {
    const s = await setupUploadDialog(UploadHost, '<p></p>');
    const d = await openKind(s, 'image');
    setChecked(dialogField(d, URL_SOURCE), true);
    await settle(s.fixture);
    typeInto(dialogField(d, SRC), '/e2e.png');
    typeInto(dialogField(d, ALT), 'Gato');
    await settle(s.fixture);
    await applyUpload(s, d);
    expect(d.open).toBe(false);
    expect(uploadHtml(s)).toBe(IMG('src="/e2e.png" alt="Gato"'));
    await drainUploads(s.fixture);
    expect(s.adapter.calls).toHaveLength(0);
  });

  it('troca de rótulos para pt-BR com arquivo escolhido: arquivo intacto', async () => {
    const s = await setupUploadDialog(UploadHost, '<p></p>');
    const d = await openKind(s, 'image');
    const input = fileInput(d);
    const file = pngFile('mantido.png');
    chooseFile(input, file);
    await settle(s.fixture);
    s.host.labels.set(RTE_LABELS_PT_BR);
    await settle(s.fixture);
    expect(sourceOf(d)?.querySelector('legend')?.textContent?.trim()).toBe(
      'Origem',
    );
    expect(dialogField(d, 'Arquivo')).toBe(
      d.querySelector('input[type="radio"]'),
    );
    expect(dialogField(d, 'Arquivo de imagem')).toBe(input);
    expect(fileInput(d)).toBe(input);
    expect(input.files?.[0]).toBe(file);
    expect(
      d.ownerDocument.getElementById(`${input.id}-hint`)?.textContent?.trim(),
    ).toBe('Aceitos: PNG, JPEG, GIF, WebP, AVIF. Até 10 MB.');
    typeInto(dialogField(d, 'Texto alternativo'), 'Gato');
    await settle(s.fixture);
    await applyUpload(s, d);
    expect(d.open).toBe(false);
    await drainUploads(s.fixture);
    expect(s.adapter.calls[0]?.file).toBe(file);
  });

  it('reabrir limpa o arquivo escolhido antes', async () => {
    const s = await setupUploadDialog(UploadHost, '<p></p>');
    let d = await openKind(s, 'image');
    chooseFile(fileInput(d), pngFile());
    setChecked(dialogField(d, URL_SOURCE), true);
    await settle(s.fixture);
    button(d, '.rte-dialog__cancel').click();
    await settle(s.fixture);
    d = await openKind(s, 'image');
    const input = fileInput(d);
    expect(input.value).toBe('');
    expect(dialogField(d, FILE).checked).toBe(true);
    expect(hiddenField(input)).toBe(false);
    typeInto(dialogField(d, ALT), 'Gato');
    await settle(s.fixture);
    await applyUpload(s, d);
    expect(d.open).toBe(true);
    expect(errorOf(input)).toBe('Choose a file.');
  });

  it('envio chegando com o diálogo de link aberto: o diálogo segue aberto, a figura entra ao fechar (R7)', async () => {
    const s = await setupUploadDialog(UploadHost, '<p>abc</p>');
    selectText(s.editor, 'abc', 3);
    let d = await openKind(s, 'image');
    chooseFile(fileInput(d), pngFile());
    typeInto(dialogField(d, ALT), 'Gato');
    await settle(s.fixture);
    await applyUpload(s, d);
    await drainUploads(s.fixture);
    expect(s.adapter.calls).toHaveLength(1);
    selectText(s.editor, 'abc');
    d = await openKind(s, 'link');
    s.adapter.resolve(0, { url: '/a.png' });
    await drainUploads(s.fixture);
    expect(d.open).toBe(true);
    expect(uploadHtml(s)).toBe('<p>abc</p>');
    button(d, '.rte-dialog__cancel').click();
    await drainUploads(s.fixture);
    expect(uploadHtml(s)).toBe(`<p>abc</p>${IMG('src="/a.png" alt="Gato"')}`);
  });
});

describe('porta do diálogo (pré-voo 13, Ruling 11)', () => {
  const cfg = (o: Record<string, unknown> = {}, video = true) => {
    const resolved = resolveUploadConfig({
      adapter: createFakeUploadAdapter({ video }),
      ...o,
    });
    if (!resolved) throw new Error('configuração nula');
    return resolved;
  };

  it('fileRules: accept, nomes e teto em MB (uma casa)', () => {
    expect(fileRules(cfg(), 'image')).toEqual({
      accept: IMAGE_ACCEPT,
      typeNames: ['PNG', 'JPEG', 'GIF', 'WebP', 'AVIF'],
      maxMegabytes: 10,
    });
    expect(fileRules(cfg(), 'video')).toEqual({
      accept: 'video/mp4,video/webm,.mp4,.webm',
      typeNames: ['MP4', 'WebM'],
      maxMegabytes: 200,
    });
    expect(
      fileRules(
        cfg({
          imageTypes: ['image/jpeg', 'image/webp'],
          maxImageBytes: 1.25 * 1024 * 1024,
        }),
        'image',
      ),
    ).toEqual({
      accept: 'image/jpeg,image/webp,.jpg,.jpeg,.webp',
      typeNames: ['JPEG', 'WebP'],
      maxMegabytes: 1.3,
    });
    expect(fileRules(cfg({}, false), 'video')).toBeNull();
  });

  it('createDialogUploads: regras, check pelo tipo do diálogo e start', () => {
    const starts: unknown[] = [];
    const port = createDialogUploads(
      {
        start: (files, at, text) => {
          starts.push({ files, at, text });
          return files.length;
        },
      },
      cfg({ maxImageBytes: 100 }),
    );
    expect(port.image.maxMegabytes).toBe(0);
    expect(port.video?.typeNames).toEqual(['MP4', 'WebM']);
    const png = pngFile('a.png', 10);
    expect(port.check(png, 'image')).toBeNull();
    expect(port.check(png, 'video')).toBe('type');
    expect(port.check(pngFile('b.png', 101), 'image')).toBe('size');
    expect(port.check(webmFile(), 'image')).toBe('type');
    expect(port.check(webmFile(), 'video')).toBeNull();
    expect(
      port.check(new File(['x'], 'a.svg', { type: 'image/svg+xml' }), 'image'),
    ).toBe('type');
    const text = { alt: 'A', caption: '' };
    expect(port.start({ file: png, type: 'image', at: 3, text })).toBe(true);
    expect(starts).toEqual([{ files: [png], at: 3, text }]);
    expect(
      createDialogUploads({ start: () => 0 }, cfg()).start({
        file: png,
        type: 'image',
        at: 1,
        text,
      }),
    ).toBe(false);
    expect(createDialogUploads({ start: () => 0 }, cfg({}, false)).video).toBe(
      null,
    );
  });
});
