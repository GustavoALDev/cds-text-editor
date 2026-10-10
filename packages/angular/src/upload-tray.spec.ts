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
  RteUploadError,
  type RteLabelsInput,
  type RteUploadConfig,
} from '@comodeviaser/rte-angular';
import { RTE_LABELS_PT_BR } from '@comodeviaser/rte-angular/i18n';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDialogShim } from './testing-support/dialog';
import {
  createFakeUploadAdapter,
  type FakeUploadAdapter,
} from './testing-support/fake-upload-adapter';
import { installObjectUrlProbe } from './testing-support/object-url';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';
import { whenUploadReady } from './testing-support/upload-runtime';
import { RTE_UPLOAD_KEY } from './upload/markers';

// Spec 05c2a, Tarefa 8: bandeja de envios, região `aria-live` e elemento do
// marcador (E7, E8, E16, E20; R10, R14; pré-voos 7, 14 e 15).

@Component({
  selector: 'rte-test-tray-host',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    [upload]="upload()"
    [labels]="labels()"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('<p>ab</p>');
  readonly upload = signal<RteUploadConfig | null | undefined>(undefined);
  readonly labels = signal<RteLabelsInput | undefined>(undefined);
  readonly cmp = viewChild.required(RteEditor);
}

interface Setup {
  fixture: ComponentFixture<Host>;
  host: Host;
  cmp: RteEditor;
  editor: Editor;
  adapter: FakeUploadAdapter;
  root: HTMLElement;
}

async function setup(o: { preview?: boolean } = {}): Promise<Setup> {
  const adapter = createFakeUploadAdapter();
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  host.upload.set(
    o.preview === undefined ? { adapter } : { adapter, preview: o.preview },
  );
  fixture.autoDetectChanges();
  await settle(fixture);
  const cmp = host.cmp();
  await whenUploadReady(cmp);
  await settle(fixture);
  return {
    fixture,
    host,
    cmp,
    editor: cmp.editor() as Editor,
    adapter,
    root: fixture.nativeElement as HTMLElement,
  };
}

const png = (name: string) => new File(['xyz'], name, { type: 'image/png' });

/** Microtarefas, uma tarefa e a detecção: as *promises* do adaptador assentam. */
async function drain(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await settle(fixture);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function tray(root: HTMLElement): HTMLElement | null {
  return root.querySelector('section.rte-uploads');
}

function items(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.rte-uploads__item')];
}

function names(root: HTMLElement): string[] {
  return items(root).map(
    (li) => li.querySelector('.rte-uploads__name')?.textContent?.trim() ?? '',
  );
}

function cancelButton(root: HTMLElement, i: number): HTMLButtonElement {
  const button = items(root)[i]?.querySelector<HTMLButtonElement>(
    'button.rte-uploads__cancel',
  );
  if (!button) throw new Error(`sem o botão do item ${i}`);
  return button;
}

function status(root: HTMLElement): HTMLElement {
  const el = root.querySelector<HTMLElement>('.rte-uploads__status');
  if (!el) throw new Error('sem a região de status');
  return el;
}

/** Textos da região `aria-live`, um por nó. */
function said(root: HTMLElement): string[] {
  return [...status(root).children].map((c) => c.textContent?.trim() ?? '');
}

function markerIds(editor: Editor): string[] {
  return (RTE_UPLOAD_KEY.getState(editor.state)?.markers ?? []).map(
    (m) => m.id,
  );
}

function markers(editor: Editor): HTMLElement[] {
  return [
    ...editor.view.dom.querySelectorAll<HTMLElement>('.rte-upload-marker'),
  ];
}

/** Três envios: `a` com progresso 0,4, `b` indeterminado e `c` na fila. */
async function three(s: Setup): Promise<void> {
  s.editor.commands.focus('end');
  expect(s.cmp.uploadFiles([png('a.png'), png('b.png'), png('c.png')])).toBe(3);
  s.adapter.progress(0, 0.4);
  await nextFrame();
  await settle(s.fixture);
}

function enter(target: HTMLElement): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    keyCode: 13,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
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

describe('bandeja (E8, R10)', () => {
  it('sem envios: nenhuma bandeja; a região de status existe e está vazia', async () => {
    const s = await setup();
    expect(tray(s.root)).toBeNull();
    const region = status(s.root);
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent?.trim()).toBe('');
    // depois do editável, dentro da moldura
    expect(region.closest('.rte-editor__frame')).not.toBeNull();
  });

  it('três envios: grupo "Uploads", ordem do gesto, progresso determinado, indeterminado e na fila', async () => {
    const s = await setup();
    await three(s);
    const section = tray(s.root);
    expect(section).not.toBeNull();
    expect(section?.getAttribute('role')).toBe('group');
    expect(section?.getAttribute('aria-label')).toBe('Uploads');
    // dentro da moldura, depois do editável
    const mount = s.root.querySelector('.rte-editor__mount') as HTMLElement;
    expect(section?.closest('.rte-editor__frame')).not.toBeNull();
    expect(
      mount.compareDocumentPosition(section as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(names(s.root)).toEqual(['a.png', 'b.png', 'c.png']);
    const bars = items(s.root).map(
      (li) => li.querySelector('progress.rte-uploads__progress') as Element,
    );
    expect(bars[0]?.getAttribute('value')).toBe('0.4');
    expect(bars[1]?.hasAttribute('value')).toBe(false);
    expect(bars[2]?.hasAttribute('value')).toBe(false);
    expect(bars.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Uploading a.png',
      'Uploading b.png',
      'c.png (waiting)',
    ]);
    expect(
      [0, 1, 2].map((i) => cancelButton(s.root, i).getAttribute('aria-label')),
    ).toEqual([
      'Cancel upload of a.png',
      'Cancel upload of b.png',
      'Cancel upload of c.png',
    ]);
    expect(cancelButton(s.root, 0).type).toBe('button');
  });

  it('nome de 150 caracteres: 100 + "…" na tela, nome inteiro no title', async () => {
    const s = await setup();
    const long = `${'n'.repeat(146)}.png`;
    s.cmp.uploadFiles([png(long)]);
    await settle(s.fixture);
    const name = items(s.root)[0]?.querySelector('.rte-uploads__name');
    expect(name?.textContent?.trim()).toBe(`${long.slice(0, 100)}…`);
    expect(name?.getAttribute('title')).toBe(long);
    // o nome acessível do progresso e do botão usa o nome inteiro
    expect(
      items(s.root)[0]?.querySelector('progress')?.getAttribute('aria-label'),
    ).toBe(`Uploading ${long}`);
  });

  it('Review Focus 1: nome com HTML aparece como texto, sem img na bandeja', async () => {
    const s = await setup();
    const hostile = '<img src=x onerror=alert(1)>';
    s.cmp.uploadFiles([png(hostile)]);
    await settle(s.fixture);
    expect(names(s.root)).toEqual([hostile]);
    expect(tray(s.root)?.querySelector('img')).toBeNull();
    expect(status(s.root).querySelector('img')).toBeNull();
    const marker = markers(s.editor)[0];
    expect(marker?.querySelector('img')).toBeNull();
    expect(marker?.querySelector('.rte-upload-marker__name')?.textContent).toBe(
      hostile,
    );
  });

  it('cancelar o do meio pelo clique: aborta, tira item e marcador, foco no seguinte', async () => {
    const s = await setup();
    await three(s);
    const ids = s.cmp.uploads().map((u) => u.id);
    // o clique do Chromium/Firefox foca o botão; o `click()` do jsdom, não
    cancelButton(s.root, 1).focus();
    cancelButton(s.root, 1).click();
    await settle(s.fixture);
    expect(s.adapter.signal(1).aborted).toBe(true);
    expect(names(s.root)).toEqual(['a.png', 'c.png']);
    expect(markerIds(s.editor)).toEqual([ids[0], ids[2]]);
    expect(document.activeElement).toBe(cancelButton(s.root, 1));
    expect(said(s.root)).toEqual(['Upload of b.png cancelled.']);
  });

  it('cancelar o do meio por Enter (keyCode 13): o mesmo, sem clique duplicado', async () => {
    const s = await setup();
    await three(s);
    const cancel = vi.spyOn(s.cmp, 'cancelUpload');
    cancelButton(s.root, 1).focus();
    const event = enter(cancelButton(s.root, 1));
    await settle(s.fixture);
    expect(event.defaultPrevented).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(s.adapter.signal(1).aborted).toBe(true);
    expect(names(s.root)).toEqual(['a.png', 'c.png']);
    expect(document.activeElement).toBe(cancelButton(s.root, 1));
  });

  it('cancelar o último: foco no anterior', async () => {
    const s = await setup();
    await three(s);
    // o clique do Chromium/Firefox foca o botão; o `click()` do jsdom, não
    cancelButton(s.root, 2).focus();
    cancelButton(s.root, 2).click();
    await settle(s.fixture);
    expect(names(s.root)).toEqual(['a.png', 'b.png']);
    expect(document.activeElement).toBe(cancelButton(s.root, 1));
  });

  it('cancelar o único: bandeja some e o foco vai ao editável', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    await settle(s.fixture);
    cancelButton(s.root, 0).focus();
    cancelButton(s.root, 0).click();
    await settle(s.fixture);
    expect(s.adapter.signal(0).aborted).toBe(true);
    expect(tray(s.root)).toBeNull();
    // o `focus` do Tiptap espera um quadro
    await nextFrame();
    expect(document.activeElement).toBe(s.editor.view.dom);
  });
});

describe('foco quando o item focado sai sem cancelar (Ruling 31)', () => {
  it('o envio focado termina: o foco vai ao botão seguinte, nunca ao body', async () => {
    const s = await setup();
    await three(s);
    cancelButton(s.root, 0).focus();
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(names(s.root)).toEqual(['b.png', 'c.png']);
    expect(document.activeElement).toBe(cancelButton(s.root, 0));
  });

  it('o último focado falha: o foco vai ao anterior', async () => {
    const s = await setup();
    await three(s);
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    // c começou depois de a; agora: b (1), c (2)
    cancelButton(s.root, 1).focus();
    s.adapter.reject(2, new RteUploadError('server'));
    await drain(s.fixture);
    expect(names(s.root)).toEqual(['b.png']);
    expect(document.activeElement).toBe(cancelButton(s.root, 0));
  });

  it('o único focado termina: a bandeja some e o foco vai ao editável', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    await settle(s.fixture);
    cancelButton(s.root, 0).focus();
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(tray(s.root)).toBeNull();
    await nextFrame();
    expect(document.activeElement).toBe(s.editor.view.dom);
  });

  it('o foco saiu da bandeja sem destino (relatedTarget nulo): o envio que termina não o puxa de volta', async () => {
    const s = await setup();
    await three(s);
    const button = cancelButton(s.root, 0);
    button.focus();
    button.blur();
    expect(document.activeElement).toBe(document.body);
    await Promise.resolve();
    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(names(s.root)).toEqual(['b.png', 'c.png']);
    expect(document.activeElement).toBe(document.body);
  });

  it('sem foco na bandeja, um envio que termina não move o foco', async () => {
    const s = await setup();
    await three(s);
    const outside = document.createElement('button');
    document.body.append(outside);
    try {
      outside.focus();
      s.adapter.resolve(0, { url: '/a.png' });
      await drain(s.fixture);
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });
});

describe('anúncios (E8, R10)', () => {
  it('início uma vez por gesto, conclusão, cancelamento e erro; progresso não anuncia', async () => {
    const s = await setup();
    s.editor.commands.focus('end');
    s.cmp.uploadFiles([png('a.png'), png('b.png'), png('c.png')]);
    await settle(s.fixture);
    expect(said(s.root)).toEqual(['Uploading 3 files.']);

    const before = status(s.root).innerHTML;
    s.adapter.progress(0, 0.5);
    s.adapter.progress(1, 0.7);
    await nextFrame();
    await settle(s.fixture);
    expect(status(s.root).innerHTML).toBe(before);

    s.adapter.resolve(0, { url: '/a.png' });
    await drain(s.fixture);
    expect(said(s.root)).toEqual(['a.png uploaded.']);

    cancelButton(s.root, 0).click();
    await settle(s.fixture);
    expect(said(s.root)).toEqual(['Upload of b.png cancelled.']);

    await drain(s.fixture);
    s.adapter.reject(2, new RteUploadError('server'));
    await drain(s.fixture);
    expect(said(s.root)).toEqual([
      'Could not upload c.png: the server refused it.',
    ]);
    expect(tray(s.root)).toBeNull();
  });

  it('o mesmo texto repetido vira um nó novo (reanunciado)', async () => {
    const s = await setup();
    s.cmp.uploadFiles([png('a.png')]);
    await settle(s.fixture);
    const first = status(s.root).firstElementChild;
    s.cmp.cancelAllUploads();
    await settle(s.fixture);
    s.cmp.uploadFiles([png('a.png')]);
    await settle(s.fixture);
    expect(said(s.root)).toEqual(['Uploading 1 file.']);
    expect(status(s.root).firstElementChild).not.toBe(first);
  });

  it('início e recusa do mesmo gesto ficam os dois na região', async () => {
    const s = await setup();
    const svg = new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' });
    s.cmp.uploadFiles([png('a.png'), svg]);
    await settle(s.fixture);
    expect(said(s.root)).toEqual([
      'Uploading 1 file.',
      'Could not upload x.svg: file type not accepted.',
    ]);
  });

  it('trocar os rótulos para pt-BR com a bandeja aberta traduz tudo e mantém os envios', async () => {
    const s = await setup();
    await three(s);
    s.host.labels.set(RTE_LABELS_PT_BR);
    await settle(s.fixture);
    expect(tray(s.root)?.getAttribute('aria-label')).toBe('Envios');
    const bars = items(s.root).map((li) =>
      li.querySelector('progress')?.getAttribute('aria-label'),
    );
    expect(bars).toEqual([
      'Enviando a.png',
      'Enviando b.png',
      'c.png (na fila)',
    ]);
    expect(cancelButton(s.root, 0).getAttribute('aria-label')).toBe(
      'Cancelar envio de a.png',
    );
    // a troca de idioma não reanuncia: o texto foi fixado ao anunciar
    expect(said(s.root)).toEqual(['Uploading 3 files.']);
    expect(s.cmp.uploads().length).toBe(3);
    expect(s.adapter.signal(0).aborted).toBe(false);
    expect(s.adapter.signal(1).aborted).toBe(false);
    // o anúncio seguinte já sai em pt-BR
    cancelButton(s.root, 2).click();
    await settle(s.fixture);
    expect(said(s.root)).toEqual(['Envio de c.png cancelado.']);
  });
});

describe('marcador (E7, E16, pré-voo 7)', () => {
  it('nome, progresso e --queued; sem miniatura por padrão', async () => {
    const s = await setup();
    await three(s);
    const shown = markers(s.editor);
    expect(shown.length).toBe(3);
    for (const m of shown) {
      expect(m.tagName).toBe('SPAN');
      expect(m.getAttribute('contenteditable')).toBe('false');
      expect(m.getAttribute('aria-hidden')).toBe('true');
      expect(m.classList.contains('rte-upload-marker--image')).toBe(true);
      expect(m.querySelector('img')).toBeNull();
      expect(m.querySelector('progress.rte-upload-marker__progress')).not.toBe(
        null,
      );
    }
    expect(
      shown.map(
        (m) => m.querySelector('.rte-upload-marker__name')?.textContent,
      ),
    ).toEqual(['a.png', 'b.png', 'c.png']);
    expect(
      shown.map((m) => m.classList.contains('rte-upload-marker--queued')),
    ).toEqual([false, false, true]);
    const bars = shown.map((m) =>
      m.querySelector<HTMLProgressElement>('progress'),
    );
    expect(bars[0]?.getAttribute('value')).toBe('0.4');
    expect(bars[1]?.hasAttribute('value')).toBe(false);
    expect(bars[2]?.hasAttribute('value')).toBe(false);
  });

  it('com preview: miniatura img[alt=""] só para imagem, revogada no fim', async () => {
    const probe = installObjectUrlProbe();
    try {
      const s = await setup({ preview: true });
      const webm = new File(['v'], 'v.webm', { type: 'video/webm' });
      s.cmp.uploadFiles([png('a.png'), webm]);
      await settle(s.fixture);
      const [image, video] = markers(s.editor);
      const preview = image?.querySelector('img.rte-upload-marker__preview');
      expect(preview?.getAttribute('alt')).toBe('');
      expect(preview?.getAttribute('src')).toBe('blob:test/0');
      expect(video?.querySelector('img')).toBeNull();
      expect(probe.created).toEqual(['blob:test/0']);
      s.adapter.resolve(0, { url: '/a.png' });
      await drain(s.fixture);
      expect(probe.revoked).toEqual(['blob:test/0']);
    } finally {
      probe.restore();
    }
  });
});
