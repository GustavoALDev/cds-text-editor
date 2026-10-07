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
import { RteEditor } from '@cds/rte-angular';
import { getSearchState } from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeCoords } from './testing-support/geometry';
import { settle } from './testing-support/render';

// Spec 05d1, Tarefa 3 (R1): a barra de busca num `@defer` (K3), com carga
// manual; falha de carga devolve `Mod-F` ao navegador.

const SEARCH_FAILED =
  '[rte-editor] não foi possível carregar a barra de busca; Mod-F segue com o navegador.';

@Component({
  selector: 'rte-test-search-defer',
  imports: [RteEditor],
  template: `<rte-editor [value]="'<p>alpha beta alpha</p>'" toolbar="full" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly cmp = viewChild.required(RteEditor);
}

let restoreCoords: (() => void) | undefined;

beforeEach(() => {
  TestBed.configureTestingModule({
    deferBlockBehavior: DeferBlockBehavior.Manual,
  });
});

afterEach(() => {
  restoreCoords?.();
  restoreCoords = undefined;
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

async function setup(): Promise<{
  fixture: ComponentFixture<Host>;
  root: HTMLElement;
  cmp: RteEditor;
  editor: Editor;
  block: DeferBlockFixture;
}> {
  const fixture = TestBed.createComponent(Host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const cmp = fixture.componentInstance.cmp();
  const editor = cmp.editor() as Editor;
  restoreCoords = fakeCoords(editor, () => ({
    top: 0,
    bottom: 20,
    left: 0,
    right: 0,
  }));
  // Sete blocos; a barra de busca é o primeiro (entre a barra de ferramentas
  // e o editável).
  const blocks = await fixture.getDeferBlocks();
  expect(blocks).toHaveLength(7);
  return {
    fixture,
    root: (fixture.nativeElement as HTMLElement).querySelector(
      'rte-editor',
    ) as HTMLElement,
    cmp,
    editor,
    block: blocks[0] as DeferBlockFixture,
  };
}

function ctrlF(editor: Editor): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    key: 'f',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  editor.view.dom.dispatchEvent(e);
  return e;
}

describe('@defer da barra de busca (K3)', () => {
  it('fechada: nenhuma barra no DOM', async () => {
    const s = await setup();
    expect(s.root.querySelector('rte-search')).toBeNull();
    expect(s.root.querySelector('.rte-search')).toBeNull();
  });

  it('aberta antes da carga: a consulta vale e a chegada do chunk mostra a barra', async () => {
    const s = await setup();
    expect(s.cmp.openSearch('alpha')).toBe(true);
    await settle(s.fixture);
    expect(s.root.querySelector('.rte-search')).toBeNull();
    expect(getSearchState(s.editor)?.total).toBe(2);
    await s.block.render(DeferBlockState.Complete);
    await settle(s.fixture);
    await settle(s.fixture);
    const bar = s.root.querySelector('.rte-search');
    expect(bar).not.toBeNull();
    expect(s.root.querySelector<HTMLInputElement>('.rte-search__input')?.value).toBe(
      'alpha',
    );
    expect(document.activeElement).toBe(
      s.root.querySelector('.rte-search__input'),
    );
  });

  it('falha de carga: aviso em dev, Mod-F devolve a tecla ao navegador e openSearch é false', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = await setup();
    expect(s.cmp.openSearch()).toBe(true);
    await settle(s.fixture);
    await s.block.render(DeferBlockState.Error);
    await settle(s.fixture);
    await settle(s.fixture);
    expect(warn).toHaveBeenCalledWith(SEARCH_FAILED);
    expect(s.cmp.searchOpen()).toBe(false);
    expect(getSearchState(s.editor)?.query).toBe('');
    expect(s.root.querySelector('.rte-search')).toBeNull();
    expect(ctrlF(s.editor).defaultPrevented).toBe(false);
    expect(s.cmp.openSearch()).toBe(false);
  });

  it('falha de carga: o item search da barra fica desabilitado', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = await setup();
    const item = () =>
      s.root.querySelector<HTMLButtonElement>(
        '.rte-toolbar [aria-label="Find and replace"]',
      ) as HTMLButtonElement;
    expect(item().getAttribute('aria-disabled')).toBeNull();
    expect(s.cmp.openSearch()).toBe(true);
    await settle(s.fixture);
    await s.block.render(DeferBlockState.Error);
    await settle(s.fixture);
    await settle(s.fixture);
    expect(item().getAttribute('aria-disabled')).toBe('true');
  });
});
