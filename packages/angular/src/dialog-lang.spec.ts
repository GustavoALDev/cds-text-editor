import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { getHtmlSchema, normalizeAttribute } from '@comodeviaser/rte-core';
import { getRteHtml } from '@comodeviaser/rte-core/extensions';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RTE_DIALOG_LANGUAGES, RteEditor } from '@comodeviaser/rte-angular';
import type { Editor } from '@tiptap/core';
import fc from 'fast-check';
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

// Spec 05b2a, Tarefa 6: diálogo de idioma (R9).

const RUNS = Number(process.env['FC_RUNS'] ?? 100);
const SEED = process.env['FC_SEED'];

const LANGUAGE = 'Language';
const CODE = 'Language code (BCP 47)';
const DIRECTION = 'Text direction';
const CODE_ERROR = 'Invalid code. Use a BCP 47 tag such as pt-BR.';

const LANG_RULE = (() => {
  const rule = getHtmlSchema({ features: { newsBlocks: true } }).elements[
    'span'
  ]?.attributes['lang']?.rule;
  if (!rule) throw new Error('regra span[lang] ausente');
  return rule;
})();

@Component({
  selector: 'rte-test-lang-host',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    (valueChange)="changes = changes + 1"
    toolbar="full"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('<p>ab</p>');
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

async function setup(doc: string): Promise<Setup> {
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  host.value.set(doc);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  return { fixture, host, editor: host.cmp().editor() as Editor };
}

interface Opened extends Setup {
  dialog: HTMLDialogElement;
  language: HTMLSelectElement;
  direction: HTMLSelectElement;
  initial: string;
}

async function openLang(s: Setup): Promise<Opened> {
  s.host.changes = 0;
  const initial = getRteHtml(s.editor);
  expect(s.host.cmp().openDialog('lang')).toBe(true);
  const dialog = await waitForDialog(s.fixture);
  return {
    ...s,
    dialog,
    language: dialogField(dialog, LANGUAGE) as unknown as HTMLSelectElement,
    direction: dialogField(dialog, DIRECTION) as unknown as HTMLSelectElement,
    initial,
  };
}

async function choose(
  o: Opened,
  select: HTMLSelectElement,
  value: string,
): Promise<void> {
  chooseOption(select, value);
  await settle(o.fixture);
}

async function submit(o: Opened): Promise<void> {
  o.dialog.querySelector<HTMLButtonElement>('.rte-dialog__apply')?.click();
  await settle(o.fixture);
}

function title(dialog: HTMLElement): string | undefined {
  return dialog.querySelector('.rte-dialog__title')?.textContent?.trim();
}

function hasField(dialog: HTMLElement, label: string): boolean {
  return [...dialog.querySelectorAll('.rte-dialog__label')].some(
    (l) => l.textContent?.trim() === label,
  );
}

function errorText(dialog: HTMLElement): string | undefined {
  return dialog.querySelector('.rte-dialog__error')?.textContent?.trim();
}

function expectOneStep(o: Opened): void {
  expect(o.host.changes).toBe(1);
  o.editor.commands.undo();
  expect(getRteHtml(o.editor)).toBe(o.initial);
}

describe('diálogo de idioma (R9)', () => {
  it('lista: 12 idiomas + Other…, padrão en e direção Default', async () => {
    const s = await setup('<p>ab</p>');
    selectText(s.editor, 'ab');
    const o = await openLang(s);
    expect(title(o.dialog)).toBe('Mark language');
    expect([...o.language.options].map((op) => op.value)).toEqual([
      ...RTE_DIALOG_LANGUAGES,
      'other',
    ]);
    expect([...o.language.options].map((op) => op.text.trim())).toContain(
      'Other…',
    );
    expect(o.language.options[3]?.text.trim()).toBe('German');
    expect(o.language.value).toBe('en');
    expect([...o.direction.options].map((op) => op.value)).toEqual([
      '',
      'ltr',
      'rtl',
    ]);
    expect(o.direction.options[0]?.text.trim()).toBe('Default');
    expect(o.direction.value).toBe('');
    expect(hasField(o.dialog, CODE)).toBe(false);
    expect(o.dialog.querySelector('.rte-dialog__remove')).toBeNull();
  });

  it('de da lista → <span lang="de">, 1 emissão, 1 undo', async () => {
    const s = await setup('<p>ab</p>');
    selectText(s.editor, 'ab');
    const o = await openLang(s);
    await choose(o, o.language, 'de');
    await submit(o);
    expect(o.dialog.open).toBe(false);
    expect(getRteHtml(o.editor)).toBe('<p><span lang="de">ab</span></p>');
    expectOneStep(o);
  });

  it.each(['pt-BR', 'zh-Hant-TW'])('Other… %s aceito', async (code) => {
    const s = await setup('<p>ab</p>');
    selectText(s.editor, 'ab');
    const o = await openLang(s);
    await choose(o, o.language, 'other');
    typeInto(dialogField(o.dialog, CODE), code);
    await submit(o);
    expect(getRteHtml(o.editor)).toBe(`<p><span lang="${code}">ab</span></p>`);
    expectOneStep(o);
  });

  it.each(['e', 'português', 'en_US', 'a'.repeat(31), '<x>'])(
    'Other… "%s": Invalid code, nada aplicado',
    async (code) => {
      const s = await setup('<p>ab</p>');
      selectText(s.editor, 'ab');
      const o = await openLang(s);
      await choose(o, o.language, 'other');
      const field = dialogField(o.dialog, CODE);
      typeInto(field, code);
      await submit(o);
      expect(errorText(o.dialog)).toBe(CODE_ERROR);
      expect(field.getAttribute('aria-invalid')).toBe('true');
      expect(o.dialog.open).toBe(true);
      expect(getRteHtml(o.editor)).toBe(o.initial);
      expect(o.host.changes).toBe(0);
    },
  );

  it('Other… vazio: Fill in this field.', async () => {
    const s = await setup('<p>ab</p>');
    selectText(s.editor, 'ab');
    const o = await openLang(s);
    await choose(o, o.language, 'other');
    await submit(o);
    expect(errorText(o.dialog)).toBe('Fill in this field.');
    expect(o.dialog.open).toBe(true);
  });

  it('ar sugere rtl: <span lang="ar" dir="rtl">', async () => {
    const s = await setup('<p>ab</p>');
    selectText(s.editor, 'ab');
    const o = await openLang(s);
    await choose(o, o.language, 'ar');
    expect(o.direction.value).toBe('rtl');
    await submit(o);
    expect(getRteHtml(o.editor)).toBe(
      '<p><span lang="ar" dir="rtl">ab</span></p>',
    );
    expectOneStep(o);
  });

  it('he sugere rtl; ar e depois fr volta a Default (pré-voo 8)', async () => {
    const s = await setup('<p>ab</p>');
    selectText(s.editor, 'ab');
    const o = await openLang(s);
    await choose(o, o.language, 'he');
    expect(o.direction.value).toBe('rtl');
    await choose(o, o.language, 'ar');
    expect(o.direction.value).toBe('rtl');
    await choose(o, o.language, 'fr');
    expect(o.direction.value).toBe('');
    await submit(o);
    expect(getRteHtml(o.editor)).toBe('<p><span lang="fr">ab</span></p>');
  });

  it('direção mudada à mão não volta a Default', async () => {
    const s = await setup('<p>ab</p>');
    selectText(s.editor, 'ab');
    const o = await openLang(s);
    await choose(o, o.language, 'ar');
    await choose(o, o.direction, 'ltr');
    await choose(o, o.language, 'fr');
    expect(o.direction.value).toBe('ltr');
    await submit(o);
    expect(getRteHtml(o.editor)).toBe(
      '<p><span lang="fr" dir="ltr">ab</span></p>',
    );
  });

  it('editar: fr/ltr preenchidos; Remove language tira a marca do trecho inteiro', async () => {
    const s = await setup('<p>x<span lang="fr" dir="ltr">ab</span></p>');
    selectText(s.editor, 'xab', 2);
    const o = await openLang(s);
    expect(title(o.dialog)).toBe('Edit language');
    expect(o.language.value).toBe('fr');
    expect(o.direction.value).toBe('ltr');
    const remove = o.dialog.querySelector<HTMLButtonElement>(
      '.rte-dialog__remove',
    );
    expect(remove?.textContent?.trim()).toBe('Remove language');
    remove?.click();
    await settle(o.fixture);
    expect(o.dialog.open).toBe(false);
    expect(getRteHtml(o.editor)).toBe('<p>xab</p>');
    expectOneStep(o);
  });

  it('editar: trocar o idioma muda o trecho inteiro', async () => {
    const s = await setup('<p>x<span lang="fr" dir="ltr">ab</span></p>');
    selectText(s.editor, 'xab', 2);
    const o = await openLang(s);
    await choose(o, o.language, 'de');
    await choose(o, o.direction, '');
    await submit(o);
    expect(getRteHtml(o.editor)).toBe('<p>x<span lang="de">ab</span></p>');
    expectOneStep(o);
  });

  it('editar código fora da lista: Other… com o código', async () => {
    const s = await setup('<p><span lang="pt-BR">ab</span></p>');
    selectText(s.editor, 'ab', 1);
    const o = await openLang(s);
    expect(o.language.value).toBe('other');
    expect(dialogField(o.dialog, CODE).value).toBe('pt-BR');
  });

  it('cor + idioma: span aninhados (ruling 12 do ADR 0004)', async () => {
    const s = await setup(
      '<p><span data-rt-color="red" style="color: #b3261e">ab</span></p>',
    );
    selectText(s.editor, 'ab');
    const o = await openLang(s);
    await choose(o, o.language, 'de');
    await submit(o);
    expect(getRteHtml(o.editor)).toBe(
      '<p><span data-rt-color="red" style="color: #b3261e"><span lang="de">ab</span></span></p>',
    );
    expectOneStep(o);
  });

  const subtag = fc.stringMatching(/^[a-zA-Z0-9]{1,9}$/);
  const bcp47 = fc
    .tuple(
      fc.stringMatching(/^[a-zA-Z]{1,4}$/),
      fc.array(subtag, { maxLength: 4 }),
    )
    .map(([primary, rest]) => [primary, ...rest].join('-'));

  it('propriedade: Other… aplica ⇔ normalizeAttribute(regra, entrada) ≠ null', async () => {
    const s = await setup('<p>abc</p>');
    await fc.assert(
      fc.asyncProperty(fc.oneof(fc.string(), bcp47), async (input) => {
        selectText(s.editor, 'abc');
        const o = await openLang(s);
        await choose(o, o.language, 'other');
        const field = dialogField(o.dialog, CODE);
        typeInto(field, input);
        // O campo de texto descarta quebras de linha: a entrada é o valor dele.
        const expected = normalizeAttribute(LANG_RULE, field.value);
        await submit(o);
        if (expected === null) {
          expect(o.dialog.open).toBe(true);
          expect(getRteHtml(o.editor)).toBe(o.initial);
          escapeDialog(o.dialog);
          await settle(o.fixture);
        } else {
          expect(o.dialog.open).toBe(false);
          const span = new DOMParser()
            .parseFromString(getRteHtml(o.editor), 'text/html')
            .querySelector('span[lang]');
          expect(span?.getAttribute('lang')).toBe(expected);
          o.editor.commands.undo();
          expect(getRteHtml(o.editor)).toBe(o.initial);
        }
      }),
      { numRuns: RUNS, ...(SEED ? { seed: Number(SEED) } : {}) },
    );
  }, 120_000);
});
