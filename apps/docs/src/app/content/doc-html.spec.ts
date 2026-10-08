import { Router, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocHtml } from './doc-html';

const HTML = [
  '<h2 id="providers">Providers</h2>',
  '<a id="interno" href="guia/configuracao#providers">interno</a>',
  '<a id="ancora" href="#providers">âncora</a>',
  '<a id="externo" href="https://outro.test/x" rel="noopener noreferrer" target="_blank">externo</a>',
].join('');

describe('DocHtml', () => {
  let host: HTMLElement;
  let navigate: ReturnType<typeof vi.spyOn>;
  let prevented: boolean[];
  const onClick = (e: Event) => {
    prevented.push(e.defaultPrevented);
    e.preventDefault(); // o jsdom não tenta navegar de verdade
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    navigate = vi
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true);
    const fixture = TestBed.createComponent(DocHtml);
    fixture.componentRef.setInput('html', HTML);
    await fixture.whenStable();
    host = fixture.nativeElement as HTMLElement;
    document.body.append(host);
    prevented = [];
    document.addEventListener('click', onClick);
  });

  afterEach(() => {
    document.removeEventListener('click', onClick);
    host.remove();
  });

  const click = (id: string, init: MouseEventInit = {}) =>
    host.querySelector(`#${id}`)!.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...init,
      }),
    );

  it('mantém os id dos títulos (por isso o bypass do sanitizador)', () => {
    expect(host.querySelector('h2')?.id).toBe('providers');
  });

  it('clique primário em link interno navega pelo router, sem recarregar', () => {
    click('interno');
    expect(navigate).toHaveBeenCalledWith('/guia/configuracao#providers');
    expect(prevented).toEqual([true]);
  });

  it('âncora da própria página também vai pelo router (relativa à base)', () => {
    click('ancora');
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(String(navigate.mock.calls[0][0])).toMatch(/#providers$/);
  });

  it('Ctrl, Meta, Shift, Alt e botão do meio não são interceptados', () => {
    click('interno', { ctrlKey: true });
    click('interno', { metaKey: true });
    click('interno', { shiftKey: true });
    click('interno', { altKey: true });
    click('interno', { button: 1 });
    expect(navigate).not.toHaveBeenCalled();
    expect(prevented).toEqual([false, false, false, false, false]);
  });

  it('link externo não é interceptado e mantém rel e target', () => {
    click('externo');
    expect(navigate).not.toHaveBeenCalled();
    expect(prevented).toEqual([false]);
    const a = host.querySelector('#externo')!;
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.getAttribute('target')).toBe('_blank');
  });
});
