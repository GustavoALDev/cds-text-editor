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
import { getRteHtml } from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchDrag,
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
import { uploadsOf, whenUploadReady } from './testing-support/upload-runtime';
import { RTE_UPLOAD_LOADER, type RteUploadLoader } from './upload/facade';
import { RTE_UPLOAD_KEY } from './upload/markers';

// Spec 05c2a, Tarefa 9: colar e soltar arquivos (E12, E13; R8; pré-voo 12) e
// o tratador mínimo do principal, que vale antes de o *chunk* `rte-upload`
// chegar e depois de a carga falhar (Ruling 29).

@Component({
  selector: 'rte-test-paste-drop',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    [upload]="upload()"
    [readonly]="readonly()"
    [maxLength]="maxLength()"
    (uploadError)="errors.push($event)"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('<p>abcd</p>');
  readonly upload = signal<RteUploadConfig | null>(null);
  readonly readonly = signal(false);
  readonly maxLength = signal<number | undefined>(undefined);
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

const realLoader: RteUploadLoader = () => import('./upload/rte-upload');

async function setup(
  o: {
    doc?: string;
    enabled?: boolean;
    readonly?: boolean;
    maxLength?: number;
    loader?: RteUploadLoader;
    /** Espera o *chunk* antes do gesto (padrão `true`). */
    ready?: boolean;
  } = {},
): Promise<Setup> {
  TestBed.configureTestingModule({
    providers: [
      { provide: RTE_UPLOAD_LOADER, useValue: o.loader ?? realLoader },
    ],
  });
  const adapter = createFakeUploadAdapter();
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  host.value.set(o.doc ?? '<p>abcd</p>');
  host.readonly.set(o.readonly ?? false);
  host.maxLength.set(o.maxLength);
  if (o.enabled !== false) host.upload.set({ adapter });
  fixture.autoDetectChanges();
  await settle(fixture);
  const cmp = host.cmp();
  if (o.enabled !== false && o.ready !== false) {
    await whenUploadReady(cmp);
    await settle(fixture);
  }
  const editor = cmp.editor() as Editor;
  return { fixture, host, cmp, editor, dom: editor.view.dom, adapter };
}

const png = (name: string) => new File(['x'], name, { type: 'image/png' });
const svg = (name: string) =>
  new File(['<svg/>'], name, { type: 'image/svg+xml' });

function markers(editor: Editor): { pos: number; index: number }[] {
  return (RTE_UPLOAD_KEY.getState(editor.state)?.markers ?? []).map((m) => ({
    pos: m.pos,
    index: m.index,
  }));
}

function names(cmp: RteEditor): string[] {
  return cmp.uploads().map((u) => u.fileName);
}

/** Troca `view.posAtCoords` (o jsdom não mede); devolve a função que restaura. */
function fakePosAtCoords(
  editor: Editor,
  at: (c: { left: number; top: number }) => number | null,
): { calls: { left: number; top: number }[]; restore: () => void } {
  const view = editor.view;
  const calls: { left: number; top: number }[] = [];
  const original = Object.getOwnPropertyDescriptor(view, 'posAtCoords');
  Object.defineProperty(view, 'posAtCoords', {
    configurable: true,
    writable: true,
    value: (c: { left: number; top: number }) => {
      calls.push(c);
      const pos = at(c);
      return pos === null ? null : { pos, inside: -1 };
    },
  });
  return {
    calls,
    restore: () => {
      if (original) Object.defineProperty(view, 'posAtCoords', original);
      else Reflect.deleteProperty(view, 'posAtCoords');
    },
  };
}

async function drain(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await settle(fixture);
  }
}

let restoreDialog: () => void;
let restorePopover: () => void;
let restoreTransfer: () => void;
beforeEach(() => {
  restoreDialog = installDialogShim();
  restorePopover = installPopoverShim();
  restoreTransfer = installDataTransferShim();
});
afterEach(() => {
  TestBed.resetTestingModule();
  restoreTransfer();
  restorePopover();
  restoreDialog();
  vi.restoreAllMocks();
});

describe('colar arquivos (E12)', () => {
  it('só imagem → marcador em selection.to, preventDefault e a seleção fica', async () => {
    const s = await setup();
    selectText(s.editor, 'abcd', 1, 3);
    const e = dispatchPaste(s.dom, { files: [png('a.png')] });
    expect(e.defaultPrevented).toBe(true);
    expect(markers(s.editor)).toEqual([{ pos: 4, index: 0 }]);
    expect(names(s.cmp)).toEqual(['a.png']);
    expect(s.editor.getText()).toBe('abcd');
    expect(s.editor.state.selection.from).toBe(2);
    expect(s.editor.state.selection.to).toBe(4);
  });

  it('imagem + text/html sem texto → envio', async () => {
    const s = await setup();
    selectText(s.editor, 'abcd', 4);
    const e = dispatchPaste(s.dom, {
      files: [png('a.png')],
      html: '<img src="data:image/png;base64,AAAA">',
    });
    expect(e.defaultPrevented).toBe(true);
    expect(names(s.cmp)).toEqual(['a.png']);
    expect(s.editor.getText()).toBe('abcd');
  });

  it("imagem + text/plain 'oi' → colagem de texto do core, nenhum envio", async () => {
    const s = await setup();
    selectText(s.editor, 'abcd', 4);
    dispatchPaste(s.dom, { files: [png('a.png')], text: 'oi' });
    expect(s.editor.getText()).toBe('abcdoi');
    expect(markers(s.editor)).toEqual([]);
    expect(s.cmp.uploads()).toEqual([]);
    expect(s.adapter.calls).toEqual([]);
  });

  it('text/plain só com espaços → envio', async () => {
    const s = await setup();
    selectText(s.editor, 'abcd', 4);
    dispatchPaste(s.dom, { files: [png('a.png')], text: ' \n\t ' });
    expect(names(s.cmp)).toEqual(['a.png']);
    expect(s.editor.getText()).toBe('abcd');
  });

  it('3 arquivos → 3 marcadores na ordem do gesto', async () => {
    const s = await setup();
    selectText(s.editor, 'abcd', 2);
    dispatchPaste(s.dom, { files: [png('a.png'), png('b.png'), png('c.png')] });
    expect(markers(s.editor)).toEqual([
      { pos: 3, index: 0 },
      { pos: 3, index: 1 },
      { pos: 3, index: 2 },
    ]);
    expect(names(s.cmp)).toEqual(['a.png', 'b.png', 'c.png']);
  });

  it("svg no meio → uploadError 'type' e os outros seguem", async () => {
    const s = await setup();
    dispatchPaste(s.dom, { files: [png('a.png'), svg('x.svg'), png('c.png')] });
    expect(s.host.errors).toEqual([
      { fileName: 'x.svg', type: 'image', reason: 'type' },
    ]);
    expect(names(s.cmp)).toEqual(['a.png', 'c.png']);
  });

  it('sem adaptador → caminho do core (img data: continua sem imagem)', async () => {
    const s = await setup({ enabled: false });
    selectText(s.editor, 'abcd', 4);
    const before = getRteHtml(s.editor);
    dispatchPaste(s.dom, {
      files: [png('a.png')],
      html: '<img src="data:image/png;base64,AAAA">',
    });
    expect(getRteHtml(s.editor)).toBe(before);
    expect(getRteHtml(s.editor)).not.toContain('<img');
    expect(s.cmp.uploads()).toEqual([]);
    expect(s.host.errors).toEqual([]);
  });

  it('readonly → nada', async () => {
    const s = await setup({ readonly: true });
    dispatchPaste(s.dom, { files: [png('a.png')] });
    expect(markers(s.editor)).toEqual([]);
    expect(s.cmp.uploads()).toEqual([]);
    expect(s.host.errors).toEqual([]);
  });

  it('maxLength cheio: colar arquivo ainda cria envio (antes do charLimit)', async () => {
    const s = await setup({ maxLength: 4 });
    selectText(s.editor, 'abcd', 4);
    const e = dispatchPaste(s.dom, { files: [png('a.png')] });
    expect(e.defaultPrevented).toBe(true);
    expect(names(s.cmp)).toEqual(['a.png']);
  });
});

describe('colar: bloco de código e tabela (Review Focus 5)', () => {
  it('cursor num bloco de código → marcador, nada colado no código, figura depois do bloco', async () => {
    const s = await setup({ doc: '<pre><code>xy</code></pre><p>z</p>' });
    selectText(s.editor, 'xy', 1);
    const e = dispatchPaste(s.dom, { files: [png('a.png')] });
    expect(e.defaultPrevented).toBe(true);
    expect(markers(s.editor)).toHaveLength(1);
    expect(s.editor.state.doc.child(0).textContent).toBe('xy');
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    const types: string[] = [];
    s.editor.state.doc.forEach((n) => types.push(n.type.name));
    expect(types[0]).toBe('codeBlock');
    expect(types[1]).not.toBe('paragraph');
    expect(getRteHtml(s.editor)).toMatch(
      /^<pre[^>]*><code[^>]*>xy<\/code><\/pre><figure[^>]*><img src="\/a\.png"/,
    );
    expect(s.editor.state.doc.child(0).textContent).toBe('xy');
  });

  it('cursor numa célula → figura dentro da célula', async () => {
    const s = await setup({
      doc: '<table><tbody><tr><td><p>cel</p></td></tr></tbody></table>',
    });
    selectText(s.editor, 'cel', 1);
    dispatchPaste(s.dom, { files: [png('a.png')] });
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(getRteHtml(s.editor)).toMatch(
      /<td><p>cel<\/p><figure[^>]*><img src="\/a\.png"[^>]*><\/figure><\/td>/,
    );
  });
});

describe('soltar arquivos (E13)', () => {
  it('com arquivos → marcador na posição das coordenadas', async () => {
    const s = await setup({ doc: '<p>ab</p><p>cd</p>' });
    selectText(s.editor, 'ab', 0);
    const fake = fakePosAtCoords(s.editor, () => 6);
    const e = dispatchDrag(
      s.dom,
      'drop',
      { files: [png('a.png')] },
      {
        x: 40,
        y: 70,
      },
    );
    fake.restore();
    expect(e.defaultPrevented).toBe(true);
    expect(fake.calls).toEqual([{ left: 40, top: 70 }]);
    expect(markers(s.editor)).toEqual([{ pos: 6, index: 0 }]);
    expect(names(s.cmp)).toEqual(['a.png']);
  });

  it('posAtCoords null → selection.to', async () => {
    const s = await setup();
    selectText(s.editor, 'abcd', 1, 3);
    const fake = fakePosAtCoords(s.editor, () => null);
    const e = dispatchDrag(s.dom, 'drop', { files: [png('a.png')] });
    fake.restore();
    expect(e.defaultPrevented).toBe(true);
    expect(markers(s.editor)).toEqual([{ pos: 4, index: 0 }]);
  });

  it('sem adaptador → defaultPrevented e nenhum envio', async () => {
    const s = await setup({ enabled: false });
    const fake = fakePosAtCoords(s.editor, () => 1);
    const e = dispatchDrag(s.dom, 'drop', { files: [png('a.png')] });
    fake.restore();
    expect(e.defaultPrevented).toBe(true);
    expect(s.cmp.uploads()).toEqual([]);
    expect(s.host.errors).toEqual([]);
    expect(getRteHtml(s.editor)).toBe('<p>abcd</p>');
  });

  it('readonly → defaultPrevented e nenhum envio', async () => {
    const s = await setup({ readonly: true });
    const fake = fakePosAtCoords(s.editor, () => 1);
    const over = dispatchDrag(s.dom, 'dragover', { files: [png('a.png')] });
    const e = dispatchDrag(s.dom, 'drop', { files: [png('a.png')] });
    fake.restore();
    expect(over.defaultPrevented).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(markers(s.editor)).toEqual([]);
    expect(s.cmp.uploads()).toEqual([]);
  });

  it('dragenter e dragover com Files → defaultPrevented', async () => {
    const s = await setup();
    // `null`: o `Dropcursor` (que também ouve o `dragover`) não desenha no jsdom
    const fake = fakePosAtCoords(s.editor, () => null);
    const enter = dispatchDrag(s.dom, 'dragenter', { files: [png('a.png')] });
    const over = dispatchDrag(s.dom, 'dragover', { files: [png('a.png')] });
    fake.restore();
    // o `Dropcursor` continua recebendo o `dragover` (posição pedida)
    expect(fake.calls.length).toBeGreaterThan(0);
    expect(enter.defaultPrevented).toBe(true);
    expect(over.defaultPrevented).toBe(true);
    expect(s.cmp.uploads()).toEqual([]);
  });

  it('drop sem Files (HTML) → caminho do ProseMirror, nenhum envio', async () => {
    const s = await setup();
    const fake = fakePosAtCoords(s.editor, () => null);
    const e = dispatchDrag(s.dom, 'drop', { html: '<p>x</p>', text: 'x' });
    fake.restore();
    // o ProseMirror pergunta a posição e, sem ela, deixa o evento
    expect(fake.calls).toHaveLength(1);
    expect(e.defaultPrevented).toBe(false);
    expect(s.cmp.uploads()).toEqual([]);
  });

  it('arrasto interno (view.dragging) com Files → não tratado aqui', async () => {
    const s = await setup();
    const fake = fakePosAtCoords(s.editor, () => null);
    const view = s.editor.view as unknown as { dragging: unknown };
    view.dragging = { slice: s.editor.state.doc.slice(1, 2), move: true };
    dispatchDrag(s.dom, 'drop', { files: [png('a.png')], html: '<p>b</p>' });
    fake.restore();
    expect(fake.calls).toHaveLength(1);
    expect(s.cmp.uploads()).toEqual([]);
    expect(markers(s.editor)).toEqual([]);
  });
});

describe('tratador do principal antes do chunk e depois da falha (Ruling 29)', () => {
  function gatedLoader(): { loader: RteUploadLoader; release: () => void } {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    return { loader: () => gate.then(realLoader), release };
  }

  it('soltar antes do chunk: preventDefault, recusas na hora, aceitos em espera', async () => {
    const gated = gatedLoader();
    const s = await setup({ loader: gated.loader, ready: false });
    expect(uploadsOf(s.cmp).current()).toBeNull();
    const fake = fakePosAtCoords(s.editor, () => 3);
    const e = dispatchDrag(s.dom, 'drop', {
      files: [png('a.png'), svg('x.svg')],
    });
    fake.restore();
    expect(e.defaultPrevented).toBe(true);
    expect(s.host.errors).toEqual([
      { fileName: 'x.svg', type: 'image', reason: 'type' },
    ]);
    expect(uploadsOf(s.cmp).announcement()).toMatchObject({
      kind: 'error',
      names: ['x.svg'],
      reasons: ['type'],
    });
    expect(markers(s.editor)).toEqual([]);
    gated.release();
    await uploadsOf(s.cmp).load();
    await settle(s.fixture);
    expect(markers(s.editor)).toEqual([{ pos: 3, index: 0 }]);
    expect(names(s.cmp)).toEqual(['a.png']);
    expect(s.host.errors).toHaveLength(1);
  });

  it('colar antes do chunk: preventDefault e envio na chegada', async () => {
    const gated = gatedLoader();
    const s = await setup({ loader: gated.loader, ready: false });
    selectText(s.editor, 'abcd', 2);
    const e = dispatchPaste(s.dom, { files: [png('a.png')] });
    expect(e.defaultPrevented).toBe(true);
    expect(s.editor.getText()).toBe('abcd');
    gated.release();
    await uploadsOf(s.cmp).load();
    await settle(s.fixture);
    expect(markers(s.editor)).toEqual([{ pos: 3, index: 0 }]);
  });

  it("soltar depois da falha de carga: preventDefault e 'unavailable'", async () => {
    const s = await setup({
      loader: () => Promise.reject(new Error('chunk')),
      ready: false,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await uploadsOf(s.cmp).load();
    await settle(s.fixture);
    const fake = fakePosAtCoords(s.editor, () => 1);
    const e = dispatchDrag(s.dom, 'drop', {
      files: [png('a.png'), svg('x.svg')],
    });
    fake.restore();
    expect(e.defaultPrevented).toBe(true);
    expect(s.host.errors).toEqual([
      { fileName: 'a.png', type: 'image', reason: 'unavailable' },
      { fileName: 'x.svg', type: 'image', reason: 'type' },
    ]);
    expect(markers(s.editor)).toEqual([]);
  });
});
