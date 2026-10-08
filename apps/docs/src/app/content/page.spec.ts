import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocPage } from '../layout/doc-page';
import type { PageData } from './page';

@Component({ selector: 'docs-fake-live', template: '<b id="vivo">VIVO</b>' })
class FakeLive {}

const PAGE: PageData = {
  title: 'Página de teste',
  headings: [{ depth: 2, id: 'a', text: 'A' }],
  segments: [
    { html: '<h2 id="a">A</h2><p>antes</p>' },
    { live: 'fake' },
    { html: '<p>depois</p>' },
  ],
};

describe('DocPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renderiza os segmentos de HTML e, entre eles, o exemplo vivo (NgComponentOutlet)', async () => {
    const error = vi.spyOn(console, 'error');
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(DocPage);
    fixture.componentRef.setInput('page', PAGE);
    fixture.componentRef.setInput('examples', { fake: FakeLive });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const article = root.querySelector('article.doc')!;
    expect(article.querySelector('h1')?.textContent).toBe('Página de teste');
    const text = (article.textContent ?? '').replace(/\s+/g, ' ');
    expect(text.indexOf('antes')).toBeGreaterThan(-1);
    expect(text.indexOf('VIVO')).toBeGreaterThan(text.indexOf('antes'));
    expect(text.indexOf('depois')).toBeGreaterThan(text.indexOf('VIVO'));
    expect(article.querySelector('.doc-live #vivo')).not.toBeNull();
    expect(article.querySelector('h2#a')).not.toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it('sem a página mostra o aviso de não encontrada', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(DocPage);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Página não encontrada',
    );
  });
});
