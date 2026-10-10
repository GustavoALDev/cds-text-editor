import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor, type RteEditorConfig } from '@comodeviaser/rte-angular';
import { getRteHtml, getSearchState } from '@comodeviaser/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeCoords } from './testing-support/geometry';
import { settle } from './testing-support/render';

// Spec 05d1, Tarefa 3 (R4): barra de busca e substituição (K7-K10) com o
// *chunk* já carregado (a carga manual está em `search-defer.spec.ts`).

const DOC = '<p>alpha beta alpha</p><p>Alpha gamma</p>';

@Component({
  selector: 'rte-test-search',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    [disabled]="disabled()"
    [readonly]="readonly()"
    [options]="options()"
    toolbar="full"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal(DOC);
  readonly disabled = signal(false);
  readonly readonly = signal(false);
  readonly options = signal<RteEditorConfig | undefined>(undefined);
  readonly cmp = viewChild.required(RteEditor);
}

interface Setup {
  fixture: ComponentFixture<Host>;
  host: Host;
  root: HTMLElement;
  cmp: RteEditor;
  editor: Editor;
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

let restoreCoords: (() => void) | undefined;

afterEach(() => {
  restoreCoords?.();
  restoreCoords = undefined;
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

async function setup(init?: (host: Host) => void): Promise<Setup> {
  const fixture = TestBed.createComponent(Host);
  init?.(fixture.componentInstance);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const cmp = fixture.componentInstance.cmp();
  // O jsdom não tem geometria: o ProseMirror rola até a seleção com `coordsAtPos`.
  restoreCoords = fakeCoords(cmp.editor() as Editor, () => ({
    top: 0,
    bottom: 20,
    left: 0,
    right: 0,
  }));
  return {
    fixture,
    host: fixture.componentInstance,
    root: (fixture.nativeElement as HTMLElement).querySelector(
      'rte-editor',
    ) as HTMLElement,
    cmp,
    editor: cmp.editor() as Editor,
  };
}

async function flush(s: Setup): Promise<void> {
  await settle(s.fixture);
  await settle(s.fixture);
}

const bar = (s: Setup) => s.root.querySelector<HTMLElement>('.rte-search');
const query = (s: Setup) =>
  s.root.querySelector<HTMLInputElement>('.rte-search__input');
const count = (s: Setup) =>
  s.root.querySelector('.rte-search__count')?.textContent?.trim() ?? '';
const live = (s: Setup) =>
  s.root.querySelector('.rte-search .rte-live')?.textContent?.trim() ?? '';
const searchItem = (s: Setup) =>
  s.root.querySelector<HTMLButtonElement>(
    '.rte-toolbar [aria-label="Find and replace"]',
  ) as HTMLButtonElement;
const button = (s: Setup, label: string) =>
  s.root.querySelector<HTMLButtonElement>(
    `.rte-search button[aria-label="${label}"]`,
  ) as HTMLButtonElement;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function key(
  target: Element,
  k: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    key: k,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(e);
  return e;
}

async function typeQuery(s: Setup, text: string): Promise<void> {
  const el = query(s) as HTMLInputElement;
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await flush(s);
}

async function openWith(s: Setup, text: string): Promise<void> {
  expect(s.cmp.openSearch()).toBe(true);
  await flush(s);
  await typeQuery(s, text);
}

describe('abertura (K7)', () => {
  it('Mod-F no editável abre a barra (role=search, nome, foco no campo)', async () => {
    const s = await setup();
    expect(bar(s)).toBeNull();
    expect(s.cmp.searchOpen()).toBe(false);
    s.editor.view.dom.focus();
    const e = key(s.editor.view.dom, 'f', { ctrlKey: true });
    expect(e.defaultPrevented).toBe(true);
    await flush(s);
    expect(s.cmp.searchOpen()).toBe(true);
    const el = bar(s) as HTMLElement;
    expect(el.getAttribute('role')).toBe('search');
    expect(el.getAttribute('aria-label')).toBe('Find and replace');
    expect(document.activeElement).toBe(query(s));
    // Entre a barra de ferramentas e o editável, dentro da moldura.
    const frame = s.root.querySelector('.rte-editor__frame') as HTMLElement;
    const children = [...frame.children];
    expect(children.indexOf(el.closest('rte-search') as Element)).toBeGreaterThan(
      children.indexOf(frame.querySelector('rte-toolbar') as Element),
    );
    expect(children.indexOf(el.closest('rte-search') as Element)).toBeLessThan(
      children.indexOf(frame.querySelector('.rte-editor__mount') as Element),
    );
  });

  it('Mod-F fora do editável (na barra de ferramentas) abre; sem Mod, não', async () => {
    const s = await setup();
    const btn = s.root.querySelector('.rte-toolbar button') as HTMLElement;
    expect(key(btn, 'f').defaultPrevented).toBe(false);
    expect(bar(s)).toBeNull();
    expect(key(btn, 'f', { ctrlKey: true }).defaultPrevented).toBe(true);
    await flush(s);
    expect(bar(s)).not.toBeNull();
  });

  it('o item search da barra abre a barra', async () => {
    const s = await setup();
    searchItem(s).click();
    await flush(s);
    expect(bar(s)).not.toBeNull();
    expect(searchItem(s).getAttribute('aria-keyshortcuts')).toBe('Control+F');
    expect(searchItem(s).getAttribute('title')).toBe('Find and replace (Ctrl+F)');
  });

  it('a seleção de 1 a 200 caracteres num bloco vira a consulta inicial', async () => {
    const s = await setup();
    s.editor.commands.setTextSelection({ from: 7, to: 11 });
    expect(s.cmp.openSearch()).toBe(true);
    await flush(s);
    expect(getSearchState(s.editor)?.query).toBe('beta');
    expect(query(s)?.value).toBe('beta');
    expect(count(s)).toBe('1 of 1');
  });

  it('seleção com mais de 200 caracteres ou entre blocos não vira consulta', async () => {
    const s = await setup((h) =>
      h.value.set(`<p>${'x'.repeat(250)}</p><p>b</p>`),
    );
    s.editor.commands.setTextSelection({ from: 1, to: 251 });
    s.cmp.openSearch();
    await flush(s);
    expect(getSearchState(s.editor)?.query).toBe('');
    s.cmp.closeSearch();
    s.editor.commands.setTextSelection({ from: 5, to: 255 });
    s.cmp.openSearch();
    await flush(s);
    expect(getSearchState(s.editor)?.query).toBe('');
  });

  it('openSearch(query) usa a consulta dada; aberta, Mod-F foca e seleciona o campo', async () => {
    const s = await setup();
    expect(s.cmp.openSearch('gamma')).toBe(true);
    await flush(s);
    expect(query(s)?.value).toBe('gamma');
    s.editor.view.dom.focus();
    expect(document.activeElement).not.toBe(query(s));
    key(s.editor.view.dom, 'f', { ctrlKey: true });
    await flush(s);
    const el = query(s) as HTMLInputElement;
    expect(document.activeElement).toBe(el);
    expect(el.selectionStart).toBe(0);
    expect(el.selectionEnd).toBe(5);
    expect(getSearchState(s.editor)?.query).toBe('gamma');
  });

  it('features.search: false: openSearch e Mod-F devolvem false (a tecla é do navegador)', async () => {
    const s = await setup((h) => h.options.set({ features: { search: false } }));
    expect(s.cmp.openSearch()).toBe(false);
    const e = key(s.editor.view.dom, 'f', { ctrlKey: true });
    expect(e.defaultPrevented).toBe(false);
    await flush(s);
    expect(bar(s)).toBeNull();
    expect(s.root.querySelector('[aria-label="Find and replace"]')).toBeNull();
  });
});

describe('readonly e disabled (K7)', () => {
  it('readonly: o item search fica habilitado e a busca funciona; o resto da barra não', async () => {
    const s = await setup((h) => h.readonly.set(true));
    await flush(s);
    expect(searchItem(s).disabled).toBe(false);
    expect(s.root.querySelector<HTMLButtonElement>('[aria-label="Bold"]')?.disabled).toBe(true);
    searchItem(s).click();
    await flush(s);
    expect(bar(s)).not.toBeNull();
    await typeQuery(s, 'alpha');
    expect(count(s)).toBe('1 of 3');
    expect(button(s, 'Next match').getAttribute('aria-disabled')).toBeNull();
    button(s, 'Next match').click();
    await flush(s);
    expect(getSearchState(s.editor)?.activeIndex).toBe(1);
  });

  it('readonly: Ctrl+F no editável abre a barra com a seleção como consulta e F3 anda', async () => {
    const s = await setup((h) => h.readonly.set(true));
    await flush(s);
    expect(s.editor.isEditable).toBe(false);
    s.editor.commands.setTextSelection({ from: 1, to: 6 });
    const e = key(s.editor.view.dom, 'f', { ctrlKey: true });
    expect(e.defaultPrevented).toBe(true);
    await flush(s);
    expect(s.cmp.searchOpen()).toBe(true);
    expect(getSearchState(s.editor)?.query).toBe('alpha');
    expect(count(s)).toBe('1 of 3');
    s.editor.view.dom.focus();
    expect(key(s.editor.view.dom, 'F3').defaultPrevented).toBe(true);
    await flush(s);
    expect(count(s)).toBe('2 of 3');
    key(s.editor.view.dom, 'F3', { shiftKey: true });
    await flush(s);
    expect(count(s)).toBe('1 of 3');
  });

  it('Mod-F também por event.code (layout em que a tecla F não produz "f")', async () => {
    const s = await setup();
    const e = key(searchItem(s), 'ƒ', {
      ctrlKey: true,
      code: 'KeyF',
    });
    expect(e.defaultPrevented).toBe(true);
    await flush(s);
    expect(s.cmp.searchOpen()).toBe(true);
  });

  it('os glifos dos botões são aria-hidden: o nome acessível é o rótulo (2.5.3)', async () => {
    const s = await setup();
    await openWith(s, 'alpha');
    for (const label of ['Previous match', 'Next match', 'Match case', 'Whole word', 'Close search']) {
      const b = button(s, label);
      const glyph = b.querySelector('[aria-hidden="true"]');
      expect(glyph?.textContent?.trim()).not.toBe('');
      expect(b.textContent?.replace(glyph?.textContent ?? '', '').trim()).toBe('');
    }
  });

  it('readonly: Substituir e Substituir tudo ficam ocultos e a substituição é recusada', async () => {
    const s = await setup((h) => h.readonly.set(true));
    await openWith(s, 'alpha');
    expect(s.root.textContent).not.toContain('Replace all');
    expect(
      s.root.querySelector('.rte-search [aria-expanded]'),
    ).toBeNull();
    expect(s.editor.commands.replaceAllSearchMatches('x')).toBe(false);
    expect(getRteHtml(s.editor)).toContain('alpha');
  });

  it('disabled: o item search fica desabilitado e a barra aberta fecha', async () => {
    const s = await setup();
    await openWith(s, 'alpha');
    expect(bar(s)).not.toBeNull();
    s.host.disabled.set(true);
    await flush(s);
    expect(bar(s)).toBeNull();
    expect(s.cmp.searchOpen()).toBe(false);
    expect(getSearchState(s.editor)?.query).toBe('');
    expect(searchItem(s).disabled).toBe(true);
    expect(s.cmp.openSearch()).toBe(false);
  });
});

describe('consulta e navegação (K8, K9)', () => {
  it('cada input chama setSearchQuery sozinho; o contador mostra a posição', async () => {
    const s = await setup();
    await openWith(s, 'a');
    expect(getSearchState(s.editor)?.query).toBe('a');
    await typeQuery(s, 'alpha');
    expect(getSearchState(s.editor)?.query).toBe('alpha');
    expect(getSearchState(s.editor)?.total).toBe(3);
    expect(count(s)).toBe('1 of 3');
    await typeQuery(s, 'zzz');
    expect(count(s)).toBe('No results');
    expect(button(s, 'Next match').getAttribute('aria-disabled')).toBe('true');
  });

  it('Enter, Shift+Enter e F3/Shift+F3 andam; o resultado ativo é circular', async () => {
    const s = await setup();
    await openWith(s, 'alpha');
    const el = query(s) as HTMLInputElement;
    key(el, 'Enter');
    await flush(s);
    expect(count(s)).toBe('2 of 3');
    key(el, 'Enter', { shiftKey: true });
    await flush(s);
    expect(count(s)).toBe('1 of 3');
    key(el, 'F3');
    key(el, 'F3');
    key(el, 'F3');
    await flush(s);
    expect(count(s)).toBe('1 of 3');
    key(el, 'F3', { shiftKey: true });
    await flush(s);
    expect(count(s)).toBe('3 of 3');
    // F3 em qualquer parte da barra.
    key(button(s, 'Close search'), 'F3');
    await flush(s);
    expect(count(s)).toBe('1 of 3');
  });

  it('F3 no editável só vale com a barra aberta', async () => {
    const s = await setup();
    expect(key(s.editor.view.dom, 'F3').defaultPrevented).toBe(false);
    await openWith(s, 'alpha');
    s.editor.view.dom.focus();
    expect(key(s.editor.view.dom, 'F3').defaultPrevented).toBe(true);
    await flush(s);
    expect(count(s)).toBe('2 of 3');
    key(s.editor.view.dom, 'F3', { shiftKey: true });
    await flush(s);
    expect(count(s)).toBe('1 of 3');
  });

  it('botões anterior e próximo; maiúsculas e palavra inteira com aria-pressed', async () => {
    const s = await setup();
    await openWith(s, 'alpha');
    button(s, 'Next match').click();
    await flush(s);
    expect(count(s)).toBe('2 of 3');
    button(s, 'Previous match').click();
    await flush(s);
    expect(count(s)).toBe('1 of 3');
    const cs = button(s, 'Match case');
    expect(cs.getAttribute('aria-pressed')).toBe('false');
    cs.click();
    await flush(s);
    expect(cs.getAttribute('aria-pressed')).toBe('true');
    expect(getSearchState(s.editor)?.caseSensitive).toBe(true);
    expect(count(s)).toBe('1 of 2');
    const ww = button(s, 'Whole word');
    ww.click();
    await flush(s);
    expect(ww.getAttribute('aria-pressed')).toBe('true');
    expect(getSearchState(s.editor)?.wholeWord).toBe(true);
  });

  it('nenhum chain() de busca: os comandos vão um por vez', async () => {
    const s = await setup();
    const chain = vi.spyOn(s.editor, 'chain');
    await openWith(s, 'alpha');
    key(query(s) as Element, 'Enter');
    button(s, 'Match case').click();
    s.cmp.closeSearch();
    await flush(s);
    expect(chain).not.toHaveBeenCalled();
  });

  it('IME: a consulta só muda no compositionend', async () => {
    const s = await setup();
    s.cmp.openSearch();
    await flush(s);
    const el = query(s) as HTMLInputElement;
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    el.value = 'alp';
    el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    await flush(s);
    expect(getSearchState(s.editor)?.query).toBe('');
    // Enter durante a composição não anda.
    key(el, 'Enter', { isComposing: true });
    el.value = 'alpha';
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    await flush(s);
    expect(getSearchState(s.editor)?.query).toBe('alpha');
  });

  it('o teto de 1000 aparece como "1000+"', async () => {
    const s = await setup((h) => h.value.set(`<p>${'a '.repeat(1100)}</p>`));
    await openWith(s, 'a');
    expect(getSearchState(s.editor)?.capped).toBe(true);
    expect(count(s)).toBe('1 of 1000+');
  });
});

describe('substituição (K8, K9)', () => {
  async function withReplace(s: Setup): Promise<HTMLInputElement> {
    await openWith(s, 'alpha');
    s.root
      .querySelector<HTMLButtonElement>('.rte-search [aria-expanded]')
      ?.click();
    await flush(s);
    return s.root.querySelectorAll<HTMLInputElement>('.rte-search__input')[1] as HTMLInputElement;
  }

  it('a alternância mostra o campo e os botões; Substituir troca o ativo', async () => {
    const s = await setup();
    expect(s.root.querySelectorAll('.rte-search__input')).toHaveLength(0);
    const field = await withReplace(s);
    expect(field.getAttribute('aria-label')).toBe('Replace with');
    field.value = 'omega';
    s.root
      .querySelectorAll<HTMLButtonElement>('.rte-search .rte-search__button')
      .forEach((b) => {
        if (b.textContent?.trim() === 'Replace') b.click();
      });
    await flush(s);
    expect(getRteHtml(s.editor)).toBe(
      '<p>omega beta alpha</p><p>Alpha gamma</p>',
    );
    expect(count(s)).toBe('1 of 2');
  });

  it('Enter no campo de substituição substitui o ativo', async () => {
    const s = await setup();
    const field = await withReplace(s);
    field.value = 'omega';
    key(field, 'Enter');
    await flush(s);
    expect(getRteHtml(s.editor)).toContain('omega beta alpha');
  });

  it('Substituir tudo troca todos num passo e anuncia replaced(n)', async () => {
    const s = await setup();
    const field = await withReplace(s);
    field.value = 'omega';
    const all = [
      ...s.root.querySelectorAll<HTMLButtonElement>('.rte-search__button'),
    ].find((b) => b.textContent?.trim() === 'Replace all') as HTMLButtonElement;
    all.click();
    await flush(s);
    expect(getRteHtml(s.editor)).toBe(
      '<p>omega beta omega</p><p>omega gamma</p>',
    );
    expect(getSearchState(s.editor)?.lastReplaced).toBe(3);
    await sleep(20);
    await flush(s);
    expect(live(s)).toBe('3 matches replaced.');
    s.editor.commands.undo();
    expect(getRteHtml(s.editor)).toBe(DOC);
  });
});

describe('fechar (K9)', () => {
  it('Escape fecha, limpa as decorações e devolve o foco com a seleção no resultado ativo', async () => {
    const s = await setup();
    await openWith(s, 'beta');
    expect(s.editor.view.dom.querySelector('.rte-search-match')).not.toBeNull();
    key(query(s) as Element, 'Escape');
    await flush(s);
    await sleep(30);
    expect(bar(s)).toBeNull();
    expect(s.cmp.searchOpen()).toBe(false);
    expect(getSearchState(s.editor)?.query).toBe('');
    expect(s.editor.view.dom.querySelector('.rte-search-match')).toBeNull();
    const { from, to } = s.editor.state.selection;
    expect(s.editor.state.doc.textBetween(from, to)).toBe('beta');
    expect(s.editor.view.hasFocus()).toBe(true);
  });

  it('o botão Fechar faz o mesmo', async () => {
    const s = await setup();
    await openWith(s, 'beta');
    button(s, 'Close search').click();
    await flush(s);
    expect(bar(s)).toBeNull();
    expect(getSearchState(s.editor)?.query).toBe('');
  });

  it('closeSearch() da API fecha sem mover o foco que está fora da barra', async () => {
    const s = await setup();
    await openWith(s, 'beta');
    searchItem(s).focus();
    s.cmp.closeSearch();
    await flush(s);
    expect(bar(s)).toBeNull();
    expect(document.activeElement).toBe(searchItem(s));
  });

  it('a busca continua ativa enquanto o documento muda', async () => {
    const s = await setup();
    await openWith(s, 'alpha');
    s.editor.commands.insertContentAt(1, 'alpha ');
    await flush(s);
    // O ativo acompanha o mesmo trecho (agora o segundo de quatro).
    expect(count(s)).toBe('2 of 4');
  });

  it('carga externa (D9) refaz a consulta atual', async () => {
    const s = await setup();
    await openWith(s, 'alpha');
    await s.host.value.set('<p>alpha alpha alpha alpha</p>');
    await flush(s);
    expect(getSearchState(s.editor)?.query).toBe('alpha');
    expect(count(s)).toBe('1 of 4');
  });
});

describe('anúncios (K10)', () => {
  it('posição adiada 500 ms, imediata na navegação', async () => {
    const s = await setup();
    await openWith(s, 'alpha');
    expect(live(s)).toBe('');
    await sleep(560);
    await flush(s);
    expect(live(s)).toBe('1 of 3');
    key(query(s) as Element, 'Enter');
    await flush(s);
    await sleep(30);
    await flush(s);
    expect(live(s)).toBe('2 of 3');
  });

  it('repete o anúncio igual: Enter com 1 resultado e Substituir duas vezes', async () => {
    const s = await setup((h) => h.value.set('<p>solo x x</p>'));
    await openWith(s, 'solo');
    await sleep(560);
    await flush(s);
    expect(live(s)).toBe('1 of 1');
    const node = () => s.root.querySelector('.rte-search .rte-live > *');
    const before = node();
    key(query(s) as Element, 'Enter');
    await flush(s);
    await sleep(30);
    await flush(s);
    expect(live(s)).toBe('1 of 1');
    expect(node()).not.toBe(before);
    s.root
      .querySelector<HTMLButtonElement>('.rte-search [aria-expanded]')
      ?.click();
    await flush(s);
    await typeQuery(s, 'x');
    (
      s.root.querySelectorAll<HTMLInputElement>('.rte-search__input')[1] as HTMLInputElement
    ).value = 'y';
    const one = [
      ...s.root.querySelectorAll<HTMLButtonElement>('.rte-search__button'),
    ].find((b) => b.textContent?.trim() === 'Replace') as HTMLButtonElement;
    one.click();
    await flush(s);
    await sleep(30);
    await flush(s);
    expect(live(s)).toBe('1 match replaced.');
    const first = node();
    one.click();
    await flush(s);
    await sleep(30);
    await flush(s);
    expect(live(s)).toBe('1 match replaced.');
    expect(node()).not.toBe(first);
  });

  it('sem resultado anuncia "No results"; o teto anuncia "1000+"', async () => {
    const s = await setup((h) => h.value.set(`<p>${'a '.repeat(1100)}</p>`));
    await openWith(s, 'zzz');
    await sleep(560);
    await flush(s);
    expect(live(s)).toBe('No results');
    await typeQuery(s, 'a');
    await sleep(560);
    await flush(s);
    expect(live(s)).toBe('1 of 1000+');
  });
});
