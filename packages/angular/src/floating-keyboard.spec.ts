import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor } from '@cds/rte-angular';
import { getRteHtml } from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectText } from './testing-support/editors';
import { fakeCoords, installGeometry } from './testing-support/geometry';
import { installPopoverShim, isPopoverOpen } from './testing-support/popover';
import { settle } from './testing-support/render';
import type { RteToolbarConfig } from './toolbar/items';
import type { RteRect } from './toolbar/position';

// Spec 05b2b, Tarefa 7: teclado dos menus flutuantes (R7; M6, M12) e
// `focusFloatingMenu()`.

const DOC =
  '<p>Texto <strong>negrito</strong> e <a href="https://example.com/">exemplo</a> fim</p>' +
  '<p>um <code>codigo</code> dois</p><p>depois</p>';

const OPTIONS = { features: { code: true } };

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
  selector: 'rte-test-floating-keys',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value"
    [options]="options"
    [toolbar]="toolbar()"
    [readonly]="readonly()"
    (editorBlur)="blurs = blurs + 1"
    (editorFocus)="focuses = focuses + 1"
    (touch)="touches = touches + 1"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = DOC;
  readonly options = OPTIONS;
  readonly toolbar = signal<RteToolbarConfig>('full');
  readonly readonly = signal(false);
  blurs = 0;
  focuses = 0;
  touches = 0;
  readonly cmp = viewChild.required(RteEditor);
}

@Component({
  selector: 'rte-test-floating-keys-two',
  imports: [RteEditor],
  template: `<rte-editor
      class="a"
      [value]="value"
      [options]="options"
      toolbar="full"
    /><rte-editor
      class="b"
      [value]="value"
      [options]="options"
      toolbar="full"
    />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TwoHosts {
  readonly value = DOC;
  readonly options = OPTIONS;
  readonly cmps = viewChildren(RteEditor);
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
});

afterEach(() => {
  TestBed.resetTestingModule();
  for (const restore of restoreCoords.splice(0)) restore();
  restoreGeometry();
  restorePopover();
  vi.restoreAllMocks();
});

interface Setup {
  fixture: ComponentFixture<Host>;
  host: Host;
  el: HTMLElement;
  cmp: RteEditor;
  editor: Editor;
}

async function setup(init: (host: Host) => void = () => undefined) {
  const fixture = TestBed.createComponent(Host);
  init(fixture.componentInstance);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const host = fixture.componentInstance;
  const cmp = host.cmp();
  const editor = cmp.editor() as Editor;
  restoreCoords.push(fakeCoords(editor, coords));
  const el = (fixture.nativeElement as HTMLElement).querySelector(
    'rte-editor',
  ) as HTMLElement;
  return { fixture, host, el, cmp, editor } satisfies Setup;
}

/** Foca o editável, aplica a seleção e zera os contadores do host. */
async function focusAnd(s: Setup, select: () => void): Promise<void> {
  s.editor.view.dom.focus();
  select();
  await settle(s.fixture);
  s.host.blurs = s.host.focuses = s.host.touches = 0;
}

/** Nenhum `editorBlur`/`editorFocus`/`touch` desde o `focusAnd`. */
function expectQuiet(s: Setup): void {
  expect([s.host.blurs, s.host.focuses, s.host.touches]).toEqual([0, 0, 0]);
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

function menu(root: ParentNode, kind: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(`.rte-floating--${kind}`);
  if (!found) throw new Error(`menu ${kind} ausente`);
  return found;
}

function openKinds(root: ParentNode): string[] {
  return [...root.querySelectorAll<HTMLElement>('.rte-floating')]
    .filter((m) => isPopoverOpen(m))
    .map((m) => m.getAttribute('data-rte-kind') ?? '?');
}

function active(): string | null {
  return (
    (document.activeElement as HTMLElement | null)?.getAttribute(
      'aria-label',
    ) ?? null
  );
}

function firstToolbarItem(el: HTMLElement): HTMLElement {
  const found = el.querySelector<HTMLElement>(
    '.rte-toolbar .rte-toolbar__button',
  );
  if (!found) throw new Error('barra ausente');
  return found;
}

const bold = (editor: Editor) => () => selectText(editor, 'negrito');
const caret = (editor: Editor) => () => selectText(editor, 'depois', 1);

function range(editor: Editor): [number, number] {
  return [editor.state.selection.from, editor.state.selection.to];
}

describe('Alt+F10 (M12)', () => {
  it('editável → item ativo do menu; Escape → editável; lembrado; dentro do menu → barra', async () => {
    const s = await setup();
    await focusAnd(s, bold(s.editor));
    expect(openKinds(s.el)).toEqual(['text']);
    const sel = range(s.editor);
    const first = altF10(s.editor.view.dom);
    await settle(s.fixture);
    expect(first.defaultPrevented).toBe(true);
    expect(active()).toBe('Bold');
    key(document.activeElement as HTMLElement, 'ArrowRight');
    key(document.activeElement as HTMLElement, 'ArrowRight');
    expect(active()).toBe('Underline');
    const esc = key(document.activeElement as HTMLElement, 'Escape');
    await settle(s.fixture);
    expect(esc.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(s.editor.view.dom);
    expect(range(s.editor)).toEqual(sel);
    expect(openKinds(s.el)).toEqual(['text']);
    altF10(s.editor.view.dom);
    await settle(s.fixture);
    expect(active()).toBe('Underline');
    const inside = altF10(document.activeElement as HTMLElement);
    await settle(s.fixture);
    expect(inside.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(firstToolbarItem(s.el));
    expectQuiet(s);
  });

  it('dentro do menu sem barra → foco não muda', async () => {
    const s = await setup((h) => h.toolbar.set(false));
    await focusAnd(s, bold(s.editor));
    altF10(s.editor.view.dom);
    await settle(s.fixture);
    expect(active()).toBe('Bold');
    altF10(document.activeElement as HTMLElement);
    await settle(s.fixture);
    expect(active()).toBe('Bold');
    expectQuiet(s);
  });

  it('sem menu visível → barra (05b1); sem barra e sem menu → nada', async () => {
    const s = await setup();
    await focusAnd(s, caret(s.editor));
    expect(openKinds(s.el)).toEqual([]);
    altF10(s.editor.view.dom);
    await settle(s.fixture);
    expect(document.activeElement).toBe(firstToolbarItem(s.el));
    TestBed.resetTestingModule();
    const t = await setup((h) => h.toolbar.set(false));
    await focusAnd(t, caret(t.editor));
    altF10(t.editor.view.dom);
    await settle(t.fixture);
    expect(document.activeElement).toBe(t.editor.view.dom);
    expectQuiet(t);
  });
});

describe('navegação dentro do menu (M12)', () => {
  it('←/→ circulares, Home/End', async () => {
    const s = await setup();
    await focusAnd(s, bold(s.editor));
    altF10(s.editor.view.dom);
    const press = (k: string) => key(document.activeElement as HTMLElement, k);
    press('ArrowLeft');
    expect(active()).toBe('Link');
    press('ArrowRight');
    expect(active()).toBe('Bold');
    press('End');
    expect(active()).toBe('Link');
    press('Home');
    expect(active()).toBe('Bold');
    await settle(s.fixture);
    expectQuiet(s);
  });

  it('rtl no host inverte as setas', async () => {
    const s = await setup();
    s.el.setAttribute('dir', 'rtl');
    await focusAnd(s, bold(s.editor));
    altF10(s.editor.view.dom);
    const press = (k: string) => key(document.activeElement as HTMLElement, k);
    press('ArrowRight');
    expect(active()).toBe('Link');
    press('ArrowLeft');
    expect(active()).toBe('Bold');
    press('ArrowLeft');
    expect(active()).toBe('Italic');
    await settle(s.fixture);
    expectQuiet(s);
  });

  it('item inaplicável (Link dentro de code) recebe foco com aria-disabled; Enter não muda o documento', async () => {
    const s = await setup();
    await focusAnd(s, () => selectText(s.editor, 'codigo', 1, 4));
    expect(openKinds(s.el)).toEqual(['text']);
    altF10(s.editor.view.dom);
    key(document.activeElement as HTMLElement, 'End');
    expect(active()).toBe('Link');
    const link = document.activeElement as HTMLElement;
    expect(link.getAttribute('aria-disabled')).toBe('true');
    const before = getRteHtml(s.editor);
    key(link, 'Enter');
    link.click(); // ativação nativa do Enter num <button>
    await settle(s.fixture);
    expect(getRteHtml(s.editor)).toBe(before);
    expect(document.querySelector('dialog[open]')).toBeNull();
    expectQuiet(s);
  });
});

describe('Tab e Shift+Tab dentro do menu (M12)', () => {
  it.each([
    ['Tab', false],
    ['Shift+Tab', true],
  ])(
    '%s → editável com a seleção intacta; texto cai no lugar',
    async (_n, shiftKey) => {
      const s = await setup();
      await focusAnd(s, bold(s.editor));
      const sel = range(s.editor);
      altF10(s.editor.view.dom);
      key(document.activeElement as HTMLElement, 'ArrowRight');
      const tab = key(document.activeElement as HTMLElement, 'Tab', {
        shiftKey,
      });
      await settle(s.fixture);
      expect(tab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(s.editor.view.dom);
      expect(range(s.editor)).toEqual(sel);
      expect(openKinds(s.el)).toEqual(['text']);
      s.editor.view.dispatch(s.editor.state.tr.insertText('z'));
      expect(s.editor.state.doc.textContent.startsWith('Texto z e')).toBe(true);
      await settle(s.fixture);
      expectQuiet(s);
    },
  );
});

describe('Escape no editável (M6)', () => {
  it('com menu → oculto e consumido; sem menu → intocado; nova identidade → volta', async () => {
    const s = await setup();
    await focusAnd(s, bold(s.editor));
    const esc = key(s.editor.view.dom, 'Escape');
    await settle(s.fixture);
    expect(esc.defaultPrevented).toBe(true);
    expect(openKinds(s.el)).toEqual([]);
    const again = key(s.editor.view.dom, 'Escape');
    expect(again.defaultPrevented).toBe(false);
    selectText(s.editor, 'Texto');
    await settle(s.fixture);
    expect(openKinds(s.el)).toEqual(['text']);
    expectQuiet(s);
  });

  it('Escape já consumido (ouvinte de captura) → menu continua (Review Focus 5)', async () => {
    const s = await setup();
    await focusAnd(s, bold(s.editor));
    const consume = (e: Event) => e.preventDefault();
    s.el.addEventListener('keydown', consume, { capture: true });
    try {
      key(s.editor.view.dom, 'Escape');
      await settle(s.fixture);
    } finally {
      s.el.removeEventListener('keydown', consume, { capture: true });
    }
    expect(openKinds(s.el)).toEqual(['text']);
    expectQuiet(s);
  });
});

describe('focusFloatingMenu() (M12)', () => {
  it('true com menu (foco no item ativo); false sem menu (foco não muda)', async () => {
    const s = await setup();
    await focusAnd(s, bold(s.editor));
    expect(s.cmp.focusFloatingMenu()).toBe(true);
    expect(active()).toBe('Bold');
    s.editor.view.focus();
    caret(s.editor)();
    await settle(s.fixture);
    expect(s.cmp.focusFloatingMenu()).toBe(false);
    expect(document.activeElement).toBe(s.editor.view.dom);
    expectQuiet(s);
  });

  it('false com readonly', async () => {
    const s = await setup();
    await focusAnd(s, bold(s.editor));
    s.host.readonly.set(true);
    await settle(s.fixture);
    const before = document.activeElement;
    expect(s.cmp.focusFloatingMenu()).toBe(false);
    expect(document.activeElement).toBe(before);
  });

  it('duas instâncias: A com menu, B.focusFloatingMenu() → false e o foco não vai a A (Review Focus 4)', async () => {
    const fixture = TestBed.createComponent(TwoHosts);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const [a, b] = fixture.componentInstance.cmps();
    const editorA = a?.editor() as Editor;
    restoreCoords.push(fakeCoords(editorA, coords));
    editorA.view.dom.focus();
    selectText(editorA, 'negrito');
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const elA = root.querySelector('rte-editor.a') as HTMLElement;
    expect(openKinds(elA)).toEqual(['text']);
    expect(b?.focusFloatingMenu()).toBe(false);
    expect(document.activeElement).toBe(editorA.view.dom);
    expect(menu(elA, 'text').contains(document.activeElement)).toBe(false);
  });
});
