import {
  ChangeDetectionStrategy,
  Component,
  NgZone,
  signal,
  viewChild,
  viewChildren,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { getHtmlSchema } from '@cds/rte-core';
import { RTE_CODE_LANGUAGES } from '@cds/rte-core/code-languages';
import { getRteHtml } from '@cds/rte-core/extensions';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import {
  provideRichText,
  RteEditor,
  type RteEditorConfig,
  type RteLabelsSource,
  type RteToolbarConfig,
} from '@cds/rte-angular';
import { RTE_LABELS_ES, RTE_LABELS_PT_BR } from '@cds/rte-angular/i18n';
import { getRteEditor } from '@cds/rte-angular/testing';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectText } from './testing-support/editors';
import { installPopoverShim } from './testing-support/popover';
import { RTE_ICONS } from './toolbar/icons';
import { renderHost, settle } from './testing-support/render';

// Spec 05b1, Tarefa 6: a barra dentro do `rte-editor` (U2–U5, U8–U11, U13,
// R2–R7).

@Component({
  selector: 'rte-test-toolbar-host',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    (valueChange)="changes = changes + 1"
    [toolbar]="toolbar()"
    [labels]="labels()"
    [options]="options()"
    [disabled]="disabled()"
    [readonly]="readonly()"
    [hidden]="hidden()"
    (editorBlur)="blurs = blurs + 1"
    (touch)="touches = touches + 1"
    (editorReady)="ready.push($event)"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('<p>ab</p>');
  readonly toolbar = signal<RteToolbarConfig | undefined>(undefined);
  readonly labels = signal<RteLabelsSource | undefined>(undefined);
  readonly options = signal<RteEditorConfig | undefined>(undefined);
  readonly disabled = signal(false);
  readonly readonly = signal(false);
  readonly hidden = signal(false);
  readonly ready: Editor[] = [];
  changes = 0;
  blurs = 0;
  touches = 0;
  readonly cmp = viewChild.required(RteEditor);
}

@Component({
  selector: 'rte-test-two-hosts',
  imports: [RteEditor],
  template: `<rte-editor class="a" /><rte-editor class="b" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TwoHosts {
  readonly cmps = viewChildren(RteEditor);
}

let restoreShim: () => void;
beforeEach(() => {
  restoreShim = installPopoverShim();
});
afterEach(() => {
  TestBed.resetTestingModule();
  restoreShim();
  vi.restoreAllMocks();
});

const ARTICLE_LABELS = [
  'Undo',
  'Redo',
  'Paragraph, Text style',
  'Bold',
  'Italic',
  'Underline',
  'Strikethrough',
  'Text color',
  'Highlight',
  'Bulleted list',
  'Numbered list',
  'Task list',
  'Alignment',
  'Quote',
  'Code block',
  'Horizontal line',
  'Table',
  'Clear formatting',
];

async function setup(
  init: (host: Host) => void = () => undefined,
  providers: (Provider | EnvironmentProviders)[] = [],
): Promise<{ fixture: ComponentFixture<Host>; host: Host; el: HTMLElement }> {
  TestBed.configureTestingModule({ providers });
  const fixture = TestBed.createComponent(Host);
  init(fixture.componentInstance);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  return {
    fixture,
    host: fixture.componentInstance,
    el: fixture.nativeElement as HTMLElement,
  };
}

function editorOf(el: HTMLElement): Editor {
  const host = el.matches('rte-editor') ? el : el.querySelector('rte-editor');
  const editor = getRteEditor(host as Element);
  if (!editor) throw new Error('editor ausente');
  return editor;
}

/**
 * Simula o Chromium, que dispara `blur`/`focusout` (sem `relatedTarget`) ao
 * remover do DOM o elemento focado; o jsdom, como Firefox e WebKit, não
 * dispara. Devolve a função que desfaz o remendo.
 */
function blurOnRemove(): () => void {
  const remove = Element.prototype.remove;
  const removeChild = Node.prototype.removeChild;
  const fire = (node: Node) => {
    const active = document.activeElement;
    if (active && active !== document.body && node.contains(active)) {
      active.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: null }),
      );
    }
  };
  Element.prototype.remove = function (this: Element) {
    fire(this);
    remove.call(this);
  };
  Node.prototype.removeChild = function <T extends Node>(
    this: Node,
    child: T,
  ): T {
    fire(child);
    return removeChild.call(this, child) as T;
  };
  return () => {
    Element.prototype.remove = remove;
    Node.prototype.removeChild = removeChild;
  };
}

/** Texto visível do botão `blockType` (sem os medidores de largura). */
function blockText(block: HTMLElement): string | undefined {
  return block.querySelector('.rte-toolbar__text')?.textContent?.trim();
}

function toolbarOf(el: HTMLElement): HTMLElement | null {
  return el.querySelector<HTMLElement>('.rte-toolbar');
}

function buttons(el: ParentNode): HTMLButtonElement[] {
  return [...el.querySelectorAll<HTMLButtonElement>('.rte-toolbar__button')];
}

function button(el: ParentNode, label: string): HTMLButtonElement {
  // o `blockType` tem o bloco atual antes do rótulo ("Paragraph, Text style")
  const found = buttons(el).find((b) => {
    const name = b.getAttribute('aria-label');
    return name === label || !!name?.endsWith(`, ${label}`);
  });
  if (!found) throw new Error(`botão ${label} ausente`);
  return found;
}

/** Elementos alcançáveis por `Tab` dentro da barra. */
function tabStops(toolbar: HTMLElement): HTMLElement[] {
  return [
    ...toolbar.querySelectorAll<HTMLElement>('button, [tabindex]'),
  ].filter(
    (b) =>
      !(b as HTMLButtonElement).disabled && b.getAttribute('tabindex') !== '-1',
  );
}

function key(
  target: Element,
  k: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: k,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

/** O `focus()` do Tiptap foca o editável no quadro seguinte. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function openMenu(trigger: HTMLElement): HTMLElement {
  trigger.click();
  const id = trigger.getAttribute('aria-controls');
  const menu = id ? trigger.ownerDocument.getElementById(id) : null;
  if (!menu) throw new Error('menu ausente');
  return menu;
}

describe('estrutura (U2, U8, U9)', () => {
  it('primeiro filho da moldura, role toolbar, horizontal, nome Formatting', async () => {
    const { el } = await setup();
    const toolbar = el.querySelector(
      '.rte-editor__frame > .rte-toolbar:first-child',
    );
    expect(toolbar).not.toBeNull();
    expect(toolbar?.getAttribute('role')).toBe('toolbar');
    expect(toolbar?.getAttribute('aria-orientation')).toBe('horizontal');
    expect(toolbar?.getAttribute('aria-label')).toBe('Formatting');
  });

  it("preset 'article' por padrão, na ordem da U9", async () => {
    const { el } = await setup();
    expect(buttons(el).map((b) => b.getAttribute('aria-label'))).toEqual(
      ARTICLE_LABELS,
    );
  });

  it('separadores entre os grupos (vertical, sem foco)', async () => {
    const { el } = await setup();
    const toolbar = toolbarOf(el) as HTMLElement;
    const separators = toolbar.querySelectorAll(
      '.rte-toolbar__separator[role=separator][aria-orientation=vertical]',
    );
    expect(separators).toHaveLength(8);
    for (const sep of separators) {
      expect(sep.hasAttribute('tabindex')).toBe(false);
      expect(sep.previousElementSibling).not.toBeNull();
      expect(sep.nextElementSibling).not.toBeNull();
    }
  });

  it('full com options.codeLanguages mostra codeLanguage', async () => {
    const { el } = await setup((h) => {
      h.toolbar.set('full');
      h.options.set({ codeLanguages: RTE_CODE_LANGUAGES });
    });
    expect(() => button(el, 'Code language')).not.toThrow();
  });

  it('full sem codeLanguages não mostra codeLanguage', async () => {
    const { el } = await setup((h) => h.toolbar.set('full'));
    expect(() => button(el, 'Code language')).toThrow();
    expect(() => button(el, 'Superscript')).not.toThrow();
  });

  it('recurso desligado em options remove o item', async () => {
    const { el } = await setup((h) =>
      h.options.set({ features: { tables: false, colors: false } }),
    );
    const labels = buttons(el).map((b) => b.getAttribute('aria-label'));
    expect(labels).not.toContain('Table');
    expect(labels).not.toContain('Text color');
  });

  it('toolbar=false → sem .rte-toolbar', async () => {
    const { el } = await setup((h) => h.toolbar.set(false));
    expect(toolbarOf(el)).toBeNull();
  });

  it("provideRichText({ toolbar: 'minimal' }) respeitado e vencido pela entrada", async () => {
    const { el, fixture, host } = await setup(undefined, [
      provideRichText({ toolbar: 'minimal' }),
    ]);
    expect(buttons(el).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Undo',
      'Redo',
      'Bold',
      'Italic',
      'Bulleted list',
      'Numbered list',
    ]);
    host.toolbar.set('article');
    await settle(fixture);
    expect(buttons(el).map((b) => b.getAttribute('aria-label'))).toEqual(
      ARTICLE_LABELS,
    );
  });
});

describe('teclado (U2, U3)', () => {
  it('uma parada de Tab na barra', async () => {
    const { el } = await setup();
    expect(tabStops(toolbarOf(el) as HTMLElement)).toHaveLength(1);
  });

  it('Alt+F10 no editável foca o item ativo', async () => {
    const { el, fixture } = await setup();
    const editor = editorOf(el);
    editor.commands.focus();
    const event = key(editor.view.dom, 'F10', { altKey: true });
    await settle(fixture);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button(el, 'Undo'));
    expect(document.activeElement?.getAttribute('tabindex')).toBe('0');
  });

  it('focusToolbar() foca o item ativo', async () => {
    const { el, host } = await setup();
    host.cmp().focusToolbar();
    expect(document.activeElement).toBe(button(el, 'Undo'));
  });

  it('focusToolbar() sem barra não faz nada', async () => {
    const { host } = await setup((h) => h.toolbar.set(false));
    const before = document.activeElement;
    host.cmp().focusToolbar();
    expect(document.activeElement).toBe(before);
  });

  it('Escape num item devolve o foco ao editável com a mesma seleção', async () => {
    const { el, fixture } = await setup((h) => h.value.set('<p>abcd</p>'));
    const editor = editorOf(el);
    selectText(editor, 'abcd', 1, 3);
    const before = editor.state.selection;
    const bold = button(el, 'Bold');
    bold.focus();
    const event = key(bold, 'Escape');
    await nextFrame();
    await settle(fixture);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(editor.view.dom);
    expect(editor.state.selection.eq(before)).toBe(true);
  });
});

describe('comandos (U4)', () => {
  // Navegador real (N11): o clique pode chegar antes do render que segue a
  // transação (ou a abertura do menu); o habilitado vale o estado atual, não
  // o da última renderização.
  it('clique logo depois de uma transação, antes do render, usa o estado atual', async () => {
    const { el, fixture } = await setup();
    const editor = editorOf(el);
    selectText(editor, 'ab', 2);
    await settle(fixture);
    editor.commands.insertContent('c');
    expect(button(el, 'Undo').getAttribute('aria-disabled')).toBe('true');
    button(el, 'Undo').click();
    await settle(fixture);
    expect(getRteHtml(editor)).toBe('<p>ab</p>');
  });

  it('item de menu ativado logo depois de abrir, antes do render, usa o estado atual', async () => {
    const { el, fixture } = await setup();
    const editor = editorOf(el);
    selectText(editor, 'ab', 2);
    await settle(fixture);
    const menu = openMenu(button(el, 'Table'));
    const insert = menu.querySelector<HTMLElement>('.rte-menu__item');
    expect(insert?.getAttribute('aria-disabled')).toBe('true');
    insert?.click();
    await settle(fixture);
    expect(getRteHtml(editor)).toContain('<table>');
  });

  it('clique em bold com texto selecionado: mousedown cancelado, marca aplicada, foco no editável', async () => {
    const { el, fixture } = await setup();
    const editor = editorOf(el);
    selectText(editor, 'ab');
    const bold = button(el, 'Bold');
    const down = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    bold.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    bold.click();
    await nextFrame();
    await settle(fixture);
    expect(getRteHtml(editor)).toBe('<p><strong>ab</strong></p>');
    expect(document.activeElement).toBe(editor.view.dom);
    expect(bold.getAttribute('aria-pressed')).toBe('true');
    expect(bold.classList.contains('rte-toolbar__button--pressed')).toBe(true);
  });

  it('item inaplicável: aria-disabled, focável e sem efeito', async () => {
    const { el, fixture } = await setup();
    const editor = editorOf(el);
    const undo = button(el, 'Undo');
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    expect(undo.disabled).toBe(false);
    const html = getRteHtml(editor);
    undo.click();
    await settle(fixture);
    expect(getRteHtml(editor)).toBe(html);
  });

  it('menu textColor: paleta do esquema + Cor padrão, com amostra e nome', async () => {
    const { el, fixture } = await setup();
    const menu = openMenu(button(el, 'Text color'));
    await settle(fixture);
    const items = [...menu.querySelectorAll<HTMLElement>('.rte-menu__item')];
    const palette = getHtmlSchema().palette.text;
    expect(items.map((i) => i.textContent?.trim())).toEqual([
      ...palette.map((c) => c.name[0]?.toUpperCase() + c.name.slice(1)),
      'Default color',
    ]);
    palette.forEach((color, i) => {
      const swatch = items[i]?.querySelector('.rte-swatch[data-rte-color]');
      expect(swatch?.getAttribute('data-rte-color')).toBe(color.name);
      expect(items[i]?.getAttribute('role')).toBe('menuitemradio');
      expect(items[i]?.getAttribute('aria-checked')).toBe('false');
    });
  });

  it('item do menu de cor aplica a marca, fecha o menu e foca o editável', async () => {
    const { el, fixture } = await setup();
    const editor = editorOf(el);
    selectText(editor, 'ab');
    const trigger = button(el, 'Text color');
    const menu = openMenu(trigger);
    await settle(fixture);
    const red = [...menu.querySelectorAll<HTMLElement>('.rte-menu__item')].find(
      (i) => i.querySelector('[data-rte-color="red"]'),
    ) as HTMLElement;
    red.click();
    await nextFrame();
    await settle(fixture);
    expect(getRteHtml(editor)).toContain('data-rt-color="red"');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(editor.view.dom);
    // reaberto: o item da cor atual fica marcado
    openMenu(trigger);
    await settle(fixture);
    const checked = menu.querySelector('[aria-checked="true"]');
    expect(checked?.querySelector('[data-rte-color="red"]')).not.toBeNull();
    expect(checked?.classList.contains('rte-menu__item--checked')).toBe(true);
  });

  it.each([
    ['sem cor', '<p>ab</p>', 'Default color'],
    ['mista', '<p><span data-rt-color="red">a</span>b</p>', null],
    ['uniforme', '<p><span data-rt-color="red">ab</span></p>', 'Red'],
  ])(
    'menu textColor, seleção %s: só o item da cor comum fica marcado (K5)',
    async (_case, doc, expected) => {
      const { el, fixture } = await setup((h) => h.value.set(doc));
      selectText(editorOf(el), 'ab');
      await settle(fixture);
      const trigger = button(el, 'Text color');
      const menu = openMenu(trigger);
      await settle(fixture);
      const checked = [...menu.querySelectorAll('[aria-checked="true"]')];
      expect(checked.map((i) => i.textContent?.trim())).toEqual(
        expected ? [expected] : [],
      );
    },
  );

  it('alinhamento sem atributo: ícone do início da linha (alignRight em rtl)', async () => {
    const { el, fixture } = await setup();
    const paths = () =>
      [...button(el, 'Alignment').querySelectorAll('.rte-icon path')]
        .slice(0, RTE_ICONS.alignLeft.length)
        .map((p) => p.getAttribute('d'));
    expect(paths()).toEqual([...RTE_ICONS.alignLeft]);
    el.setAttribute('dir', 'rtl');
    button(el, 'Bold').focus();
    await settle(fixture);
    expect(paths()).toEqual([...RTE_ICONS.alignRight]);
  });

  it('blockType mostra "Heading 2" num <h2>', async () => {
    const { el } = await setup((h) => h.value.set('<h2>ab</h2>'));
    const block = button(el, 'Text style');
    expect(blockText(block)).toBe('Heading 2');
  });

  // WCAG 2.5.3 (revisão final I2): o nome contém o texto visível e anuncia o
  // bloco atual; sem bloco único, o texto visível já é o rótulo.
  it('blockType: nome acessível = texto visível + rótulo, nos três idiomas', async () => {
    const { el, fixture, host } = await setup((h) =>
      h.value.set('<h2>ab</h2><p>cd</p>'),
    );
    const editor = editorOf(el);
    const name = () =>
      toolbarOf(el)
        ?.querySelector('.rte-toolbar__text')
        ?.closest('button')
        ?.getAttribute('aria-label');
    editor.commands.setTextSelection(2);
    await settle(fixture);
    expect(name()).toBe('Heading 2, Text style');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    await settle(fixture);
    expect(name()).toBe('Paragraph, Text style');
    editor.commands.selectAll();
    await settle(fixture);
    expect(name()).toBe('Text style');
    host.labels.set({ toolbar: RTE_LABELS_PT_BR.toolbar });
    editor.commands.setTextSelection(2);
    await settle(fixture);
    expect(name()).toBe('Título 2, Estilo do texto');
    host.labels.set({ toolbar: RTE_LABELS_ES.toolbar });
    await settle(fixture);
    expect(name()).toBe('Título 2, Estilo de texto');
    // os demais gatilhos de menu mantêm o rótulo (R6)
    expect(button(el, 'Color del texto').getAttribute('aria-label')).toBe(
      'Color del texto',
    );
  });

  // Navegador real (N14, R7): em pt-BR o rótulo da casca ("Estilo do texto")
  // é mais largo que "Parágrafo" e, em certas larguras, a barra quebrava
  // linha diferente na troca casca → editor (e ao mover o cursor).
  it('blockType reserva a largura do texto mais longo (sem salto de leiaute)', async () => {
    const { el } = await setup((h) =>
      h.labels.set({ toolbar: RTE_LABELS_PT_BR.toolbar }),
    );
    const block = button(el, 'Estilo do texto');
    const sizers = [
      ...block.querySelectorAll<HTMLElement>('.rte-toolbar__sizer'),
    ];
    expect(sizers.map((s) => s.textContent?.trim())).toEqual([
      'Estilo do texto',
      'Parágrafo',
      'Título 2',
      'Título 3',
      'Título 4',
    ]);
    for (const sizer of sizers) {
      expect(sizer.getAttribute('aria-hidden')).toBe('true');
    }
    expect(blockText(block)).toBe('Parágrafo');
  });

  it('Tab num menu fecha e leva o foco ao editável', async () => {
    const { el, fixture } = await setup();
    const editor = editorOf(el);
    const trigger = button(el, 'Text style');
    trigger.focus();
    key(trigger, 'ArrowDown');
    await settle(fixture);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    key(document.activeElement as Element, 'Tab');
    await nextFrame();
    await settle(fixture);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(editor.view.dom);
  });

  it('menu de tabela: ensaios só com o menu aberto', async () => {
    const { el, fixture } = await setup();
    const menu = openMenu(button(el, 'Table'));
    await settle(fixture);
    const items = [...menu.querySelectorAll<HTMLElement>('.rte-menu__item')];
    expect(items[0]?.getAttribute('role')).toBe('menuitem');
    expect(items[0]?.textContent?.trim()).toBe('Insert table');
    expect(items[0]?.hasAttribute('aria-disabled')).toBe(false);
    // fora de tabela, as operações ficam inaplicáveis
    expect(items[1]?.getAttribute('aria-disabled')).toBe('true');
    items[0]?.click();
    await settle(fixture);
    expect(getRteHtml(editorOf(el))).toContain('<table');
  });
});

describe('rótulos ao vivo (U11)', () => {
  it('pt-BR troca aria-label, title e texto do blockType sem transação', async () => {
    const { el, fixture, host } = await setup();
    const editor = editorOf(el);
    const spy = vi.fn();
    editor.on('transaction', spy);
    expect(button(el, 'Bold').getAttribute('title')).toBe('Bold (Ctrl+B)');
    host.labels.set({ toolbar: RTE_LABELS_PT_BR.toolbar });
    await settle(fixture);
    expect(toolbarOf(el)?.getAttribute('aria-label')).toBe('Formatação');
    expect(button(el, 'Negrito').getAttribute('title')).toBe(
      'Negrito (Ctrl+B)',
    );
    expect(blockText(button(el, 'Estilo do texto'))).toBe('Parágrafo');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('estados do editor (U10, R7)', () => {
  function assertAllDisabled(el: HTMLElement): void {
    const all = buttons(el);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((b) => b.disabled)).toBe(true);
    expect(toolbarOf(el)?.querySelector('[tabindex="0"]')).toBeNull();
  }

  it('antes da criação: todos disabled, nenhum tabindex 0', () => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(Host);
    fixture.componentRef.changeDetectorRef.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.cmp().editor()).toBeNull();
    assertAllDisabled(el);
  });

  it.each(['disabled', 'readonly'] as const)(
    '%s: todos disabled; voltar a editável reabilita na mesma estabilização',
    async (state) => {
      const { el, fixture, host } = await setup();
      host[state].set(true);
      await settle(fixture);
      assertAllDisabled(el);
      host[state].set(false);
      await settle(fixture);
      expect(button(el, 'Bold').disabled).toBe(false);
      expect(toolbarOf(el)?.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    },
  );

  it('readonly com menu aberto fecha o menu', async () => {
    const { el, fixture, host } = await setup();
    const trigger = button(el, 'Text color');
    openMenu(trigger);
    await settle(fixture);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    host.readonly.set(true);
    await settle(fixture);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('hidden esconde a barra', async () => {
    const { el, fixture, host } = await setup();
    host.hidden.set(true);
    await settle(fixture);
    expect(toolbarOf(el)?.closest('[hidden]')).not.toBeNull();
  });
});

describe('atributos (U11, U12)', () => {
  it('todo svg.rte-icon tem aria-hidden e focusable=false', async () => {
    const { el } = await setup((h) => h.toolbar.set('full'));
    const icons = [...el.querySelectorAll('svg.rte-icon')];
    expect(icons.length).toBeGreaterThan(20);
    for (const svg of icons) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).toBe('false');
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
      const paths = [...svg.querySelectorAll('path')];
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) {
        expect(path.namespaceURI).toBe('http://www.w3.org/2000/svg');
        expect(path.getAttribute('d')).toMatch(/^[Mm]/);
      }
    }
  });

  it('aria-keyshortcuts de bold = Control+B; aria-pressed só nas alternâncias', async () => {
    const { el } = await setup();
    expect(button(el, 'Bold').getAttribute('aria-keyshortcuts')).toBe(
      'Control+B',
    );
    expect(button(el, 'Bold').getAttribute('aria-pressed')).toBe('false');
    expect(button(el, 'Undo').hasAttribute('aria-pressed')).toBe(false);
    expect(button(el, 'Text color').hasAttribute('aria-pressed')).toBe(false);
    expect(
      button(el, 'Text color').classList.contains('rte-toolbar__button--menu'),
    ).toBe(true);
    for (const b of buttons(el)) expect(b.getAttribute('type')).toBe('button');
  });
});

describe('troca ao vivo (R2)', () => {
  it("setInput('toolbar', 'minimal'): itens trocados, mesmo Editor, sem valueChange", async () => {
    const { el, fixture, host } = await setup();
    const editor = editorOf(el);
    host.toolbar.set('minimal');
    await settle(fixture);
    expect(buttons(el)).toHaveLength(6);
    expect(editorOf(el)).toBe(editor);
    expect(host.ready).toHaveLength(1);
    expect(host.changes).toBe(0);
  });
});

describe('Review Focus', () => {
  it('1: destruir com o menu de tabela aberto não lança, tira os ouvintes e não foca', async () => {
    const { el, fixture } = await setup();
    const trigger = button(el, 'Table');
    const menu = openMenu(trigger);
    await settle(fixture);
    (menu.querySelector('.rte-menu__item') as HTMLElement).focus();
    const remove = vi.spyOn(window, 'removeEventListener');
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    expect(() => fixture.destroy()).not.toThrow();
    const removed = remove.mock.calls.map(([type]) => type);
    expect(removed).toContain('scroll');
    expect(removed).toContain('resize');
    expect(focus).not.toHaveBeenCalled();
  });

  it('2: foco em table e troca para minimal → foco no item ativo da barra nova, sem blur', async () => {
    const { el, fixture, host } = await setup();
    button(el, 'Table').focus();
    host.toolbar.set('minimal');
    await settle(fixture);
    const active = toolbarOf(el)?.querySelector('[tabindex="0"]');
    expect(active).not.toBeNull();
    expect(document.activeElement).toBe(active);
    expect(host.blurs).toBe(0);
    expect(host.touches).toBe(0);
  });

  it('2b: focusout na remoção do item focado (Chromium) não emite editorBlur nem touch', async () => {
    const { el, fixture, host } = await setup();
    button(el, 'Clear formatting').focus();
    await settle(fixture);
    const restore = blurOnRemove();
    try {
      // Como a ponte do app de teste: a mudança e a detecção dentro de
      // `NgZone.run`, fora de uma tarefa da zona. No modo zone.js, o ouvinte
      // do `focusout` disparado durante a detecção esvazia as microtarefas
      // ao terminar, com o item ainda no DOM.
      TestBed.inject(NgZone).run(() => {
        host.toolbar.set('minimal');
        fixture.detectChanges();
      });
      await settle(fixture);
    } finally {
      restore();
    }
    const active = toolbarOf(el)?.querySelector('[tabindex="0"]');
    expect(document.activeElement).toBe(active);
    expect(host.blurs).toBe(0);
    expect(host.touches).toBe(0);
  });

  it('2c: focusout sem destino com o elemento ainda no DOM continua saindo do host', async () => {
    const { el, fixture, host } = await setup();
    const bold = button(el, 'Bold');
    bold.focus();
    await settle(fixture);
    bold.blur();
    await settle(fixture);
    expect(host.blurs).toBe(1);
    expect(host.touches).toBe(1);
  });

  it('4: duas instâncias — aria-controls distintos, Alt+F10 local, um menu aberto', async () => {
    const fixture = await renderHost(TwoHosts);
    const root = fixture.nativeElement as HTMLElement;
    const a = root.querySelector('rte-editor.a') as HTMLElement;
    const b = root.querySelector('rte-editor.b') as HTMLElement;
    const ca = button(a, 'Text color').getAttribute('aria-controls');
    const cb = button(b, 'Text color').getAttribute('aria-controls');
    expect(ca).toBeTruthy();
    expect(ca).not.toBe(cb);

    const editorA = editorOf(a);
    editorA.commands.focus();
    key(editorA.view.dom, 'F10', { altKey: true });
    await settle(fixture);
    expect(a.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(button(a, 'Undo'));

    const ta = button(a, 'Text color');
    const tb = button(b, 'Text color');
    openMenu(ta);
    await settle(fixture);
    openMenu(tb);
    await settle(fixture);
    expect(ta.getAttribute('aria-expanded')).toBe('false');
    expect(tb.getAttribute('aria-expanded')).toBe('true');
  });
});
