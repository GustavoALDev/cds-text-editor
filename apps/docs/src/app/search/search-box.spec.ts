import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchBox } from './search-box';
import type { SearchEntry } from './search-logic';

const INDEX: SearchEntry[] = [
  {
    page: 'guia/configuracao',
    pageTitle: 'Configuração',
    anchor: '',
    title: 'Configuração',
    text: 'como configurar',
  },
  {
    page: 'guia/configuracao',
    pageTitle: 'Configuração',
    anchor: 'providers',
    title: 'Providers',
    text: 'use providerichtext',
  },
  {
    page: 'api/rte-angular',
    pageTitle: 'rte-angular',
    anchor: 'providerichtext',
    title: 'provideRichText',
    text: 'registra',
  },
];

async function setup() {
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(INDEX), { status: 200 }));
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const router = TestBed.inject(Router);
  const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(SearchBox);
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const input = root.querySelector('input') as HTMLInputElement;
  const settle = async () => {
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const type = async (value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  const key = async (k: string) => {
    const ev = new KeyboardEvent('keydown', {
      key: k,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(ev);
    await settle();
    return ev;
  };
  return { fixture, root, input, fetchSpy, nav, type, key, settle };
}

describe('SearchBox', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => vi.restoreAllMocks());

  it('o campo aparece só no cliente e é um combobox ARIA com listbox', async () => {
    const { root, input } = await setup();
    expect(root.querySelector('.search')?.hasAttribute('hidden')).toBe(false);
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-controls')).toBe('docs-search-list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('[role=listbox]')).not.toBeNull();
  });

  it('o índice é buscado uma só vez, no primeiro foco', async () => {
    const { input, fetchSpy, settle, type } = await setup();
    expect(fetchSpy).not.toHaveBeenCalled();
    input.dispatchEvent(new Event('focus'));
    await settle();
    input.dispatchEvent(new Event('focus'));
    await type('prov');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toMatch(/search-index\.json$/);
  });

  it('digitar abre a lista, anuncia o total e usa aria-activedescendant com as setas', async () => {
    const { root, input, type, key } = await setup();
    await type('prov');
    const options = [...root.querySelectorAll('[role=option]')];
    expect(options.length).toBe(2);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('[role=status]')?.textContent).toContain(
      '2 resultados',
    );
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    await key('ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]?.id);
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
    await key('ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1]?.id);
    await key('ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]?.id);
    await key('ArrowUp');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1]?.id);
  });

  it('Enter navega para a página com a âncora do resultado ativo', async () => {
    const { nav, type, key } = await setup();
    await type('prov');
    await key('ArrowDown');
    await key('Enter');
    expect(nav).toHaveBeenCalledWith(['/', 'guia', 'configuracao'], {
      fragment: 'providers',
    });
  });

  it('Escape fecha a lista; sem resultado anuncia “Nenhum resultado”', async () => {
    const { root, input, type, key } = await setup();
    await type('prov');
    await key('Escape');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    await type('zzzz');
    expect(root.querySelector('[role=status]')?.textContent).toContain(
      'Nenhum resultado',
    );
  });

  it('“/” foca o campo fora de campos editáveis e é ignorado dentro deles', async () => {
    const { input } = await setup();
    document.body.appendChild(input.closest('.search') as Node);
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '/',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(input);
    input.blur();
    const other = document.createElement('input');
    document.body.appendChild(other);
    other.focus();
    other.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '/',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(other);
    other.remove();
  });
});
