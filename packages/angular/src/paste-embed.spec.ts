import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import {
  provideRichText,
  RteEditor,
  type RteMediaChange,
} from '@cds/rte-angular';
import { undo } from '@tiptap/pm/history';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchPaste,
  installDataTransferShim,
} from './testing-support/data-transfer';
import { installDialogShim } from './testing-support/dialog';
import { selectText } from './testing-support/editors';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';

// Spec 05c2b, Tarefa 4: URL colada num parágrafo vazio vira embed (R7; S11).

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

@Component({
  selector: 'rte-test-paste-embed',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    [pasteEmbeds]="paste()"
    (valueChange)="values.push($event)"
    (mediaChange)="media.push($event)"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('<p></p>');
  readonly paste = signal<boolean | undefined>(true);
  readonly values: string[] = [];
  readonly media: RteMediaChange[] = [];
  readonly cmp = viewChild.required(RteEditor);
}

let restores: (() => void)[] = [];
beforeEach(() => {
  restores = [
    installDialogShim(),
    installPopoverShim(),
    installDataTransferShim(),
  ];
});
afterEach(() => {
  restores.forEach((r) => r());
  vi.restoreAllMocks();
});

async function setup(
  o: { doc?: string; paste?: boolean | undefined; provider?: boolean } = {},
) {
  TestBed.configureTestingModule({
    providers:
      o.provider === undefined
        ? []
        : [provideRichText({ pasteEmbeds: o.provider })],
  });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  host.value.set(o.doc ?? '<p></p>');
  if ('paste' in o) host.paste.set(o.paste);
  fixture.autoDetectChanges();
  await settle(fixture);
  const editor = host.cmp().editor();
  if (!editor) throw new Error('sem editor');
  const paste = async (text: string, files: File[] = []) => {
    const event = dispatchPaste(editor.view.dom, { text, files });
    await settle(fixture);
    return event;
  };
  const html = () => editor.getHTML();
  return { fixture, host, editor, paste, html };
}

describe('pasteEmbeds (R7)', () => {
  it('desligado por padrão segue o caminho de hoje', async () => {
    const s = await setup({ paste: undefined });
    await s.paste(YT);
    expect(s.html()).not.toContain('<iframe');
  });

  it('ligado: URL em parágrafo vazio vira embed e cancela o padrão', async () => {
    const s = await setup();
    const event = await s.paste(`  ${YT}\n`);
    expect(event.defaultPrevented).toBe(true);
    expect(s.html()).toContain('<iframe');
    expect(s.host.values.length).toBe(1);
    // Embed não é mídia rastreada (V13): sem delta de endereços, sem mediaChange.
    expect(s.host.media.length).toBe(0);
  });

  it('o provider liga e a entrada vence', async () => {
    const on = await setup({ paste: undefined, provider: true });
    await on.paste(YT);
    expect(on.html()).toContain('<iframe');
    TestBed.resetTestingModule();
    const off = await setup({ paste: false, provider: true });
    await off.paste(YT);
    expect(off.html()).not.toContain('<iframe');
  });

  it('Mod+Z desfaz em um passo', async () => {
    const s = await setup();
    await s.paste(YT);
    expect(s.html()).toContain('<iframe');
    undo(s.editor.state, s.editor.view.dispatch);
    await settle(s.fixture);
    expect(s.html()).not.toContain('<iframe');
  });

  it.each([
    ['texto com espaços', `${YT} depois`, '<p></p>'],
    ['URL não suportada', 'https://example.com/pagina', '<p></p>'],
    ['não é endereço absoluto', 'youtube.com/watch?v=dQw4w9WgXcQ', '<p></p>'],
    ['parágrafo com texto', YT, '<p>abc</p>'],
    ['bloco de código', YT, '<pre><code></code></pre>'],
  ])('segue o caminho de hoje: %s', async (_n, text, doc) => {
    const s = await setup({ doc });
    s.editor.commands.focus('end');
    const event = await s.paste(text);
    expect(s.html()).not.toContain('<iframe');
    void event;
  });

  it('seleção não vazia segue o caminho de hoje', async () => {
    const s = await setup({ doc: '<p>abc</p>' });
    selectText(s.editor, 'abc');
    await s.paste(YT);
    expect(s.html()).not.toContain('<iframe');
  });

  it('arquivos presentes: a E12 vence', async () => {
    const s = await setup();
    await s.paste(YT, [new File(['x'], 'a.png', { type: 'image/png' })]);
    expect(s.html()).not.toContain('<iframe');
  });
});
