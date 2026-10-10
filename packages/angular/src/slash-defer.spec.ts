import {
  ChangeDetectionStrategy,
  Component,
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
import { RteEditor } from '@comodeviaser/rte-angular';
import { getSlashMenuState } from '@comodeviaser/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line @nx/enforce-module-boundaries -- ajudante de teste do core, só teste
import { pressKey } from '../../core/extensions/src/testing/press-key';
// eslint-disable-next-line @nx/enforce-module-boundaries -- ajudante de teste do core, só teste
import { typeText } from '../../core/extensions/src/testing/type-text';
import { fakeCoords, installGeometry } from './testing-support/geometry';
import { installPopoverShim, isPopoverOpen } from './testing-support/popover';
import { settle } from './testing-support/render';
import type { RteRect } from './toolbar/position';

// Spec 05d1, Tarefa 2 (R1): a lista do menu `/` num `@defer` (K3), com carga
// manual; o teclado do core vale antes e sem a lista.

const SLASH_FAILED =
  '[rte-editor] não foi possível carregar a lista do menu /; o teclado do menu segue funcionando sem ela.';
const EDITABLE: RteRect = { top: 100, left: 100, right: 900, bottom: 700 };

@Component({
  selector: 'rte-test-slash-defer',
  imports: [RteEditor],
  template: `<rte-editor [value]="'<p></p>'" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly cmp = viewChild.required(RteEditor);
}

let restorePopover: () => void;
let restoreGeometry: () => void;
let restoreCoords: () => void;

beforeEach(() => {
  restorePopover = installPopoverShim();
  restoreGeometry = installGeometry({
    viewport: { width: 1000, height: 800 },
    rects: (el) => (el.classList.contains('ProseMirror') ? EDITABLE : null),
    size: () => ({ width: 200, height: 100 }),
  });
  TestBed.configureTestingModule({
    deferBlockBehavior: DeferBlockBehavior.Manual,
  });
});

afterEach(() => {
  TestBed.resetTestingModule();
  restoreCoords();
  restoreGeometry();
  restorePopover();
  vi.restoreAllMocks();
});

async function setup(): Promise<{
  fixture: ComponentFixture<Host>;
  root: HTMLElement;
  editor: Editor;
  block: DeferBlockFixture;
}> {
  const fixture = TestBed.createComponent(Host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const editor = fixture.componentInstance.cmp().editor() as Editor;
  restoreCoords = fakeCoords(editor, () => ({
    top: 200,
    bottom: 220,
    left: 100,
    right: 100,
  }));
  editor.commands.setTextSelection(1);
  // Sete blocos: barra de busca, aviso do rascunho, menus flutuantes, bandeja, diálogos,
  // pré-carga da mídia e, por último, a lista do menu `/`.
  const blocks = await fixture.getDeferBlocks();
  expect(blocks).toHaveLength(7);
  return {
    fixture,
    root: (fixture.nativeElement as HTMLElement).querySelector(
      'rte-editor',
    ) as HTMLElement,
    editor,
    block: blocks[6] as DeferBlockFixture,
  };
}

describe('@defer da lista do menu / (K3)', () => {
  it('sem o menu aberto, nenhuma lista e o bloco no placeholder/inicial', async () => {
    const s = await setup();
    expect(s.root.querySelector('rte-slash-menu')).toBeNull();
    expect(s.root.querySelector('.rte-slash-menu')).toBeNull();
  });

  it('aberto antes da carga: teclado do core vale, sem lista nem ARIA; a chegada mostra a lista', async () => {
    const s = await setup();
    typeText(s.editor, '/');
    await settle(s.fixture);
    expect(getSlashMenuState(s.editor).open).toBe(true);
    expect(s.root.querySelector('rte-slash-menu')).toBeNull();
    expect(s.editor.view.dom.hasAttribute('aria-controls')).toBe(false);
    expect(pressKey(s.editor, 'ArrowDown')).toBe(true);
    expect(getSlashMenuState(s.editor).activeIndex).toBe(1);

    await s.block.render(DeferBlockState.Complete);
    await settle(s.fixture);
    await settle(s.fixture);
    const el = s.root.querySelector<HTMLElement>('.rte-slash-menu');
    expect(el).not.toBeNull();
    expect(isPopoverOpen(el as HTMLElement)).toBe(true);
    expect(s.editor.view.dom.getAttribute('aria-controls')).toBe(el?.id);
    const active = s.root.querySelectorAll('[aria-selected="true"]');
    expect(active).toHaveLength(1);
    expect(s.editor.view.dom.getAttribute('aria-activedescendant')).toBe(
      (active[0] as HTMLElement).id,
    );
  });

  it('falha de carga: aviso em dev e o teclado do menu continua', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = await setup();
    typeText(s.editor, '/');
    await settle(s.fixture);
    await s.block.render(DeferBlockState.Error);
    await settle(s.fixture);
    await settle(s.fixture);
    expect(warn).toHaveBeenCalledWith(SLASH_FAILED);
    expect(s.root.querySelector('.rte-slash-menu')).toBeNull();
    expect(pressKey(s.editor, 'ArrowDown')).toBe(true);
    expect(getSlashMenuState(s.editor).activeIndex).toBe(1);
    expect(pressKey(s.editor, 'Enter')).toBe(true);
    expect(getSlashMenuState(s.editor).open).toBe(false);
    expect(s.editor.isActive('heading', { level: 3 })).toBe(true);
  });
});
