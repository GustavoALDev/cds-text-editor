import {
  ApplicationRef,
  ChangeDetectionStrategy,
  type EnvironmentProviders,
  type Provider,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import {
  RteEditor,
  provideRichText,
  type RteEditorConfig,
  type RteLabelsSource,
} from '@cds/rte-angular';
import { getRteEditor } from '@cds/rte-angular/testing';
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHost, settle } from './testing-support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

const SEARCH_WARNING =
  '[rte-editor] features.search e features.slashCommands ficam desligados nesta versão; o valor informado foi ignorado.';
const OPTIONS_WARNING =
  '[rte-editor] options só é lido na criação; a mudança foi ignorada.';

@Component({
  selector: 'rte-test-host',
  imports: [RteEditor],
  template: `<rte-editor
    [options]="options()"
    (editorReady)="ready.push($event)"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly options = signal<RteEditorConfig | undefined>(undefined);
  readonly ready: Editor[] = [];
  readonly cmp = viewChild.required(RteEditor);
}

@Component({
  selector: 'rte-test-toggle',
  imports: [RteEditor],
  template: `@if (show()) {
    <rte-editor />
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ToggleHost {
  readonly show = signal(false);
}

@Component({
  selector: 'rte-test-labels',
  imports: [RteEditor],
  template: `<rte-editor [labels]="labels()" [ariaLabel]="ariaLabel()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class LabelsHost {
  readonly labels = signal<RteLabelsSource | undefined>(undefined);
  readonly ariaLabel = signal<string | undefined>(undefined);
  readonly cmp = viewChild.required(RteEditor);
}

const HOOK = Symbol.for('@cds/rte-angular/editor');

function names(editor: Editor): string[] {
  return editor.extensionManager.extensions.map((e) => e.name);
}

function hostEl(fixture: { nativeElement: HTMLElement }): HTMLElement {
  return fixture.nativeElement.querySelector('rte-editor') as HTMLElement;
}

describe('RteEditor: ciclo de vida (D2, R2)', () => {
  it('antes de estabilizar só há a casca; depois, o editor no mount', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentRef.changeDetectorRef.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const cmp = fixture.componentInstance.cmp();

    expect(cmp.editor()).toBeNull();
    expect(el.querySelector('.ProseMirror')).toBeNull();
    expect(
      el.querySelector('.rte-editor__shell[role="textbox"][aria-busy="true"]'),
    ).not.toBeNull();

    fixture.autoDetectChanges();
    await settle(fixture);

    const editor = cmp.editor();
    expect(editor).toBeInstanceOf(Editor);
    expect(
      el.querySelector('.rte-editor__mount > .ProseMirror.rte-content'),
    ).not.toBeNull();
    expect(el.querySelector('.rte-editor__shell')).toBeNull();
    expect(editor?.options.injectCSS).toBe(false);
    expect(document.querySelector('style[data-tiptap-style]')).toBeNull();
    expect(names(editor as Editor)).not.toContain('rtSearch');
    expect(names(editor as Editor)).not.toContain('rtSlashCommand');
    // Nenhum `clipboardParser`/`domParser` (R2); só os atributos e a seleção
    // pelo teclado em `readonly` (D10).
    expect(Object.keys(editor?.options.editorProps ?? {})).toEqual([
      'attributes',
      'handleDOMEvents',
    ]);
    expect(
      Object.keys(editor?.options.editorProps.handleDOMEvents ?? {}),
    ).toEqual(['keydown']);
    expect(fixture.componentInstance.ready).toEqual([editor]);
  });

  it('search/slashCommands do consumidor ficam desligados, com um aviso', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.options.set({
      features: { search: true, slashCommands: true },
    });
    fixture.autoDetectChanges();
    await settle(fixture);

    const editor = fixture.componentInstance.cmp().editor() as Editor;
    expect(names(editor)).not.toContain('rtSearch');
    expect(names(editor)).not.toContain('rtSlashCommand');
    expect(warn.mock.calls).toEqual([[SEARCH_WARNING]]);
  });

  it('provider e options se mesclam com a instância vencendo (D20)', async () => {
    const providers = [
      provideRichText({ editor: { features: { tables: false } } }),
    ];
    const plain = await renderHost(Host, providers);
    expect(
      names(plain.componentInstance.cmp().editor() as Editor),
    ).not.toContain('table');
    plain.destroy();
    TestBed.resetTestingModule();

    TestBed.configureTestingModule({ providers });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.options.set({ features: { tables: true } });
    fixture.autoDetectChanges();
    await settle(fixture);
    expect(names(fixture.componentInstance.cmp().editor() as Editor)).toContain(
      'table',
    );
  });

  it('mudar options depois da criação avisa uma vez e não recria', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fixture = await renderHost(Host);
    const cmp = fixture.componentInstance.cmp();
    const editor = cmp.editor();

    fixture.componentInstance.options.set({});
    await settle(fixture);
    fixture.componentInstance.options.set({ idPrefix: 'x' });
    await settle(fixture);

    expect(warn.mock.calls).toEqual([[OPTIONS_WARNING]]);
    expect(cmp.editor()).toBe(editor);
  });

  it('destruir destrói o editor e remove o gancho (D23)', async () => {
    const destroy = vi.spyOn(Editor.prototype, 'destroy');
    const fixture = await renderHost(Host);
    const host = hostEl(fixture);
    expect(getRteEditor(host)).toBe(fixture.componentInstance.cmp().editor());
    expect(Object.getOwnPropertySymbols(host)).toContain(HOOK);

    fixture.destroy();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(getRteEditor(host)).toBeNull();
    // o jsdom guarda símbolos internos no elemento; o do gancho sai
    expect(Object.getOwnPropertySymbols(host)).not.toContain(HOOK);
  });

  it(
    'alternar o editor 100× não deixa editores para trás',
    { timeout: 30_000 },
    async () => {
      const destroy = vi.spyOn(Editor.prototype, 'destroy');
      const fixture = await renderHost(ToggleHost);
      for (let i = 0; i < 100; i++) {
        fixture.componentInstance.show.set(true);
        await settle(fixture);
        expect(document.querySelectorAll('.ProseMirror')).toHaveLength(1);
        fixture.componentInstance.show.set(false);
        await settle(fixture);
      }

      expect(document.querySelectorAll('.ProseMirror')).toHaveLength(0);
      expect(destroy).toHaveBeenCalledTimes(100);
    },
  );

  it('criar e destruir antes de estabilizar não cria editor', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentRef.changeDetectorRef.detectChanges();
    const ready = fixture.componentInstance.ready;
    fixture.destroy();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(ready).toEqual([]);
    expect(document.querySelectorAll('.ProseMirror')).toHaveLength(0);
  });
});

describe('RteEditor: rótulos da instância (D15)', () => {
  async function labelsOf(
    providers: (Provider | EnvironmentProviders)[],
    setup: (host: LabelsHost) => void,
  ) {
    TestBed.configureTestingModule({ providers });
    const fixture = TestBed.createComponent(LabelsHost);
    setup(fixture.componentInstance);
    fixture.autoDetectChanges();
    await settle(fixture);
    const editor = fixture.componentInstance.cmp().editor() as Editor;
    return {
      fixture,
      editor,
      aria: editor.view.dom.getAttribute('aria-label'),
      readAlso: editor.storage.rtContent.labels().readAlsoTitle,
    };
  }

  const provider = provideRichText({
    labels: {
      editor: { ariaLabel: 'P' },
      content: { readAlsoTitle: 'Leia (P)' },
    },
  });

  it('sem provider nem entrada: en', async () => {
    const r = await labelsOf([], () => undefined);
    expect(r.aria).toBe('Rich text editor');
    expect(r.readAlso).toBe('Read also');
  });

  it('provider sobre en', async () => {
    const r = await labelsOf([provider], () => undefined);
    expect(r.aria).toBe('P');
    expect(r.readAlso).toBe('Leia (P)');
  });

  it('entrada da instância sobre o provider, por chave', async () => {
    const r = await labelsOf([provider], (h) =>
      h.labels.set({ editor: { ariaLabel: 'I' } }),
    );
    expect(r.aria).toBe('I');
    expect(r.readAlso).toBe('Leia (P)');
  });

  it('ariaLabel vence os rótulos; as fontes de conteúdo são lidas a cada uso', async () => {
    const r = await labelsOf([provider], (h) => {
      h.ariaLabel.set('Corpo');
      h.labels.set({ content: { readAlsoTitle: 'Leia (I)' } });
    });
    expect(r.aria).toBe('Corpo');
    expect(r.readAlso).toBe('Leia (I)');

    r.fixture.componentInstance.labels.set(undefined);
    await settle(r.fixture);
    expect(r.editor.storage.rtContent.labels().readAlsoTitle).toBe('Leia (P)');
  });
});
