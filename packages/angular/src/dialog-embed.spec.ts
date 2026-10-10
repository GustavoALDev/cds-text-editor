import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { getHtmlSchema, type RteEmbedProvider } from '@comodeviaser/rte-core';
import { RTE_EMBED_PROVIDERS, RTE_VIMEO_PROVIDER } from '@comodeviaser/rte-core/embeds';
import { getRteHtml } from '@comodeviaser/rte-core/extensions';
import { validateHtml } from '@comodeviaser/rte-core/html';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor, type RteEditorConfig } from '@comodeviaser/rte-angular';
import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import fc from 'fast-check';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { embedUrlValidator } from './dialogs/media-validate';
import {
  dialogField,
  installDialogShim,
  typeInto,
  waitForDialog,
} from './testing-support/dialog';
import {
  createTestEditor,
  destroyTestEditors,
  selectText,
} from './testing-support/editors';
import { fcOptions } from './testing-support/media-urls';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';
import { workspacePath } from './testing-support/workspace';

// Spec 05c1, Tarefa 6: diálogo de *embed* (R5, R6 *embed*; V5, V12).

const URL_LABEL = 'Page address (URL)';
const CAPTION = 'Caption';
const REQUIRED = 'Fill in this field.';
const EMBED_URL = 'No enabled provider recognizes this address.';
const REFUSED = '[rte-editor] o editor recusou a mídia; nada foi aplicado.';

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const VIMEO = 'https://vimeo.com/76979871';

/** Provedor do consumidor (R5): host próprio, padrão ancorado. */
const ACME: RteEmbedProvider = {
  id: 'acme',
  name: 'Acme Video',
  hosts: ['player.acme.example'],
  srcPatterns: ['^https://player\\.acme\\.example/v/\\d{1,6}$'],
  match: (url) => /^https:\/\/acme\.example\/watch\/\d{1,6}$/.test(url),
  toEmbed: (url) => {
    const id = /^https:\/\/acme\.example\/watch\/(\d{1,6})$/.exec(url)?.[1];
    return id ? { src: `https://player.acme.example/v/${id}` } : null;
  },
};

@Component({
  selector: 'rte-test-embed-host',
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
  destroyTestEditors();
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

async function openEmbed(s: Setup): Promise<Opened> {
  s.host.changes = 0;
  const initial = html(s);
  expect(s.host.cmp().openDialog('embed')).toBe(true);
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

/**
 * HTML que o core produz para `setEmbed(url, { caption })` num editor de
 * controle com os mesmos provedores (a fonte da verdade, V5), entre `before`
 * e `after`; `null` se o comando recusar.
 */
function controlHtml(
  url: string,
  caption = '',
  providers?: readonly RteEmbedProvider[],
  before = '',
  after = '',
): string | null {
  const editor = createTestEditor(
    `${before}<p></p>${after}`,
    providers ? { embedProviders: providers } : {},
  );
  // Cursor no parágrafo vazio (o core o troca pelo embed, lição 14).
  let empty = -1;
  editor.state.doc.forEach((node, offset) => {
    if (empty < 0 && node.content.size === 0) empty = offset + 1;
  });
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, empty)),
  );
  return editor.commands.setEmbed(url, { caption }) ? getRteHtml(editor) : null;
}

function field(o: Opened, label: string): HTMLInputElement {
  return dialogField(o.dialog, label);
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

function title(o: Opened): string | undefined {
  return o.dialog.querySelector('.rte-dialog__title')?.textContent?.trim();
}

function labelsOf(o: Opened): string[] {
  return [...o.dialog.querySelectorAll('.rte-dialog__label')].map(
    (l) => l.textContent?.trim() ?? '',
  );
}

function hint(o: Opened): string | undefined {
  return o.dialog.querySelector('.rte-dialog__hint')?.textContent?.trim();
}

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

function selectEmbed(editor: Editor): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === 'rtEmbed') found = pos;
    return found < 0;
  });
  expect(found).toBeGreaterThanOrEqual(0);
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, found)),
  );
  return found;
}

function expectEmbedSelected(editor: Editor): void {
  const sel = editor.state.selection;
  expect(sel).toBeInstanceOf(NodeSelection);
  expect((sel as NodeSelection).node.type.name).toBe('rtEmbed');
}

/** "Um passo de desfazer, uma emissão" (D8/D9). */
function expectOneStep(o: Opened): void {
  expect(o.host.changes).toBe(1);
  o.editor.commands.undo();
  expect(html(o)).toBe(o.initial);
}

function expectNothingApplied(o: Opened): void {
  expect(o.dialog.open).toBe(true);
  expect(html(o)).toBe(o.initial);
  expect(o.host.changes).toBe(0);
}

describe('inserir embed (R5, V5)', () => {
  it('campos, dica com os provedores padrão, sem "Remover", foco na URL', async () => {
    const o = await openEmbed(await setup('<p></p>'));
    expect(title(o)).toBe('Insert embedded content');
    expect(labelsOf(o)).toEqual([URL_LABEL, CAPTION]);
    expect(hint(o)).toBe('Accepted: YouTube, Vimeo, Spotify.');
    expect(o.dialog.querySelector('.rte-dialog__remove')).toBeNull();
    expect(o.dialog.querySelector('.rte-dialog__readonly')).toBeNull();
    expect(document.activeElement).toBe(field(o, URL_LABEL));
  });

  it.each([
    YT,
    'https://youtu.be/dQw4w9WgXcQ?t=42',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    VIMEO,
    'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
  ])(
    '%s → o HTML do setEmbed do core, embed selecionado, 1 passo',
    async (url) => {
      const o = await openEmbed(await setup('<p></p>'));
      typeInto(field(o, URL_LABEL), url);
      await submit(o);
      expect(o.dialog.open).toBe(false);
      const expected = controlHtml(url);
      expect(expected).not.toBeNull();
      expect(html(o)).toBe(expected);
      expectEmbedSelected(o.editor);
      expectOneStep(o);
    },
  );

  it('URL aparada e legenda', async () => {
    const o = await openEmbed(await setup('<p></p>'));
    typeInto(field(o, URL_LABEL), `  ${VIMEO}\t`);
    typeInto(field(o, CAPTION), 'Um clipe');
    await submit(o);
    expect(html(o)).toBe(controlHtml(VIMEO, 'Um clipe'));
    expect(html(o)).toContain('<figcaption>Um clipe</figcaption>');
    expectOneStep(o);
  });

  it('provedor do consumidor: na dica e aceito', async () => {
    const providers = [...RTE_EMBED_PROVIDERS, ACME];
    const o = await openEmbed(
      await setup('<p></p>', { embedProviders: providers }),
    );
    expect(hint(o)).toBe('Accepted: YouTube, Vimeo, Spotify, Acme Video.');
    typeInto(field(o, URL_LABEL), 'https://acme.example/watch/42');
    await submit(o);
    const expected = controlHtml(
      'https://acme.example/watch/42',
      '',
      providers,
    );
    expect(expected).toContain('https://player.acme.example/v/42');
    expect(html(o)).toBe(expected);
    expectOneStep(o);
  });
});

describe('recusas (R5)', () => {
  it.each([
    ['outro site', 'https://example.com/x'],
    ['host parecido', 'https://youtube.com.evil.example/watch?v=x'],
    ['javascript:', 'javascript:alert(1)'],
  ])('%s → errorEmbedUrl, foco no campo, nada aplicado', async (_, url) => {
    const o = await openEmbed(await setup('<p></p>'));
    const input = field(o, URL_LABEL);
    typeInto(input, url);
    await submit(o);
    expectNothingApplied(o);
    expect(errorOf(input)).toBe(EMBED_URL);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(input);
  });

  it('YouTube com só Vimeo ativo → errorEmbedUrl; dica só com Vimeo', async () => {
    const o = await openEmbed(
      await setup('<p></p>', { embedProviders: [RTE_VIMEO_PROVIDER] }),
    );
    expect(hint(o)).toBe('Accepted: Vimeo.');
    const input = field(o, URL_LABEL);
    typeInto(input, YT);
    await submit(o);
    expectNothingApplied(o);
    expect(errorOf(input)).toBe(EMBED_URL);
  });

  it('vazio → errorRequired', async () => {
    const o = await openEmbed(await setup('<p></p>'));
    await submit(o);
    expectNothingApplied(o);
    expect(errorOf(field(o, URL_LABEL))).toBe(REQUIRED);
  });

  it('legenda de 301 → Use at most 300 characters.', async () => {
    const o = await openEmbed(await setup('<p></p>'));
    typeInto(field(o, URL_LABEL), VIMEO);
    typeInto(field(o, CAPTION), 'x'.repeat(301));
    await submit(o);
    expectNothingApplied(o);
    expect(errorOf(field(o, CAPTION))).toBe('Use at most 300 characters.');
    expect(document.activeElement).toBe(field(o, CAPTION));
  });
});

describe('editar embed (R5, V5)', () => {
  async function openEdit(): Promise<Opened> {
    const doc = controlHtml(VIMEO, 'Old', undefined, '<p>ab</p>', '<p>cd</p>');
    expect(doc).not.toBeNull();
    const s = await setup(doc as string);
    selectEmbed(s.editor);
    return openEmbed(s);
  }

  it('URL somente leitura (o src do nó), sem <input>; foco na Legenda', async () => {
    const o = await openEdit();
    expect(title(o)).toBe('Embedded content details');
    const ro = o.dialog.querySelector('.rte-dialog__readonly');
    expect(ro?.tagName).toBe('P');
    expect(ro?.textContent?.trim()).toBe(
      'https://player.vimeo.com/video/76979871',
    );
    expect(labelsOf(o)).toEqual([URL_LABEL, CAPTION]);
    expect(o.dialog.querySelectorAll('input')).toHaveLength(1);
    expect(o.dialog.querySelector('.rte-dialog__hint')).toBeNull();
    expect(field(o, CAPTION).value).toBe('Old');
    expect(document.activeElement).toBe(field(o, CAPTION));
    expect(button(o, '.rte-dialog__remove').textContent?.trim()).toBe('Remove');
  });

  it('Fix 8: a URL somente leitura fica num grupo nomeado pelo rótulo', async () => {
    const o = await openEdit();
    const ro = o.dialog.querySelector('.rte-dialog__readonly');
    const group = ro?.closest('[role="group"]');
    expect(group).toBeTruthy();
    const id = group?.getAttribute('aria-labelledby') ?? '';
    expect(id).not.toBe('');
    expect(document.getElementById(id)?.textContent?.trim()).toBe(URL_LABEL);
  });

  it('só a legenda muda; NodeSelection mantida; 1 passo', async () => {
    const o = await openEdit();
    typeInto(field(o, CAPTION), 'Nova');
    await submit(o);
    expect(o.dialog.open).toBe(false);
    expect(html(o)).toBe(
      controlHtml(VIMEO, 'Nova', undefined, '<p>ab</p>', '<p>cd</p>'),
    );
    expectEmbedSelected(o.editor);
    expectOneStep(o);
  });

  it('"Remover" → embed fora, 1 passo', async () => {
    const o = await openEdit();
    button(o, '.rte-dialog__remove').click();
    await settle(o.fixture);
    expect(o.dialog.open).toBe(false);
    expect(html(o)).not.toContain('rt-embed');
    expect(html(o)).toContain('<p>ab</p>');
    expectOneStep(o);
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

  it('inserir: setEmbed recusa na aplicação → cancelamento, foco na origem', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = await setup('<p>ab</p>');
    s.editor.view.dom.focus();
    selectText(s.editor, 'ab', 1);
    const { o, origin } = await openFromToolbar(s, 'Insert embedded content');
    typeInto(field(o, URL_LABEL), VIMEO);
    await settle(o.fixture);
    // O validador já leu o `can()`; a recusa vem só na aplicação.
    vi.spyOn(rawCommands(s.editor), 'setEmbed').mockReturnValue(() => false);
    await submit(o);
    await expectCancelled(o, origin, warn);
  });

  it('editar: setNodeSelection aceita e updateEmbed recusa → nada despachado', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const doc = controlHtml(VIMEO, 'Old', undefined, '<p>ab</p>', '<p>cd</p>');
    const s = await setup(doc as string);
    s.editor.view.dom.focus();
    selectEmbed(s.editor);
    const raw = rawCommands(s.editor);
    const setNodeSelection = vi.spyOn(raw, 'setNodeSelection');
    vi.spyOn(raw, 'updateEmbed').mockReturnValue(() => false);
    const { o, origin } = await openFromToolbar(s, 'Edit embedded content');
    typeInto(field(o, CAPTION), 'Nova');
    await submit(o);
    expect(setNodeSelection).toHaveBeenCalled();
    await expectCancelled(o, origin, warn);
  });
});

/** Ofuscações das URLs geradas (R6): maiúsculas, TAB/LF/CR, `\`, C0, DEL. */
const OBFUSCATION = fc.constantFrom(
  '\t',
  '\n',
  '\r',
  '\\',
  ' ',
  '\u0000',
  '\u001f',
  '\u007f',
);

/** URLs de provedor geradas, com hosts parecidos e ofuscações (R6). */
const PROVIDER_URL: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom('https://', 'HTTPS://', 'http://', '//', '', 'javascript:'),
    fc.constantFrom(
      'www.youtube.com',
      'youtube.com',
      'YOUTUBE.com',
      'youtu.be',
      'm.youtube.com',
      'vimeo.com',
      'player.vimeo.com',
      'open.spotify.com',
      'www.youtube-nocookie.com',
      'youtube.com.evil.example',
      'evil.example',
    ),
    fc.constantFrom(
      '/watch?v=dQw4w9WgXcQ',
      '/dQw4w9WgXcQ?t=42',
      '/shorts/dQw4w9WgXcQ',
      '/embed/dQw4w9WgXcQ',
      '/76979871',
      '/video/76979871',
      '/track/4uLU6hMCjMI75M1A2tKUQC',
      '/embed/track/4uLU6hMCjMI75M1A2tKUQC',
      '/watch?v=short',
      '',
    ),
    fc.array(fc.tuple(fc.nat(), OBFUSCATION), { maxLength: 2 }),
  )
  .map(([scheme, host, path, inserts]) => {
    let out = scheme + host + path;
    for (const [at, ch] of inserts) {
      const i = at % (out.length + 1);
      out = out.slice(0, i) + ch + out.slice(i);
    }
    return out;
  });

const ANY_EMBED_URL = fc.oneof(fc.string({ maxLength: 40 }), PROVIDER_URL);

describe('propriedade R6: aceito ⇔ can().setEmbed do core', () => {
  it('pelo validador do formulário, contra um editor de controle', () => {
    const control = createTestEditor('<p></p>');
    const editor = createTestEditor('<p></p>');
    const model = signal({ url: '' });
    const f = TestBed.runInInjectionContext(() =>
      form(model, (p) => embedUrlValidator(p.url, () => editor)),
    );
    fc.assert(
      fc.property(ANY_EMBED_URL, (s) => {
        model.set({ url: s });
        const refused = f
          .url()
          .errors()
          .some((e) => e.kind === 'rteEmbedUrl');
        // O vazio é do `required` (Ruling 10); URL aparada (Ruling 11).
        const accepted = control.can().setEmbed(s.trim());
        expect(refused).toBe(s !== '' && !accepted);
      }),
      fcOptions(),
    );
  });

  it('sem editor → recusa toda URL não vazia', () => {
    const model = signal({ url: VIMEO });
    const f = TestBed.runInInjectionContext(() =>
      form(model, (p) => embedUrlValidator(p.url, () => null)),
    );
    expect(
      f
        .url()
        .errors()
        .map((e) => e.kind),
    ).toEqual(['rteEmbedUrl']);
  });

  it('pelo DOM do diálogo (20 execuções): aceito ⇒ HTML do core; recusado ⇒ HTML igual', async () => {
    const s = await setup('<p></p>');
    let accepted = 0;
    await fc.assert(
      fc.asyncProperty(ANY_EMBED_URL, async (value) => {
        s.editor.commands.setContent('<p></p>');
        const o = await openEmbed(s);
        typeInto(field(o, URL_LABEL), value);
        // O que a pessoa entregou é o valor do campo (o `<input>` tira LF/CR).
        const expected = controlHtml(field(o, URL_LABEL).value.trim());
        await submit(o);
        if (expected === null) {
          expectNothingApplied(o);
          button(o, '.rte-dialog__cancel').click();
          await settle(o.fixture);
          return;
        }
        accepted++;
        expect(o.dialog.open).toBe(false);
        expect(html(o)).toBe(expected);
      }),
      { ...fcOptions(20), examples: [[YT], [` ${VIMEO} `]] },
    );
    expect(accepted).toBeGreaterThanOrEqual(2);
  });
});

describe('importação (V5): o chunk não importa @comodeviaser/rte-core/embeds', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? sources(path) : [path];
    });
  }

  it('nenhum arquivo de src/dialogs/** o importa', () => {
    const files = sources(workspacePath('packages/angular/src/dialogs'));
    expect(files.some((f) => f.endsWith('embed-form.ts'))).toBe(true);
    const offenders = files.filter((f) =>
      readFileSync(f, 'utf8').includes('rte-core/embeds'),
    );
    expect(offenders).toEqual([]);
  });
});
