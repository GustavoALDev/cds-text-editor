import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { form, FormField } from '@angular/forms/signals';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor, type RteFloatingMenusConfig } from '@cds/rte-angular';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { RteFloatingMenus } from './floating/rte-floating-menus';
import { installDialogShim, waitForDialog } from './testing-support/dialog';
import { selectText } from './testing-support/editors';
import { fakeCoords, installGeometry } from './testing-support/geometry';
import { installPopoverShim, isPopoverOpen } from './testing-support/popover';
import { settle } from './testing-support/render';
import { positionFloating, type RteRect } from './toolbar/position';

// Spec 05b2b, Tarefa 5: exibição, posição aplicada e foco dos menus
// flutuantes (R2, R4, R5, R6, R10, R11; M11).

const DOC =
  '<p>Texto <strong>negrito</strong> e <a href="https://example.com/">exemplo</a> fim</p>' +
  '<figure class="rt-figure rt-figure--left"><img src="https://example.com/a.jpg" alt="Foto A"></figure>' +
  '<table><tbody><tr><td><p>c1</p></td><td><p>c2</p></td></tr></tbody></table>' +
  '<figure class="rt-pullquote"><blockquote><p>Uma frase marcante.</p></blockquote>' +
  '<figcaption><cite>Fulana</cite></figcaption></figure><p>depois</p>';

const OPTIONS = {
  features: {
    colors: true,
    code: true,
    tables: true,
    tasks: true,
    media: true,
    embeds: true,
    newsBlocks: true,
  },
};

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
  selector: 'rte-test-floating-host',
  imports: [RteEditor],
  template: `<rte-editor
    [(value)]="value"
    [options]="options"
    toolbar="full"
    [disabled]="disabled()"
    [readonly]="readonly()"
    [hidden]="hidden()"
    [floatingMenus]="floating()"
    (editorBlur)="blurs = blurs + 1"
    (editorFocus)="focuses = focuses + 1"
    (touch)="touches = touches + 1"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal(DOC);
  readonly options = OPTIONS;
  readonly disabled = signal(false);
  readonly readonly = signal(false);
  readonly hidden = signal(false);
  readonly floating = signal<RteFloatingMenusConfig | undefined>(undefined);
  blurs = 0;
  focuses = 0;
  touches = 0;
  readonly cmp = viewChild.required(RteEditor);
}

@Component({
  selector: 'rte-test-floating-two',
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

@Component({
  selector: 'rte-test-floating-form',
  imports: [RteEditor, FormField],
  template: `<rte-editor
    [formField]="f.body"
    [options]="options"
    toolbar="full"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class FormHost {
  readonly f = form(signal({ body: DOC }));
  readonly options = OPTIONS;
  readonly cmp = viewChild.required(RteEditor);
}

/** Ancestral com `overflow: auto` fingido e seu retângulo. */
let clip: Element | null = null;
let clipRect: RteRect = { top: 0, left: 0, right: 1000, bottom: 800 };

let restoreDialog: () => void;
let restorePopover: () => void;
let restoreGeometry: () => void;
const restoreCoords: (() => void)[] = [];
let error: MockInstance<typeof console.error>;

beforeEach(() => {
  restoreDialog = installDialogShim();
  restorePopover = installPopoverShim();
  clip = null;
  clipRect = { top: 0, left: 0, right: 1000, bottom: 800 };
  const rectOf = (el: Element): RteRect | null => {
    if (el.classList.contains('rte-floating')) return null;
    if (el === clip) return clipRect;
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
  const realStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) =>
    el === clip
      ? ({ overflowX: 'auto', overflowY: 'auto' } as CSSStyleDeclaration)
      : realStyle(el, pseudo),
  );
  error = vi.spyOn(console, 'error');
});

afterEach(() => {
  TestBed.resetTestingModule();
  for (const restore of restoreCoords.splice(0)) restore();
  restoreGeometry();
  restorePopover();
  restoreDialog();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'matchMedia');
});

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function setup(init: (host: Host) => void = () => undefined): Promise<{
  fixture: ComponentFixture<Host>;
  host: Host;
  el: HTMLElement;
  cmp: RteEditor;
  editor: Editor;
}> {
  const fixture = TestBed.createComponent(Host);
  init(fixture.componentInstance);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const host = fixture.componentInstance;
  const cmp = host.cmp();
  const editor = cmp.editor() as Editor;
  restoreCoords.push(fakeCoords(editor, coords));
  return {
    fixture,
    host,
    el: (fixture.nativeElement as HTMLElement).querySelector(
      'rte-editor',
    ) as HTMLElement,
    cmp,
    editor,
  };
}

function menus(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.rte-floating')];
}

function menu(root: ParentNode, kind: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(`.rte-floating--${kind}`);
  if (!found) throw new Error(`menu ${kind} ausente`);
  return found;
}

/** Tipos dos menus abertos. */
function openKinds(root: ParentNode): string[] {
  return menus(root)
    .filter((m) => isPopoverOpen(m))
    .map((m) => m.getAttribute('data-rte-kind') ?? '?');
}

function floatingOf(fixture: ComponentFixture<unknown>): RteFloatingMenus {
  const found = fixture.debugElement.query(By.directive(RteFloatingMenus));
  if (!found) throw new Error('rte-floating-menus ausente');
  return found.componentInstance as RteFloatingMenus;
}

function posOf(editor: Editor, name: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === name) found = pos;
    return true;
  });
  if (found < 0) throw new Error(`${name} ausente`);
  return found;
}

function selectNode(editor: Editor, name: string): void {
  editor.view.dispatch(
    editor.state.tr.setSelection(
      NodeSelection.create(editor.state.doc, posOf(editor, name)),
    ),
  );
}

/** Foca o editável, aplica a seleção e zera os contadores do host. */
async function focusAnd(
  fixture: ComponentFixture<Host>,
  editor: Editor,
  select: () => void,
): Promise<void> {
  editor.view.dom.focus();
  select();
  await settle(fixture);
  const host = fixture.componentInstance;
  host.blurs = host.focuses = host.touches = 0;
}

const bold = (editor: Editor) => () => selectText(editor, 'negrito');
const inLink = (editor: Editor) => () => selectText(editor, 'exemplo', 2);
const inCell = (editor: Editor) => () => selectText(editor, 'c1', 1);
const image = (editor: Editor) => () => selectNode(editor, 'rtImage');

describe('começam ocultos (R2)', () => {
  it('sem .rte-floating antes da criação; depois, 4 popover="manual" fechados entre o mount e os diálogos', async () => {
    const fixture = TestBed.createComponent(Host);
    expect(menus(fixture.nativeElement as HTMLElement)).toHaveLength(0);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const el = (fixture.nativeElement as HTMLElement).querySelector(
      'rte-editor',
    ) as HTMLElement;
    const found = menus(el);
    expect(found.map((m) => m.getAttribute('data-rte-kind'))).toEqual([
      'image',
      'link',
      'text',
      'table',
    ]);
    const mount = el.querySelector('.rte-editor__mount') as HTMLElement;
    const frame = el.querySelector('.rte-editor__frame') as HTMLElement;
    for (const m of found) {
      expect(m.getAttribute('popover')).toBe('manual');
      expect(m.getAttribute('role')).toBe('toolbar');
      expect(m.getAttribute('aria-orientation')).toBe('horizontal');
      expect(m.classList.contains('rte-floating')).toBe(true);
      expect(frame.contains(m)).toBe(true);
      expect(
        mount.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      for (const dialogs of el.querySelectorAll('rte-dialogs')) {
        expect(
          m.compareDocumentPosition(dialogs) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
    }
    expect(menu(el, 'text').getAttribute('aria-label')).toBe('Text formatting');
    expect(openKinds(el)).toEqual([]);
  });

  it('documento com imagem, tabela e link sem foco → nenhum aberto', async () => {
    const { fixture, el, editor } = await setup();
    image(editor)();
    await settle(fixture);
    expect(openKinds(el)).toEqual([]);
    inLink(editor)();
    await settle(fixture);
    expect(openKinds(el)).toEqual([]);
  });

  it('itens: rótulos, tabindex -1 e mousedown com preventDefault', async () => {
    const { el } = await setup();
    const names = (kind: string) =>
      [
        ...menu(el, kind).querySelectorAll<HTMLElement>('.rte-toolbar__button'),
      ].map((b) => b.getAttribute('aria-label'));
    expect(names('text')).toEqual([
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Inline code',
      'Link',
    ]);
    expect(names('link')).toEqual(['Edit link', 'Remove link']);
    expect(names('table')).toEqual([
      'Insert row below',
      'Insert column after',
      'Delete row',
      'Delete column',
      'More table operations',
    ]);
    expect(names('image')).toEqual([
      'Align left',
      'Center',
      'Align right',
      'Full width',
      'Remove image',
    ]);
    const buttons = [
      ...el.querySelectorAll<HTMLElement>('.rte-floating .rte-toolbar__button'),
    ];
    expect(buttons.length).toBe(18);
    for (const b of buttons) {
      expect(b.getAttribute('tabindex')).toBe('-1');
      const down = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      });
      b.dispatchEvent(down);
      expect(down.defaultPrevented).toBe(true);
    }
    expect(
      menu(el, 'text').querySelectorAll('.rte-toolbar__separator'),
    ).toHaveLength(1);
  });
});

describe('quando aparece e quando oculta (R4, R10)', () => {
  it('foco + seleção de texto → menu de texto, sem mexer no foco', async () => {
    const { fixture, el, editor } = await setup();
    await focusAnd(fixture, editor, bold(editor));
    expect(openKinds(el)).toEqual(['text']);
    expect(document.activeElement).toBe(editor.view.dom);
    const b = menu(el, 'text').querySelector<HTMLElement>(
      '[aria-label="Bold"]',
    );
    expect(b?.getAttribute('aria-pressed')).toBe('true');
    // troca de tipo
    inLink(editor)();
    await settle(fixture);
    expect(openKinds(el)).toEqual(['link']);
    expect(document.activeElement).toBe(editor.view.dom);
    image(editor)();
    await settle(fixture);
    expect(openKinds(el)).toEqual(['image']);
    expect(document.activeElement).toBe(editor.view.dom);
    expect(
      menu(el, 'image')
        .querySelector('[aria-label="Align left"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    inCell(editor)();
    await settle(fixture);
    expect(openKinds(el)).toEqual(['table']);
    expect(document.activeElement).toBe(editor.view.dom);
    // reposicionar
    window.dispatchEvent(new Event('resize'));
    await nextFrame();
    await settle(fixture);
    expect(openKinds(el)).toEqual(['table']);
    expect(document.activeElement).toBe(editor.view.dom);
    // ocultar
    selectText(editor, 'depois', 1);
    await settle(fixture);
    expect(openKinds(el)).toEqual([]);
    expect(document.activeElement).toBe(editor.view.dom);
    expect(error).not.toHaveBeenCalled();
  });

  it('foco num botão da barra → oculto', async () => {
    const { fixture, el, editor } = await setup();
    await focusAnd(fixture, editor, bold(editor));
    el.querySelector<HTMLElement>('.rte-toolbar .rte-toolbar__button')?.focus();
    await settle(fixture);
    expect(openKinds(el)).toEqual([]);
  });

  it.each(['disabled', 'readonly', 'hidden'] as const)(
    '%s → oculto; desligar → volta',
    async (which) => {
      const { fixture, host, el, editor } = await setup();
      await focusAnd(fixture, editor, bold(editor));
      expect(openKinds(el)).toEqual(['text']);
      host[which].set(true);
      await settle(fixture);
      expect(openKinds(el)).toEqual([]);
      host[which].set(false);
      await settle(fixture);
      editor.view.dom.focus();
      await settle(fixture);
      expect(openKinds(el)).toEqual(['text']);
    },
  );

  it('pointerdown no editável → oculto até pointerup no documento', async () => {
    const { fixture, el, editor } = await setup();
    await focusAnd(fixture, editor, bold(editor));
    editor.view.dom.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
    );
    await settle(fixture);
    expect(openKinds(el)).toEqual([]);
    document.body.dispatchEvent(
      new MouseEvent('pointerup', { bubbles: true, button: 0 }),
    );
    await settle(fixture);
    expect(openKinds(el)).toEqual(['text']);
    expect(document.activeElement).toBe(editor.view.dom);
  });

  it('compositionstart → oculto até compositionend', async () => {
    const { fixture, el, editor } = await setup();
    await focusAnd(fixture, editor, bold(editor));
    editor.view.dom.dispatchEvent(
      new Event('compositionstart', { bubbles: true }),
    );
    await settle(fixture);
    expect(openKinds(el)).toEqual([]);
    editor.view.dom.dispatchEvent(
      new Event('compositionend', { bubbles: true }),
    );
    await settle(fixture);
    expect(openKinds(el)).toEqual(['text']);
  });

  it('openDialog com o menu visível → oculto; cancelar → volta (R10)', async () => {
    const { fixture, el, cmp, editor } = await setup();
    await focusAnd(fixture, editor, () => selectText(editor, 'marcante'));
    expect(openKinds(el)).toEqual(['text']);
    expect(cmp.openDialog('quoteAuthor')).toBe(true);
    await settle(fixture);
    expect(openKinds(el)).toEqual([]);
    const dialog = await waitForDialog(fixture);
    expect(openKinds(el)).toEqual([]);
    const cancel = [
      ...dialog.querySelectorAll<HTMLButtonElement>(
        '.rte-dialog__actions button',
      ),
    ].find((b) => b.textContent?.trim() === 'Cancel');
    cancel?.click();
    await settle(fixture);
    await nextFrame();
    await settle(fixture);
    expect(document.activeElement).toBe(editor.view.dom);
    expect(openKinds(el)).toEqual(['text']);
  });

  it('duas instâncias: só a com foco mostra; diálogo em A oculta o de B (Review Focus 4)', async () => {
    const fixture = TestBed.createComponent(TwoHosts);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const [a, b] = fixture.componentInstance.cmps();
    if (!a || !b) throw new Error('instâncias ausentes');
    const ea = a.editor() as Editor;
    const eb = b.editor() as Editor;
    restoreCoords.push(fakeCoords(ea, coords), fakeCoords(eb, coords));
    const root = fixture.nativeElement as HTMLElement;
    const elA = root.querySelector('rte-editor.a') as HTMLElement;
    const elB = root.querySelector('rte-editor.b') as HTMLElement;
    selectText(ea, 'marcante');
    selectText(eb, 'negrito');
    eb.view.dom.focus();
    await settle(fixture);
    expect(openKinds(elA)).toEqual([]);
    expect(openKinds(elB)).toEqual(['text']);
    expect(a.openDialog('quoteAuthor')).toBe(true);
    await waitForDialog(fixture);
    eb.view.dom.focus();
    await settle(fixture);
    expect(openKinds(elA)).toEqual([]);
    expect(openKinds(elB)).toEqual([]);
  });
});

describe('posição (R5)', () => {
  it('left/top de positionFloating, sem --measuring depois do render', async () => {
    const { fixture, el, editor } = await setup();
    await focusAnd(fixture, editor, bold(editor));
    const { from, to } = editor.state.selection;
    const p = positionFloating({
      anchor: {
        top: 200,
        bottom: 220,
        left: coords(from).left,
        right: coords(to).right,
      },
      visible: EDITABLE,
      menu: MENU,
      viewport: VIEWPORT,
      prefer: 'above',
    });
    const m = menu(el, 'text');
    expect(m.style.getPropertyValue('left')).toBe(`${Math.round(p.left)}px`);
    expect(m.style.getPropertyValue('top')).toBe(`${Math.round(p.top)}px`);
    expect(p.placement).toBe('above');
    expect(m.classList.contains('rte-floating--measuring')).toBe(false);
  });

  it('pointer: coarse → texto abaixo da âncora', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (q: string) => ({ matches: q === '(pointer: coarse)', media: q }),
    });
    const { fixture, el, editor } = await setup();
    await focusAnd(fixture, editor, bold(editor));
    expect(menu(el, 'text').style.getPropertyValue('top')).toBe('228px');
  });

  it('âncora fora da área visível → oculto; volta com scroll + quadro', async () => {
    const { fixture, el, editor } = await setup();
    clip = fixture.nativeElement as Element;
    await focusAnd(fixture, editor, bold(editor));
    expect(openKinds(el)).toEqual(['text']);
    clipRect = { top: 400, left: 0, right: 1000, bottom: 800 };
    window.dispatchEvent(new Event('scroll'));
    await nextFrame();
    await settle(fixture);
    expect(openKinds(el)).toEqual([]);
    expect(floatingOf(fixture).visibleKind()).toBeNull();
    expect(document.activeElement).toBe(editor.view.dom);
    clipRect = { top: 0, left: 0, right: 1000, bottom: 800 };
    window.dispatchEvent(new Event('scroll'));
    await nextFrame();
    await settle(fixture);
    expect(openKinds(el)).toEqual(['text']);
    expect(floatingOf(fixture).visibleKind()).toBe('text');
  });

  it('ouvintes de scroll/resize só com candidato (pré-voo 8)', async () => {
    const { fixture, editor } = await setup();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const count = (spy: typeof add | typeof remove, type: string) =>
      spy.mock.calls.filter((c) => c[0] === type).length;
    editor.view.dom.focus();
    await settle(fixture);
    expect(count(add, 'scroll') + count(add, 'resize')).toBe(0);
    bold(editor)();
    await settle(fixture);
    expect(count(add, 'scroll')).toBe(1);
    expect(count(add, 'resize')).toBe(1);
    // recortado continua com candidato: sem novo registro nem remoção
    clip = fixture.nativeElement as Element;
    clipRect = { top: 400, left: 0, right: 1000, bottom: 800 };
    window.dispatchEvent(new Event('resize'));
    await nextFrame();
    await settle(fixture);
    expect(floatingOf(fixture).visibleKind()).toBeNull();
    expect(count(add, 'scroll')).toBe(1);
    expect(count(remove, 'scroll')).toBe(0);
    selectText(editor, 'depois', 1);
    await settle(fixture);
    expect(count(remove, 'scroll')).toBe(1);
    expect(count(remove, 'resize')).toBe(1);
    expect(count(add, 'scroll')).toBe(1);
  });
});

describe('foco (R6, M11)', () => {
  it('ir e voltar entre editável e menu: sem editorBlur/editorFocus/touch', async () => {
    const { fixture, host, el, editor } = await setup();
    await focusAnd(fixture, editor, bold(editor));
    const floating = floatingOf(fixture);
    expect(floating.focusActive()).toBe(true);
    await settle(fixture);
    expect(menu(el, 'text').contains(document.activeElement)).toBe(true);
    expect(openKinds(el)).toEqual(['text']);
    editor.view.focus();
    await settle(fixture);
    expect(document.activeElement).toBe(editor.view.dom);
    expect(openKinds(el)).toEqual(['text']);
    selectText(editor, 'depois', 1);
    await settle(fixture);
    expect([host.blurs, host.focuses, host.touches]).toEqual([0, 0, 0]);
    for (const b of el.querySelectorAll('.rte-floating .rte-toolbar__button')) {
      expect(b.getAttribute('tabindex')).toBe('-1');
    }
  });

  it('[formField]: ir ao menu e voltar não marca touched', async () => {
    const fixture = TestBed.createComponent(FormHost);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const editor = fixture.componentInstance.cmp().editor() as Editor;
    restoreCoords.push(fakeCoords(editor, coords));
    editor.view.dom.focus();
    selectText(editor, 'negrito');
    await settle(fixture);
    expect(floatingOf(fixture).focusActive()).toBe(true);
    await settle(fixture);
    editor.view.focus();
    await settle(fixture);
    expect(fixture.componentInstance.f.body().touched()).toBe(false);
  });

  it('readonly com o foco no menu de link → foco no editável antes de ocultar', async () => {
    const { fixture, host, el, editor } = await setup();
    await focusAnd(fixture, editor, inLink(editor));
    expect(openKinds(el)).toEqual(['link']);
    expect(floatingOf(fixture).focusActive()).toBe(true);
    await settle(fixture);
    const m = menu(el, 'link');
    expect(m.contains(document.activeElement)).toBe(true);
    let atHide: Element | null = null;
    m.addEventListener('toggle', (e) => {
      if ((e as ToggleEvent).newState === 'closed') {
        atHide = document.activeElement;
      }
    });
    host.readonly.set(true);
    await settle(fixture);
    expect(openKinds(el)).toEqual([]);
    expect(atHide).toBe(editor.view.dom);
    expect(document.activeElement).toBe(editor.view.dom);
    expect(host.blurs).toBe(0);
    expect(error).not.toHaveBeenCalled();
  });

  it('disabled com o foco no menu → touch 1× (U18)', async () => {
    const { fixture, host, el, editor } = await setup();
    await focusAnd(fixture, editor, bold(editor));
    floatingOf(fixture).focusActive();
    await settle(fixture);
    host.disabled.set(true);
    await settle(fixture);
    await nextFrame();
    await settle(fixture);
    expect(openKinds(el)).toEqual([]);
    expect(host.touches).toBe(1);
  });

  it('tipo desligado ao vivo com o foco dentro → foco no editável, sem editorBlur (pré-voo 11)', async () => {
    const { fixture, host, el, editor } = await setup();
    await focusAnd(fixture, editor, inLink(editor));
    floatingOf(fixture).focusActive();
    await settle(fixture);
    expect(menu(el, 'link').contains(document.activeElement)).toBe(true);
    host.floating.set({ link: false });
    await settle(fixture);
    await nextFrame();
    await settle(fixture);
    expect(el.querySelector('.rte-floating--link')).toBeNull();
    expect(document.activeElement).toBe(editor.view.dom);
    expect(host.blurs).toBe(0);
    expect(host.touches).toBe(0);
  });

  it('valor externo com o foco no menu de imagem → oculto, foco no editável (Review Focus 3)', async () => {
    const { fixture, host, el, editor } = await setup();
    await focusAnd(fixture, editor, image(editor));
    expect(floatingOf(fixture).focusActive()).toBe(true);
    await settle(fixture);
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Align left',
    );
    host.value.set('<p>x</p>');
    await settle(fixture);
    expect(openKinds(el)).toEqual([]);
    expect(document.activeElement).toBe(editor.view.dom);
    expect(host.blurs).toBe(0);
    expect(error).not.toHaveBeenCalled();
  });

  it('undo que remove a imagem com o foco no menu → oculto, foco no editável', async () => {
    const { fixture, host, el, editor } = await setup((h) =>
      h.value.set('<p>a</p>'),
    );
    editor.view.dom.focus();
    editor
      .chain()
      .insertContentAt(
        editor.state.doc.content.size,
        '<figure class="rt-figure rt-figure--left"><img src="https://example.com/b.jpg" alt="B"></figure>',
      )
      .run();
    await focusAnd(fixture, editor, image(editor));
    expect(openKinds(el)).toEqual(['image']);
    expect(floatingOf(fixture).focusActive()).toBe(true);
    await settle(fixture);
    editor.commands.undo();
    await settle(fixture);
    expect(() => posOf(editor, 'rtImage')).toThrow();
    expect(openKinds(el)).toEqual([]);
    expect(document.activeElement).toBe(editor.view.dom);
    expect(host.blurs).toBe(0);
    expect(error).not.toHaveBeenCalled();
  });
});

describe('dismiss', () => {
  it('oculta o visível e devolve true; sem menu visível, false', async () => {
    const { fixture, el, editor } = await setup();
    const floating = floatingOf(fixture);
    expect(floating.dismiss()).toBe(false);
    await focusAnd(fixture, editor, bold(editor));
    expect(floating.visibleKind()).toBe('text');
    expect(floating.dismiss()).toBe(true);
    await settle(fixture);
    expect(openKinds(el)).toEqual([]);
    // outra identidade → volta
    selectText(editor, 'Texto');
    await settle(fixture);
    expect(openKinds(el)).toEqual(['text']);
  });
});

describe('configuração (R11)', () => {
  it('floatingMenus: false com o foco no menu de link → foco no editável, sem editorBlur/touch', async () => {
    const { fixture, host, el, editor } = await setup();
    await focusAnd(fixture, editor, inLink(editor));
    expect(floatingOf(fixture).focusActive()).toBe(true);
    await settle(fixture);
    expect(menu(el, 'link').contains(document.activeElement)).toBe(true);
    host.floating.set(false);
    await settle(fixture);
    await nextFrame();
    await settle(fixture);
    expect(el.querySelector('rte-floating-menus')).toBeNull();
    expect(document.activeElement).toBe(editor.view.dom);
    expect(host.blurs).toBe(0);
    expect(host.touches).toBe(0);
  });

  it('desligar o tipo visível com o foco no editável → oculto', async () => {
    const { fixture, host, el, editor } = await setup();
    await focusAnd(fixture, editor, bold(editor));
    expect(openKinds(el)).toEqual(['text']);
    host.floating.set({ text: false });
    await settle(fixture);
    expect(el.querySelector('.rte-floating--text')).toBeNull();
    expect(openKinds(el)).toEqual([]);
    expect(document.activeElement).toBe(editor.view.dom);
    expect(host.blurs).toBe(0);
  });

  it('floatingMenus: false → sem rte-floating-menus; { table: false } → 3; ao vivo sem recriar', async () => {
    const ready = vi.fn();
    const { fixture, host, el, cmp } = await setup((h) =>
      h.floating.set(false),
    );
    cmp.editorReady.subscribe(ready);
    expect(el.querySelector('rte-floating-menus')).toBeNull();
    host.floating.set({ table: false });
    await settle(fixture);
    expect(menus(el).map((m) => m.getAttribute('data-rte-kind'))).toEqual([
      'image',
      'link',
      'text',
    ]);
    host.floating.set(true);
    await settle(fixture);
    expect(menus(el)).toHaveLength(4);
    expect(ready).not.toHaveBeenCalled();
  });
});

describe('destruição (Review Focus 2)', () => {
  it('remove ouvintes e cancela o quadro pendente', async () => {
    const { fixture, el, editor } = await setup();
    await focusAnd(fixture, editor, bold(editor));
    expect(openKinds(el)).toEqual(['text']);
    const removeWin = vi.spyOn(window, 'removeEventListener');
    const removeDoc = vi.spyOn(document, 'removeEventListener');
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    window.dispatchEvent(new Event('scroll'));
    fixture.destroy();
    const types = (spy: typeof removeWin) => spy.mock.calls.map((c) => c[0]);
    expect(types(removeWin)).toEqual(
      expect.arrayContaining(['scroll', 'resize']),
    );
    expect(types(removeDoc)).toContain('pointerup');
    expect(cancel).toHaveBeenCalled();
    await nextFrame();
    expect(error).not.toHaveBeenCalled();
  });
});
