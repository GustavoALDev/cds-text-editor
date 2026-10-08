// @vitest-environment jsdom
import {
  ChangeDetectionStrategy,
  Component,
  NgZone,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor } from '@cds/rte-angular';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RteViewportWatch } from './floating/viewport-watch';
import { readViewport } from './floating/visual-viewport';
import { installDialogShim } from './testing-support/dialog';
import { selectText } from './testing-support/editors';
import { fakeCoords, installGeometry } from './testing-support/geometry';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';
import { positionFloating, type RteRect } from './toolbar/position';
// eslint-disable-next-line @nx/enforce-module-boundaries -- ajudante de teste do core, só teste
import { pressKey } from '../../core/extensions/src/testing/press-key';
// eslint-disable-next-line @nx/enforce-module-boundaries -- ajudante de teste do core, só teste
import { typeText } from '../../core/extensions/src/testing/type-text';

// Spec 08b, O7: camadas posicionadas pela viewport visual (teclado virtual e
// pinça), com `visualViewport` falso (o jsdom não tem).

const LAYOUT = { width: 1000, height: 800 };
const EDITABLE: RteRect = { top: 100, left: 100, right: 900, bottom: 700 };
const MENU = { width: 200, height: 40 };
const LIST = { width: 200, height: 120 };
const coords = (pos: number): RteRect => ({
  top: 200,
  bottom: 220,
  left: 100 + pos * 2,
  right: 100 + pos * 2,
});

type VisualBox = {
  offsetLeft: number;
  offsetTop: number;
  width: number;
  height: number;
};

/** `visualViewport` falso: alvo de eventos com os quatro números lidos. */
class FakeVisualViewport extends EventTarget {
  offsetLeft = 0;
  offsetTop = 0;
  width = LAYOUT.width;
  height = LAYOUT.height;
  scale = 1;

  move(next: Partial<VisualBox>, type = 'resize'): void {
    Object.assign(this, next);
    this.dispatchEvent(new Event(type));
  }
}

function installVisualViewport(): FakeVisualViewport {
  const fake = new FakeVisualViewport();
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: fake,
  });
  return fake;
}

@Component({
  selector: 'rte-test-visual-viewport',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="'<p>Texto <strong>negrito</strong> fim</p>'"
    toolbar="full"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly cmp = viewChild.required(RteEditor);
}

let restorePopover: () => void;
let restoreGeometry: () => void;
let restoreDialog: () => void;
let restoreCoords: (() => void) | undefined;

beforeEach(() => {
  restoreDialog = installDialogShim();
  restorePopover = installPopoverShim();
  restoreGeometry = installGeometry({
    viewport: LAYOUT,
    rects: (el) => (el.classList.contains('ProseMirror') ? EDITABLE : null),
    size: (el) =>
      el.classList.contains('rte-floating')
        ? MENU
        : el.classList.contains('rte-slash-menu')
          ? LIST
          : { width: 100, height: 40 },
  });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  TestBed.resetTestingModule();
  restoreCoords?.();
  restoreCoords = undefined;
  restoreGeometry();
  restorePopover();
  restoreDialog();
  vi.restoreAllMocks();
  // estado de módulo compartilhado (`isolate: false`): o jsdom não tem a API
  Reflect.deleteProperty(window, 'visualViewport');
});

async function setup(): Promise<{
  fixture: ComponentFixture<Host>;
  root: HTMLElement;
  editor: Editor;
}> {
  const fixture = TestBed.createComponent(Host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const editor = fixture.componentInstance.cmp().editor() as Editor;
  restoreCoords = fakeCoords(editor, coords);
  return {
    fixture,
    root: (fixture.nativeElement as HTMLElement).querySelector(
      'rte-editor',
    ) as HTMLElement,
    editor,
  };
}

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const textMenu = (root: ParentNode) =>
  root.querySelector<HTMLElement>('.rte-floating--text') as HTMLElement;
const slashList = (root: ParentNode) =>
  root.querySelector<HTMLElement>('.rte-slash-menu') as HTMLElement;

describe('readViewport (O7)', () => {
  it('sem visualViewport: a viewport de layout, como antes', () => {
    expect(readViewport(window)).toEqual({ top: 0, left: 0, ...LAYOUT });
  });

  it('com visualViewport deslocada e reduzida: o retângulo visual', () => {
    installVisualViewport().move({
      offsetLeft: 12,
      offsetTop: 340,
      width: 360,
      height: 300,
    });
    expect(readViewport(window)).toEqual({
      top: 340,
      left: 12,
      width: 360,
      height: 300,
    });
  });

  it('visualViewport de tamanho zero (documento destacado): cai para o layout', () => {
    installVisualViewport().move({ width: 0, height: 0 });
    expect(readViewport(window)).toEqual({ top: 0, left: 0, ...LAYOUT });
  });
});

describe('positionFloating com viewport deslocada (O7)', () => {
  const visible: RteRect = { top: 0, left: 0, right: 1000, bottom: 800 };

  it('left/top zero equivalem a omiti-los', () => {
    const base = {
      anchor: { top: 400, bottom: 420, left: 450, right: 550 },
      visible,
      menu: MENU,
      prefer: 'above' as const,
    };
    expect(positionFloating({ ...base, viewport: LAYOUT })).toEqual(
      positionFloating({ ...base, viewport: { ...LAYOUT, left: 0, top: 0 } }),
    );
  });

  it('margem de 8 contada a partir da borda visual (esquerda e topo)', () => {
    const p = positionFloating({
      anchor: { top: 130, bottom: 150, left: 210, right: 230 },
      visible,
      menu: MENU,
      viewport: { left: 200, top: 100, width: 300, height: 300 },
      prefer: 'above',
    });
    // acima: 130 - 8 - 40 = 82 < 100 + 8, então abaixo; esquerda: 200 + 8
    expect(p).toEqual({ left: 208, top: 158, placement: 'below' });
  });

  it('borda direita e inferior visuais, não as de layout', () => {
    const p = positionFloating({
      anchor: { top: 330, bottom: 350, left: 480, right: 490 },
      visible,
      menu: MENU,
      viewport: { left: 200, top: 100, width: 300, height: 300 },
      prefer: 'below',
    });
    // abaixo: 358 + 40 > 100 + 300 - 8, então acima; direita: 200 + 300 - 8 - 200
    expect(p).toEqual({ left: 292, top: 282, placement: 'above' });
  });
});

describe('RteViewportWatch com visualViewport (O7, F3)', () => {
  it('start/stop registram e removem resize e scroll da viewport visual, uma vez', () => {
    const vv = installVisualViewport();
    const add = vi.spyOn(vv, 'addEventListener');
    const remove = vi.spyOn(vv, 'removeEventListener');
    const frames: number[] = [];
    const watch = new RteViewportWatch(
      window,
      TestBed.inject(NgZone),
      () => undefined,
      () => frames.push(1),
    );
    const types = (spy: typeof add) => spy.mock.calls.map((c) => c[0]);
    watch.start();
    watch.start();
    expect(types(add)).toEqual(['resize', 'scroll']);
    watch.stop();
    watch.stop();
    expect(types(remove)).toEqual(['resize', 'scroll']);
    vv.move({ offsetTop: 10 }, 'scroll');
    expect(frames).toEqual([]);
  });

  it('eventos da viewport visual agendam um quadro sem invalidar os ancestrais', async () => {
    const vv = installVisualViewport();
    const onResize = vi.fn();
    const frames: number[] = [];
    const watch = new RteViewportWatch(
      window,
      TestBed.inject(NgZone),
      onResize,
      () => frames.push(1),
    );
    watch.start();
    vv.move({ height: 300 });
    vv.move({ offsetTop: 5 }, 'scroll');
    await nextFrame();
    watch.stop();
    expect(frames).toEqual([1]);
    expect(onResize).not.toHaveBeenCalled();
  });
});

describe('menu flutuante pela viewport visual (O7)', () => {
  it('teclado aberto (viewport visual menor): sem espaço acima, o menu vai para baixo', async () => {
    const { fixture, root, editor } = await setup();
    installVisualViewport().move({ offsetTop: 150, height: 300 });
    editor.view.dom.focus();
    selectText(editor, 'negrito');
    await settle(fixture);
    // layout (800): acima = 152; visual (150..450): acima não cabe, abaixo sim
    expect(textMenu(root).style.top).toBe('228px');
  });

  it('resize e scroll da viewport visual reposicionam só com o menu visível', async () => {
    const { fixture, root, editor } = await setup();
    const vv = installVisualViewport();
    const add = vi.spyOn(vv, 'addEventListener');
    const remove = vi.spyOn(vv, 'removeEventListener');
    const count = (spy: typeof add, type: string) =>
      spy.mock.calls.filter((c) => c[0] === type).length;
    editor.view.dom.focus();
    await settle(fixture);
    expect(count(add, 'resize') + count(add, 'scroll')).toBe(0);
    selectText(editor, 'negrito');
    await settle(fixture);
    expect(count(add, 'resize')).toBe(1);
    expect(count(add, 'scroll')).toBe(1);
    expect(textMenu(root).style.top).toBe('152px');
    vv.move({ offsetTop: 150, height: 300 });
    await nextFrame();
    await settle(fixture);
    expect(textMenu(root).style.top).toBe('228px');
    vv.move({ offsetTop: 0, height: 800 }, 'scroll');
    await nextFrame();
    await settle(fixture);
    expect(textMenu(root).style.top).toBe('152px');
    editor.commands.setTextSelection(2);
    await settle(fixture);
    expect(count(remove, 'resize')).toBe(1);
    expect(count(remove, 'scroll')).toBe(1);
  });

  it('destruir com o menu visível remove os ouvintes da viewport visual', async () => {
    const { fixture, editor } = await setup();
    const vv = installVisualViewport();
    const remove = vi.spyOn(vv, 'removeEventListener');
    editor.view.dom.focus();
    selectText(editor, 'negrito');
    await settle(fixture);
    fixture.destroy();
    const types = remove.mock.calls.map((c) => c[0]);
    expect(types).toContain('resize');
    expect(types).toContain('scroll');
  });
});

describe('lista do / pela viewport visual (O7)', () => {
  it('abaixo da linha com a viewport inteira; acima quando o teclado a encolhe', async () => {
    const { fixture, root, editor } = await setup();
    const vv = installVisualViewport();
    editor.commands.setTextSelection(1);
    typeText(editor, '/');
    await settle(fixture);
    await settle(fixture);
    expect(slashList(root).style.top).toBe('228px');
    vv.move({ height: 300 });
    await nextFrame();
    await settle(fixture);
    // 228 + 120 > 300 - 8, então acima da linha: 200 - 8 - 120
    expect(slashList(root).style.top).toBe('72px');
  });

  it('ouvintes só com a lista aberta e removidos ao fechar', async () => {
    const { fixture, editor } = await setup();
    const vv = installVisualViewport();
    const add = vi.spyOn(vv, 'addEventListener');
    const remove = vi.spyOn(vv, 'removeEventListener');
    editor.commands.setTextSelection(1);
    await settle(fixture);
    expect(add).not.toHaveBeenCalled();
    typeText(editor, '/');
    await settle(fixture);
    await settle(fixture);
    expect(add.mock.calls.map((c) => c[0])).toEqual(['resize', 'scroll']);
    pressKey(editor, 'Escape');
    await settle(fixture);
    await settle(fixture);
    expect(remove.mock.calls.map((c) => c[0])).toEqual(['resize', 'scroll']);
  });
});
