import {
  ChangeDetectionStrategy,
  Component,
  NgZone,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor, type RteUploadConfig } from '@comodeviaser/rte-angular';
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
import { RTE_UPLOAD_LOADER } from './upload/facade';

// Spec 05c2b, Tarefa 1: `isDirty`, `markSaved` e `onMediaRemoved` (R5; S8, S9).

const IMG = (src: string) =>
  `<figure class="rt-figure rt-figure--center"><img src="${src}" alt="A"></figure>`;

@Component({
  selector: 'rte-test-dirty',
  imports: [RteEditor],
  template: `<rte-editor [value]="value()" [upload]="upload()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('<p>ab</p>');
  readonly upload = signal<RteUploadConfig | null>(null);
  readonly cmp = viewChild.required(RteEditor);
  /** `markSaved` na vista pronta, antes do `afterNextRender` do editor. */
  early: boolean | null = null;

  ngAfterViewInit(): void {
    this.early = this.cmp().markSaved();
  }
}

interface Removed {
  urls: readonly string[];
  inZone: boolean;
}

interface Setup {
  fixture: ComponentFixture<Host>;
  host: Host;
  cmp: RteEditor;
  editor: Editor;
  adapter: FakeUploadAdapter;
  removed: Removed[];
  errors: ReturnType<typeof vi.spyOn>;
}

async function setup(
  doc = '<p>ab</p>',
  o: { reject?: boolean } = {},
): Promise<Setup> {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: RTE_UPLOAD_LOADER,
        useValue: () => import('./upload/rte-upload'),
      },
    ],
  });
  const errors = vi.spyOn(console, 'error');
  const adapter = createFakeUploadAdapter();
  const removed: Removed[] = [];
  adapter.onMediaRemoved = (urls) => {
    removed.push({ urls, inZone: NgZone.isInAngularZone() });
    return o.reject ? Promise.reject(new Error('falhou')) : undefined;
  };
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  host.value.set(doc);
  host.upload.set({ adapter });
  fixture.autoDetectChanges();
  await settle(fixture);
  const cmp = host.cmp();
  return {
    fixture,
    host,
    cmp,
    editor: cmp.editor() as Editor,
    adapter,
    removed,
    errors,
  };
}

/** Deixa o *chunk* de envio chegar (ocioso). */
async function drain(s: Setup): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await settle(s.fixture);
  }
  const loading = (uploadsOf(s.cmp) as unknown as { loaded: Promise<unknown> })
    .loaded;
  if (loading) await loading;
  await settle(s.fixture);
}

function noNg010x(s: Setup): void {
  const messages: string[] = s.errors.mock.calls.map((args: unknown[]) =>
    args.map(String).join(' '),
  );
  expect(messages.filter((m: string) => /NG010[01]/.test(m))).toEqual([]);
}

function removeImage(editor: Editor, n = 0): void {
  let seen = 0;
  let found: { pos: number; size: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === 'rtImage' && seen++ === n) {
      found = { pos, size: node.nodeSize };
    }
    return true;
  });
  const hit = found as { pos: number; size: number } | null;
  if (!hit) throw new Error('sem imagem');
  editor.view.dispatch(editor.state.tr.delete(hit.pos, hit.pos + hit.size));
}

const png = (name: string) => new File(['x'], name, { type: 'image/png' });

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

describe('isDirty (S8)', () => {
  it('limpo na criação; sujo ao editar; limpo ao desfazer até a base', async () => {
    const s = await setup();
    expect(s.cmp.isDirty()).toBe(false);
    s.editor.commands.insertContent('x');
    await settle(s.fixture);
    expect(s.cmp.isDirty()).toBe(true);
    s.editor.commands.undo();
    await settle(s.fixture);
    expect(s.cmp.isDirty()).toBe(false);
    noNg010x(s);
  });

  it('limpo após carga externa', async () => {
    const s = await setup();
    s.editor.commands.insertContent('x');
    await settle(s.fixture);
    expect(s.cmp.isDirty()).toBe(true);
    s.host.value.set('<p>novo</p>');
    await settle(s.fixture);
    expect(s.cmp.isDirty()).toBe(false);
    s.editor.commands.insertContent('y');
    await settle(s.fixture);
    expect(s.cmp.isDirty()).toBe(true);
    noNg010x(s);
  });
});

describe('markSaved (S8)', () => {
  it('markSaved() fixa o valor atual como base', async () => {
    const s = await setup();
    s.editor.commands.insertContent('x');
    await settle(s.fixture);
    expect(s.cmp.markSaved()).toBe(true);
    expect(s.cmp.isDirty()).toBe(false);
    s.editor.commands.insertContent('y');
    await settle(s.fixture);
    expect(s.cmp.isDirty()).toBe(true);
    noNg010x(s);
  });

  it('markSaved(html) com digitação no meio continua sujo; igual ao atual limpa', async () => {
    const s = await setup();
    s.editor.commands.insertContent('x');
    await settle(s.fixture);
    const sent = '<p>xab</p>';
    s.editor.commands.insertContent('y');
    await settle(s.fixture);
    const current = s.cmp.value();
    expect(s.cmp.markSaved(sent)).toBe(true);
    expect(s.cmp.isDirty()).toBe(true);
    expect(s.cmp.markSaved(current)).toBe(true);
    expect(s.cmp.isDirty()).toBe(false);
    noNg010x(s);
  });

  it('savedHtml passa pela leitura do esquema antes de virar base', async () => {
    const s = await setup();
    expect(s.cmp.markSaved('<p>ab</p><script>x</script>')).toBe(true);
    expect(s.cmp.isDirty()).toBe(false);
    expect(s.cmp.markSaved('')).toBe(true);
    expect(s.cmp.isDirty()).toBe(true);
  });

  it('antes de editorReady devolve false', () => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect(fixture.componentInstance.early).toBe(false);
    expect(fixture.componentInstance.cmp().isDirty()).toBe(false);
  });
});

describe('onMediaRemoved (S9)', () => {
  const DOC = `${IMG('/a.png')}${IMG('/b.png')}<p>t</p>`;

  it('nunca é chamado por mídia removida, só por markSaved', async () => {
    const s = await setup(DOC);
    removeImage(s.editor);
    await settle(s.fixture);
    s.host.value.set('<p>outro</p>');
    await settle(s.fixture);
    expect(s.removed).toEqual([]);
  });

  it('markSaved entrega os endereços removidos, fora da zona', async () => {
    const s = await setup(DOC);
    await drain(s);
    removeImage(s.editor);
    await settle(s.fixture);
    s.cmp.markSaved();
    expect(s.removed).toEqual([{ urls: ['/a.png'], inZone: false }]);
    s.cmp.markSaved();
    expect(s.removed).toHaveLength(1);
    noNg010x(s);
  });

  it('lista vazia não chama; endereço do savedHtml fica de fora', async () => {
    const s = await setup(DOC);
    s.cmp.markSaved();
    expect(s.removed).toEqual([]);
    removeImage(s.editor);
    await settle(s.fixture);
    s.cmp.markSaved(DOC);
    expect(s.removed).toEqual([]);
  });

  it('espera pendingUploads() zerar e filtra de novo contra o documento', async () => {
    const s = await setup(DOC);
    await drain(s);
    s.editor.commands.focus('end');
    expect(s.cmp.uploadFiles([png('n.png')])).toBe(1);
    await settle(s.fixture);
    expect(s.cmp.pendingUploads()).toBe(1);
    removeImage(s.editor, 0);
    removeImage(s.editor, 0);
    await settle(s.fixture);
    s.cmp.markSaved();
    expect(s.removed).toEqual([]);
    // o endereço volta ao documento antes da entrega
    s.editor.commands.insertContent(IMG('/a.png'));
    await settle(s.fixture);
    s.adapter.resolve(0, { url: '/n.png' });
    await drain(s);
    expect(s.cmp.pendingUploads()).toBe(0);
    expect(s.removed).toEqual([{ urls: ['/b.png'], inZone: false }]);
    noNg010x(s);
  });

  it('lista que fica vazia depois do filtro não chama', async () => {
    const s = await setup(DOC);
    await drain(s);
    s.editor.commands.focus('end');
    s.cmp.uploadFiles([png('n.png')]);
    await settle(s.fixture);
    removeImage(s.editor, 0);
    await settle(s.fixture);
    s.cmp.markSaved();
    s.editor.commands.insertContent(IMG('/a.png'));
    await settle(s.fixture);
    s.adapter.resolve(0, { url: '/n.png' });
    await drain(s);
    expect(s.removed).toEqual([]);
  });

  it('destroy antes da entrega descarta a lista', async () => {
    const s = await setup(DOC);
    await drain(s);
    s.editor.commands.focus('end');
    s.cmp.uploadFiles([png('n.png')]);
    await settle(s.fixture);
    removeImage(s.editor, 0);
    await settle(s.fixture);
    s.cmp.markSaved();
    s.fixture.destroy();
    s.adapter.resolve(0, { url: '/n.png' });
    await new Promise((resolve) => setTimeout(resolve));
    expect(s.removed).toEqual([]);
  });

  it('rejeição e exceção do adaptador são engolidas com aviso', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = await setup(DOC, { reject: true });
    removeImage(s.editor);
    await settle(s.fixture);
    s.cmp.markSaved();
    await new Promise((resolve) => setTimeout(resolve));
    expect(s.removed).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    s.adapter.onMediaRemoved = () => {
      throw new Error('sync');
    };
    removeImage(s.editor);
    await settle(s.fixture);
    expect(() => s.cmp.markSaved()).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
