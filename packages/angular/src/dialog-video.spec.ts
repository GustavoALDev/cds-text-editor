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
import { validateHtml } from '@cds/rte-core/html';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor, type RteEditorConfig } from '@cds/rte-angular';
import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { langCodeValidator } from './dialogs/form-helpers';
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
import { ANY_LANG, anyMediaUrl, fcOptions } from './testing-support/media-urls';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';

// Spec 05c1, Tarefa 5: diálogo de vídeo e faixas (R4, R6 vídeo; V4, V8).

const SRC = 'Video address (URL)';
const POSTER = 'Cover image address (optional)';
const CAPTION = 'Caption';
const KIND = 'Type';
const TRACK_SRC = 'Track address (.vtt)';
const LANG = 'Language code (BCP 47)';
const LABEL = 'Label';
const DEFAULT = 'Default';
const ADD = 'Add track';
const HINT =
  'No captions track: videos with speech or meaningful sound need one (WCAG 1.2.2).';
const REQUIRED = 'Fill in this field.';
const MEDIA_URL =
  'Address not accepted. Use https:// or a path starting with /, on an allowed host.';
const LANG_CODE = 'Invalid code. Use a BCP 47 tag such as pt-BR.';
const REFUSED = '[rte-editor] o editor recusou a mídia; nada foi aplicado.';

const VIDEO = (attrs: string, inner = '', caption = '') =>
  `<figure class="rt-figure rt-figure--video"><video ${attrs} controls="" preload="metadata" playsinline=""${inner}</video>${caption}</figure>`;
const TRACK = (attrs: string) => `<track ${attrs}>`;
const EDIT_TRACK = TRACK(
  'kind="captions" src="/t.vtt" srclang="en" label="English" default=""',
);
const EDIT_DOC = `<p>ab</p><figure class="rt-figure rt-figure--video"><video src="/v.webm" controls="" preload="metadata" playsinline="" poster="/p.png">${EDIT_TRACK}</video><figcaption>Old</figcaption></figure><p>cd</p>`;
const IMAGE =
  '<figure class="rt-figure rt-figure--center"><img src="/a.png" alt="A" loading="lazy" decoding="async"></figure>';

@Component({
  selector: 'rte-test-video-host',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    (valueChange)="changes = changes + 1"
    [options]="options()"
    toolbar="full"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('<p></p>');
  readonly options = signal<RteEditorConfig | undefined>(undefined);
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

/** Abre o diálogo de vídeo sobre a seleção atual (zera as emissões). */
async function openVideo(s: Setup): Promise<Opened> {
  s.host.changes = 0;
  const initial = html(s);
  expect(s.host.cmp().openDialog('video')).toBe(true);
  const dialog = await waitForDialog(s.fixture);
  return { ...s, dialog, initial };
}

/** HTML do editor, sempre com 0 violações de `validateHtml` (R6). */
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

function fieldsets(o: Opened): HTMLFieldSetElement[] {
  return [
    ...o.dialog.querySelectorAll<HTMLFieldSetElement>(
      'fieldset.rte-dialog__fieldset',
    ),
  ];
}

/** Campo `label` da faixa `i` (base 0), dentro do seu `<fieldset>`. */
function trackField(o: Opened, i: number, label: string): HTMLInputElement {
  const set = fieldsets(o)[i];
  if (!set) throw new Error(`faixa ${i} ausente`);
  return dialogField(set, label);
}

function buttonByText(o: Opened, text: string): HTMLButtonElement {
  const found = [
    ...o.dialog.querySelectorAll<HTMLButtonElement>('button'),
  ].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`botão ${text} ausente`);
  return found;
}

function button(o: Opened, selector: string): HTMLButtonElement {
  const found = o.dialog.querySelector<HTMLButtonElement>(selector);
  if (!found) throw new Error(`${selector} ausente`);
  return found;
}

async function submit(o: Opened): Promise<void> {
  button(o, '.rte-dialog__apply').click();
  await settle(o.fixture);
}

async function addTrack(o: Opened): Promise<void> {
  buttonByText(o, ADD).click();
  await settle(o.fixture);
}

interface TrackInput {
  kind?: 'captions' | 'subtitles';
  src?: string;
  lang?: string;
  label?: string;
}

/** Acrescenta uma faixa e preenche os campos dados. */
async function fillNewTrack(o: Opened, t: TrackInput): Promise<void> {
  await addTrack(o);
  const i = fieldsets(o).length - 1;
  if (t.kind) {
    chooseOption(
      trackField(o, i, KIND) as unknown as HTMLSelectElement,
      t.kind,
    );
  }
  if (t.src !== undefined) typeInto(trackField(o, i, TRACK_SRC), t.src);
  if (t.lang !== undefined) typeInto(trackField(o, i, LANG), t.lang);
  if (t.label !== undefined) typeInto(trackField(o, i, LABEL), t.label);
  await settle(o.fixture);
}

function title(o: Opened): string | undefined {
  return o.dialog.querySelector('.rte-dialog__title')?.textContent?.trim();
}

/** Rótulos dos campos fora das faixas. */
function topLabels(o: Opened): string[] {
  return [...o.dialog.querySelectorAll('.rte-dialog__label')]
    .filter((l) => !l.closest('fieldset'))
    .map((l) => l.textContent?.trim() ?? '');
}

function hintShown(o: Opened): boolean {
  return [...o.dialog.querySelectorAll('.rte-dialog__hint')].some(
    (h) => h.textContent?.trim() === HINT,
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

function expectVideoSelected(editor: Editor): void {
  const sel = editor.state.selection;
  expect(sel).toBeInstanceOf(NodeSelection);
  expect((sel as NodeSelection).node.type.name).toBe('rtVideo');
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

describe('inserir vídeo (R4, V8)', () => {
  it('sem faixas: campos, dica WCAG, HTML do core, seleção no vídeo, 1 passo', async () => {
    const s = await setup('<p></p>');
    const o = await openVideo(s);
    expect(title(o)).toBe('Insert video');
    expect(topLabels(o)).toEqual([SRC, POSTER, CAPTION]);
    expect(fieldsets(o)).toHaveLength(0);
    expect(o.dialog.querySelector('.rte-dialog__remove')).toBeNull();
    expect(hintShown(o)).toBe(true);
    expect(document.activeElement).toBe(field(o, SRC));
    typeInto(field(o, SRC), '/e2e.webm');
    await submit(o);
    expect(o.dialog.open).toBe(false);
    expect(html(o)).toBe(VIDEO('src="/e2e.webm"', '>'));
    expectVideoSelected(o.editor);
    expectOneStep(o);
  });

  it('pôster e legenda; endereços aparados', async () => {
    const s = await setup('<p></p>');
    const o = await openVideo(s);
    typeInto(field(o, SRC), ' /e2e.webm ');
    typeInto(field(o, POSTER), '\t/e2e.png ');
    typeInto(field(o, CAPTION), 'Um vídeo');
    await submit(o);
    expect(html(o)).toBe(
      VIDEO(
        'src="/e2e.webm"',
        ' poster="/e2e.png">',
        '<figcaption>Um vídeo</figcaption>',
      ),
    );
    expectOneStep(o);
  });

  it('uma faixa captions padrão → <track … default="">', async () => {
    const s = await setup('<p></p>');
    const o = await openVideo(s);
    typeInto(field(o, SRC), '/e2e.webm');
    await fillNewTrack(o, {
      kind: 'captions',
      src: '/e2e.vtt',
      lang: 'pt-BR',
      label: 'Português',
    });
    expect(fieldsets(o)).toHaveLength(1);
    expect(
      fieldsets(o)[0]
        ?.querySelector('legend.rte-dialog__legend')
        ?.textContent?.trim(),
    ).toBe('Track 1');
    setChecked(trackField(o, 0, DEFAULT), true);
    await settle(o.fixture);
    await submit(o);
    expect(html(o)).toBe(
      VIDEO(
        'src="/e2e.webm"',
        `>${TRACK('kind="captions" src="/e2e.vtt" srclang="pt-BR" label="Português" default=""')}`,
      ),
    );
    expectVideoSelected(o.editor);
    expectOneStep(o);
  });

  it('rótulo aparado; faixa subtitles sem padrão', async () => {
    const s = await setup('<p></p>');
    const o = await openVideo(s);
    typeInto(field(o, SRC), '/e2e.webm');
    await fillNewTrack(o, {
      kind: 'subtitles',
      src: ' /e2e.vtt ',
      lang: 'es',
      label: '  Español  ',
    });
    await submit(o);
    expect(html(o)).toBe(
      VIDEO(
        'src="/e2e.webm"',
        `>${TRACK('kind="subtitles" src="/e2e.vtt" srclang="es" label="Español"')}`,
      ),
    );
    expectOneStep(o);
  });

  it('10 faixas → 10 <track> e "Acrescentar faixa" desabilitado', async () => {
    const s = await setup('<p></p>');
    const o = await openVideo(s);
    typeInto(field(o, SRC), '/e2e.webm');
    for (let i = 1; i <= 10; i++) {
      expect(buttonByText(o, ADD).disabled).toBe(false);
      await fillNewTrack(o, { src: `/t${i}.vtt`, lang: 'en', label: `L${i}` });
    }
    expect(fieldsets(o)).toHaveLength(10);
    expect(buttonByText(o, ADD).disabled).toBe(true);
    await submit(o);
    const out = html(o);
    expect(out.match(/<track /g)).toHaveLength(10);
    expect(out).toContain(
      TRACK('kind="captions" src="/t10.vtt" srclang="en" label="L10"'),
    );
    expectOneStep(o);
  });

  it('Review Focus 2: imagem selecionada → vídeo depois da imagem, imagem preservada', async () => {
    const s = await setup(`<p>ab</p>${IMAGE}<p>cd</p>`);
    selectNode(s.editor, 'rtImage');
    const o = await openVideo(s);
    expect(title(o)).toBe('Insert video');
    expect(o.dialog.querySelector('.rte-dialog__remove')).toBeNull();
    typeInto(field(o, SRC), '/e2e.webm');
    await submit(o);
    expect(html(o)).toBe(
      `<p>ab</p>${IMAGE}${VIDEO('src="/e2e.webm"', '>')}<p>cd</p>`,
    );
    expectVideoSelected(o.editor);
    expectOneStep(o);
  });
});

describe('editar vídeo (R4, V8)', () => {
  async function openEdit(): Promise<Opened & { pos: number }> {
    const s = await setup(EDIT_DOC);
    const pos = selectNode(s.editor, 'rtVideo');
    return { ...(await openVideo(s)), pos };
  }

  it('abre com os valores do nó e "Remover"', async () => {
    const o = await openEdit();
    expect(title(o)).toBe('Video details');
    expect(field(o, SRC).value).toBe('/v.webm');
    expect(field(o, POSTER).value).toBe('/p.png');
    expect(field(o, CAPTION).value).toBe('Old');
    expect(fieldsets(o)).toHaveLength(1);
    expect(trackField(o, 0, KIND).value).toBe('captions');
    expect(trackField(o, 0, TRACK_SRC).value).toBe('/t.vtt');
    expect(trackField(o, 0, LANG).value).toBe('en');
    expect(trackField(o, 0, LABEL).value).toBe('English');
    expect(trackField(o, 0, DEFAULT).checked).toBe(true);
    expect(hintShown(o)).toBe(false);
    expect(button(o, '.rte-dialog__remove').textContent?.trim()).toBe('Remove');
  });

  it('trocar a legenda e remover a faixa → um passo, NodeSelection mantida', async () => {
    const o = await openEdit();
    typeInto(field(o, CAPTION), 'Nova');
    buttonByText(o, 'Remove track 1').click();
    await settle(o.fixture);
    expect(hintShown(o)).toBe(true);
    await submit(o);
    expect(html(o)).toBe(
      `<p>ab</p>${VIDEO('src="/v.webm"', ' poster="/p.png">', '<figcaption>Nova</figcaption>')}<p>cd</p>`,
    );
    expectVideoSelected(o.editor);
    expect(o.editor.state.selection.from).toBe(o.pos);
    expectOneStep(o);
  });

  it('pôster apagado → sem poster', async () => {
    const o = await openEdit();
    typeInto(field(o, POSTER), '');
    await submit(o);
    expect(html(o)).toBe(
      `<p>ab</p>${VIDEO('src="/v.webm"', `>${EDIT_TRACK}`, '<figcaption>Old</figcaption>')}<p>cd</p>`,
    );
    expectOneStep(o);
  });

  it('"Remover" → vídeo fora, um passo', async () => {
    const o = await openEdit();
    button(o, '.rte-dialog__remove').click();
    await settle(o.fixture);
    expect(o.dialog.open).toBe(false);
    expect(html(o)).toBe('<p>ab</p><p>cd</p>');
    expect(o.editor.state.selection).toBeInstanceOf(TextSelection);
    expectOneStep(o);
  });
});

describe('editar vídeo com muitas faixas (R4, fix 1)', () => {
  /** Vídeo com `n` faixas (`/t1.vtt`…), legenda "Old". */
  function manyTracksDoc(n: number): string {
    const tracks = Array.from({ length: n }, (_, i) =>
      TRACK(
        `kind="captions" src="/t${i + 1}.vtt" srclang="en" label="L${i + 1}"`,
      ),
    ).join('');
    return `<p>ab</p>${VIDEO('src="/v.webm"', `>${tracks}`, '<figcaption>Old</figcaption>')}<p>cd</p>`;
  }

  it.each([10, 12])(
    '%i faixas: todas carregadas, "Acrescentar" desabilitado, legenda trocada mantém todas',
    async (n) => {
      const s = await setup(manyTracksDoc(n));
      expect(html(s).match(/<track /g)).toHaveLength(n);
      selectNode(s.editor, 'rtVideo');
      const o = await openVideo(s);
      expect(fieldsets(o)).toHaveLength(n);
      expect(buttonByText(o, ADD).disabled).toBe(true);
      typeInto(field(o, CAPTION), 'Nova');
      await submit(o);
      expect(o.dialog.open).toBe(false);
      expect(html(o)).toBe(
        manyTracksDoc(n).replace(
          '<figcaption>Old</figcaption>',
          '<figcaption>Nova</figcaption>',
        ),
      );
      expectOneStep(o);
    },
  );
});

describe('erros no campo (R4, V4, V8)', () => {
  /** Abre, com endereço válido e uma faixa válida exceto por `bad`. */
  async function withTrack(bad: TrackInput): Promise<Opened> {
    const s = await setup('<p></p>');
    const o = await openVideo(s);
    typeInto(field(o, SRC), '/e2e.webm');
    await fillNewTrack(o, {
      src: '/e2e.vtt',
      lang: 'en',
      label: 'English',
      ...bad,
    });
    await submit(o);
    return o;
  }

  it('endereço da faixa http: → errorMediaUrl na faixa, foco nele', async () => {
    const o = await withTrack({ src: 'http://x.test/a.vtt' });
    const input = trackField(o, 0, TRACK_SRC);
    expect(errorOf(input)).toBe(MEDIA_URL);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(input);
    expectNothingApplied(o);
  });

  it('endereço da faixa vazio → errorRequired', async () => {
    const o = await withTrack({ src: '' });
    expect(errorOf(trackField(o, 0, TRACK_SRC))).toBe(REQUIRED);
    expectNothingApplied(o);
  });

  it.each(['e', 'en_US', 'a'.repeat(31), ' en'])(
    'idioma %j → errorLangCode',
    async (lang) => {
      const o = await withTrack({ lang });
      const input = trackField(o, 0, LANG);
      expect(errorOf(input)).toBe(LANG_CODE);
      expect(document.activeElement).toBe(input);
      expectNothingApplied(o);
    },
  );

  it('idioma vazio → errorRequired', async () => {
    const o = await withTrack({ lang: '' });
    expect(errorOf(trackField(o, 0, LANG))).toBe(REQUIRED);
    expectNothingApplied(o);
  });

  it.each(['', '   '])('rótulo %j → errorRequired', async (label) => {
    const o = await withTrack({ label });
    const input = trackField(o, 0, LABEL);
    expect(errorOf(input)).toBe(REQUIRED);
    expect(document.activeElement).toBe(input);
    expectNothingApplied(o);
  });

  it('rótulo de 101 → Use at most 100 characters.', async () => {
    const o = await withTrack({ label: 'a'.repeat(101) });
    expect(errorOf(trackField(o, 0, LABEL))).toBe(
      'Use at most 100 characters.',
    );
    expectNothingApplied(o);
  });

  it('erro na faixa 2 de 2 → erro só nela, foco nela', async () => {
    const s = await setup('<p></p>');
    const o = await openVideo(s);
    typeInto(field(o, SRC), '/e2e.webm');
    await fillNewTrack(o, { src: '/a.vtt', lang: 'en', label: 'A' });
    await fillNewTrack(o, { src: '/b.vtt', lang: 'en_US', label: 'B' });
    await submit(o);
    expect(errorOf(trackField(o, 0, LANG))).toBeNull();
    expect(errorOf(trackField(o, 1, LANG))).toBe(LANG_CODE);
    expect(document.activeElement).toBe(trackField(o, 1, LANG));
    expectNothingApplied(o);
  });

  it.each([
    ['data:', 'data:image/png;base64,AA=='],
    ['http:', 'http://x.test/a.png'],
  ])('pôster %s → errorMediaUrl', async (_, poster) => {
    const s = await setup('<p></p>');
    const o = await openVideo(s);
    typeInto(field(o, SRC), '/e2e.webm');
    typeInto(field(o, POSTER), poster);
    await submit(o);
    expect(errorOf(field(o, POSTER))).toBe(MEDIA_URL);
    expect(document.activeElement).toBe(field(o, POSTER));
    expectNothingApplied(o);
  });

  it('endereço do vídeo vazio → errorRequired; javascript: → errorMediaUrl', async () => {
    const s = await setup('<p></p>');
    const o = await openVideo(s);
    await submit(o);
    expect(errorOf(field(o, SRC))).toBe(REQUIRED);
    expect(document.activeElement).toBe(field(o, SRC));
    typeInto(field(o, SRC), 'javascript:alert(1)');
    await submit(o);
    expect(errorOf(field(o, SRC))).toBe(MEDIA_URL);
    expectNothingApplied(o);
  });

  it('Fix 2: endereço do vídeo só de espaços → errorRequired, nada aplicado', async () => {
    const s = await setup('<p></p>');
    const o = await openVideo(s);
    typeInto(field(o, SRC), '   ');
    await submit(o);
    expect(errorOf(field(o, SRC))).toBe(REQUIRED);
    expect(document.activeElement).toBe(field(o, SRC));
    expectNothingApplied(o);
  });

  it('Fix 2: endereço da faixa só de espaços → errorRequired', async () => {
    const o = await withTrack({ src: '   ' });
    expect(errorOf(trackField(o, 0, TRACK_SRC))).toBe(REQUIRED);
    expectNothingApplied(o);
  });

  it('Fix 2: pôster só de espaços → aplica sem poster, sem erro no campo', async () => {
    const s = await setup('<p></p>');
    const o = await openVideo(s);
    typeInto(field(o, SRC), '/e2e.webm');
    typeInto(field(o, POSTER), '   ');
    await submit(o);
    expect(errorOf(field(o, POSTER))).toBeNull();
    expect(o.dialog.open).toBe(false);
    expect(html(o)).toBe(VIDEO('src="/e2e.webm"', '>'));
    expectOneStep(o);
  });

  it('Ruling 14: legenda de 301 → Use at most 300 characters.', async () => {
    const s = await setup('<p></p>');
    const o = await openVideo(s);
    typeInto(field(o, SRC), '/e2e.webm');
    typeInto(field(o, CAPTION), 'a'.repeat(301));
    await submit(o);
    expect(errorOf(field(o, CAPTION))).toBe('Use at most 300 characters.');
    expect(document.activeElement).toBe(field(o, CAPTION));
    expectNothingApplied(o);
  });
});

describe('"Padrão" exclusivo (V8)', () => {
  it('marcar a faixa 2 desmarca a 1; default="" só na 2', async () => {
    const s = await setup('<p></p>');
    const o = await openVideo(s);
    typeInto(field(o, SRC), '/e2e.webm');
    await fillNewTrack(o, { src: '/a.vtt', lang: 'en', label: 'A' });
    await fillNewTrack(o, { src: '/b.vtt', lang: 'pt', label: 'B' });
    setChecked(trackField(o, 0, DEFAULT), true);
    await settle(o.fixture);
    setChecked(trackField(o, 1, DEFAULT), true);
    await settle(o.fixture);
    expect(trackField(o, 0, DEFAULT).checked).toBe(false);
    expect(trackField(o, 1, DEFAULT).checked).toBe(true);
    await submit(o);
    expect(html(o)).toBe(
      VIDEO(
        'src="/e2e.webm"',
        `>${TRACK('kind="captions" src="/a.vtt" srclang="en" label="A"')}${TRACK('kind="captions" src="/b.vtt" srclang="pt" label="B" default=""')}`,
      ),
    );
    expectOneStep(o);
  });

  it('desmarcar a única padrão → nenhuma default', async () => {
    const s = await setup(EDIT_DOC);
    selectNode(s.editor, 'rtVideo');
    const o = await openVideo(s);
    setChecked(trackField(o, 0, DEFAULT), false);
    await settle(o.fixture);
    await submit(o);
    expect(html(o)).not.toContain('default=""');
    expectOneStep(o);
  });
});

describe('foco ao acrescentar e remover faixas (V8)', () => {
  async function withTracks(n: number): Promise<Opened> {
    const s = await setup('<p></p>');
    const o = await openVideo(s);
    for (let i = 1; i <= n; i++) {
      await fillNewTrack(o, { src: `/${i}.vtt` });
    }
    return o;
  }

  it('"Acrescentar faixa" foca o tipo da faixa nova', async () => {
    const o = await withTracks(1);
    expect(document.activeElement).toBe(trackField(o, 0, KIND));
    await addTrack(o);
    expect(document.activeElement).toBe(trackField(o, 1, KIND));
    expect(document.activeElement?.tagName).toBe('SELECT');
  });

  it('"Remover faixa 2" de 3 → foco no tipo da nova faixa 2 (a antiga 3)', async () => {
    const o = await withTracks(3);
    buttonByText(o, 'Remove track 2').click();
    await settle(o.fixture);
    expect(fieldsets(o)).toHaveLength(2);
    expect(trackField(o, 1, TRACK_SRC).value).toBe('/3.vtt');
    expect(document.activeElement).toBe(trackField(o, 1, KIND));
    expect(fieldsets(o)[1]?.querySelector('legend')?.textContent?.trim()).toBe(
      'Track 2',
    );
  });

  it('remover a última de 2 → foco no tipo da faixa 1', async () => {
    const o = await withTracks(2);
    buttonByText(o, 'Remove track 2').click();
    await settle(o.fixture);
    expect(fieldsets(o)).toHaveLength(1);
    expect(trackField(o, 0, TRACK_SRC).value).toBe('/1.vtt');
    expect(document.activeElement).toBe(trackField(o, 0, KIND));
  });

  it('remover a única → foco em "Acrescentar faixa"', async () => {
    const o = await withTracks(1);
    buttonByText(o, 'Remove track 1').click();
    await settle(o.fixture);
    expect(fieldsets(o)).toHaveLength(0);
    expect(document.activeElement).toBe(buttonByText(o, ADD));
  });

  it('remover habilita "Acrescentar faixa" de novo no teto', async () => {
    const o = await withTracks(10);
    expect(buttonByText(o, ADD).disabled).toBe(true);
    buttonByText(o, 'Remove track 10').click();
    await settle(o.fixture);
    expect(buttonByText(o, ADD).disabled).toBe(false);
    expect(document.activeElement).toBe(trackField(o, 8, KIND));
  });
});

describe('dica WCAG 1.2.2 (V8)', () => {
  it('visível sem captions, oculta com uma, volta com subtitles', async () => {
    const s = await setup('<p></p>');
    const o = await openVideo(s);
    expect(hintShown(o)).toBe(true);
    await fillNewTrack(o, { kind: 'captions' });
    expect(hintShown(o)).toBe(false);
    chooseOption(
      trackField(o, 0, KIND) as unknown as HTMLSelectElement,
      'subtitles',
    );
    await settle(o.fixture);
    expect(hintShown(o)).toBe(true);
  });
});

describe('Fix 9: grupo das faixas descrito pela dica WCAG 1.2.2', () => {
  function group(o: Opened): HTMLElement {
    const g = o.dialog.querySelector<HTMLElement>('.rte-dialog__tracks');
    if (!g) throw new Error('grupo das faixas ausente');
    return g;
  }

  it('sem captions → aria-describedby aponta para a dica; com captions → sem descrição nem dica', async () => {
    const s = await setup('<p></p>');
    const o = await openVideo(s);
    const id = group(o).getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id ?? '')?.textContent?.trim()).toBe(HINT);
    await fillNewTrack(o, { kind: 'captions' });
    expect(group(o).hasAttribute('aria-describedby')).toBe(false);
    expect(hintShown(o)).toBe(false);
  });
});

describe('comando recusado (V9, Ruling 4)', () => {
  function rawCommands(
    editor: Editor,
  ): Record<string, (...args: unknown[]) => unknown> {
    return (
      editor as unknown as {
        commandManager: {
          rawCommands: Record<string, (...args: unknown[]) => unknown>;
        };
      }
    ).commandManager.rawCommands;
  }

  async function openFromToolbar(
    s: Setup,
    name: string,
  ): Promise<{ o: Opened; origin: HTMLButtonElement }> {
    await settle(s.fixture);
    const root = s.fixture.nativeElement as HTMLElement;
    const origin = [
      ...root.querySelectorAll<HTMLButtonElement>('.rte-toolbar__button'),
    ].find((b) => b.getAttribute('aria-label') === name);
    if (!origin) throw new Error(`botão ${name} ausente`);
    s.host.changes = 0;
    const initial = html(s);
    origin.focus();
    origin.click();
    const dialog = await waitForDialog(s.fixture);
    return { o: { ...s, dialog, initial }, origin };
  }

  async function expectCancelled(
    o: Opened,
    origin: HTMLElement,
    warn: { mock: { calls: unknown[][] } },
  ): Promise<void> {
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    await settle(o.fixture);
    expect(o.dialog.open).toBe(false);
    expect(html(o)).toBe(o.initial);
    expect(o.host.changes).toBe(0);
    expect(warn.mock.calls.filter(([m]) => m === REFUSED)).toHaveLength(1);
    expect(document.activeElement).toBe(origin);
  }

  it('inserir: setVideo devolve false → cancelamento, foco na origem', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = await setup('<p>ab</p>');
    s.editor.view.dom.focus();
    selectText(s.editor, 'ab', 1);
    vi.spyOn(rawCommands(s.editor), 'setVideo').mockReturnValue(() => false);
    const { o, origin } = await openFromToolbar(s, 'Insert video');
    typeInto(field(o, SRC), '/e2e.webm');
    await submit(o);
    await expectCancelled(o, origin, warn);
  });

  it('editar: setNodeSelection aceita e updateVideo recusa → nada despachado', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = await setup(EDIT_DOC);
    s.editor.view.dom.focus();
    selectNode(s.editor, 'rtVideo');
    const raw = rawCommands(s.editor);
    const setNodeSelection = vi.spyOn(raw, 'setNodeSelection');
    vi.spyOn(raw, 'updateVideo').mockReturnValue(() => false);
    const { o, origin } = await openFromToolbar(s, 'Edit video');
    typeInto(field(o, CAPTION), 'Nova');
    await submit(o);
    expect(setNodeSelection).toHaveBeenCalled();
    await expectCancelled(o, origin, warn);
  });
});

function ruleOf(
  config: RteEditorConfig,
  tag: string,
  attr: string,
): RteAttrRule {
  const rule = getHtmlSchema(config).elements[tag]?.attributes[attr]?.rule;
  if (!rule) throw new Error(`regra ${tag}[${attr}] ausente`);
  return rule;
}

const CONFIGS: [string, RteEditorConfig][] = [
  ['padrão', {}],
  ['mediaHosts', { mediaHosts: ['media.example.test'] }],
  ['allowRelativeMedia: false', { allowRelativeMedia: false }],
];

describe('propriedade R6: aceito ⇔ a regra do esquema aceita', () => {
  describe.each<[string, string, string]>([
    ['video', 'src', 'webm'],
    ['video', 'poster', 'png'],
    ['track', 'src', 'vtt'],
  ])('%s[%s] pelo validador do formulário', (tag, attr, ext) => {
    it.each(CONFIGS)('%s', (_, config) => {
      const rule = ruleOf(config, tag, attr);
      const model = signal({ src: '' });
      const f = TestBed.runInInjectionContext(() =>
        form(model, (p) => mediaUrlValidator(p.src, () => rule)),
      );
      fc.assert(
        fc.property(anyMediaUrl(ext), (s) => {
          model.set({ src: s });
          const refused = f
            .src()
            .errors()
            .some((e) => e.kind === 'rteMediaUrl');
          // Endereços aparados (Ruling 11); o vazio é do `required` (Ruling 10).
          const expected =
            s.trim() !== '' && normalizeAttribute(rule, s.trim()) === null;
          expect(refused).toBe(expected);
        }),
        fcOptions(),
      );
    });
  });

  it('track[srclang] pelo validador do formulário (sem trim, Ruling 11)', () => {
    const rule = ruleOf({}, 'track', 'srclang');
    const model = signal({ lang: '' });
    const f = TestBed.runInInjectionContext(() =>
      form(model, (p) => langCodeValidator(p.lang, () => rule)),
    );
    fc.assert(
      fc.property(ANY_LANG, (s) => {
        model.set({ lang: s });
        const refused = f
          .lang()
          .errors()
          .some((e) => e.kind === 'rteLangCode');
        expect(refused).toBe(s !== '' && normalizeAttribute(rule, s) === null);
      }),
      fcOptions(),
    );
  });

  it('pelo DOM do diálogo (20 execuções): vídeo e faixa; aceito ⇒ canônico, recusado ⇒ HTML igual', async () => {
    const config: RteEditorConfig = { mediaHosts: ['media.example.test'] };
    const s = await setup('<p></p>', config);
    const videoRule = ruleOf(config, 'video', 'src');
    const trackRule = ruleOf(config, 'track', 'src');
    const langRule = ruleOf(config, 'track', 'srclang');
    let accepted = 0;
    await fc.assert(
      fc.asyncProperty(
        anyMediaUrl('webm'),
        anyMediaUrl('vtt'),
        ANY_LANG,
        async (videoValue, trackValue, langValue) => {
          cursorAt(s.editor, 1);
          const o = await openVideo(s);
          typeInto(field(o, SRC), videoValue);
          await fillNewTrack(o, {
            src: trackValue,
            lang: langValue,
            label: 'L',
          });
          // O que a pessoa entregou é o valor do campo (o `<input>` tira LF/CR).
          const src = normalizeAttribute(videoRule, field(o, SRC).value.trim());
          const track = normalizeAttribute(
            trackRule,
            trackField(o, 0, TRACK_SRC).value.trim(),
          );
          const lang = normalizeAttribute(
            langRule,
            trackField(o, 0, LANG).value,
          );
          await submit(o);
          if (src === null || track === null || lang === null) {
            expect(o.dialog.open).toBe(true);
            expect(html(o)).toBe(o.initial);
            button(o, '.rte-dialog__cancel').click();
            await settle(o.fixture);
            return;
          }
          accepted++;
          expect(o.dialog.open).toBe(false);
          const parsed = new DOMParser().parseFromString(html(o), 'text/html');
          expect(parsed.querySelector('video')?.getAttribute('src')).toBe(src);
          const t = parsed.querySelector('track');
          expect(t?.getAttribute('src')).toBe(track);
          expect(t?.getAttribute('srclang')).toBe(lang);
          o.editor.commands.undo();
          expect(html(o)).toBe(o.initial);
        },
      ),
      {
        ...fcOptions(20),
        examples: [
          ['/e2e.webm', '/e2e.vtt', 'pt-BR'],
          ['https://media.example.test/a.webm', '/a.vtt', 'en'],
        ],
      },
    );
    // O ramo "aceito" foi exercitado (ao menos os exemplos fixos).
    expect(accepted).toBeGreaterThanOrEqual(2);
  });
});
