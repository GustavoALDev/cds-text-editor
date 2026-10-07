import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import {
  RteEditor,
  type RteUploadConfig,
  type RteUploadErrorEvent,
} from '@cds/rte-angular';
import { undo } from '@tiptap/pm/history';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchPaste,
  installDataTransferShim,
} from './testing-support/data-transfer';
import { installDialogShim } from './testing-support/dialog';
import { selectText } from './testing-support/editors';
import {
  createFakeUploadAdapter,
  type FakeUploadAdapter,
} from './testing-support/fake-upload-adapter';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';
import { whenUploadReady } from './testing-support/upload-runtime';
import { RTE_UPLOAD_LOADER } from './upload/facade';
import { isExternalHttps } from './upload/rehost';

// Spec 05c2b, Tarefa 5: re-hospedagem de imagens externas coladas (S10, R6).

@Component({
  selector: 'rte-test-rehost',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    [upload]="upload()"
    [readonly]="readonly()"
    (valueChange)="values.push($event)"
    (uploadError)="errors.push($event)"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('<p>abcd</p>');
  readonly upload = signal<RteUploadConfig | null>(null);
  readonly readonly = signal(false);
  readonly values: string[] = [];
  readonly errors: RteUploadErrorEvent[] = [];
  readonly cmp = viewChild.required(RteEditor);
}

interface Setup {
  fixture: ComponentFixture<Host>;
  host: Host;
  cmp: RteEditor;
  editor: Editor;
  dom: HTMLElement;
  adapter: FakeUploadAdapter;
}

async function setup(
  o: {
    config?: Partial<RteUploadConfig>;
    external?: boolean;
    doc?: string;
  } = {},
): Promise<Setup> {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: RTE_UPLOAD_LOADER,
        useValue: () => import('./upload/rte-upload'),
      },
    ],
  });
  const adapter = createFakeUploadAdapter({ external: o.external ?? true });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  host.value.set(o.doc ?? '<p>abcd</p>');
  host.upload.set({ adapter, rehostExternal: true, ...o.config });
  fixture.autoDetectChanges();
  await settle(fixture);
  const cmp = host.cmp();
  await whenUploadReady(cmp);
  await settle(fixture);
  const editor = cmp.editor() as Editor;
  return { fixture, host, cmp, editor, dom: editor.view.dom, adapter };
}

const EXT = 'https://img.example.com/pics/gato%20a.png';
const img = (src: string) => `<img src="${src}" alt="x">`;

function paste(s: Setup, html: string): void {
  selectText(s.editor, 'abcd', 4);
  dispatchPaste(s.dom, { html, text: '' });
}

function srcs(editor: Editor): string[] {
  return [...editor.view.dom.querySelectorAll('img')].map(
    (i) => i.getAttribute('src') ?? '',
  );
}

const OK = {
  url: 'https://cdn.example.com/__uploads/1.png',
  width: 10,
  height: 20,
};

let restore: (() => void)[] = [];
beforeEach(() => {
  restore = [
    installDialogShim(),
    installPopoverShim(),
    installDataTransferShim(),
  ];
});
afterEach(() => {
  TestBed.resetTestingModule();
  restore.reverse().forEach((r) => r());
  vi.restoreAllMocks();
});

describe('re-hospedagem de imagens coladas (S10, R6)', () => {
  it('imagem externa colada → item na bandeja com o último segmento, sem marcador', async () => {
    const s = await setup();
    paste(s, img(EXT));
    expect(s.adapter.externalCalls.map((c) => c.url)).toEqual([EXT]);
    expect(s.cmp.uploads().map((u) => u.fileName)).toEqual(['gato a.png']);
    expect(s.cmp.pendingUploads()).toBe(1);
    expect(srcs(s.editor)).toEqual([EXT]);
    expect(s.adapter.calls).toEqual([]);
  });

  it('desligada por padrão e sem registerExternal: nada', async () => {
    const off = await setup({ config: { rehostExternal: false } });
    paste(off, img(EXT));
    expect(off.adapter.externalCalls).toEqual([]);
    expect(off.cmp.uploads()).toEqual([]);
    TestBed.resetTestingModule();
    const none = await setup({ external: false });
    paste(none, img(EXT));
    expect(none.cmp.uploads()).toEqual([]);
  });

  it('só https externo: http, ownHosts e a origem da página ficam', async () => {
    const s = await setup({ config: { ownHosts: ['Own.example.com'] } });
    paste(
      s,
      [
        img('http://img.example.com/a.png'),
        img('https://own.example.com/b.png'),
        img(`${window.location.origin}/c.png`),
        img('/d.png'),
      ].join(''),
    );
    expect(s.adapter.externalCalls).toEqual([]);
  });

  it('imagem anterior à colagem não entra', async () => {
    const s = await setup({ doc: `<p>abcd</p><figure>${img(EXT)}</figure>` });
    paste(s, img('https://img.example.com/novo.png'));
    expect(s.adapter.externalCalls.map((c) => c.url)).toEqual([
      'https://img.example.com/novo.png',
    ]);
  });

  it('mesma imagem duas vezes → um trabalho; sucesso troca todas e emite uma vez', async () => {
    const s = await setup();
    paste(s, img(EXT) + '<p>x</p>' + img(EXT));
    expect(s.adapter.externalCalls).toHaveLength(1);
    const before = s.host.values.length;
    s.adapter.resolveExternal(0, {
      ...OK,
      srcset: `${OK.url} 1x`,
      sizes: '100vw',
    });
    await settle(s.fixture);
    expect(srcs(s.editor)).toEqual([OK.url, OK.url]);
    expect(s.editor.view.dom.querySelector('img')?.getAttribute('srcset')).toBe(
      `${OK.url} 1x`,
    );
    expect(s.host.values.length - before).toBe(1);
    expect(s.cmp.uploads()).toEqual([]);
    expect(s.host.errors).toEqual([]);
  });

  it('Mod+Z remove a imagem colada, não volta ao externo', async () => {
    const s = await setup();
    paste(s, img(EXT));
    s.adapter.resolveExternal(0, OK);
    await settle(s.fixture);
    expect(srcs(s.editor)).toEqual([OK.url]);
    undo(s.editor.view.state, s.editor.view.dispatch);
    expect(srcs(s.editor)).toEqual([]);
  });

  it('fila de 2: o terceiro espera', async () => {
    const s = await setup();
    paste(
      s,
      ['a', 'b', 'c']
        .map((n) => img(`https://img.example.com/${n}.png`))
        .join(''),
    );
    expect(s.adapter.externalCalls).toHaveLength(2);
    expect(s.cmp.uploads().map((u) => u.state)).toEqual([
      'uploading',
      'uploading',
      'queued',
    ]);
    s.adapter.resolveExternal(0, OK);
    await settle(s.fixture);
    expect(s.adapter.externalCalls).toHaveLength(3);
  });

  it('resposta recusada, falha: mantém o original sem uploadError', async () => {
    const s = await setup();
    paste(s, img(EXT) + img('https://img.example.com/b.png'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    s.adapter.resolveExternal(0, { url: 'javascript:alert(1)' });
    s.adapter.rejectExternal(1, new Error('x'));
    await settle(s.fixture);
    expect(srcs(s.editor)).toEqual([EXT, 'https://img.example.com/b.png']);
    expect(s.host.errors).toEqual([]);
    expect(s.cmp.uploads()).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('cancelar pela bandeja aborta e mantém o original', async () => {
    const s = await setup();
    paste(s, img(EXT));
    const id = s.cmp.uploads()[0]?.id as string;
    s.cmp.cancelUpload(id);
    expect(s.adapter.externalCalls[0]?.ctx.signal.aborted).toBe(true);
    expect(s.cmp.uploads()).toEqual([]);
    expect(srcs(s.editor)).toEqual([EXT]);
    expect(s.host.errors).toEqual([]);
  });

  it('editor não editável na chegada ou imagem removida: mantém o original', async () => {
    const s = await setup();
    paste(s, img(EXT));
    s.host.readonly.set(true);
    await settle(s.fixture);
    s.adapter.resolveExternal(0, OK);
    await settle(s.fixture);
    expect(srcs(s.editor)).toEqual([EXT]);
    expect(s.host.errors).toEqual([]);
    s.host.readonly.set(false);
    await settle(s.fixture);
    paste(s, img('https://img.example.com/z.png'));
    s.editor.commands.setContent('<p>vazio</p>');
    s.adapter.resolveExternal(1, OK);
    await settle(s.fixture);
    expect(srcs(s.editor)).toEqual([]);
    expect(s.cmp.uploads()).toEqual([]);
  });
});

describe('isExternalHttps (revisão final da 05c2b)', () => {
  it('recusa endereço com credenciais (não as repassa ao adaptador)', () => {
    expect(isExternalHttps('https://u:p@cdn.example/a.png', [], null)).toBe(
      false,
    );
    expect(isExternalHttps('https://u@cdn.example/a.png', [], null)).toBe(
      false,
    );
    expect(isExternalHttps('https://cdn.example/a.png', [], null)).toBe(true);
  });
});
