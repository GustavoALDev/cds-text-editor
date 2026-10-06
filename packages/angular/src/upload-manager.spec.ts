import {
  ChangeDetectionStrategy,
  Component,
  NgZone,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import {
  provideRichText,
  RteEditor,
  RteUploadError,
  type RteUploadAdapter,
  type RteUploadConfig,
  type RteUploadErrorEvent,
} from '@cds/rte-angular';
import { getRteHtml } from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  escapeDialog,
  installDialogShim,
  waitForDialog,
} from './testing-support/dialog';
import { selectText } from './testing-support/editors';
import {
  createFakeUploadAdapter,
  type FakeUploadAdapter,
} from './testing-support/fake-upload-adapter';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';
import { RTE_TEST_MODE } from './testing-support/test-mode';
import { mediaSrcs } from './testing-support/upload-markers';
import type { RteUploadManager } from './upload/manager';
import { RTE_UPLOAD_KEY } from './upload/markers';

// Spec 05c2a, Tarefa 6: gerenciador de envios e ligações no `RteEditor`
// (E3, E4, E10, E11, E15–E18, E23; R3, R5, R7, R10, R13).

@Component({
  selector: 'rte-test-upload-host',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    [upload]="upload()"
    [readonly]="readonly()"
    [disabled]="disabled()"
    [hidden]="hidden()"
    (valueChange)="log.push('value')"
    (mediaChange)="log.push('media')"
    (uploadError)="onError($event)"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('<p>ab</p>');
  readonly upload = signal<RteUploadConfig | null | undefined>(undefined);
  readonly readonly = signal(false);
  readonly hidden = signal(false);
  readonly disabled = signal(false);
  readonly log: string[] = [];
  readonly errors: RteUploadErrorEvent[] = [];
  readonly errorZones: boolean[] = [];
  readonly cmp = viewChild.required(RteEditor);

  onError(e: RteUploadErrorEvent): void {
    this.log.push('error');
    this.errors.push(e);
    this.errorZones.push(NgZone.isInAngularZone());
  }
}

interface Setup {
  fixture: ComponentFixture<Host>;
  host: Host;
  cmp: RteEditor;
  editor: Editor;
  adapter: FakeUploadAdapter;
  error: ReturnType<typeof vi.spyOn>;
}

async function setup(
  o: {
    doc?: string;
    upload?: (adapter: FakeUploadAdapter) => RteUploadConfig | null;
    provider?: RteUploadConfig;
  } = {},
): Promise<Setup> {
  const error = vi.spyOn(console, 'error');
  if (o.provider) {
    TestBed.configureTestingModule({
      providers: [provideRichText({ upload: o.provider })],
    });
  }
  const adapter = createFakeUploadAdapter();
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  host.value.set(o.doc ?? '<p>ab</p>');
  host.upload.set(o.upload ? o.upload(adapter) : { adapter });
  fixture.autoDetectChanges();
  await settle(fixture);
  const cmp = host.cmp();
  return { fixture, host, cmp, editor: cmp.editor() as Editor, adapter, error };
}

const png = (name: string, size = 3) =>
  new File(['x'.repeat(size)], name, { type: 'image/png' });

/** Microtarefas e uma tarefa: as *promises* do adaptador assentam. */
async function drain(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await settle(fixture);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function manager(cmp: RteEditor): RteUploadManager {
  return (cmp as unknown as { uploadManager: RteUploadManager }).uploadManager;
}

function markerIds(editor: Editor): string[] {
  return (RTE_UPLOAD_KEY.getState(editor.state)?.markers ?? []).map(
    (m) => m.id,
  );
}

function states(cmp: RteEditor): string[] {
  return cmp.uploads().map((u) => `${u.fileName}:${u.state}`);
}

function noNg010x(error: Setup['error']): void {
  const messages: string[] = error.mock.calls.map((args: unknown[]) =>
    args.map(String).join(' '),
  );
  expect(messages.filter((m) => /NG010[01]/.test(m))).toEqual([]);
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

describe('configuração (E3, R3)', () => {
  it('entrada vence o provider', async () => {
    const provider = createFakeUploadAdapter();
    const s = await setup({ provider: { adapter: provider } });
    expect(s.cmp.uploadFiles([png('a.png')])).toBe(1);
    expect(s.adapter.calls.length).toBe(1);
    expect(provider.calls.length).toBe(0);
  });

  it('sem entrada, vale o provider', async () => {
    const provider = createFakeUploadAdapter();
    const s = await setup({
      provider: { adapter: provider },
      upload: () => undefined as unknown as null,
    });
    expect(s.cmp.uploadFiles([png('a.png')])).toBe(1);
    expect(provider.calls.length).toBe(1);
  });

  it('[upload]="null" desliga mesmo com provider; sem adaptador → 0', async () => {
    const provider = createFakeUploadAdapter();
    const s = await setup({
      provider: { adapter: provider },
      upload: () => null,
    });
    expect(s.cmp.uploadFiles([png('a.png')])).toBe(0);
    expect(provider.calls.length).toBe(0);
    expect(s.cmp.uploads()).toEqual([]);
    TestBed.resetTestingModule();
    const t = await setup({ upload: () => null });
    expect(t.cmp.uploadFiles([png('a.png')])).toBe(0);
    expect(markerIds(t.editor)).toEqual([]);
  });

  it('trocar a referência de upload aborta os envios sem uploadError', async () => {
    const s = await setup();
    expect(s.cmp.uploadFiles([png('a.png'), png('b.png')])).toBe(2);
    expect(markerIds(s.editor).length).toBe(2);
    s.host.upload.set({ adapter: s.adapter });
    await settle(s.fixture);
    expect(s.adapter.signal(0).aborted).toBe(true);
    expect(s.adapter.signal(1).aborted).toBe(true);
    expect(markerIds(s.editor)).toEqual([]);
    expect(s.cmp.uploads()).toEqual([]);
    expect(s.cmp.pendingUploads()).toBe(0);
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(mediaSrcs(s.editor.state.doc)).toEqual([]);
    expect(s.host.errors).toEqual([]);
    expect(manager(s.cmp).announcement()).toMatchObject({
      kind: 'cancelled',
      names: ['a.png', 'b.png'],
    });
  });
});

describe('fila e ordem (E11, R13)', () => {
  it('3 arquivos: 2 enviando, 1 na fila; o primeiro termina e o terceiro começa', async () => {
    const s = await setup();
    s.editor.commands.focus('end');
    expect(s.cmp.uploadFiles([png('a.png'), png('b.png'), png('c.png')])).toBe(
      3,
    );
    expect(s.adapter.calls.map((c) => c.file.name)).toEqual(['a.png', 'b.png']);
    expect(states(s.cmp)).toEqual([
      'a.png:uploading',
      'b.png:uploading',
      'c.png:queued',
    ]);
    expect(s.cmp.pendingUploads()).toBe(3);
    expect(s.host.log).toEqual([]);
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(s.adapter.calls.map((c) => c.file.name)).toEqual([
      'a.png',
      'b.png',
      'c.png',
    ]);
    expect(states(s.cmp)).toEqual(['b.png:uploading', 'c.png:uploading']);
    expect(s.cmp.pendingUploads()).toBe(2);
    s.adapter.resolve(2, { url: '/c.png' });
    s.adapter.resolve(1, { url: '/b.png' });
    await drain(s.fixture);
    expect(mediaSrcs(s.editor.state.doc)).toEqual([
      '/a.png',
      '/b.png',
      '/c.png',
    ]);
    expect(s.cmp.uploads()).toEqual([]);
  });

  it('ids únicos por instância, no formato rte-upload-<instância>-<n>', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png'), png('b.png')]);
    const ids = s.cmp.uploads().map((u) => u.id);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(id).toMatch(/^rte-upload-\d+-\d+$/);
  });
});

describe('validação no gesto (E5, R4)', () => {
  it('21 imagens: 20 aceitas, 1 count, 2 chamadas imediatas (Ruling 8)', async () => {
    const s = await setup();
    const files = Array.from({ length: 21 }, (_, i) => png(`f${i}.png`));
    expect(s.cmp.uploadFiles(files)).toBe(20);
    expect(s.cmp.uploads().length).toBe(20);
    expect(s.adapter.calls.length).toBe(2);
    expect(s.host.errors).toEqual([
      { fileName: 'f20.png', type: 'image', reason: 'count' },
    ]);
    for (let i = 0; i < 20; i++) {
      s.adapter.resolve(i, { url: `/f${i}.png` });
      await drain(s.fixture);
    }
    expect(s.adapter.calls.length).toBe(20);
    expect(s.adapter.calls.map((c) => c.file.name)).not.toContain('f20.png');
  });

  it('svg no meio: type; os outros seguem; nenhuma chamada para o recusado', async () => {
    const s = await setup();
    const svg = new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' });
    expect(s.cmp.uploadFiles([png('a.png'), svg, png('b.png')])).toBe(2);
    expect(s.host.errors).toEqual([
      { fileName: 'x.svg', type: 'image', reason: 'type' },
    ]);
    expect(s.adapter.calls.map((c) => c.file.name)).toEqual(['a.png', 'b.png']);
    expect(s.cmp.uploads().map((u) => u.fileName)).toEqual(['a.png', 'b.png']);
  });

  it('tamanho acima do limite: size', async () => {
    const s = await setup({
      upload: (adapter) => ({ adapter, maxImageBytes: 2 }),
    });
    expect(s.cmp.uploadFiles([png('big.png', 3)])).toBe(0);
    expect(s.host.errors).toEqual([
      { fileName: 'big.png', type: 'image', reason: 'size' },
    ]);
    expect(s.adapter.calls).toEqual([]);
  });
});

describe('erros do adaptador e chegada (E4, E6, E9, R5, R7)', () => {
  it('RteUploadError(network) mantém o motivo e a causa; marcador e item saem', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    const e = new RteUploadError('network');
    s.adapter.reject(0, e);
    await drain(s.fixture);
    expect(s.host.errors).toEqual([
      { fileName: 'a.png', type: 'image', reason: 'network', cause: e },
    ]);
    expect(s.host.errors[0]?.cause).toBe(e);
    expect(markerIds(s.editor)).toEqual([]);
    expect(s.cmp.uploads()).toEqual([]);
    expect(manager(s.cmp).announcement()).toMatchObject({
      kind: 'error',
      names: ['a.png'],
      reason: 'network',
    });
  });

  it('Error comum → server', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    s.adapter.reject(0, new Error('x'));
    await drain(s.fixture);
    expect(s.host.errors.map((e) => e.reason)).toEqual(['server']);
  });

  it('cancelar e depois resolver: nada inserido, nenhuma emissão', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    const id = s.cmp.uploads()[0]?.id as string;
    const before = s.editor.state.doc;
    expect(s.cmp.cancelUpload(id)).toBe(true);
    expect(s.adapter.signal(0).aborted).toBe(true);
    expect(s.cmp.cancelUpload(id)).toBe(false);
    expect(markerIds(s.editor)).toEqual([]);
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(s.editor.state.doc).toBe(before);
    expect(s.host.log).toEqual([]);
    expect(manager(s.cmp).announcement()).toMatchObject({
      kind: 'cancelled',
      names: ['a.png'],
    });
  });

  it('cancelar e depois rejeitar com AbortError: nada', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    s.cmp.cancelAllUploads();
    expect(s.adapter.signal(0).aborted).toBe(true);
    s.adapter.reject(0, new DOMException('abortado', 'AbortError'));
    await drain(s.fixture);
    expect(s.host.log).toEqual([]);
    expect(s.cmp.uploads()).toEqual([]);
  });

  it('resposta com http: → response, marcador fora, nada inserido', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    s.adapter.resolve(0, { url: 'http://cdn.example.test/a.png' });
    await drain(s.fixture);
    expect(s.host.errors.map((e) => e.reason)).toEqual(['response']);
    expect(markerIds(s.editor)).toEqual([]);
    expect(mediaSrcs(s.editor.state.doc)).toEqual([]);
    expect(s.host.log).toEqual(['error']);
  });

  it('marcador sem emissão; chegada com uma emissão de value e de mediaChange', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    await settle(s.fixture);
    expect(markerIds(s.editor).length).toBe(1);
    expect(s.host.log).toEqual([]);
    s.adapter.resolve(0, { url: '/a.png', width: 10, height: 20 });
    await drain(s.fixture);
    expect(s.host.log).toEqual(['value', 'media']);
    expect(markerIds(s.editor)).toEqual([]);
    const html = getRteHtml(s.editor);
    expect(html).toContain('src="/a.png"');
    expect(html).toContain('width="10"');
    expect(html).not.toContain('rte-upload-marker');
    expect(s.cmp.mediaSession().current).toEqual(['/a.png']);
    expect(manager(s.cmp).announcement()).toMatchObject({
      kind: 'done',
      names: ['a.png'],
    });
    // colado/`uploadFiles`: `alt: null` (E9, E19)
    expect(s.cmp.imagesMissingAlt()).toBe(1);
  });

  it('com foco e cursor no marcador, a mídia fica selecionada (E9)', async () => {
    const s = await setup();
    s.editor.commands.focus('end');
    vi.spyOn(s.editor.view, 'hasFocus').mockReturnValue(true);
    s.cmp.uploadFiles([png('a.png')]);
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(s.editor.state.selection.toJSON()).toMatchObject({ type: 'node' });
  });

  it('vídeo: uploadVideo com a resposta e o poster', async () => {
    const s = await setup();
    const webm = new File(['v'], 'v.webm', { type: 'video/webm' });
    expect(s.cmp.uploadFiles([webm])).toBe(1);
    expect(s.adapter.calls[0]?.type).toBe('video');
    s.adapter.resolve(0, { url: '/v.webm', poster: '/p.png' });
    await drain(s.fixture);
    const html = getRteHtml(s.editor);
    expect(html).toContain('src="/v.webm"');
    expect(html).toContain('poster="/p.png"');
  });
});

describe('adaptador mal comportado (Review Focus 2)', () => {
  it('onProgress: NaN → null, 1.7 → 1, -1 → 0; depois de resolver, ignorado', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    const progress = () => s.cmp.uploads()[0]?.progress;
    s.adapter.progress(0, 0.5);
    await nextFrame();
    expect(progress()).toBe(0.5);
    s.adapter.progress(0, Number.NaN);
    await nextFrame();
    expect(progress()).toBeNull();
    s.adapter.progress(0, 1.7);
    await nextFrame();
    expect(progress()).toBe(1);
    s.adapter.progress(0, -1);
    await nextFrame();
    expect(progress()).toBe(0);
    s.adapter.progress(0, 'x' as unknown as number);
    await nextFrame();
    expect(progress()).toBeNull();
    // o editor fica na espera: a chegada não pode limpar a lista ainda
    vi.spyOn(s.editor.view, 'composing', 'get').mockReturnValue(true);
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(s.cmp.uploads()[0]?.state).toBe('inserting');
    const list = s.cmp.uploads();
    s.adapter.progress(0, 0.9);
    await nextFrame();
    expect(s.cmp.uploads()).toBe(list);
  });

  it.each([
    [
      'lança em vez de rejeitar → server',
      (): never => {
        throw new Error('boom');
      },
      'server',
    ],
    ['devolve 42 (não promise) → response', (): unknown => 42, 'response'],
    [
      'resolve null → response',
      (): unknown => Promise.resolve(null),
      'response',
    ],
    ["resolve 'x' → response", (): unknown => Promise.resolve('x'), 'response'],
  ] as const)('%s', async (_name, uploadImage, reason) => {
    const s = await setup({
      upload: () => ({
        adapter: { uploadImage } as unknown as RteUploadAdapter,
      }),
    });
    expect(s.cmp.uploadFiles([png('a.png')])).toBe(1);
    await drain(s.fixture);
    expect(s.host.errors.map((e) => e.reason)).toEqual([reason]);
    expect(s.cmp.uploads()).toEqual([]);
    expect(markerIds(s.editor)).toEqual([]);
  });
});

describe('nome exibido (Review Focus 1)', () => {
  it("arquivo de nome '' → image.png na lista; uploadError com o nome cru", async () => {
    const s = await setup();
    s.cmp.uploadFiles([new File(['x'], '', { type: 'image/png' })]);
    expect(s.cmp.uploads()[0]?.fileName).toBe('image.png');
    s.adapter.reject(0, new Error('x'));
    await drain(s.fixture);
    expect(s.host.errors[0]?.fileName).toBe('');
    expect(manager(s.cmp).announcement()?.names).toEqual(['image.png']);
  });
});

describe('adiamento da inserção (E10, R7)', () => {
  it('diálogo aberto na chegada: inserting, o diálogo continua; cancelar → inserido', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    selectText(s.editor, 'ab');
    expect(s.cmp.openDialog('link')).toBe(true);
    const dialog = await waitForDialog(s.fixture);
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(states(s.cmp)).toEqual(['a.png:inserting']);
    expect(s.cmp.pendingUploads()).toBe(1);
    expect(dialog.open).toBe(true);
    expect(mediaSrcs(s.editor.state.doc)).toEqual([]);
    escapeDialog(dialog);
    await drain(s.fixture);
    expect(mediaSrcs(s.editor.state.doc)).toEqual(['/a.png']);
    expect(s.cmp.uploads()).toEqual([]);
    expect(s.host.log).toEqual(['value', 'media']);
    noNg010x(s.error);
  });

  it('composição de IME: espera o compositionend', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    const composing = vi
      .spyOn(s.editor.view, 'composing', 'get')
      .mockReturnValue(true);
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(states(s.cmp)).toEqual(['a.png:inserting']);
    expect(mediaSrcs(s.editor.state.doc)).toEqual([]);
    composing.mockRestore();
    s.editor.view.dom.dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true, data: 'é' }),
    );
    await drain(s.fixture);
    expect(mediaSrcs(s.editor.state.doc)).toEqual(['/a.png']);
    expect(s.cmp.uploads()).toEqual([]);
  });

  it('readonly na chegada → unavailable, marcador fora', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    s.host.readonly.set(true);
    await settle(s.fixture);
    expect(s.adapter.signal(0).aborted).toBe(false);
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(s.host.errors).toEqual([
      { fileName: 'a.png', type: 'image', reason: 'unavailable' },
    ]);
    expect(markerIds(s.editor)).toEqual([]);
    expect(mediaSrcs(s.editor.state.doc)).toEqual([]);
  });

  it('readonly durante o envio sem chegada: nada abortado; volta a editar e insere', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    s.host.readonly.set(true);
    await settle(s.fixture);
    s.host.readonly.set(false);
    await settle(s.fixture);
    expect(s.adapter.signal(0).aborted).toBe(false);
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(mediaSrcs(s.editor.state.doc)).toEqual(['/a.png']);
    expect(s.host.errors).toEqual([]);
  });
});

describe('ciclo de vida (E17, R10)', () => {
  it('destroy aborta sem uploadError', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    s.fixture.destroy();
    expect(s.adapter.signal(0).aborted).toBe(true);
    s.adapter.resolve(0, { url: '/a.png' });
    await new Promise((resolve) => setTimeout(resolve));
    expect(s.host.errors).toEqual([]);
  });

  it('carga externa aborta e anuncia um cancelamento', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png'), png('b.png')]);
    const n = manager(s.cmp).announcement()?.n ?? 0;
    s.host.value.set('<p>outro</p>');
    await settle(s.fixture);
    expect(s.adapter.signal(0).aborted).toBe(true);
    expect(s.adapter.signal(1).aborted).toBe(true);
    expect(s.cmp.uploads()).toEqual([]);
    expect(markerIds(s.editor)).toEqual([]);
    expect(manager(s.cmp).announcement()).toEqual({
      n: n + 1,
      kind: 'cancelled',
      names: ['a.png', 'b.png'],
    });
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(getRteHtml(s.editor)).toBe('<p>outro</p>');
    expect(s.host.errors).toEqual([]);
    expect(s.host.log).toEqual([]);
  });

  it('disabled não aborta', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    s.host.disabled.set(true);
    await settle(s.fixture);
    expect(s.adapter.signal(0).aborted).toBe(false);
    expect(s.cmp.pendingUploads()).toBe(1);
  });
});

describe('zona e detecção de mudanças (E23)', () => {
  it('adaptador chamado dentro de runOutsideAngular; uploadError na zona', async () => {
    const s = await setup();
    const zone = TestBed.inject(NgZone);
    const outside = zone.runOutsideAngular.bind(zone);
    let depth = 0;
    vi.spyOn(zone, 'runOutsideAngular').mockImplementation(
      <T>(fn: (...a: unknown[]) => T) => {
        depth += 1;
        try {
          return outside(fn);
        } finally {
          depth -= 1;
        }
      },
    );
    const seen: { depth: number; inZone: boolean }[] = [];
    const uploadImage = s.adapter.uploadImage;
    s.adapter.uploadImage = (file, ctx) => {
      seen.push({ depth, inZone: NgZone.isInAngularZone() });
      return uploadImage(file, ctx);
    };
    s.cmp.uploadFiles([png('a.png')]);
    expect(seen).toEqual([{ depth: 1, inZone: false }]);
    s.adapter.reject(0, new Error('x'));
    await drain(s.fixture);
    const zoned = TestBed.inject(RTE_TEST_MODE) === 'zone';
    expect(s.host.errorZones).toEqual([zoned]);
    noNg010x(s.error);
  });

  it('50 onProgress no mesmo quadro → no máximo uma escrita em uploads', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    const before = s.cmp.uploads();
    for (let i = 1; i <= 50; i++) s.adapter.progress(0, i / 100);
    expect(s.cmp.uploads()).toBe(before);
    const scheduled = frames.length;
    expect(scheduled).toBe(1);
    for (const cb of frames.splice(0)) cb(performance.now());
    const after = s.cmp.uploads();
    expect(after).not.toBe(before);
    expect(after[0]?.progress).toBe(0.5);
    // mudança < 0,01 não publica
    s.adapter.progress(0, 0.505);
    for (const cb of frames.splice(0)) cb(performance.now());
    expect(s.cmp.uploads()).toBe(after);
    await settle(s.fixture);
    noNg010x(s.error);
  });
});

describe('revisão da Tarefa 6 (Ruling 27)', () => {
  it('o widget do marcador é o elemento do gerenciador (vídeo, sem --queued depois de começar)', async () => {
    const s = await setup();
    const webm = new File(['v'], 'v.webm', { type: 'video/webm' });
    s.cmp.uploadFiles([webm, png('a.png'), png('b.png')]);
    const [v, , b] = s.cmp.uploads().map((u) => u.id) as [
      string,
      string,
      string,
    ];
    const shown = [
      ...s.editor.view.dom.querySelectorAll<HTMLElement>('.rte-upload-marker'),
    ];
    expect(shown.length).toBe(3);
    expect(shown[0]).toBe(manager(s.cmp).elementOf(v));
    expect(shown[2]).toBe(manager(s.cmp).elementOf(b));
    expect(shown[0]?.classList.contains('rte-upload-marker--video')).toBe(true);
    expect(shown[0]?.classList.contains('rte-upload-marker--queued')).toBe(
      false,
    );
    expect(shown[2]?.classList.contains('rte-upload-marker--queued')).toBe(
      true,
    );
    s.adapter.resolve(0, { url: '/v.webm' });
    await drain(s.fixture);
    expect(shown[2]?.classList.contains('rte-upload-marker--queued')).toBe(
      false,
    );
  });

  it('recusas do gesto: um anúncio de erro combinado, depois do início', async () => {
    const s = await setup({
      upload: (adapter) => ({ adapter, maxImageBytes: 2 }),
    });
    const svg = new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' });
    expect(s.cmp.uploadFiles([svg, png('big.png', 3)])).toBe(0);
    expect(manager(s.cmp).announcement()).toEqual({
      n: 1,
      kind: 'error',
      names: ['x.svg', 'big.png'],
      reasons: ['type', 'size'],
      reason: 'type',
    });
    expect(s.cmp.uploadFiles([png('a.png', 1), svg])).toBe(1);
    expect(manager(s.cmp).announcement()).toMatchObject({
      n: 3,
      kind: 'error',
      names: ['x.svg'],
      reasons: ['type'],
    });
  });

  it('hidden na chegada → unavailable', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    s.host.hidden.set(true);
    await settle(s.fixture);
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(s.host.errors.map((e) => e.reason)).toEqual(['unavailable']);
    expect(markerIds(s.editor)).toEqual([]);
  });

  it('cancelar todos com um envio esperando para inserir: nada entra depois', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    const composing = vi
      .spyOn(s.editor.view, 'composing', 'get')
      .mockReturnValue(true);
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(states(s.cmp)).toEqual(['a.png:inserting']);
    s.cmp.cancelAllUploads();
    expect(s.cmp.uploads()).toEqual([]);
    expect(markerIds(s.editor)).toEqual([]);
    composing.mockRestore();
    s.editor.view.dom.dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true }),
    );
    await drain(s.fixture);
    expect(mediaSrcs(s.editor.state.doc)).toEqual([]);
    expect(s.host.errors).toEqual([]);
  });

  it('vídeo sem uploadVideo → type, sem chamada', async () => {
    const s = await setup({
      upload: () => ({ adapter: createFakeUploadAdapter({ video: false }) }),
    });
    const webm = new File(['v'], 'v.webm', { type: 'video/webm' });
    expect(s.cmp.uploadFiles([webm])).toBe(0);
    expect(s.host.errors).toEqual([
      { fileName: 'v.webm', type: 'video', reason: 'type' },
    ]);
  });

  it('exceção na inserção → response com a causa', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    const boom = new Error('boom');
    vi.spyOn(s.editor, 'chain').mockImplementation(() => {
      throw boom;
    });
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(s.host.errors).toEqual([
      { fileName: 'a.png', type: 'image', reason: 'response', cause: boom },
    ]);
  });

  it('sem compositionend, a transação seguinte libera a inserção adiada', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    const composing = vi
      .spyOn(s.editor.view, 'composing', 'get')
      .mockReturnValue(true);
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    s.editor.commands.insertContentAt(1, 'x');
    await drain(s.fixture);
    expect(mediaSrcs(s.editor.state.doc)).toEqual([]);
    composing.mockRestore();
    s.editor.commands.insertContentAt(1, 'y');
    await drain(s.fixture);
    expect(mediaSrcs(s.editor.state.doc)).toEqual(['/a.png']);
    expect(s.cmp.uploads()).toEqual([]);
  });

  it('a fila esvaziada cancela o quadro pendente', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return 77;
    });
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    s.adapter.progress(0, 0.5);
    expect(frames.length).toBe(1);
    s.cmp.cancelAllUploads();
    expect(cancel).toHaveBeenCalledWith(77);
  });
});
