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
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDialogShim } from './testing-support/dialog';
import {
  createFakeUploadAdapter,
  type FakeUploadAdapter,
} from './testing-support/fake-upload-adapter';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';
import { uploadsOf } from './testing-support/upload-runtime';
import { RTE_UPLOAD_LOADER, type RteUploadLoader } from './upload/facade';
import { RTE_UPLOAD_KEY } from './upload/markers';

// Spec 05c2a, Tarefa 7b (Ruling 28): a maquinaria do envio vive num *chunk*
// carregado sob demanda; gestos antes da carga ficam em espera, na ordem.

@Component({
  selector: 'rte-test-upload-lazy',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    [upload]="upload()"
    (valueChange)="log.push('value')"
    (uploadError)="errors.push($event)"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('<p>ab</p>');
  readonly upload = signal<RteUploadConfig | null>(null);
  readonly log: string[] = [];
  readonly errors: RteUploadErrorEvent[] = [];
  readonly cmp = viewChild.required(RteEditor);
}

interface Setup {
  fixture: ComponentFixture<Host>;
  host: Host;
  cmp: RteEditor;
  editor: Editor;
  adapter: FakeUploadAdapter;
  loader: ReturnType<typeof vi.fn<RteUploadLoader>>;
}

const realLoader: RteUploadLoader = () => import('./upload/rte-upload');

/** Carregador que só entrega o módulo quando o teste chama `release`. */
function gatedLoader(): {
  loader: RteUploadLoader;
  release: () => void;
} {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return { loader: () => gate.then(realLoader), release };
}

async function setup(
  o: {
    loader?: RteUploadLoader;
    enabled?: boolean;
  } = {},
): Promise<Setup> {
  const loader = vi.fn(o.loader ?? realLoader);
  TestBed.configureTestingModule({
    providers: [{ provide: RTE_UPLOAD_LOADER, useValue: loader }],
  });
  const adapter = createFakeUploadAdapter();
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  if (o.enabled !== false) host.upload.set({ adapter });
  fixture.autoDetectChanges();
  await settle(fixture);
  const cmp = host.cmp();
  return {
    fixture,
    host,
    cmp,
    editor: cmp.editor() as Editor,
    adapter,
    loader,
  };
}

const png = (name: string) => new File(['x'], name, { type: 'image/png' });
const svg = (name: string) =>
  new File(['<svg/>'], name, { type: 'image/svg+xml' });

/**
 * Tarefas e microtarefas: o ocioso (recuo por `setTimeout`) dispara a carga;
 * depois espera a carga já começada (sem começar outra) terminar.
 */
async function drain(s: {
  fixture: ComponentFixture<unknown>;
  cmp: RteEditor;
}): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await settle(s.fixture);
  }
  const loading = (uploadsOf(s.cmp) as unknown as { loaded: Promise<unknown> })
    .loaded;
  if (loading) await loading;
  await settle(s.fixture);
}

function uploadPlugins(editor: Editor): number {
  return editor.state.plugins.filter(
    (p) => (p as unknown as { key: string }).key === 'rteUpload$',
  ).length;
}

function markerIds(editor: Editor): string[] {
  return (RTE_UPLOAD_KEY.getState(editor.state)?.markers ?? []).map(
    (m) => m.id,
  );
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

describe('carga sob demanda (Ruling 28)', () => {
  it('sem configuração, o carregador nunca é chamado; ligar carrega em ocioso', async () => {
    const s = await setup({ enabled: false });
    await drain(s);
    expect(s.loader).not.toHaveBeenCalled();
    expect(s.cmp.uploadFiles([png('a.png')])).toBe(0);
    expect(s.loader).not.toHaveBeenCalled();
    expect(uploadPlugins(s.editor)).toBe(0);
    s.host.upload.set({ adapter: s.adapter });
    await drain(s);
    expect(s.loader).toHaveBeenCalledTimes(1);
    expect(uploadPlugins(s.editor)).toBe(1);
  });

  it('com configuração: uma carga, plugin registrado uma vez, mesmo trocando a configuração', async () => {
    const s = await setup();
    await drain(s);
    expect(s.loader).toHaveBeenCalledTimes(1);
    expect(uploadPlugins(s.editor)).toBe(1);
    s.host.upload.set({ adapter: s.adapter });
    await drain(s);
    expect(s.loader).toHaveBeenCalledTimes(1);
    expect(uploadPlugins(s.editor)).toBe(1);
  });

  it('gestos antes da carga ficam em espera e são repostos na ordem', async () => {
    const gated = gatedLoader();
    const s = await setup({ loader: gated.loader });
    s.editor.commands.focus('end');
    expect(s.cmp.uploadFiles([png('a.png'), png('b.png')])).toBe(2);
    expect(s.cmp.uploadFiles([png('c.png'), svg('x.svg')])).toBe(1);
    expect(s.loader).toHaveBeenCalledTimes(1);
    expect(s.cmp.uploads()).toEqual([]);
    expect(markerIds(s.editor)).toEqual([]);
    expect(s.adapter.calls).toEqual([]);
    // Ruling 29: as recusas da E5 saem na hora; só os aceitos esperam
    expect(s.host.errors).toEqual([
      { fileName: 'x.svg', type: 'image', reason: 'type' },
    ]);
    gated.release();
    await drain(s);
    expect(s.cmp.uploads().map((u) => u.fileName)).toEqual([
      'a.png',
      'b.png',
      'c.png',
    ]);
    expect(markerIds(s.editor)).toHaveLength(3);
    expect(s.adapter.calls.map((c) => c.file.name)).toEqual(['a.png', 'b.png']);
    expect(s.host.errors).toEqual([
      { fileName: 'x.svg', type: 'image', reason: 'type' },
    ]);
  });

  it('Ruling 33: pendingUploads conta os aceitos em espera e segue na reposição', async () => {
    const gated = gatedLoader();
    const s = await setup({ loader: gated.loader });
    expect(s.cmp.pendingUploads()).toBe(0);
    expect(s.cmp.uploadFiles([png('a.png'), svg('x.svg')])).toBe(1);
    expect(s.cmp.uploadFiles([png('b.png')])).toBe(1);
    expect(s.cmp.uploads()).toEqual([]);
    expect(s.cmp.pendingUploads()).toBe(2);
    gated.release();
    await drain(s);
    expect(s.cmp.uploads()).toHaveLength(2);
    expect(s.cmp.pendingUploads()).toBe(2);
    s.cmp.cancelAllUploads();
    await settle(s.fixture);
    expect(s.cmp.pendingUploads()).toBe(0);
  });

  it('Ruling 33: cancelar, configuração null e falha da carga zeram os em espera', async () => {
    const gated = gatedLoader();
    const s = await setup({ loader: gated.loader });
    s.cmp.uploadFiles([png('a.png')]);
    expect(s.cmp.pendingUploads()).toBe(1);
    s.cmp.cancelAllUploads();
    expect(s.cmp.pendingUploads()).toBe(0);
    s.cmp.uploadFiles([png('b.png')]);
    expect(s.cmp.pendingUploads()).toBe(1);
    s.host.upload.set(null);
    await settle(s.fixture);
    expect(s.cmp.pendingUploads()).toBe(0);

    TestBed.resetTestingModule();
    const t = await setup({
      loader: () => Promise.reject(new Error('chunk')),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    t.cmp.uploadFiles([png('c.png')]);
    expect(t.cmp.pendingUploads()).toBe(1);
    await drain(t);
    expect(t.cmp.pendingUploads()).toBe(0);
    expect(t.host.errors.map((e) => e.reason)).toEqual(['unavailable']);
  });

  it('a posição em espera acompanha as edições feitas antes da carga', async () => {
    const gated = gatedLoader();
    const s = await setup({ loader: gated.loader });
    s.editor.commands.setTextSelection(2);
    expect(s.cmp.uploadFiles([png('a.png')])).toBe(1);
    s.editor.commands.insertContentAt(1, 'zz');
    gated.release();
    await drain(s);
    const [marker] = RTE_UPLOAD_KEY.getState(s.editor.state)?.markers ?? [];
    expect(marker?.pos).toBe(4);
  });

  it('falha da carga: unavailable por arquivo e um anúncio; os gestos seguintes também', async () => {
    const s = await setup({
      loader: () => Promise.reject(new Error('chunk')),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(s.cmp.uploadFiles([png('a.png'), png('b.png')])).toBe(2);
    await drain(s);
    expect(s.host.errors).toEqual([
      { fileName: 'a.png', type: 'image', reason: 'unavailable' },
      { fileName: 'b.png', type: 'image', reason: 'unavailable' },
    ]);
    const said = uploadsOf(s.cmp).announcement();
    expect(said).toMatchObject({
      kind: 'error',
      names: ['a.png', 'b.png'],
      reasons: ['unavailable', 'unavailable'],
      reason: 'unavailable',
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(s.cmp.uploadFiles([png('c.png'), svg('x.svg')])).toBe(1);
    expect(s.host.errors.slice(2)).toEqual([
      { fileName: 'c.png', type: 'image', reason: 'unavailable' },
      { fileName: 'x.svg', type: 'image', reason: 'type' },
    ]);
    expect(uploadsOf(s.cmp).announcement()).toMatchObject({
      n: (said?.n ?? 0) + 1,
      kind: 'error',
      names: ['c.png', 'x.svg'],
    });
    expect(s.loader).toHaveBeenCalledTimes(1);
    expect(s.cmp.uploads()).toEqual([]);
    expect(uploadPlugins(s.editor)).toBe(0);
  });

  it('configuração null desmonta: aborta, tira o plugin; religar não recarrega', async () => {
    const s = await setup();
    await drain(s);
    expect(s.cmp.uploadFiles([png('a.png')])).toBe(1);
    s.host.upload.set(null);
    await drain(s);
    expect(s.adapter.signal(0).aborted).toBe(true);
    expect(uploadPlugins(s.editor)).toBe(0);
    expect(s.cmp.uploads()).toEqual([]);
    expect(s.cmp.uploadFiles([png('b.png')])).toBe(0);
    s.host.upload.set({ adapter: s.adapter });
    await drain(s);
    expect(s.loader).toHaveBeenCalledTimes(1);
    expect(uploadPlugins(s.editor)).toBe(1);
    expect(s.cmp.uploadFiles([png('c.png')])).toBe(1);
    expect(s.cmp.uploads().map((u) => u.fileName)).toEqual(['c.png']);
  });

  it('gestos em espera somem com a configuração null, sem uploadError', async () => {
    const gated = gatedLoader();
    const s = await setup({ loader: gated.loader });
    expect(s.cmp.uploadFiles([png('a.png')])).toBe(1);
    s.host.upload.set(null);
    await settle(s.fixture);
    gated.release();
    await drain(s);
    expect(s.adapter.calls).toEqual([]);
    expect(s.host.errors).toEqual([]);
    expect(uploadPlugins(s.editor)).toBe(0);
  });

  it('destroy tira o plugin uma vez e ignora uma carga que chega depois', async () => {
    const s = await setup();
    await drain(s);
    const unregister = vi.spyOn(s.editor, 'unregisterPlugin');
    s.fixture.destroy();
    expect(unregister).toHaveBeenCalledTimes(1);

    TestBed.resetTestingModule();
    const gated = gatedLoader();
    const t = await setup({ loader: gated.loader });
    expect(t.cmp.uploadFiles([png('a.png')])).toBe(1);
    const register = vi.spyOn(t.editor, 'registerPlugin');
    t.fixture.destroy();
    gated.release();
    await drain(t);
    expect(register).not.toHaveBeenCalled();
    expect(t.adapter.calls).toEqual([]);
  });

  it('registrar o plugin não mexe no histórico, na seleção nem no value', async () => {
    const gated = gatedLoader();
    const s = await setup({ loader: gated.loader });
    s.editor.commands.focus('end');
    s.editor.commands.insertContent('X');
    s.editor.commands.setTextSelection({ from: 1, to: 3 });
    const log = [...s.host.log];
    const register = vi.spyOn(s.editor, 'registerPlugin');
    gated.release();
    await drain(s);
    expect(register).toHaveBeenCalledTimes(1);
    expect(s.editor.state.selection.from).toBe(1);
    expect(s.editor.state.selection.to).toBe(3);
    expect(s.host.log).toEqual(log);
    expect(s.editor.commands.undo()).toBe(true);
    expect(s.editor.getText()).toBe('ab');
  });
});
