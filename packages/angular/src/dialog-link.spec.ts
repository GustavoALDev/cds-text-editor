import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  getLinkAttributes,
  normalizeHref,
  type RteLinkPolicy,
} from '@comodeviaser/rte-core';
import { getRteHtml } from '@comodeviaser/rte-core/extensions';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor, type RteEditorConfig } from '@comodeviaser/rte-angular';
import type { Editor } from '@tiptap/core';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dialogField,
  escapeDialog,
  installDialogShim,
  typeInto,
  setChecked,
  waitForDialog,
} from './testing-support/dialog';
import { selectText } from './testing-support/editors';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';

// Spec 05b2a, Tarefa 6: diálogo de link (R5, R6, R7).

const RUNS = Number(process.env['FC_RUNS'] ?? 100);
const SEED = process.env['FC_SEED'];

const URL_LABEL = 'Address (URL)';
const TEXT_LABEL = 'Text';
const NEW_TAB_LABEL = 'Open in a new tab';
const URL_ERROR =
  'Address not accepted. Check the format or use another address.';

@Component({
  selector: 'rte-test-link-host',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    (valueChange)="changes = changes + 1"
    [toolbar]="toolbar()"
    [options]="options()"
    [readonly]="readonly()"
    [disabled]="disabled()"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('<p>ab</p>');
  readonly toolbar = signal<'full' | false>('full');
  readonly options = signal<RteEditorConfig | undefined>(undefined);
  readonly readonly = signal(false);
  readonly disabled = signal(false);
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
}

async function setup(
  doc: string,
  policy?: Partial<RteLinkPolicy>,
  init: (host: Host) => void = () => undefined,
): Promise<Setup> {
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  host.value.set(doc);
  if (policy) host.options.set({ linkPolicy: policy });
  init(host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  return { fixture, host, editor: host.cmp().editor() as Editor };
}

interface Opened extends Setup {
  dialog: HTMLDialogElement;
  url: HTMLInputElement;
  initial: string;
}

/** Abre o diálogo de link sobre a seleção atual (zera as emissões). */
async function openLink(s: Setup): Promise<Opened> {
  s.host.changes = 0;
  const initial = getRteHtml(s.editor);
  expect(s.host.cmp().openDialog('link')).toBe(true);
  const dialog = await waitForDialog(s.fixture);
  return { ...s, dialog, url: dialogField(dialog, URL_LABEL), initial };
}

function title(dialog: HTMLElement): string | undefined {
  return dialog.querySelector('.rte-dialog__title')?.textContent?.trim();
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

function labelsOf(dialog: HTMLElement): string[] {
  return [...dialog.querySelectorAll('.rte-dialog__label')].map(
    (l) => l.textContent?.trim() ?? '',
  );
}

function errorText(dialog: HTMLElement): string | undefined {
  return dialog.querySelector('.rte-dialog__error')?.textContent?.trim();
}

/** `href` da marca `link` no primeiro texto que a tem (ou `null`). */
function appliedHref(editor: Editor): string | null {
  let href: string | null = null;
  editor.state.doc.descendants((node) => {
    if (href !== null) return false;
    const mark = node.marks.find((m) => m.type.name === 'link');
    if (mark) href = String(mark.attrs['href']);
    return true;
  });
  return href;
}

/** Digitação no cursor, como o ProseMirror (herda as marcas guardadas). */
function typeText(editor: Editor, text: string): void {
  editor.view.dispatch(editor.state.tr.insertText(text));
}

/** Confere "um passo de desfazer, uma emissão" (D8/D9). */
function expectOneStep(o: Opened): void {
  expect(o.host.changes).toBe(1);
  o.editor.commands.undo();
  expect(getRteHtml(o.editor)).toBe(o.initial);
}

describe('modos do diálogo de link (R5)', () => {
  it('inserir: URL e Texto → <a> no cursor, 1 emissão, 1 undo', async () => {
    const s = await setup('<p>ab</p>');
    selectText(s.editor, 'ab', 1);
    const o = await openLink(s);
    expect(title(o.dialog)).toBe('Insert link');
    expect(labelsOf(o.dialog)).toEqual([URL_LABEL, TEXT_LABEL, NEW_TAB_LABEL]);
    expect(o.dialog.querySelector('.rte-dialog__remove')).toBeNull();
    typeInto(o.url, 'site.com');
    typeInto(dialogField(o.dialog, TEXT_LABEL), 'Site');
    await submit(o);
    expect(o.dialog.open).toBe(false);
    expect(getRteHtml(o.editor)).toBe(
      '<p>a<a href="https://site.com/">Site</a>b</p>',
    );
    expectOneStep(o);
  });

  it('inserir: o que se digita depois sai fora do <a>', async () => {
    const s = await setup('<p>ab</p>');
    selectText(s.editor, 'ab', 1);
    const o = await openLink(s);
    typeInto(o.url, 'site.com');
    typeInto(dialogField(o.dialog, TEXT_LABEL), 'Site');
    await submit(o);
    typeText(o.editor, 'z');
    expect(getRteHtml(o.editor)).toBe(
      '<p>a<a href="https://site.com/">Site</a>zb</p>',
    );
  });

  it('inserir sem Texto: Fill in this field., nada aplicado', async () => {
    const s = await setup('<p>ab</p>');
    selectText(s.editor, 'ab', 1);
    const o = await openLink(s);
    typeInto(o.url, 'site.com');
    await submit(o);
    const text = dialogField(o.dialog, TEXT_LABEL);
    expect(errorText(o.dialog)).toBe('Fill in this field.');
    expect(text.getAttribute('aria-invalid')).toBe('true');
    expect(o.dialog.open).toBe(true);
    expect(getRteHtml(o.editor)).toBe(o.initial);
    expect(o.host.changes).toBe(0);
  });

  it('URL vazia: Fill in this field.', async () => {
    const s = await setup('<p>ab</p>');
    selectText(s.editor, 'a');
    const o = await openLink(s);
    await submit(o);
    expect(errorText(o.dialog)).toBe('Fill in this field.');
    expect(o.dialog.open).toBe(true);
  });

  it('aplicar sobre "a": sem campo Texto, <a> na seleção, 1 emissão, 1 undo', async () => {
    const s = await setup('<p>ab</p>');
    selectText(s.editor, 'a');
    const o = await openLink(s);
    expect(title(o.dialog)).toBe('Insert link');
    expect(labelsOf(o.dialog)).toEqual([URL_LABEL, NEW_TAB_LABEL]);
    expect(o.dialog.querySelector('.rte-dialog__remove')).toBeNull();
    typeInto(o.url, 'site.com');
    await submit(o);
    expect(getRteHtml(o.editor)).toBe(
      '<p><a href="https://site.com/">a</a>b</p>',
    );
    expectOneStep(o);
  });

  it('aplicar: o que se digita depois sai fora do <a>', async () => {
    const s = await setup('<p>ab</p>');
    selectText(s.editor, 'a');
    const o = await openLink(s);
    typeInto(o.url, 'site.com');
    await submit(o);
    typeText(o.editor, 'z');
    expect(getRteHtml(o.editor)).toBe(
      '<p><a href="https://site.com/">a</a>zb</p>',
    );
  });

  it('editar com o cursor em "b": URL preenchida e o link inteiro muda', async () => {
    const s = await setup('<p><a href="https://x.com/">abc</a></p>');
    selectText(s.editor, 'abc', 1);
    const o = await openLink(s);
    expect(title(o.dialog)).toBe('Edit link');
    expect(o.url.value).toBe('https://x.com/');
    expect(dialogField(o.dialog, NEW_TAB_LABEL).checked).toBe(false);
    expect(labelsOf(o.dialog)).toEqual([URL_LABEL, NEW_TAB_LABEL]);
    typeInto(o.url, 'y.com');
    await submit(o);
    expect(getRteHtml(o.editor)).toBe(
      '<p><a href="https://y.com/">abc</a></p>',
    );
    expectOneStep(o);
  });

  it('editar: "nova aba" preenchida pelo target da marca', async () => {
    const s = await setup(
      '<p><a href="https://x.com/" target="_blank">abc</a></p>',
    );
    selectText(s.editor, 'abc', 1);
    const o = await openLink(s);
    expect(dialogField(o.dialog, NEW_TAB_LABEL).checked).toBe(true);
  });

  it('editar e digitar no fim do link: sai fora do <a>', async () => {
    const s = await setup('<p><a href="https://x.com/">abc</a>d</p>');
    selectText(s.editor, 'abcd', 1);
    const o = await openLink(s);
    typeInto(o.url, 'y.com');
    await submit(o);
    typeText(o.editor, 'z');
    expect(getRteHtml(o.editor)).toBe(
      '<p><a href="https://y.com/">abc</a>zd</p>',
    );
  });

  it('remover: botão Remove link só no modo editar; tira o link inteiro', async () => {
    const s = await setup('<p><a href="https://x.com/">abc</a></p>');
    selectText(s.editor, 'abc', 1);
    const o = await openLink(s);
    const remove = button(o.dialog, '.rte-dialog__remove');
    expect(remove.textContent?.trim()).toBe('Remove link');
    expect(remove.type).toBe('button');
    const actions = [
      ...o.dialog.querySelectorAll<HTMLButtonElement>(
        '.rte-dialog__actions button',
      ),
    ].map((b) => b.className);
    expect(actions).toEqual([
      'rte-dialog__remove',
      'rte-dialog__cancel',
      'rte-dialog__apply',
    ]);
    remove.click();
    await settle(o.fixture);
    expect(o.dialog.open).toBe(false);
    expect(getRteHtml(o.editor)).toBe('<p>abc</p>');
    expectOneStep(o);
  });

  it('seleção que cobre metade do link: Insert link, aplica só à seleção (Review Focus 3)', async () => {
    const s = await setup('<p>xy<a href="https://x.com/">abc</a></p>');
    selectText(s.editor, 'xyabc', 1, 3);
    const o = await openLink(s);
    expect(title(o.dialog)).toBe('Insert link');
    expect(o.url.value).toBe('');
    expect(o.dialog.querySelector('.rte-dialog__remove')).toBeNull();
    typeInto(o.url, 'z.com');
    await submit(o);
    expect(getRteHtml(o.editor)).toBe(
      '<p>x<a href="https://z.com/">ya</a><a href="https://x.com/">bc</a></p>',
    );
    expectOneStep(o);
  });
});

describe('política de links (R6)', () => {
  it.each([
    ['site.com', 'https://site.com/'],
    ['a@b.com', 'mailto:a@b.com'],
  ])('padrão: %s → %s', async (input, href) => {
    const s = await setup('<p>ab</p>');
    selectText(s.editor, 'a');
    const o = await openLink(s);
    typeInto(o.url, input);
    await submit(o);
    expect(getRteHtml(o.editor)).toBe(`<p><a href="${href}">a</a>b</p>`);
    expect(appliedHref(o.editor)).toBe(normalizeHref(input));
  });

  const LONG = 'https://a.com/' + 'a'.repeat(2049 - 14);
  it.each<[string, string, Partial<RteLinkPolicy> | undefined]>([
    ['javascript:', 'javascript:alert(1)', undefined],
    ['data:', 'data:text/html,x', undefined],
    ['vbscript:', 'vbscript:x', undefined],
    ['2049 caracteres', LONG, undefined],
    ['só espaços', '   ', undefined],
    [
      'domínio bloqueado',
      'https://evil.example/x',
      { blockedDomains: ['evil.example'] },
    ],
    [
      'subdomínio bloqueado',
      'sub.evil.example',
      { blockedDomains: ['evil.example'] },
    ],
    ['relativo proibido', '/caminho', { allowRelative: false }],
    ['âncora proibida', '#ancora', { allowRelative: false }],
    ['mailto fora dos protocolos', 'mailto:a@b.com', { protocols: ['https'] }],
  ])('%s: erro rteLinkUrl, nada aplicado', async (_name, input, policy) => {
    expect(LONG).toHaveLength(2049);
    const s = await setup('<p>ab</p>', policy);
    selectText(s.editor, 'a');
    const o = await openLink(s);
    typeInto(o.url, input);
    await submit(o);
    expect(errorText(o.dialog)).toBe(URL_ERROR);
    expect(o.url.getAttribute('aria-invalid')).toBe('true');
    expect(o.dialog.open).toBe(true);
    expect(getRteHtml(o.editor)).toBe(o.initial);
    expect(o.host.changes).toBe(0);
    expect(normalizeHref(input, policy)).toBeNull();
  });

  it.each<[RteLinkPolicy['target'], boolean]>([
    ['preserve', true],
    ['blank', false],
    ['never', false],
  ])('target %s: "Open in a new tab" presente = %s', async (target, shown) => {
    const s = await setup('<p>ab</p>', { target });
    selectText(s.editor, 'a');
    const o = await openLink(s);
    expect(labelsOf(o.dialog).includes(NEW_TAB_LABEL)).toBe(shown);
  });

  it('nova aba marcada: target="_blank" e rel de getLinkAttributes', async () => {
    const policy: Partial<RteLinkPolicy> = {
      target: 'preserve',
      defaultRel: ['nofollow'],
    };
    const s = await setup('<p>ab</p>', policy);
    selectText(s.editor, 'a');
    const o = await openLink(s);
    typeInto(o.url, 'site.com');
    setChecked(dialogField(o.dialog, NEW_TAB_LABEL), true);
    await submit(o);
    const a = new DOMParser()
      .parseFromString(getRteHtml(o.editor), 'text/html')
      .querySelector('a');
    const expected = getLinkAttributes('https://site.com/', policy, {
      target: '_blank',
    });
    expect(a?.getAttribute('href')).toBe('https://site.com/');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe(expected?.rel);
    expect(expected?.rel).toContain('noopener');
  });

  const bareDomain = fc
    .domain()
    .chain((d) =>
      fc.constantFrom(d, `${d}/x`, `sub.${d}`, `${d}:8080/p?q=1#h`),
    );
  const inputs = fc.oneof(
    fc.string(),
    fc.webUrl({ withQueryParameters: true, withFragments: true }),
    fc.emailAddress(),
    bareDomain,
    fc.constantFrom(
      'javascript:alert(1)',
      'data:text/html,x',
      '/caminho',
      '#ancora',
      'tel:+5511999999999',
      'mailto:a@b.com',
    ),
  );

  it.each<[string, Partial<RteLinkPolicy> | undefined]>([
    ['padrão', undefined],
    ['https sem relativos', { protocols: ['https'], allowRelative: false }],
  ])(
    'propriedade (%s): aplica ⇔ normalizeHref ≠ null; href aplicado = o devolvido',
    async (_name, policy) => {
      const s = await setup('<p>abc</p>', policy);
      await fc.assert(
        fc.asyncProperty(inputs, async (input) => {
          selectText(s.editor, 'abc');
          const o = await openLink(s);
          typeInto(o.url, input);
          // O campo de texto descarta quebras de linha: a entrada é o valor dele.
          const expected = normalizeHref(o.url.value, policy);
          await submit(o);
          if (expected === null) {
            expect(o.dialog.open).toBe(true);
            expect(getRteHtml(o.editor)).toBe(o.initial);
            expect(o.host.changes).toBe(0);
            escapeDialog(o.dialog);
            await settle(o.fixture);
          } else {
            expect(o.dialog.open).toBe(false);
            expect(appliedHref(o.editor)).toBe(expected);
            o.editor.commands.undo();
            expect(getRteHtml(o.editor)).toBe(o.initial);
          }
        }),
        { numRuns: RUNS, ...(SEED ? { seed: Number(SEED) } : {}) },
      );
    },
    120_000,
  );
});

/** `Mod-k` como o jsdom o vê fora do Mac (`Mod` = Ctrl). */
function modK(init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: 'k',
    keyCode: 75,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

async function expectNoDialog(fixture: ComponentFixture<Host>): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await settle(fixture);
    await new Promise((resolve) => setTimeout(resolve));
  }
  expect(
    (fixture.nativeElement as HTMLElement).querySelector('.rte-dialog[open]'),
  ).toBeNull();
}

describe('Mod-K (R7)', () => {
  it('no editável: abre o diálogo de link e consome a tecla', async () => {
    const s = await setup('<p>ab</p>');
    selectText(s.editor, 'a');
    const event = modK();
    s.editor.view.dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const dialog = await waitForDialog(s.fixture);
    expect(title(dialog)).toBe('Insert link');
  });

  it.each<[string, string, (host: Host) => void]>([
    ['bloco de código', '<pre><code>ab</code></pre>', () => undefined],
    ['readonly', '<p>ab</p>', (h) => h.readonly.set(true)],
    ['disabled', '<p>ab</p>', (h) => h.disabled.set(true)],
  ])('%s: nada abre e a tecla não é consumida', async (_name, doc, init) => {
    const s = await setup(doc, undefined, init);
    selectText(s.editor, 'ab', 1);
    const event = modK();
    s.editor.view.dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    await expectNoDialog(s.fixture);
  });

  it('durante composição de IME: nada abre', async () => {
    const s = await setup('<p>ab</p>');
    selectText(s.editor, 'a');
    const dom = s.editor.view.dom;
    dom.dispatchEvent(
      new CompositionEvent('compositionstart', { bubbles: true }),
    );
    const event = modK({ isComposing: true });
    dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    await expectNoDialog(s.fixture);
  });
});
