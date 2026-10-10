import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import {
  RteEditor,
  provideRichText,
  type RteEditorConfig,
} from '@comodeviaser/rte-angular';
import { type Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRteEditor } from '@comodeviaser/rte-angular/testing';
import { settle } from './testing-support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

@Component({
  selector: 'rte-test-features',
  imports: [RteEditor],
  template: `<rte-editor [options]="options()" toolbar="full" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly options = signal<RteEditorConfig | undefined>(undefined);
}

function names(editor: Editor): string[] {
  return editor.extensionManager.extensions.map((e) => e.name);
}

function searchButton(fixture: { nativeElement: HTMLElement }) {
  return fixture.nativeElement.querySelector(
    '.rte-toolbar [aria-label="Find and replace"]',
  );
}

async function mount(
  options: RteEditorConfig | undefined,
  providers: ReturnType<typeof provideRichText>[] = [],
) {
  TestBed.configureTestingModule({ providers });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.options.set(options);
  fixture.autoDetectChanges();
  await settle(fixture);
  return fixture;
}

describe('RteEditor: busca e menu / ligados por padrão (K2, R2)', () => {
  it('sem configuração registra rtSearch e rtSlashCommand e mostra o item', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fixture = await mount(undefined);
    const editor = getEditor(fixture);
    expect(names(editor)).toContain('rtSearch');
    expect(names(editor)).toContain('rtSlashCommand');
    expect(searchButton(fixture)).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('features desligadas na entrada não registram e escondem o item', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fixture = await mount({
      features: { search: false, slashCommands: false },
    });
    const editor = getEditor(fixture);
    expect(names(editor)).not.toContain('rtSearch');
    expect(names(editor)).not.toContain('rtSlashCommand');
    expect(searchButton(fixture)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('features desligadas no provider valem; a entrada vence o provider', async () => {
    const off = provideRichText({
      editor: { features: { search: false, slashCommands: false } },
    });
    const fromProvider = await mount(undefined, [off]);
    expect(names(getEditor(fromProvider))).not.toContain('rtSearch');
    expect(names(getEditor(fromProvider))).not.toContain('rtSlashCommand');
    expect(searchButton(fromProvider)).toBeNull();
    fromProvider.destroy();
    TestBed.resetTestingModule();

    const override = await mount(
      { features: { search: true, slashCommands: true } },
      [off],
    );
    expect(names(getEditor(override))).toContain('rtSearch');
    expect(names(getEditor(override))).toContain('rtSlashCommand');
    expect(searchButton(override)).not.toBeNull();
  });

  it('features.search ligado pelo consumidor não gera aviso de dev', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await mount({ features: { search: true, slashCommands: true } });
    expect(warn).not.toHaveBeenCalled();
  });
});

function getEditor(fixture: { nativeElement: HTMLElement }): Editor {
  const el = fixture.nativeElement.querySelector('rte-editor') as HTMLElement;
  return getRteEditor(el) as Editor;
}
