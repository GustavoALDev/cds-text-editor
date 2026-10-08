import { TestBed } from '@angular/core/testing';
import { RteEditor } from '@cds/rte-angular';
import { RTE_LABELS_EN, RTE_LABELS_ES, RTE_LABELS_PT_BR } from '@cds/rte-angular/i18n';
import { getRteEditor } from '@cds/rte-angular/testing';
import { describe, expect, it, vi } from 'vitest';
import { I18nPage } from './i18n.page';

// Primeira criação do editor carrega chunks sob demanda: folga no relógio do teste.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

describe('página /i18n', () => {
  it('trocar o idioma por signal muda os rótulos sem recriar o editor', async () => {
    const fixture = TestBed.createComponent(I18nPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const host = root.querySelector('rte-editor') as HTMLElement;
    const textbox = () => root.querySelector('[role="textbox"]') as HTMLElement;
    const toolbar = () => root.querySelector('[role="toolbar"]') as HTMLElement;
    const editorBefore = getRteEditor(host);
    const textboxBefore = textbox();
    expect(editorBefore).not.toBeNull();
    expect(textbox().getAttribute('aria-label')).toBe(RTE_LABELS_PT_BR.editor.ariaLabel);
    const toolbarPt = toolbar().getAttribute('aria-label');

    for (const [lang, pack] of [
      ['en', RTE_LABELS_EN],
      ['es', RTE_LABELS_ES],
      ['pt-BR', RTE_LABELS_PT_BR],
    ] as const) {
      fixture.componentInstance.lang.set(lang);
      await fixture.whenStable();
      expect(root.querySelector('rte-editor')).toBe(host);
      expect(getRteEditor(host)).toBe(editorBefore);
      expect(textbox()).toBe(textboxBefore);
      expect(textbox().getAttribute('aria-label')).toBe(pack.editor.ariaLabel);
    }
    fixture.componentInstance.lang.set('en');
    await fixture.whenStable();
    expect(toolbar().getAttribute('aria-label')).not.toBe(toolbarPt);
    expect(
      fixture.debugElement.children.some((d) => d.componentInstance instanceof RteEditor),
    ).toBe(true);
  });

  it('o seletor altera o signal e a página explica o que mostra', async () => {
    const fixture = TestBed.createComponent(I18nPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const select = root.querySelector('[data-testid="lang"]') as HTMLSelectElement;
    select.value = 'es';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(fixture.componentInstance.lang()).toBe('es');
    expect(root.querySelector('.page-note')?.textContent).toContain('O que isto mostra');
    expect(root.querySelector('.page-note a')?.getAttribute('href')).toContain('#rotulos-e-idioma');
  });
});
