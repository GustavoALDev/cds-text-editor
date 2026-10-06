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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RteFloatingMenusConfig } from './floating/types';
import { selectText } from './testing-support/editors';
import { fakeCoords, installGeometry } from './testing-support/geometry';
import { installPopoverShim, isPopoverOpen } from './testing-support/popover';
import { settle } from './testing-support/render';
import type { RteRect } from './toolbar/position';

// Spec 05b2b, Tarefa 8b: os menus flutuantes num `@defer` (M2, ruling 8),
// com carga manual: antes da chegada o editor funciona sem eles.

const FLOATING_FAILED =
  '[rte-editor] não foi possível carregar os menus flutuantes; o editor segue sem eles.';

const VIEWPORT = { width: 1000, height: 800 };
const EDITABLE: RteRect = { top: 100, left: 100, right: 900, bottom: 700 };
const BLOCK: RteRect = { top: 300, left: 150, right: 450, bottom: 400 };
const MENU = { width: 200, height: 40 };
const coords = (pos: number): RteRect => ({
  top: 200,
  bottom: 220,
  left: 100 + pos * 2,
  right: 100 + pos * 2,
});

@Component({
  selector: 'rte-test-floating-defer',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value"
    toolbar="full"
    [floatingMenus]="floatingMenus()"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = '<p>Texto negrito fim</p><p>depois</p>';
  readonly floatingMenus = signal<RteFloatingMenusConfig | undefined>(
    undefined,
  );
  readonly cmp = viewChild.required(RteEditor);
}

interface Setup {
  fixture: ComponentFixture<Host>;
  el: HTMLElement;
  cmp: RteEditor;
  editor: Editor;
  /** Bloco dos menus: o primeiro do template (o dos diálogos vem depois). */
  block: DeferBlockFixture;
}

let restorePopover: () => void;
let restoreGeometry: () => void;
const restoreCoords: (() => void)[] = [];

beforeEach(() => {
  restorePopover = installPopoverShim();
  const rectOf = (el: Element): RteRect | null => {
    if (el.classList.contains('rte-floating')) return null;
    if (el.classList.contains('ProseMirror')) return EDITABLE;
    return BLOCK;
  };
  restoreGeometry = installGeometry({
    viewport: VIEWPORT,
    rects: rectOf,
    size: (el) => {
      if (el.classList.contains('rte-floating')) return MENU;
      const r = rectOf(el) ?? BLOCK;
      return { width: r.right - r.left, height: r.bottom - r.top };
    },
  });
  TestBed.configureTestingModule({
    deferBlockBehavior: DeferBlockBehavior.Manual,
  });
});

afterEach(() => {
  TestBed.resetTestingModule();
  for (const restore of restoreCoords.splice(0)) restore();
  restoreGeometry();
  restorePopover();
  vi.restoreAllMocks();
});

async function setup(
  init: (host: Host) => void = () => undefined,
): Promise<Setup> {
  const fixture = TestBed.createComponent(Host);
  init(fixture.componentInstance);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const cmp = fixture.componentInstance.cmp();
  const editor = cmp.editor() as Editor;
  restoreCoords.push(fakeCoords(editor, coords));
  // Quatro blocos: menus (o primeiro), bandeja de envios (05c2a E8),
  // diálogos e pré-carga da mídia (05c2a E2).
  const blocks = await fixture.getDeferBlocks();
  expect(blocks).toHaveLength(4);
  const el = (fixture.nativeElement as HTMLElement).querySelector(
    'rte-editor',
  ) as HTMLElement;
  return { fixture, el, cmp, editor, block: blocks[0] as DeferBlockFixture };
}

function key(
  target: EventTarget,
  name: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

const altF10 = (target: EventTarget) => key(target, 'F10', { altKey: true });

function openKinds(root: ParentNode): string[] {
  return [...root.querySelectorAll<HTMLElement>('.rte-floating')]
    .filter((m) => isPopoverOpen(m))
    .map((m) => m.getAttribute('data-rte-kind') ?? '?');
}

function firstToolbarItem(el: HTMLElement): HTMLElement {
  const found = el.querySelector<HTMLElement>(
    '.rte-toolbar .rte-toolbar__button',
  );
  if (!found) throw new Error('barra ausente');
  return found;
}

/** Foca o editável e seleciona "negrito" (seleção que mostra o menu de texto). */
async function selectBold(s: Setup): Promise<void> {
  s.editor.view.dom.focus();
  selectText(s.editor, 'negrito');
  await settle(s.fixture);
}

async function render(s: Setup, state: DeferBlockState): Promise<void> {
  await s.block.render(state);
  await settle(s.fixture);
}

describe('@defer dos menus flutuantes (M2, Tarefa 8b)', () => {
  it('antes da carga: sem .rte-floating, focusFloatingMenu() false, Alt+F10 → barra, Escape livre', async () => {
    const s = await setup();
    await selectBold(s);
    expect(s.el.querySelector('rte-floating-menus')).toBeNull();
    expect(s.el.querySelector('.rte-floating')).toBeNull();
    expect(s.cmp.focusFloatingMenu()).toBe(false);
    expect(document.activeElement).toBe(s.editor.view.dom);

    const esc = key(s.editor.view.dom, 'Escape');
    expect(esc.defaultPrevented).toBe(false);

    const alt = altF10(s.editor.view.dom);
    await settle(s.fixture);
    expect(alt.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(firstToolbarItem(s.el));
  });

  it('na chegada com uma seleção: o menu abre sem mover o foco', async () => {
    const s = await setup();
    await selectBold(s);
    const selection = s.editor.state.selection.toJSON();

    await render(s, DeferBlockState.Complete);
    expect(openKinds(s.el)).toEqual(['text']);
    expect(document.activeElement).toBe(s.editor.view.dom);
    expect(s.editor.state.selection.toJSON()).toEqual(selection);

    expect(s.cmp.focusFloatingMenu()).toBe(true);
    expect(
      (document.activeElement as HTMLElement).closest('.rte-floating--text'),
    ).not.toBeNull();
  });

  it('@error: avisa uma vez e o editor segue sem menus (Alt+F10 → barra)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = await setup();
    await selectBold(s);

    await render(s, DeferBlockState.Error);
    expect(s.el.querySelector('.rte-floating')).toBeNull();
    expect(warn.mock.calls.filter(([m]) => m === FLOATING_FAILED)).toHaveLength(
      1,
    );
    expect(s.cmp.focusFloatingMenu()).toBe(false);

    const alt = altF10(s.editor.view.dom);
    await settle(s.fixture);
    expect(document.activeElement).toBe(firstToolbarItem(s.el));
    expect(alt.defaultPrevented).toBe(true);

    s.editor.chain().focus().insertContent('!').run();
    await settle(s.fixture);
    expect(s.editor.getHTML()).toContain('!');
  });
});

describe('gatilho do @defer dos menus (Playthrough)', () => {
  /** O gatilho do bloco (`when floatingWanted()`, um só) e os tipos ligados. */
  interface Triggers {
    floatingWanted(): boolean;
    floatingKinds(): readonly string[];
  }

  async function playthrough(menus: RteFloatingMenusConfig | undefined) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      deferBlockBehavior: DeferBlockBehavior.Playthrough,
    });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.floatingMenus.set(menus);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    await settle(fixture);
    const triggers = fixture.componentInstance.cmp() as unknown as Triggers;
    return { root: fixture.nativeElement as HTMLElement, triggers };
  }

  it('com menus ligados o chunk chega depois da criação do editor', async () => {
    const { root, triggers } = await playthrough(undefined);
    expect(triggers.floatingWanted()).toBe(true);
    expect(root.querySelector('rte-floating-menus')).not.toBeNull();
    expect(root.querySelectorAll('.rte-floating').length).toBeGreaterThan(0);
  });

  it('floatingMenus: false → o bloco fica no placeholder (chunk nunca pedido)', async () => {
    const { root, triggers } = await playthrough(false);
    // O gatilho fica falso (e sem tipos): o Angular nunca pede o chunk.
    expect(triggers.floatingWanted()).toBe(false);
    expect(triggers.floatingKinds()).toEqual([]);
    expect(root.querySelector('rte-floating-menus')).toBeNull();
    expect(root.querySelector('.rte-floating')).toBeNull();
  });
});
