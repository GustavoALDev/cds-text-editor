import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor, type RteEditorConfig } from '@comodeviaser/rte-angular';
import { getSlashMenuState } from '@comodeviaser/rte-core/extensions';
import type { Editor } from '@tiptap/core';
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
// eslint-disable-next-line @nx/enforce-module-boundaries -- ajudante de teste do core, só teste
import { pressKey } from '../../core/extensions/src/testing/press-key';
// eslint-disable-next-line @nx/enforce-module-boundaries -- ajudante de teste do core, só teste
import { typeText } from '../../core/extensions/src/testing/type-text';
import { slashListId, slashOptionId } from './slash/state';
import { installDialogShim } from './testing-support/dialog';
import { fakeCoords, installGeometry } from './testing-support/geometry';
import { installPopoverShim, isPopoverOpen } from './testing-support/popover';
import { settle } from './testing-support/render';
import type { RteRect } from './toolbar/position';

// Spec 05d1, Tarefa 2 (R3): lista do menu `/` (K4–K6) com o *chunk* já
// carregado (a carga manual está em `slash-defer.spec.ts`).

const VIEWPORT = { width: 1000, height: 800 };
const EDITABLE: RteRect = { top: 100, left: 100, right: 900, bottom: 700 };
const LIST = { width: 200, height: 120 };
const coords = (pos: number): RteRect => ({
  top: 200,
  bottom: 220,
  left: 100 + pos * 2,
  right: 100 + pos * 2,
});
const OPTIONS: RteEditorConfig = {
  features: { media: true, embeds: true, tables: true, newsBlocks: true },
};

@Component({
  selector: 'rte-test-slash',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="'<p></p>'"
    [options]="options()"
    [readonly]="readonly()"
    toolbar="full"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly options = signal<RteEditorConfig>(OPTIONS);
  readonly readonly = signal(false);
  readonly cmp = viewChild.required(RteEditor);
}

let editableRect: RteRect = EDITABLE;
let restorePopover: () => void;
let restoreGeometry: () => void;
let restoreDialog: () => void;
let restoreCoords: (() => void) | undefined;
let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  editableRect = EDITABLE;
  restoreDialog = installDialogShim();
  restorePopover = installPopoverShim();
  restoreGeometry = installGeometry({
    viewport: VIEWPORT,
    rects: (el) => (el.classList.contains('ProseMirror') ? editableRect : null),
    size: (el) =>
      el.classList.contains('rte-slash-menu')
        ? LIST
        : { width: 100, height: 40 },
  });
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  TestBed.resetTestingModule();
  restoreCoords?.();
  restoreCoords = undefined;
  restoreGeometry();
  restorePopover();
  restoreDialog();
  vi.restoreAllMocks();
});

interface Setup {
  fixture: ComponentFixture<Host>;
  host: Host;
  root: HTMLElement;
  cmp: RteEditor;
  editor: Editor;
}

async function setup(options?: RteEditorConfig): Promise<Setup> {
  const fixture = TestBed.createComponent(Host);
  if (options) fixture.componentInstance.options.set(options);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const cmp = fixture.componentInstance.cmp();
  const editor = cmp.editor() as Editor;
  restoreCoords = fakeCoords(editor, coords);
  editor.commands.setTextSelection(1);
  return {
    fixture,
    host: fixture.componentInstance,
    root: (fixture.nativeElement as HTMLElement).querySelector(
      'rte-editor',
    ) as HTMLElement,
    cmp,
    editor,
  };
}

/** Digita e espera o *chunk* e o render. */
async function type(s: Setup, text: string): Promise<void> {
  typeText(s.editor, text);
  await settle(s.fixture);
  await settle(s.fixture);
}

const list = (root: ParentNode) =>
  root.querySelector<HTMLElement>('.rte-slash-menu');
const options = (root: ParentNode) => [
  ...root.querySelectorAll<HTMLElement>('.rte-slash-menu__option'),
];
const live = (root: ParentNode) =>
  root.querySelector<HTMLElement>('.rte-live')?.textContent?.trim() ?? '';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ARIA = ['aria-autocomplete', 'aria-controls', 'aria-activedescendant'];
const selected = (root: ParentNode) =>
  options(root).filter((o) => o.getAttribute('aria-selected') === 'true');

describe('abertura e posição (K5)', () => {
  it('sem "/": lista ausente e nenhum atributo ARIA', async () => {
    const s = await setup();
    await settle(s.fixture);
    expect(list(s.root)).toBeNull();
    for (const a of ARIA) expect(s.editor.view.dom.hasAttribute(a)).toBe(false);
  });

  it('"/" abre o popover manual na posição do "/", abaixo da linha', async () => {
    const s = await setup();
    await type(s, '/');
    const el = list(s.root) as HTMLElement;
    expect(el.getAttribute('popover')).toBe('manual');
    expect(isPopoverOpen(el)).toBe(true);
    expect(el.style.left).toBe('102px');
    expect(el.style.top).toBe('228px');
    expect(el.getAttribute('role')).toBe('listbox');
    expect(el.getAttribute('aria-label')).toBe('Insert block');
    expect(options(s.root).length).toBeGreaterThan(3);
  });

  it('acima da linha quando não cabe abaixo', async () => {
    const s = await setup();
    restoreCoords?.();
    restoreCoords = fakeCoords(s.editor, () => ({
      top: 700,
      bottom: 720,
      left: 300,
      right: 300,
    }));
    await type(s, '/');
    const el = list(s.root) as HTMLElement;
    expect(el.style.top).toBe(`${700 - 8 - LIST.height}px`);
  });

  it('abaixo da linha mesmo quando a linha é a última e o editável é baixo (só a janela e os ancestrais limitam)', async () => {
    const s = await setup();
    editableRect = { top: 100, left: 100, right: 900, bottom: 222 };
    await type(s, '/');
    const el = list(s.root) as HTMLElement;
    expect(el.style.top).toBe('228px');
  });

  it('sem itens (consulta sem resultado): lista não mostrada', async () => {
    const s = await setup();
    await type(s, '/zzzzzz');
    expect(getSlashMenuState(s.editor).open).toBe(true);
    expect(getSlashMenuState(s.editor).items).toHaveLength(0);
    const el = list(s.root);
    expect(el === null || !isPopoverOpen(el)).toBe(true);
    for (const a of ARIA) expect(s.editor.view.dom.hasAttribute(a)).toBe(false);
  });
});

describe('ARIA do editável (K4)', () => {
  it('só com o menu aberto e a lista carregada; sem combobox nem aria-expanded', async () => {
    const s = await setup();
    const dom = s.editor.view.dom;
    await type(s, '/');
    const el = list(s.root) as HTMLElement;
    expect(dom.getAttribute('role')).toBe('textbox');
    expect(dom.hasAttribute('aria-expanded')).toBe(false);
    expect(dom.getAttribute('aria-autocomplete')).toBe('list');
    expect(dom.getAttribute('aria-controls')).toBe(el.id);
    expect(selected(s.root)).toHaveLength(1);
    const active = selected(s.root)[0] as HTMLElement;
    expect(dom.getAttribute('aria-activedescendant')).toBe(active.id);
    expect(active.getAttribute('role')).toBe('option');
    expect(active.classList.contains('rte-slash-menu__option--active')).toBe(
      true,
    );
    expect(pressKey(s.editor, 'Escape')).toBe(true);
    await settle(s.fixture);
    for (const a of ARIA) expect(dom.hasAttribute(a)).toBe(false);
  });

  it('ids estáveis: rte-<instância>-slash-<id>; ArrowDown move o ativo', async () => {
    const s = await setup();
    await type(s, '/');
    const ids = options(s.root).map((o) => o.id);
    expect(ids[0]).toMatch(/^rte-\d+-slash-opt-heading2$/);
    const prefix = (ids[0] as string).replace(/heading2$/, '');
    expect(ids.every((id) => id.startsWith(prefix))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pressKey(s.editor, 'ArrowDown')).toBe(true);
    await settle(s.fixture);
    expect(s.editor.view.dom.getAttribute('aria-activedescendant')).toBe(
      ids[1],
    );
    expect(options(s.root).map((o) => o.id)).toEqual(ids);
  });
});

describe('anúncio (K4)', () => {
  it('contagem adiada 300 ms, "nenhum" sem itens e vazio ao fechar', async () => {
    const s = await setup();
    expect(live(s.root)).toBe('');
    await type(s, '/');
    expect(live(s.root)).toBe('');
    await sleep(380);
    await settle(s.fixture);
    const n = getSlashMenuState(s.editor).items.length;
    expect(live(s.root)).toBe(`${n} options`);
    await type(s, 'zzzz');
    await sleep(380);
    await settle(s.fixture);
    expect(live(s.root)).toBe('No options');
    pressKey(s.editor, 'Escape');
    await settle(s.fixture);
    await sleep(30);
    await settle(s.fixture);
    expect(live(s.root)).toBe('');
  });
});

describe('ids sem colisão (K4)', () => {
  it('uma opção cujo id de item é "list" não colide com o id da lista', () => {
    expect(slashOptionId('rte-1', 'list')).not.toBe(slashListId('rte-1'));
  });
});

describe('opção ativa visível e ponteiro no fundo da lista', () => {
  it('ArrowDown rola a opção ativa para a área visível (block: nearest)', async () => {
    const s = await setup();
    const calls: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      calls.push(this);
    };
    try {
      await type(s, '/');
      expect(calls.at(-1)).toBe(options(s.root)[0]);
      expect(pressKey(s.editor, 'ArrowDown')).toBe(true);
      await settle(s.fixture);
      expect(calls.at(-1)).toBe(options(s.root)[1]);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('mousedown no fundo da lista não tira o foco (preventDefault) e o menu segue aberto', async () => {
    const s = await setup();
    await type(s, '/');
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    (list(s.root) as HTMLElement).dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    await settle(s.fixture);
    expect(getSlashMenuState(s.editor).open).toBe(true);
  });
});

describe('ponteiro (K5)', () => {
  it('mousedown roda o item sem tirar o foco; o ponteiro não troca o ativo', async () => {
    const s = await setup();
    s.editor.view.dom.focus();
    await type(s, '/');
    const target = options(s.root).find((o) =>
      o.id.endsWith('-slash-opt-heading2'),
    ) as HTMLElement;
    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    await settle(s.fixture);
    expect(getSlashMenuState(s.editor).activeIndex).toBe(0);
    const down = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(down);
    await settle(s.fixture);
    expect(down.defaultPrevented).toBe(true);
    expect(s.editor.isActive('heading', { level: 2 })).toBe(true);
    expect(getSlashMenuState(s.editor).open).toBe(false);
    expect(document.activeElement).toBe(s.editor.view.dom);
    expect(isPopoverOpen(list(s.root) as HTMLElement)).toBe(false);
  });
});

describe('fechamento (K5)', () => {
  const open = async () => {
    const s = await setup();
    s.editor.view.dom.focus();
    await type(s, '/');
    expect(getSlashMenuState(s.editor).open).toBe(true);
    return s;
  };

  it('foco sai do editável', async () => {
    const s = await open();
    s.editor.view.dom.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: null }),
    );
    await settle(s.fixture);
    expect(getSlashMenuState(s.editor).open).toBe(false);
    expect(isPopoverOpen(list(s.root) as HTMLElement)).toBe(false);
  });

  it('foco vai ao aviso de restauração (elemento do host fora do editável)', async () => {
    const s = await open();
    const prompt = document.createElement('button');
    s.root.appendChild(prompt);
    s.editor.view.dom.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: prompt }),
    );
    expect(getSlashMenuState(s.editor).open).toBe(false);
  });

  it('foco que fica no editável não fecha', async () => {
    const s = await open();
    s.editor.view.dom.dispatchEvent(
      new FocusEvent('focusout', {
        bubbles: true,
        relatedTarget: s.editor.view.dom,
      }),
    );
    expect(getSlashMenuState(s.editor).open).toBe(true);
  });

  it('um diálogo que abre', async () => {
    const s = await open();
    expect(s.cmp.openDialog('table')).toBe(true);
    await settle(s.fixture);
    expect(getSlashMenuState(s.editor).open).toBe(false);
    expect(isPopoverOpen(list(s.root) as HTMLElement)).toBe(false);
  });

  it('o editor deixa de ser editável', async () => {
    const s = await open();
    s.host.readonly.set(true);
    await settle(s.fixture);
    await settle(s.fixture);
    expect(getSlashMenuState(s.editor).open).toBe(false);
    expect(isPopoverOpen(list(s.root) as HTMLElement)).toBe(false);
    for (const a of ARIA) expect(s.editor.view.dom.hasAttribute(a)).toBe(false);
  });

  it('menus flutuantes ficam ocultos (bloqueados) enquanto aberto', async () => {
    const s = await setup();
    await settle(s.fixture);
    const floating = () =>
      s.fixture.debugElement.query(By.directive(RteFloatingMenus))
        .componentInstance as RteFloatingMenus;
    expect(floating().blocked()).toBe(false);
    s.editor.view.dom.focus();
    await type(s, '/');
    expect(floating().blocked()).toBe(true);
    pressKey(s.editor, 'Escape');
    await settle(s.fixture);
    expect(floating().blocked()).toBe(false);
  });
});

describe('onUiItem (K6)', () => {
  it('image abre o diálogo (microtask); o do consumidor recebe todos os ids', async () => {
    const seen: string[] = [];
    const s = await setup({
      ...OPTIONS,
      slash: { onUiItem: (id) => void seen.push(id) },
    });
    const open = vi.spyOn(s.cmp, 'openDialog');
    s.editor.view.dom.focus();
    await type(s, '/image');
    s.editor.commands.runSlashItem();
    expect(open).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(open).toHaveBeenCalledWith('image');
    expect(seen).toEqual(['image']);
    await settle(s.fixture);
    await type(s, '/video');
    s.editor.commands.runSlashItem();
    await Promise.resolve();
    expect(open).toHaveBeenCalledWith('video');
    expect(seen).toEqual(['image', 'video']);
  });

  it('exceção do consumidor é engolida com aviso e o diálogo ainda abre', async () => {
    const s = await setup({
      ...OPTIONS,
      slash: {
        onUiItem: () => {
          throw new Error('x');
        },
      },
    });
    const open = vi.spyOn(s.cmp, 'openDialog');
    s.editor.view.dom.focus();
    await type(s, '/embed');
    expect(() => s.editor.commands.runSlashItem()).not.toThrow();
    await Promise.resolve();
    expect(open).toHaveBeenCalledWith('embed');
    expect(warn.mock.calls.some((c) => String(c[0]).includes('onUiItem'))).toBe(
      true,
    );
  });

  it('item com comando não abre diálogo nem chama o do consumidor', async () => {
    const seen: string[] = [];
    const s = await setup({
      ...OPTIONS,
      slash: { onUiItem: (id) => void seen.push(id) },
    });
    const open = vi.spyOn(s.cmp, 'openDialog');
    await type(s, '/heading');
    s.editor.commands.runSlashItem();
    await Promise.resolve();
    expect(open).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });
});
