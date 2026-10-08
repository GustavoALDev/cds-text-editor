import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { RenderPage } from './render.page';

describe('página /render', () => {
  it('mostra editor, exibição e sumário lado a lado', async () => {
    const fixture = TestBed.createComponent(RenderPage);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('rte-editor')).not.toBeNull();
    const view = root.querySelector(
      '[data-testid="render-view"]',
    ) as HTMLElement;
    expect(view.querySelector('h2')?.textContent).toBe('Introdução');
    const toc = root.querySelector('rte-toc nav.rte-toc');
    expect(toc).not.toBeNull();
    expect(
      toc?.querySelectorAll('a.rte-toc__link').length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('um <script> e os atributos on* colados somem da exibição', async () => {
    const fixture = TestBed.createComponent(RenderPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const raw = root.querySelector(
      '[data-testid="render-raw-view"]',
    ) as HTMLElement;
    expect(raw.innerHTML).not.toContain('<script');
    expect(raw.innerHTML).not.toContain('onerror');
    expect(raw.innerHTML).not.toContain('onclick');
    expect(raw.textContent).toContain('Texto seguro.');
    expect(raw.querySelector('script')).toBeNull();
  });
});
