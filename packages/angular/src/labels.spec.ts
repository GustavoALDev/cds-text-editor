import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChildren,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RTE_HIGHLIGHT_COLORS, RTE_TEXT_COLORS } from '@cds/rte-core';
import {
  getRteHtml,
  RTE_CONTENT_LABELS,
  RTE_SLASH_LABELS,
} from '@cds/rte-core/extensions';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import {
  provideRichText,
  RteEditor,
  RTE_DIALOG_LANGUAGES,
  RTE_LABELS_EN as EN_FROM_ROOT,
  type RteLabels,
  type RteLabelsInput,
  type RteLabelsSource,
} from '@cds/rte-angular';
import {
  RTE_LABELS_EN,
  RTE_LABELS_ES,
  RTE_LABELS_PT_BR,
} from '@cds/rte-angular/i18n';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  dialogField,
  installDialogShim,
  typeInto,
  waitForDialog,
} from './testing-support/dialog';
import { selectText } from './testing-support/editors';
import { fakeCoords, installGeometry } from './testing-support/geometry';
import { installPopoverShim, isPopoverOpen } from './testing-support/popover';
import { mergeLabels, readLabelsSource } from './labels/merge';
import { settle } from './testing-support/render';
import { createFakeUploadAdapter } from './testing-support/fake-upload-adapter';
import { whenUploadReady } from './testing-support/upload-runtime';

function deepKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return [prefix];
  return Object.keys(value)
    .sort()
    .flatMap((key) =>
      deepKeys((value as Record<string, unknown>)[key], `${prefix}.${key}`),
    );
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === 'object')
    return Object.values(value).flatMap(strings);
  return [];
}

function isDeepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true;
  return (
    Object.isFrozen(value) &&
    Object.values(value).every((child) => isDeepFrozen(child))
  );
}

describe('pacotes de rótulos', () => {
  const packs = [
    ['en', RTE_LABELS_EN],
    ['pt-BR', RTE_LABELS_PT_BR],
    ['es', RTE_LABELS_ES],
  ] as const;

  it('têm as mesmas chaves profundas', () => {
    expect(deepKeys(RTE_LABELS_PT_BR)).toEqual(deepKeys(RTE_LABELS_EN));
    expect(deepKeys(RTE_LABELS_ES)).toEqual(deepKeys(RTE_LABELS_EN));
  });

  it('não têm string vazia', () => {
    for (const [, pack] of packs) {
      for (const text of strings(pack)) expect(text).not.toBe('');
    }
  });

  it('interpolam max e actual', () => {
    for (const [, pack] of packs) {
      for (const text of [
        pack.errors.rteMaxChars({ max: 5, actual: 7 }),
        pack.errors.rteMaxWords({ max: 5, actual: 7 }),
      ]) {
        expect(text).toContain('5');
        expect(text).toContain('7');
      }
    }
  });

  it('reutilizam os objetos do core', () => {
    for (const [lang, pack] of packs) {
      expect(pack.content).toBe(RTE_CONTENT_LABELS[lang]);
      expect(pack.slash).toBe(RTE_SLASH_LABELS[lang]);
    }
  });

  it('são congelados em profundidade', () => {
    for (const [, pack] of packs) expect(isDeepFrozen(pack)).toBe(true);
  });

  it('têm a cópia fixada pelo plano', () => {
    expect(RTE_LABELS_EN.editor.ariaLabel).toBe('Rich text editor');
    expect(RTE_LABELS_EN.errors.rteRequired).toBe('This field is required.');
    expect(RTE_LABELS_EN.errors.rteMaxChars({ max: 5, actual: 7 })).toBe(
      'Use at most 5 characters (7 now).',
    );
    expect(RTE_LABELS_EN.errors.rteMaxWords({ max: 5, actual: 7 })).toBe(
      'Use at most 5 words (7 now).',
    );
    expect(RTE_LABELS_PT_BR.editor.ariaLabel).toBe('Editor de texto rico');
    expect(RTE_LABELS_PT_BR.errors.rteRequired).toBe(
      'Este campo é obrigatório.',
    );
    expect(RTE_LABELS_PT_BR.errors.rteMaxChars({ max: 5, actual: 7 })).toBe(
      'Use no máximo 5 caracteres (7 agora).',
    );
    expect(RTE_LABELS_PT_BR.errors.rteMaxWords({ max: 5, actual: 7 })).toBe(
      'Use no máximo 5 palavras (7 agora).',
    );
    expect(RTE_LABELS_ES.editor.ariaLabel).toBe('Editor de texto enriquecido');
    expect(RTE_LABELS_ES.errors.rteRequired).toBe('Este campo es obligatorio.');
    expect(RTE_LABELS_ES.errors.rteMaxChars({ max: 5, actual: 7 })).toBe(
      'Usa como máximo 5 caracteres (7 ahora).',
    );
    expect(RTE_LABELS_ES.errors.rteMaxWords({ max: 5, actual: 7 })).toBe(
      'Usa como máximo 5 palabras (7 ahora).',
    );
  });

  it('toolbar: heading(2|3|4) e colorNames cobrem a paleta nos três pacotes', () => {
    const names = [...RTE_TEXT_COLORS, ...RTE_HIGHLIGHT_COLORS].map(
      (c) => c.name,
    );
    for (const [, pack] of packs) {
      for (const level of [2, 3, 4] as const)
        expect(pack.toolbar.heading(level)).toContain(String(level));
      for (const name of new Set(names))
        expect(pack.toolbar.colorNames[name], name).toEqual(expect.any(String));
    }
  });

  it('toolbar: cópia fixada', () => {
    expect(RTE_LABELS_EN.toolbar.toolbar).toBe('Formatting');
    expect(RTE_LABELS_EN.toolbar.heading(2)).toBe('Heading 2');
    expect(RTE_LABELS_EN.toolbar.strike).toBe('Strikethrough');
    expect(RTE_LABELS_EN.toolbar.colorNames['teal']).toBe('Teal');
    expect(RTE_LABELS_EN.toolbar.spanLimit).toBe(
      'Unavailable: a cell would span more than 100 rows or columns.',
    );
    expect(RTE_LABELS_PT_BR.toolbar.toolbar).toBe('Formatação');
    expect(RTE_LABELS_PT_BR.toolbar.heading(3)).toBe('Título 3');
    expect(RTE_LABELS_PT_BR.toolbar.colorNames['teal']).toBe('Verde-azulado');
    expect(RTE_LABELS_PT_BR.toolbar.readAlso).toBe('Caixa "Leia também"');
    expect(RTE_LABELS_ES.toolbar.toolbar).toBe('Formato');
    expect(RTE_LABELS_ES.toolbar.heading(4)).toBe('Título 4');
    expect(RTE_LABELS_ES.toolbar.colorNames['teal']).toBe('Verde azulado');
    expect(RTE_LABELS_ES.toolbar.mergeCells).toBe('Combinar celdas');
  });

  it('o /i18n reexporta o RTE_LABELS_EN do entry .', () => {
    expect(RTE_LABELS_EN).toBe(EN_FROM_ROOT);
  });
});

describe('rótulos dos menus flutuantes', () => {
  const packs = [
    ['en', RTE_LABELS_EN],
    ['pt-BR', RTE_LABELS_PT_BR],
    ['es', RTE_LABELS_ES],
  ] as const;

  it('floating completa e sem string vazia nos três pacotes', () => {
    for (const [, pack] of packs) {
      expect(Object.keys(pack.floating).length).toBe(19);
      for (const text of strings(pack.floating)) expect(text).not.toBe('');
    }
  });

  it('floating: cópia da tabela', () => {
    expect(RTE_LABELS_EN.floating.openLink).toBe('Opens in a new tab');
    expect(RTE_LABELS_EN.floating.tableMore).toBe('More table operations');
    expect(RTE_LABELS_PT_BR.floating.textMenu).toBe('Formatação do texto');
    expect(RTE_LABELS_PT_BR.floating.imageAlignFull).toBe('Largura total');
    expect(RTE_LABELS_ES.floating.imageAlignFull).toBe('Ancho completo');
    expect(RTE_LABELS_ES.floating.removeLink).toBe('Quitar enlace');
  });

  it('mergeLabels mescla floating por chave, só strings', () => {
    const merged = mergeLabels(RTE_LABELS_EN, {
      floating: { removeLink: 'X', tableMore: 1 as never },
    });
    expect(merged.floating.removeLink).toBe('X');
    expect(merged.floating.tableMore).toBe('More table operations');
  });
});

describe('rótulos dos diálogos', () => {
  const packs = [
    ['en', RTE_LABELS_EN],
    ['pt-BR', RTE_LABELS_PT_BR],
    ['es', RTE_LABELS_ES],
  ] as const;

  it('dialogs: funções e languageNames nos três pacotes', () => {
    for (const [, pack] of packs) {
      const d = pack.dialogs;
      expect(d.errorRange(1, 100)).toContain('1');
      expect(d.errorRange(1, 100)).toContain('100');
      expect(d.errorMaxLength(200)).toContain('200');
      expect(Object.keys(d.languageNames).sort()).toEqual(
        [...RTE_DIALOG_LANGUAGES].sort(),
      );
      for (const text of strings(d)) expect(text).not.toBe('');
    }
  });

  it('dialogs: cópia da tabela', () => {
    expect(RTE_LABELS_EN.dialogs.linkNewTab).toBe('Open in a new tab');
    expect(RTE_LABELS_EN.toolbar.insertTable).toBe('Insert table 3 × 3');
    expect(RTE_LABELS_EN.toolbar.insertTableCustom).toBe('Insert table…');
    expect(RTE_LABELS_PT_BR.toolbar.insertTable).toBe('Inserir tabela 3 × 3');
    expect(RTE_LABELS_PT_BR.toolbar.quoteAuthor).toBe('Autor da citação');
    expect(RTE_LABELS_ES.dialogs.languageNames['he']).toBe('Hebreo');
    expect(RTE_LABELS_ES.toolbar.editLink).toBe('Editar enlace');
    expect(RTE_LABELS_EN.dialogs.errorRange(1, 20)).toBe(
      'Enter a whole number from 1 to 20.',
    );
  });

  it('mergeLabels mescla dialogs por chave e protege as funções', () => {
    const merged = mergeLabels(RTE_LABELS_EN, {
      dialogs: {
        apply: 'OK',
        languageNames: { fr: 'Français' },
        errorRange: () => {
          throw 1;
        },
      },
    });
    expect(merged.dialogs.apply).toBe('OK');
    expect(merged.dialogs.languageNames['fr']).toBe('Français');
    expect(merged.dialogs.languageNames['de']).toBe('German');
    expect(merged.dialogs.errorRange(1, 20)).toBe(
      'Enter a whole number from 1 to 20.',
    );
  });

  it('mergeLabels ignora tipos errados e chaves fora de RTE_DIALOG_LANGUAGES', () => {
    const merged = mergeLabels(RTE_LABELS_EN, {
      dialogs: { apply: 1, languageNames: { xx: 'X' } },
    } as unknown as RteLabelsInput);
    expect(merged.dialogs.apply).toBe('Apply');
    expect(Object.hasOwn(merged.dialogs.languageNames, 'xx')).toBe(false);
  });
});

describe('mergeLabels', () => {
  const base: RteLabels = RTE_LABELS_EN;

  it('sem entrada devolve a base', () => {
    expect(mergeLabels(base, undefined)).toBe(base);
  });

  it('mescla calloutTitles por variante', () => {
    const out = mergeLabels(base, {
      content: { calloutTitles: { info: 'I' } },
    });
    expect(out.content.calloutTitles.info).toBe('I');
    expect(out.content.calloutTitles.warning).toBe('Warning');
    expect(out.slash).toBe(base.slash);
  });

  it('ignora valores do tipo errado', () => {
    const input = { editor: { ariaLabel: 1 } } as unknown as RteLabelsInput;
    expect(mergeLabels(base, input).editor.ariaLabel).toBe('Rich text editor');
  });

  it('ignora chaves herdadas', () => {
    const input = Object.create({
      editor: { ariaLabel: 'herdado' },
    }) as RteLabelsInput;
    expect(mergeLabels(base, input).editor.ariaLabel).toBe('Rich text editor');
  });

  it('aceita slash[id] válido e ignora keywords inválidas', () => {
    const ok = mergeLabels(base, {
      slash: { table: { title: 'Grade', keywords: ['a'] } },
    });
    expect(ok.slash.table).toEqual({ title: 'Grade', keywords: ['a'] });
    expect(ok.slash.image).toBe(base.slash.image);
    const bad = mergeLabels(base, {
      slash: { table: { title: 'Grade', keywords: 'x' } },
    } as unknown as RteLabelsInput);
    expect(bad.slash.table).toBe(base.slash.table);
    const badItem = mergeLabels(base, {
      slash: { table: { title: 'G', keywords: [1] } },
    } as unknown as RteLabelsInput);
    expect(badItem.slash.table).toBe(base.slash.table);
  });

  it('funções que lançam ou devolvem não-string caem no rótulo da base', () => {
    const out = mergeLabels(base, {
      errors: {
        rteMaxChars: () => {
          throw new Error('x');
        },
        rteMaxWords: (() => 1) as unknown as () => string,
      },
      content: {
        taskCheckbox: () => {
          throw new Error('x');
        },
      },
    });
    expect(out.errors.rteMaxChars({ max: 5, actual: 7 })).toBe(
      base.errors.rteMaxChars({ max: 5, actual: 7 }),
    );
    expect(out.errors.rteMaxWords({ max: 5, actual: 7 })).toBe(
      base.errors.rteMaxWords({ max: 5, actual: 7 }),
    );
    expect(out.content.taskCheckbox('a')).toBe(base.content.taskCheckbox('a'));
  });

  it('getter ou armadilha de Proxy que lança caem no rótulo da base', () => {
    const getter = {
      get editor(): never {
        throw new Error('getter');
      },
      errors: {
        get rteRequired(): never {
          throw new Error('getter');
        },
      },
      content: {
        calloutTitles: {
          get info(): never {
            throw new Error('getter');
          },
          warning: 'W',
        },
      },
    } as unknown as RteLabelsInput;
    expect(() => mergeLabels(base, getter)).not.toThrow();
    const fromGetter = mergeLabels(base, getter);
    expect(fromGetter.editor).toEqual(base.editor);
    expect(fromGetter.errors.rteRequired).toBe(base.errors.rteRequired);
    expect(fromGetter.content.calloutTitles.info).toBe(
      base.content.calloutTitles.info,
    );
    expect(fromGetter.content.calloutTitles.warning).toBe('W');

    // `get` e `getOwnPropertyDescriptor` são as armadilhas que a mescla
    // aciona; `has` e `ownKeys` não são lidas, mas também não podem vazar.
    for (const trap of ['get', 'getOwnPropertyDescriptor', 'has', 'ownKeys']) {
      const handler = {
        [trap]: () => {
          throw new Error(trap);
        },
      };
      const reached = trap === 'get' || trap === 'getOwnPropertyDescriptor';
      const top = new Proxy({ editor: { ariaLabel: 'X' } }, handler);
      const nested = new Proxy(
        { table: { title: 'T', keywords: [] } },
        handler,
      );
      const keywords = new Proxy(['k'], handler);
      const input = {
        slash: nested,
        content: { calloutTitles: top },
        errors: top,
      } as unknown as RteLabelsInput;
      expect(() => mergeLabels(base, top as RteLabelsInput)).not.toThrow();
      expect(mergeLabels(base, top as RteLabelsInput).editor).toEqual(
        reached ? base.editor : { ariaLabel: 'X' },
      );
      expect(() => mergeLabels(base, input)).not.toThrow();
      const out = mergeLabels(base, input);
      expect(out.slash.table).toEqual(
        reached ? base.slash.table : { title: 'T', keywords: [] },
      );
      expect(out.content.calloutTitles).toEqual(base.content.calloutTitles);
      expect(out.errors.rteRequired).toBe(base.errors.rteRequired);
      const withKeywords = {
        slash: { table: { title: 'T', keywords } },
      } as unknown as RteLabelsInput;
      expect(() => mergeLabels(base, withKeywords)).not.toThrow();
    }
  });

  it('mescla toolbar por chave', () => {
    const out = mergeLabels(base, {
      toolbar: {
        bold: 'B',
        colorNames: { red: 'R' },
        heading: () => {
          throw 1;
        },
      },
    } as unknown as RteLabelsInput);
    expect(out.toolbar.bold).toBe('B');
    expect(out.toolbar.colorNames['red']).toBe('R');
    expect(out.toolbar.colorNames['blue']).toBe('Blue');
    expect(out.toolbar.heading(2)).toBe('Heading 2');
    expect(out.toolbar.italic).toBe('Italic');
    const custom = mergeLabels(base, {
      toolbar: { heading: (n) => `H${n}` },
    });
    expect(custom.toolbar.heading(3)).toBe('H3');
  });

  it('toolbar com valor do tipo errado é ignorado', () => {
    const out = mergeLabels(base, {
      toolbar: { bold: 1, colorNames: { red: 2 } },
    } as unknown as RteLabelsInput);
    expect(out.toolbar.bold).toBe('Bold');
    expect(out.toolbar.colorNames['red']).toBe('Red');
  });

  it('usa funções válidas do consumidor', () => {
    const out = mergeLabels(base, {
      errors: { rteMaxChars: ({ max }) => `max ${max}` },
    });
    expect(out.errors.rteMaxChars({ max: 3, actual: 9 })).toBe('max 3');
  });
});

describe('readLabelsSource', () => {
  it('lê objetos e funções', () => {
    const obj = { editor: { ariaLabel: 'X' } };
    expect(readLabelsSource(obj)).toBe(obj);
    expect(readLabelsSource(() => obj)).toBe(obj);
    expect(readLabelsSource(undefined)).toBeUndefined();
  });

  it('função que lança ou devolve não-objeto vira undefined', () => {
    expect(
      readLabelsSource(() => {
        throw 1;
      }),
    ).toBeUndefined();
    expect(
      readLabelsSource((() => 1) as unknown as () => RteLabelsInput),
    ).toBeUndefined();
  });
});

const PACKS = {
  en: RTE_LABELS_EN,
  'pt-BR': RTE_LABELS_PT_BR,
  es: RTE_LABELS_ES,
} as const;

const CONTENT =
  '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">X</label></li></ul>' +
  '<aside class="rt-callout rt-callout--warning" role="note"><p class="rt-callout__title"></p><p>corpo</p></aside>';

@Component({
  selector: 'rte-test-live-labels',
  imports: [RteEditor],
  template: `<rte-editor
      [value]="content"
      [labels]="labels()"
      (valueChange)="writes = writes + 1"
    />
    <rte-editor
      [labels]="labels()"
      [placeholder]="placeholder()"
      (valueChange)="writes = writes + 1"
    />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class LiveLabelsHost {
  readonly content = CONTENT;
  readonly lang = signal<keyof typeof PACKS>('en');
  readonly labels = signal<RteLabelsSource | undefined>(
    () => PACKS[this.lang()],
  );
  readonly placeholder = signal('A');
  writes = 0;
  readonly editors = viewChildren(RteEditor);
}

describe('no editor', () => {
  async function setup(providers: (Provider | EnvironmentProviders)[] = []) {
    TestBed.configureTestingModule({ providers });
    const fixture = TestBed.createComponent(LiveLabelsHost);
    fixture.autoDetectChanges();
    await settle(fixture);
    const host = fixture.componentInstance;
    const [full, empty] = host.editors().map((c) => c.editor() as Editor) as [
      Editor,
      Editor,
    ];
    const read = () => ({
      aria: full.view.dom.getAttribute('aria-label'),
      title: full.view.dom
        .querySelector('p.rt-callout__title')
        ?.getAttribute('data-placeholder'),
      task: full.view.dom
        .querySelector('li.rt-task input')
        ?.getAttribute('aria-label'),
    });
    return { fixture, host, full, empty, read };
  }

  it('trocar o idioma atualiza nome, título vazio e tarefas sem editar o texto', async () => {
    const { fixture, host, full, read } = await setup();
    expect(read()).toEqual({
      aria: 'Rich text editor',
      title: 'Warning',
      task: 'Task: X',
    });
    // O documento não muda (a transação é só de meta). O `getRteHtml`
    // escreve o rótulo atual no título vazio da caixa (B12 da 03c), então só
    // esse texto acompanha o idioma.
    const doc = full.state.doc;
    const html = getRteHtml(full);
    expect(html).toContain('<p class="rt-callout__title">Warning</p>');

    host.lang.set('pt-BR');
    await settle(fixture);
    expect(read()).toEqual({
      aria: 'Editor de texto rico',
      title: 'Atenção',
      task: 'Tarefa: X',
    });
    expect(host.writes).toBe(0);
    expect(full.state.doc).toBe(doc);
    expect(getRteHtml(full)).toBe(html.replace('Warning', 'Atenção'));

    host.lang.set('es');
    await settle(fixture);
    expect(read()).toEqual({
      aria: 'Editor de texto enriquecido',
      title: 'Atención',
      task: 'Tarea: X',
    });
    expect(host.writes).toBe(0);
    expect(full.state.doc).toBe(doc);
    expect(getRteHtml(full)).toBe(html.replace('Warning', 'Atención'));
  });

  it('o placeholder muda ao vivo no documento vazio', async () => {
    const { fixture, host, empty } = await setup();
    const p = () => empty.view.dom.querySelector('p.rte-placeholder--doc');
    expect(p()?.getAttribute('data-placeholder')).toBe('A');
    host.placeholder.set('B');
    await settle(fixture);
    expect(p()?.getAttribute('data-placeholder')).toBe('B');
    expect(empty.view.dom.getAttribute('aria-placeholder')).toBe('B');
    expect(host.writes).toBe(0);
  });

  it('fonte que lança vale en', async () => {
    const { fixture, host, read } = await setup();
    host.lang.set('pt-BR');
    await settle(fixture);
    host.labels.set(() => {
      throw new Error('falhou');
    });
    await settle(fixture);
    expect(read()).toEqual({
      aria: 'Rich text editor',
      title: 'Warning',
      task: 'Task: X',
    });
  });

  it('getter ou Proxy que lança (entrada e provider) valem en, sem exceção', async () => {
    const throwing = new Proxy(
      {},
      {
        get: () => {
          throw new Error('get');
        },
        getOwnPropertyDescriptor: () => {
          throw new Error('descriptor');
        },
        ownKeys: () => {
          throw new Error('ownKeys');
        },
      },
    ) as RteLabelsInput;
    const getter = {
      get editor(): never {
        throw new Error('getter');
      },
      get content(): never {
        throw new Error('getter');
      },
    } as unknown as RteLabelsInput;
    const { fixture, host, read } = await setup([
      provideRichText({ labels: throwing }),
    ]);
    expect(read()).toEqual({
      aria: 'Rich text editor',
      title: 'Warning',
      task: 'Task: X',
    });
    host.labels.set(getter);
    await settle(fixture);
    expect(read()).toEqual({
      aria: 'Rich text editor',
      title: 'Warning',
      task: 'Task: X',
    });
    host.labels.set(undefined);
    await settle(fixture);
    expect(read().aria).toBe('Rich text editor');
    expect(fixture.nativeElement.querySelectorAll('.rte-content').length).toBe(
      2,
    );
  });

  it('prioridade: entrada labels > provideRichText > en', async () => {
    const { fixture, host, read } = await setup([
      provideRichText({ labels: () => PACKS.es }),
    ]);
    expect(read().aria).toBe('Rich text editor');
    host.labels.set(undefined);
    await settle(fixture);
    expect(read()).toEqual({
      aria: 'Editor de texto enriquecido',
      title: 'Atención',
      task: 'Tarea: X',
    });
    host.labels.set({ editor: { ariaLabel: 'I' } });
    await settle(fixture);
    expect(read()).toEqual({
      aria: 'I',
      title: 'Atención',
      task: 'Tarea: X',
    });
  });
});

describe('rótulos dos diálogos ao vivo (R16)', () => {
  it('trocar o idioma com o diálogo de link aberto e erro visível atualiza os textos sem fechar nem apagar', async () => {
    const restoreDialog = installDialogShim();
    const restorePopover = installPopoverShim();
    try {
      const fixture = TestBed.createComponent(LiveLabelsHost);
      fixture.autoDetectChanges();
      await settle(fixture);
      const host = fixture.componentInstance;
      const cmp = host.editors()[0] as RteEditor;
      const editor = cmp.editor() as Editor;
      selectText(editor, 'corpo');
      let transactions = 0;
      editor.on('transaction', ({ transaction }) => {
        if (transaction.docChanged) transactions++;
      });
      const doc = editor.state.doc;

      expect(cmp.openDialog('link')).toBe(true);
      const dialog = await waitForDialog(fixture);
      const url = dialogField(dialog, 'Address (URL)');
      typeInto(url, 'x y');
      dialog.querySelector<HTMLButtonElement>('.rte-dialog__apply')?.click();
      await settle(fixture);
      const text = (selector: string) =>
        dialog.querySelector(selector)?.textContent?.trim();
      expect(text('.rte-dialog__error')).toBe(
        'Address not accepted. Check the format or use another address.',
      );

      host.lang.set('pt-BR');
      await settle(fixture);
      expect(dialog.open).toBe(true);
      expect(text('.rte-dialog__title')).toBe('Inserir link');
      expect(text('.rte-dialog__apply')).toBe('Aplicar');
      expect(text('.rte-dialog__error')).toBe(
        'Endereço não aceito. Confira o formato ou use outro endereço.',
      );
      expect(dialogField(dialog, 'Endereço (URL)')).toBe(url);
      expect(url.value).toBe('x y');
      expect(transactions).toBe(0);
      expect(editor.state.doc).toBe(doc);
      expect(host.writes).toBe(0);
    } finally {
      TestBed.resetTestingModule();
      restorePopover();
      restoreDialog();
    }
  });
});

// G19 (spec 05c1, V14): os diálogos de mídia trocam todos os textos ao vivo.

const MEDIA_IMAGE_DOC =
  '<p>ab</p><figure class="rt-figure rt-figure--center"><img src="/a.png" alt="A" width="800" height="600" loading="lazy" decoding="async"></figure><p>cd</p>';

@Component({
  selector: 'rte-test-live-media',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    [labels]="labels()"
    toolbar="full"
    (valueChange)="writes = writes + 1"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class LiveMediaHost {
  readonly value = signal('<p></p>');
  readonly lang = signal<keyof typeof PACKS>('en');
  readonly labels = signal<RteLabelsSource | undefined>(
    () => PACKS[this.lang()],
  );
  writes = 0;
  readonly cmp = viewChildren(RteEditor);
}

/** Textos visíveis do diálogo, na ordem do documento. */
function dialogTexts(dialog: HTMLDialogElement): string[] {
  return [
    ...dialog.querySelectorAll(
      '.rte-dialog__title, .rte-dialog__label, .rte-dialog__hint, .rte-dialog__error, .rte-dialog__subtitle, .rte-dialog__legend, button, option',
    ),
  ].map((el) => el.textContent?.trim() ?? '');
}

describe('rótulos dos diálogos de mídia ao vivo (G19)', () => {
  interface Live {
    fixture: ReturnType<typeof TestBed.createComponent<LiveMediaHost>>;
    host: LiveMediaHost;
    cmp: RteEditor;
    editor: Editor;
  }

  async function setup(doc: string): Promise<Live> {
    const fixture = TestBed.createComponent(LiveMediaHost);
    const host = fixture.componentInstance;
    host.value.set(doc);
    fixture.autoDetectChanges();
    await settle(fixture);
    const cmp = host.cmp()[0] as RteEditor;
    return { fixture, host, cmp, editor: cmp.editor() as Editor };
  }

  /**
   * Abre `kind`, deixa `fill` digitar e mostrar um erro, troca para pt-BR e
   * devolve o diálogo; confere que nada foi aplicado nem emitido.
   */
  async function switchWhileOpen(
    live: Live,
    kind: 'image' | 'video' | 'embed',
    fill: (dialog: HTMLDialogElement) => Promise<void>,
  ): Promise<HTMLDialogElement> {
    const { fixture, host, cmp, editor } = live;
    let transactions = 0;
    editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged) transactions++;
    });
    const doc = editor.state.doc;
    host.writes = 0;
    expect(cmp.openDialog(kind)).toBe(true);
    const dialog = await waitForDialog(fixture);
    await fill(dialog);
    dialog.querySelector<HTMLButtonElement>('.rte-dialog__apply')?.click();
    await settle(fixture);
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('.rte-dialog__error')).not.toBeNull();

    host.lang.set('pt-BR');
    await settle(fixture);
    expect(dialog.open).toBe(true);
    expect(transactions).toBe(0);
    expect(editor.state.doc).toBe(doc);
    expect(host.writes).toBe(0);
    return dialog;
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
  });

  it('imagem (editar) com erro visível: título, rótulos, dicas, erro, alinhamentos e ações em pt-BR; valores intactos', async () => {
    const live = await setup(MEDIA_IMAGE_DOC);
    let found = -1;
    live.editor.state.doc.descendants((node, pos) => {
      if (found < 0 && node.type.name === 'rtImage') found = pos;
      return found < 0;
    });
    live.editor.view.dispatch(
      live.editor.state.tr.setSelection(
        NodeSelection.create(live.editor.state.doc, found),
      ),
    );
    let src!: HTMLInputElement;
    let alt!: HTMLInputElement;
    let width!: HTMLInputElement;
    const dialog = await switchWhileOpen(live, 'image', async (d) => {
      src = dialogField(d, 'Image address (URL)');
      alt = dialogField(d, 'Alternative text');
      width = dialogField(d, 'Width (px)');
      typeInto(src, 'javascript:x');
      typeInto(alt, 'Uma foto');
      typeInto(width, '640');
    });

    expect(dialogTexts(dialog)).toEqual([
      'Detalhes da imagem',
      'Endereço da imagem (URL)',
      'Use https://… ou um caminho que comece com /.',
      'Endereço não aceito. Use https:// ou um caminho que comece com /, num host permitido.',
      'Texto alternativo',
      'Descreva o que a imagem mostra. Marque "Imagem decorativa" só se ela não acrescentar informação.',
      'Imagem decorativa',
      'Legenda',
      'Crédito',
      'Alinhamento',
      'Alinhar à esquerda',
      'Centralizar',
      'Alinhar à direita',
      'Largura total',
      'Largura (px)',
      'Deixe vazio para o tamanho natural.',
      'Remover',
      'Cancelar',
      'Aplicar',
    ]);
    expect(dialogField(dialog, 'Endereço da imagem (URL)')).toBe(src);
    expect(dialogField(dialog, 'Texto alternativo')).toBe(alt);
    expect(src.value).toBe('javascript:x');
    expect(alt.value).toBe('Uma foto');
    expect(width.value).toBe('640');
  });

  it('vídeo (inserir) com 3 faixas e um erro visível: legendas Faixa 1…3, "Remover faixa 2" e erro em pt-BR; valores intactos', async () => {
    const live = await setup('<p></p>');
    let inputs: HTMLInputElement[] = [];
    const dialog = await switchWhileOpen(live, 'video', async (d) => {
      typeInto(dialogField(d, 'Video address (URL)'), '/v.webm');
      typeInto(dialogField(d, 'Caption'), 'Aula');
      for (let i = 0; i < 3; i++) {
        d.querySelector<HTMLButtonElement>('.rte-dialog__track-add')?.click();
        await settle(live.fixture);
      }
      const sets = [
        ...d.querySelectorAll<HTMLFieldSetElement>('.rte-dialog__fieldset'),
      ];
      expect(sets).toHaveLength(3);
      // Faixa 2 sem rótulo: o único erro visível.
      const values = [
        ['/1.vtt', 'en', 'English'],
        ['/2.vtt', 'es', ''],
        ['/3.vtt', 'fr', 'Français'],
      ];
      sets.forEach((set, i) => {
        const fields = [
          ...set.querySelectorAll<HTMLInputElement>('input.rte-dialog__input'),
        ];
        fields.forEach((input, j) => typeInto(input, values[i]![j]!));
      });
      await settle(live.fixture);
      inputs = [...d.querySelectorAll<HTMLInputElement>('input')];
    });
    const before = inputs.map((i) =>
      i.type === 'checkbox' ? i.checked : i.value,
    );

    const track = (n: number) => [
      `Faixa ${n}`,
      'Tipo',
      'Legendas para surdos (falas e sons)',
      'Legendas (tradução)',
      'Endereço da faixa (.vtt)',
      'Código do idioma (BCP 47)',
      'Rótulo',
      ...(n === 2 ? ['Preencha este campo.'] : []),
      'Padrão',
      `Remover faixa ${n}`,
    ];
    expect(dialogTexts(dialog)).toEqual([
      'Inserir vídeo',
      'Endereço do vídeo (URL)',
      'Use https://… ou um caminho que comece com /.',
      'Endereço da imagem de capa (opcional)',
      'Legenda (abaixo do vídeo)',
      'Faixas de texto',
      ...track(1),
      ...track(2),
      ...track(3),
      'Acrescentar faixa',
      'Cancelar',
      'Aplicar',
    ]);
    expect(
      [...dialog.querySelectorAll('.rte-dialog__legend')].map((l) =>
        l.textContent?.trim(),
      ),
    ).toEqual(['Faixa 1', 'Faixa 2', 'Faixa 3']);
    expect(
      [
        ...dialog.querySelectorAll('.rte-dialog__track-remove'),
      ][1]?.textContent?.trim(),
    ).toBe('Remover faixa 2');
    // Os mesmos elementos, com os mesmos valores.
    expect([...dialog.querySelectorAll<HTMLInputElement>('input')]).toEqual(
      inputs,
    );
    expect(
      inputs.map((i) => (i.type === 'checkbox' ? i.checked : i.value)),
    ).toEqual(before);
    expect(before).toContain('/v.webm');
    expect(before).toContain('Français');
  });

  it('embed (inserir) com erro visível: título, rótulos, dica com provedores, erro e ações em pt-BR; valores intactos', async () => {
    const live = await setup('<p></p>');
    let url!: HTMLInputElement;
    let caption!: HTMLInputElement;
    const dialog = await switchWhileOpen(live, 'embed', async (d) => {
      url = dialogField(d, 'Page address (URL)');
      caption = dialogField(d, 'Caption');
      typeInto(url, 'https://example.com/x');
      typeInto(caption, 'Um vídeo');
    });

    expect(dialogTexts(dialog)).toEqual([
      'Inserir conteúdo incorporado',
      'Endereço da página (URL)',
      'Aceitos: YouTube, Vimeo, Spotify.',
      'Nenhum provedor ativo reconhece este endereço.',
      'Legenda',
      'Cancelar',
      'Aplicar',
    ]);
    expect(dialogField(dialog, 'Endereço da página (URL)')).toBe(url);
    expect(url.value).toBe('https://example.com/x');
    expect(caption.value).toBe('Um vídeo');
  });
});

const LINK_DOC = '<p>Texto <a href="https://example.com/">exemplo</a> fim</p>';

@Component({
  selector: 'rte-test-live-floating',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="content"
    [labels]="labels()"
    (valueChange)="writes = writes + 1"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class LiveFloatingHost {
  readonly content = LINK_DOC;
  readonly lang = signal<keyof typeof PACKS>('en');
  readonly labels = signal<RteLabelsSource | undefined>(
    () => PACKS[this.lang()],
  );
  writes = 0;
  readonly cmp = viewChildren(RteEditor);
}

describe('rótulos dos menus flutuantes ao vivo (R13)', () => {
  it('trocar o idioma com o menu de link visível atualiza aria-label e title sem fechar nem editar', async () => {
    const restorePopover = installPopoverShim();
    const editable = { top: 100, left: 100, right: 900, bottom: 700 };
    const block = { top: 300, left: 150, right: 450, bottom: 400 };
    const restoreGeometry = installGeometry({
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
    });
    let restoreCoords: (() => void) | undefined;
    try {
      const fixture = TestBed.createComponent(LiveFloatingHost);
      fixture.autoDetectChanges();
      await settle(fixture);
      const host = fixture.componentInstance;
      const editor = (host.cmp()[0] as RteEditor).editor() as Editor;
      restoreCoords = fakeCoords(editor, (pos) => ({
        top: 200,
        bottom: 220,
        left: 100 + pos * 2,
        right: 100 + pos * 2,
      }));
      let transactions = 0;
      editor.on('transaction', ({ transaction }) => {
        if (transaction.docChanged) transactions++;
      });
      const doc = editor.state.doc;
      editor.view.dom.focus();
      selectText(editor, 'exemplo', 2);
      await settle(fixture);

      const el = fixture.nativeElement as HTMLElement;
      const menu = el.querySelector<HTMLElement>('.rte-floating--link');
      if (!menu) throw new Error('menu de link ausente');
      expect(isPopoverOpen(menu)).toBe(true);
      const read = () => ({
        menu: menu.getAttribute('aria-label'),
        edit: menu
          .querySelector('button[aria-haspopup="dialog"]')
          ?.getAttribute('aria-label'),
        remove: menu
          .querySelector('button:not([aria-haspopup])')
          ?.getAttribute('aria-label'),
        address: menu
          .querySelector('.rte-floating__link')
          ?.getAttribute('title'),
      });
      expect(read()).toEqual({
        menu: 'Link',
        edit: 'Edit link',
        remove: 'Remove link',
        address: 'Opens in a new tab',
      });

      host.lang.set('pt-BR');
      await settle(fixture);
      expect(isPopoverOpen(menu)).toBe(true);
      expect(read()).toEqual({
        menu: 'Link',
        edit: 'Editar link',
        remove: 'Remover link',
        address: 'Abre em nova aba',
      });
      expect(transactions).toBe(0);
      expect(editor.state.doc).toBe(doc);
      expect(host.writes).toBe(0);
    } finally {
      TestBed.resetTestingModule();
      restoreCoords?.();
      restoreGeometry();
      restorePopover();
    }
  });
});

describe('rótulos de mídia (05c1)', () => {
  const packs = [
    ['en', RTE_LABELS_EN],
    ['pt-BR', RTE_LABELS_PT_BR],
    ['es', RTE_LABELS_ES],
  ] as const;
  const KEYS = {
    toolbar: ['image', 'editImage', 'video', 'editVideo', 'embed', 'editEmbed'],
    floating: [
      'videoMenu',
      'embedMenu',
      'imageDetails',
      'videoDetails',
      'embedDetails',
      'removeVideo',
      'removeEmbed',
    ],
    dialogs: [
      'imageInsertTitle',
      'imageEditTitle',
      'imageUrl',
      'imageUrlHint',
      'imageAlt',
      'imageAltHint',
      'imageDecorative',
      'imageCaption',
      'imageCredit',
      'imageAlign',
      'imageWidth',
      'imageWidthHint',
      'videoInsertTitle',
      'videoEditTitle',
      'videoUrl',
      'videoUrlHint',
      'videoPoster',
      'videoCaption',
      'videoTracks',
      'videoTrack',
      'videoTrackKind',
      'videoTrackCaptions',
      'videoTrackSubtitles',
      'videoTrackUrl',
      'videoTrackLang',
      'videoTrackLabel',
      'videoTrackDefault',
      'videoTrackAdd',
      'videoTrackRemove',
      'videoCaptionsHint',
      'embedInsertTitle',
      'embedEditTitle',
      'embedUrl',
      'embedUrlHint',
      'embedCaption',
      'errorMediaUrl',
      'errorEmbedUrl',
    ],
  } as const;

  it('as chaves novas existem e têm texto nos três pacotes', () => {
    for (const [name, pack] of packs) {
      for (const [section, keys] of Object.entries(KEYS)) {
        const bag = (
          pack as unknown as Record<string, Record<string, unknown>>
        )[section];
        for (const key of keys) {
          const value = bag?.[key];
          const text =
            typeof value === 'function'
              ? key === 'embedUrlHint'
                ? (value as (p: string[]) => string)(['YouTube', 'Vimeo'])
                : (value as (n: number) => string)(3)
              : value;
          expect(typeof text, `${name}.${section}.${key}`).toBe('string');
          expect(text, `${name}.${section}.${key}`).not.toBe('');
        }
      }
    }
  });

  it('cópia da tabela', () => {
    expect(RTE_LABELS_EN.dialogs.videoTrack(2)).toBe('Track 2');
    expect(RTE_LABELS_EN.dialogs.videoTrackRemove(3)).toBe('Remove track 3');
    expect(RTE_LABELS_PT_BR.dialogs.embedUrlHint(['YouTube', 'Vimeo'])).toBe(
      'Aceitos: YouTube, Vimeo.',
    );
    expect(RTE_LABELS_ES.dialogs.embedUrlHint(['YouTube'])).toBe(
      'Se aceptan: YouTube.',
    );
    expect(RTE_LABELS_ES.floating.removeEmbed).toBe(
      'Quitar contenido incrustado',
    );
    expect(RTE_LABELS_PT_BR.toolbar.editEmbed).toBe(
      'Editar conteúdo incorporado',
    );
    expect(RTE_LABELS_EN.dialogs.imageUrlHint).toBe(
      RTE_LABELS_EN.dialogs.videoUrlHint,
    );
  });

  it('mergeLabels protege as funções novas de dialogs', () => {
    const merged = mergeLabels(RTE_LABELS_EN, {
      dialogs: {
        videoTrack: () => 7 as never,
        videoTrackRemove: () => {
          throw new Error('x');
        },
        embedUrlHint: (p) => p.join('|'),
      },
    });
    expect(merged.dialogs.videoTrack(1)).toBe('Track 1');
    expect(merged.dialogs.videoTrackRemove(2)).toBe('Remove track 2');
    expect(merged.dialogs.embedUrlHint(['a', 'b'])).toBe('a|b');
  });
});

describe('rótulos do envio de arquivos (05c2a, E20)', () => {
  const packs = [
    ['en', RTE_LABELS_EN],
    ['pt-BR', RTE_LABELS_PT_BR],
    ['es', RTE_LABELS_ES],
  ] as const;
  const REASONS = [
    'type',
    'size',
    'count',
    'network',
    'server',
    'response',
    'unavailable',
  ] as const;

  const COPY = {
    en: {
      region: 'Uploads',
      progress: 'Uploading a.png',
      queued: 'a.png (waiting)',
      cancel: 'Cancel upload of a.png',
      start1: 'Uploading 1 file.',
      start3: 'Uploading 3 files.',
      done: 'a.png uploaded.',
      cancelled: 'Upload of a.png cancelled.',
      error: {
        type: 'Could not upload a.png: file type not accepted.',
        size: 'Could not upload a.png: file too large.',
        count: 'Could not upload a.png: too many files at once.',
        network: 'Could not upload a.png: connection failed.',
        server: 'Could not upload a.png: the server refused it.',
        response: 'Could not upload a.png: invalid server response.',
        unavailable: 'Could not upload a.png: the editor is not editable.',
      },
      mediaSource: 'Source',
      mediaSourceFile: 'File',
      mediaSourceUrl: 'Address (URL)',
      imageFile: 'Image file',
      videoFile: 'Video file',
      fileHint: 'Accepted: PNG, JPEG. Up to 10 MB.',
      errorFileRequired: 'Choose a file.',
      errorFileType: 'This file type is not accepted.',
      errorFileSize: 'The file is larger than 10 MB.',
      pending1: 'Wait for 1 upload to finish.',
      pending2: 'Wait for 2 uploads to finish.',
      missingAlt1: '1 image has no alternative text.',
      missingAlt2: '2 images have no alternative text.',
    },
    'pt-BR': {
      region: 'Envios',
      progress: 'Enviando a.png',
      queued: 'a.png (na fila)',
      cancel: 'Cancelar envio de a.png',
      start1: 'Enviando 1 arquivo.',
      start3: 'Enviando 3 arquivos.',
      done: 'a.png enviado.',
      cancelled: 'Envio de a.png cancelado.',
      error: {
        type: 'Não foi possível enviar a.png: tipo de arquivo não aceito.',
        size: 'Não foi possível enviar a.png: arquivo grande demais.',
        count: 'Não foi possível enviar a.png: arquivos demais de uma vez.',
        network: 'Não foi possível enviar a.png: falha de conexão.',
        server: 'Não foi possível enviar a.png: o servidor recusou.',
        response:
          'Não foi possível enviar a.png: resposta inválida do servidor.',
        unavailable:
          'Não foi possível enviar a.png: o editor não está editável.',
      },
      mediaSource: 'Origem',
      mediaSourceFile: 'Arquivo',
      mediaSourceUrl: 'Endereço (URL)',
      imageFile: 'Arquivo de imagem',
      videoFile: 'Arquivo de vídeo',
      fileHint: 'Aceitos: PNG, JPEG. Até 10 MB.',
      errorFileRequired: 'Escolha um arquivo.',
      errorFileType: 'Este tipo de arquivo não é aceito.',
      errorFileSize: 'O arquivo passa de 10 MB.',
      pending1: 'Aguarde o fim de 1 envio.',
      pending2: 'Aguarde o fim de 2 envios.',
      missingAlt1: '1 imagem sem texto alternativo.',
      missingAlt2: '2 imagens sem texto alternativo.',
    },
    es: {
      region: 'Envíos',
      progress: 'Enviando a.png',
      queued: 'a.png (en cola)',
      cancel: 'Cancelar envío de a.png',
      start1: 'Enviando 1 archivo.',
      start3: 'Enviando 3 archivos.',
      done: 'a.png enviado.',
      cancelled: 'Envío de a.png cancelado.',
      error: {
        type: 'No se pudo enviar a.png: tipo de archivo no aceptado.',
        size: 'No se pudo enviar a.png: archivo demasiado grande.',
        count: 'No se pudo enviar a.png: demasiados archivos a la vez.',
        network: 'No se pudo enviar a.png: fallo de conexión.',
        server: 'No se pudo enviar a.png: el servidor lo rechazó.',
        response: 'No se pudo enviar a.png: respuesta del servidor no válida.',
        unavailable: 'No se pudo enviar a.png: el editor no es editable.',
      },
      mediaSource: 'Origen',
      mediaSourceFile: 'Archivo',
      mediaSourceUrl: 'Dirección (URL)',
      imageFile: 'Archivo de imagen',
      videoFile: 'Archivo de vídeo',
      fileHint: 'Se aceptan: PNG, JPEG. Hasta 10 MB.',
      errorFileRequired: 'Elige un archivo.',
      errorFileType: 'Este tipo de archivo no se acepta.',
      errorFileSize: 'El archivo supera 10 MB.',
      pending1: 'Espera a que termine 1 envío.',
      pending2: 'Espera a que terminen 2 envíos.',
      missingAlt1: '1 imagen sin texto alternativo.',
      missingAlt2: '2 imágenes sin texto alternativo.',
    },
  } as const;

  it('fixa o número de chaves das seções', () => {
    for (const [name, pack] of packs) {
      expect(Object.keys(pack.upload).length, name).toBe(8);
      expect(Object.keys(pack.errors).length, name).toBe(5);
      expect(Object.keys(pack.dialogs).length, name).toBe(82);
    }
  });

  it('cada texto novo é igual ao da tabela, nos três idiomas', () => {
    for (const [name, pack] of packs) {
      const c = COPY[name];
      const u = pack.upload;
      expect(u.region, name).toBe(c.region);
      expect(u.progress('a.png'), name).toBe(c.progress);
      expect(u.queued('a.png'), name).toBe(c.queued);
      expect(u.cancel('a.png'), name).toBe(c.cancel);
      expect(u.announceStart(1), name).toBe(c.start1);
      expect(u.announceStart(3), name).toBe(c.start3);
      expect(u.announceDone('a.png'), name).toBe(c.done);
      expect(u.announceCancelled('a.png'), name).toBe(c.cancelled);
      for (const reason of REASONS)
        expect(u.announceError('a.png', reason), `${name}.${reason}`).toBe(
          c.error[reason],
        );
      const d = pack.dialogs;
      expect(d.mediaSource, name).toBe(c.mediaSource);
      expect(d.mediaSourceFile, name).toBe(c.mediaSourceFile);
      expect(d.mediaSourceUrl, name).toBe(c.mediaSourceUrl);
      expect(d.imageFile, name).toBe(c.imageFile);
      expect(d.videoFile, name).toBe(c.videoFile);
      expect(d.fileHint(['PNG', 'JPEG'], 10), name).toBe(c.fileHint);
      expect(d.errorFileRequired, name).toBe(c.errorFileRequired);
      expect(d.errorFileType, name).toBe(c.errorFileType);
      expect(d.errorFileSize(10), name).toBe(c.errorFileSize);
      expect(pack.errors.rteUploadsPending(1), name).toBe(c.pending1);
      expect(pack.errors.rteUploadsPending(2), name).toBe(c.pending2);
      expect(pack.errors.rteImagesMissingAlt(1), name).toBe(c.missingAlt1);
      expect(pack.errors.rteImagesMissingAlt(2), name).toBe(c.missingAlt2);
    }
  });

  it('literais do plano', () => {
    expect(RTE_LABELS_EN.upload.cancel('a.png')).toBe('Cancel upload of a.png');
    expect(RTE_LABELS_PT_BR.upload.announceStart(2)).toBe(
      'Enviando 2 arquivos.',
    );
    expect(RTE_LABELS_ES.dialogs.fileHint(['PNG', 'JPEG'], 1)).toBe(
      'Se aceptan: PNG, JPEG. Hasta 1 MB.',
    );
    expect(RTE_LABELS_PT_BR.errors.rteImagesMissingAlt(1)).toBe(
      '1 imagem sem texto alternativo.',
    );
  });

  it('mergeLabels protege as funções de upload e mescla region', () => {
    const merged = mergeLabels(RTE_LABELS_EN, {
      upload: {
        cancel: () => 7 as never,
        region: 'X',
        progress: () => {
          throw new Error('x');
        },
        announceStart: (c) => `n=${c}`,
      },
    });
    expect(merged.upload.cancel('a')).toBe('Cancel upload of a');
    expect(merged.upload.region).toBe('X');
    expect(merged.upload.progress('a')).toBe('Uploading a');
    expect(merged.upload.announceStart(2)).toBe('n=2');
    expect(merged.upload.queued('a')).toBe('a (waiting)');
  });

  it('mergeLabels protege as funções novas de dialogs e errors', () => {
    const merged = mergeLabels(RTE_LABELS_EN, {
      dialogs: {
        fileHint: () => 1 as never,
        errorFileSize: (m) => `big ${m}`,
        errorFileType: 'T',
      },
      errors: {
        rteUploadsPending: () => {
          throw new Error('x');
        },
        rteImagesMissingAlt: (c) => `alt ${c}`,
      },
    });
    expect(merged.dialogs.fileHint(['A'], 2)).toBe('Accepted: A. Up to 2 MB.');
    expect(merged.dialogs.errorFileSize(3)).toBe('big 3');
    expect(merged.dialogs.errorFileType).toBe('T');
    expect(merged.errors.rteUploadsPending(1)).toBe(
      'Wait for 1 upload to finish.',
    );
    expect(merged.errors.rteImagesMissingAlt(4)).toBe('alt 4');
  });

  it('mergeLabels ignora upload que não é objeto', () => {
    expect(mergeLabels(RTE_LABELS_EN, { upload: 1 as never }).upload).toBe(
      RTE_LABELS_EN.upload,
    );
  });
});

@Component({
  selector: 'rte-test-upload-labels',
  imports: [RteEditor],
  template: `<rte-editor [upload]="upload" [labels]="labels" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class UploadLabelsHost {
  readonly upload = { adapter: createFakeUploadAdapter() };
  readonly labels: RteLabelsInput = {
    upload: { region: 'Fila', announceStart: (c: number) => `n=${c}` },
  };
}

describe('rótulos do envio na tela (E20, R14)', () => {
  let restoreDialog: () => void;
  beforeEach(() => {
    restoreDialog = installDialogShim();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    restoreDialog();
  });

  it('rótulos parciais do consumidor chegam à bandeja e à região; o resto vem do en', async () => {
    const fixture = TestBed.createComponent(UploadLabelsHost);
    fixture.autoDetectChanges();
    await settle(fixture);
    const cmp = fixture.debugElement.query(
      (el) => el.componentInstance instanceof RteEditor,
    ).componentInstance as RteEditor;
    await whenUploadReady(cmp);
    cmp.uploadFiles([new File(['x'], 'a.png', { type: 'image/png' })]);
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    expect(
      root.querySelector('section.rte-uploads')?.getAttribute('aria-label'),
    ).toBe('Fila');
    expect(
      root.querySelector('.rte-uploads__progress')?.getAttribute('aria-label'),
    ).toBe('Uploading a.png');
    expect(
      root.querySelector('.rte-uploads__status')?.textContent?.trim(),
    ).toBe('n=1');
  });
});
