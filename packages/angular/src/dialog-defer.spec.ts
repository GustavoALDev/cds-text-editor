import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import {
  DeferBlockBehavior,
  DeferBlockState,
  TestBed,
  type ComponentFixture,
  type DeferBlockFixture,
} from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor } from '@cds/rte-angular';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dialogField, installDialogShim } from './testing-support/dialog';
import { selectText } from './testing-support/editors';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';

// Spec 05b2a, Tarefa 7: o `@defer` dos diálogos com carga manual (R12 unitário,
// G7, pré-voo 5, Review Focus 1 e 4).

const DEFER_FAILED =
  '[rte-editor] não foi possível carregar os diálogos; o pedido foi descartado.';

const VIDEO_DOC =
  '<p>abcd efgh</p><figure class="rt-figure rt-figure--video"><video src="/v.webm" controls="" preload="metadata" playsinline=""></video></figure>';

/** Documento do próximo `Host` (lido na criação). */
let hostValue = '<p>abcd efgh</p>';

@Component({
  selector: 'rte-test-defer-host',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value"
    toolbar="full"
    [disabled]="disabled()"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = hostValue;
  readonly disabled = signal(false);
  readonly cmp = viewChild.required(RteEditor);
}

interface Setup {
  fixture: ComponentFixture<Host>;
  host: Host;
  root: HTMLElement;
  cmp: RteEditor;
  editor: Editor;
  block: DeferBlockFixture;
}

let restoreDialog: () => void;
let restorePopover: () => void;
beforeEach(() => {
  restoreDialog = installDialogShim();
  restorePopover = installPopoverShim();
  hostValue = '<p>abcd efgh</p>';
  TestBed.configureTestingModule({
    deferBlockBehavior: DeferBlockBehavior.Manual,
  });
});
afterEach(() => {
  TestBed.resetTestingModule();
  restorePopover();
  restoreDialog();
  vi.restoreAllMocks();
});

async function setup(): Promise<Setup> {
  const fixture = TestBed.createComponent(Host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const host = fixture.componentInstance;
  const cmp = host.cmp();
  const editor = cmp.editor() as Editor;
  selectText(editor, 'abcd');
  // Três blocos (Tarefa 8b da 05b2b; 05c2a E2): os menus flutuantes, dentro
  // de `.rte-editor__frame`, vêm antes; o dos diálogos é o segundo e o de
  // pré-carga dos formulários de mídia (`when false`), o terceiro.
  const blocks = await fixture.getDeferBlocks();
  expect(blocks).toHaveLength(3);
  return {
    fixture,
    host,
    root: fixture.nativeElement as HTMLElement,
    cmp,
    editor,
    block: blocks[1] as DeferBlockFixture,
  };
}

/** `Mod-k` como o jsdom o vê fora do Mac (`Mod` = Ctrl). */
function modK(): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: 'k',
    keyCode: 75,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
}

function linkButton(root: HTMLElement): HTMLButtonElement {
  const found = [
    ...root.querySelectorAll<HTMLButtonElement>(
      '.rte-toolbar .rte-toolbar__button',
    ),
  ].find((b) => b.getAttribute('aria-label') === 'Link');
  if (!found) throw new Error('botão Link ausente');
  return found;
}

function pending(editor: Editor): Element | null {
  return editor.view.dom.querySelector('.rte-pending-selection');
}

async function render(s: Setup, state: DeferBlockState): Promise<void> {
  await s.block.render(state);
  await settle(s.fixture);
}

/**
 * Bloco dos formulários de mídia (05c2a E2), aninhado no `RteDialogs`: só
 * existe depois que o bloco dos diálogos renderizou.
 */
async function mediaBlock(s: Setup): Promise<DeferBlockFixture> {
  const nested = await s.block.getDeferBlocks();
  expect(nested).toHaveLength(1);
  return nested[0] as DeferBlockFixture;
}

/** Carrega os dois *chunks* (diálogos e, dentro deles, mídia). */
async function renderBoth(s: Setup): Promise<void> {
  await render(s, DeferBlockState.Complete);
  await (await mediaBlock(s)).render(DeferBlockState.Complete);
  await settle(s.fixture);
}

describe('@defer dos diálogos (R12 unitário, G7)', () => {
  it('antes da carga: nenhum rte-dialogs; o pedido abre na chegada com foco na URL', async () => {
    const s = await setup();
    expect(s.root.querySelector('rte-dialogs')).toBeNull();
    expect(s.cmp.openDialog('link')).toBe(true);
    await settle(s.fixture);
    expect(s.root.querySelector('dialog')).toBeNull();
    expect(pending(s.editor)?.textContent).toBe('abcd');

    await render(s, DeferBlockState.Complete);
    const dialog = s.root.querySelector<HTMLDialogElement>('.rte-dialog');
    expect(dialog?.open).toBe(true);
    const url = dialogField(dialog as HTMLDialogElement, 'Address (URL)');
    expect(document.activeElement).toBe(url);
  });

  it('Mod-K antes da carga: consumido e aberto depois dela', async () => {
    const s = await setup();
    const key = modK();
    s.editor.view.dom.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    await settle(s.fixture);
    expect(s.root.querySelector('dialog')).toBeNull();

    await render(s, DeferBlockState.Complete);
    expect(s.root.querySelector('.rte-dialog[open]')).not.toBeNull();
  });

  it('ativação dupla antes da carga: o segundo pedido → false, um só diálogo (Review Focus 4)', async () => {
    const s = await setup();
    const first = modK();
    s.editor.view.dom.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    const second = modK();
    s.editor.view.dom.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
    expect(s.cmp.openDialog('link')).toBe(false);

    await render(s, DeferBlockState.Complete);
    expect(s.root.querySelectorAll('.rte-dialog[open]')).toHaveLength(1);
  });

  it('pedido cancelado por disabled antes da carga: nada abre depois e sem decoração (Review Focus 1)', async () => {
    const s = await setup();
    expect(s.cmp.openDialog('link')).toBe(true);
    await settle(s.fixture);
    expect(pending(s.editor)).not.toBeNull();
    s.host.disabled.set(true);
    await settle(s.fixture);

    await render(s, DeferBlockState.Complete);
    expect(s.root.querySelector('rte-dialogs')).not.toBeNull();
    expect(s.root.querySelector('.rte-dialog[open]')).toBeNull();
    expect(pending(s.editor)).toBeNull();
  });

  it('prefetch (bloco carregado sem pedido): nenhum diálogo aberto', async () => {
    const s = await setup();
    await render(s, DeferBlockState.Complete);
    expect(s.root.querySelector('rte-dialogs')).not.toBeNull();
    expect(s.root.querySelector('.rte-dialog[open]')).toBeNull();
    expect(pending(s.editor)).toBeNull();
  });

  it('@error: descarta o pedido, devolve o foco ao botão, avisa e é terminal (pré-voo 5)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = await setup();
    const origin = linkButton(s.root);
    origin.focus();
    origin.click();
    await settle(s.fixture);
    expect(pending(s.editor)).not.toBeNull();

    await render(s, DeferBlockState.Error);
    expect(document.activeElement).toBe(origin);
    expect(pending(s.editor)).toBeNull();
    expect(s.root.querySelector('dialog')).toBeNull();
    expect(warn.mock.calls.filter(([m]) => m === DEFER_FAILED)).toHaveLength(1);

    expect(s.cmp.openDialog('link')).toBe(false);
    const key = modK();
    s.editor.view.dom.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    await settle(s.fixture);
    expect(pending(s.editor)).toBeNull();
  });
});

// Spec 05c1, Tarefa 6: pedido de mídia antes da carga do *chunk* (R7).
describe('@defer com diálogo de mídia (05c1)', () => {
  function title(root: HTMLElement): string | undefined {
    return root.querySelector('.rte-dialog__title')?.textContent?.trim();
  }

  it("openDialog('video') antes da carga: abre no modo inserir quando o @defer resolve", async () => {
    const s = await setup();
    expect(s.cmp.openDialog('video')).toBe(true);
    await settle(s.fixture);
    expect(s.root.querySelector('dialog')).toBeNull();

    await renderBoth(s);
    const dialog = s.root.querySelector<HTMLDialogElement>('.rte-dialog');
    expect(dialog?.open).toBe(true);
    expect(title(s.root)).toBe('Insert video');
    expect(dialog?.querySelector('.rte-dialog__remove')).toBeNull();
    const src = dialogField(dialog as HTMLDialogElement, 'Video address (URL)');
    expect(document.activeElement).toBe(src);
  });

  it("openDialog('video') antes da carga com o vídeo selecionado: abre no modo editar", async () => {
    hostValue = VIDEO_DOC;
    const s = await setup();
    let pos = -1;
    s.editor.state.doc.descendants((node, at) => {
      if (node.type.name === 'rtVideo') pos = at;
    });
    s.editor.view.dispatch(
      s.editor.state.tr.setSelection(
        NodeSelection.create(s.editor.state.doc, pos),
      ),
    );
    expect(s.cmp.openDialog('video')).toBe(true);
    await settle(s.fixture);
    expect(s.root.querySelector('dialog')).toBeNull();

    await renderBoth(s);
    const dialog = s.root.querySelector<HTMLDialogElement>('.rte-dialog');
    expect(dialog?.open).toBe(true);
    expect(title(s.root)).toBe('Video details');
    expect(dialog?.querySelector('.rte-dialog__remove')).not.toBeNull();
    const src = dialogField(dialog as HTMLDialogElement, 'Video address (URL)');
    expect(src.value).toBe('/v.webm');
    expect(document.activeElement).toBe(src);
  });
});

// Spec 05c2a, Tarefa 1: os formulários de mídia num `@defer` próprio dentro do
// `<dialog>` (E2, R2): o pedido de mídia espera os dois *chunks*.
describe('@defer próprio dos formulários de mídia (05c2a E2)', () => {
  function imageButton(root: HTMLElement): HTMLButtonElement {
    const found = [
      ...root.querySelectorAll<HTMLButtonElement>(
        '.rte-toolbar .rte-toolbar__button',
      ),
    ].find((b) => b.getAttribute('aria-label') === 'Insert image');
    if (!found) throw new Error('botão Insert image ausente');
    return found;
  }

  function dialogTitle(root: HTMLElement): string | undefined {
    return root.querySelector('.rte-dialog__title')?.textContent?.trim();
  }

  it("openDialog('image') com o rte-dialogs carregado e a mídia não: pendente; abre na chegada com foco no primeiro campo", async () => {
    const s = await setup();
    expect(s.cmp.openDialog('image')).toBe(true);
    await render(s, DeferBlockState.Complete);
    const dialog = s.root.querySelector<HTMLDialogElement>('.rte-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.open).toBe(false);
    expect(s.root.querySelector('rte-media-forms')).toBeNull();
    // Pedido pendente: um segundo pedido é recusado.
    expect(s.cmp.openDialog('link')).toBe(false);

    await (await mediaBlock(s)).render(DeferBlockState.Complete);
    await settle(s.fixture);
    expect(dialog?.open).toBe(true);
    expect(dialogTitle(s.root)).toBe('Insert image');
    const src = dialogField(dialog as HTMLDialogElement, 'Image address (URL)');
    expect(document.activeElement).toBe(src);
    expect(s.root.querySelectorAll('.rte-dialog[open]')).toHaveLength(1);
  });

  it("openDialog('link') não depende do bloco de mídia", async () => {
    const s = await setup();
    await render(s, DeferBlockState.Complete);
    expect(s.cmp.openDialog('link')).toBe(true);
    await settle(s.fixture);
    const dialog = s.root.querySelector<HTMLDialogElement>('.rte-dialog');
    expect(dialog?.open).toBe(true);
    expect(s.root.querySelector('rte-media-forms')).toBeNull();
    const url = dialogField(dialog as HTMLDialogElement, 'Address (URL)');
    expect(document.activeElement).toBe(url);
  });

  it('@error da mídia: cancela com foco na origem, avisa 1×, recusa mídia e segue abrindo o link', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = await setup();
    await render(s, DeferBlockState.Complete);
    const origin = imageButton(s.root);
    origin.focus();
    origin.click();
    await settle(s.fixture);
    const dialog = s.root.querySelector<HTMLDialogElement>('.rte-dialog');
    expect(dialog?.open).toBe(false);

    await (await mediaBlock(s)).render(DeferBlockState.Error);
    await settle(s.fixture);
    expect(dialog?.open).toBe(false);
    expect(document.activeElement).toBe(origin);
    expect(warn.mock.calls.filter(([m]) => m === DEFER_FAILED)).toHaveLength(1);
    expect(s.cmp.openDialog('image')).toBe(false);
    expect(s.cmp.openDialog('video')).toBe(false);
    expect(s.cmp.openDialog('embed')).toBe(false);

    selectText(s.editor, 'abcd');
    expect(s.cmp.openDialog('link')).toBe(true);
    await settle(s.fixture);
    expect(dialog?.open).toBe(true);
    expect(dialogTitle(s.root)).toBe('Insert link');
    expect(warn.mock.calls.filter(([m]) => m === DEFER_FAILED)).toHaveLength(1);
  });

  it('um diálogo por vez com os dois chunks; imagem → link → imagem foca o formulário recriado', async () => {
    const s = await setup();
    expect(s.cmp.openDialog('image')).toBe(true);
    await renderBoth(s);
    const dialog = s.root.querySelector<HTMLDialogElement>('.rte-dialog');
    expect(dialog?.open).toBe(true);
    expect(s.cmp.openDialog('link')).toBe(false);
    expect(s.cmp.openDialog('video')).toBe(false);
    dialog?.close();
    await settle(s.fixture);

    selectText(s.editor, 'abcd');
    expect(s.cmp.openDialog('link')).toBe(true);
    await settle(s.fixture);
    expect(s.root.querySelectorAll('.rte-dialog[open]')).toHaveLength(1);
    expect(s.root.querySelector('rte-image-form')).toBeNull();
    dialog?.close();
    await settle(s.fixture);

    expect(s.cmp.openDialog('image')).toBe(true);
    await settle(s.fixture);
    expect(dialog?.open).toBe(true);
    expect(dialogTitle(s.root)).toBe('Insert image');
    expect(document.activeElement).toBe(
      dialogField(dialog as HTMLDialogElement, 'Image address (URL)'),
    );
  });
});
