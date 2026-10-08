import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

// Primeira criação do editor carrega chunks sob demanda: folga no relógio do teste.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
import { ToolbarPage } from './toolbar.page';

// Primeira criação do editor carrega chunks sob demanda: folga no relógio do teste.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

async function setup() {
  const fixture = TestBed.createComponent(ToolbarPage);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, host: () => root.querySelector('rte-editor') as HTMLElement };
}

describe('página /toolbar', () => {
  it('sem mudança de configuração a instância é a mesma', async () => {
    const { fixture, host } = await setup();
    const before = host();
    expect(before).not.toBeNull();
    fixture.componentInstance.preset.set('article');
    fixture.componentInstance.features.update((f) => ({ ...f }));
    await fixture.whenStable();
    expect(host()).toBe(before);
  });

  it('trocar o preset recria o editor e a barra muda', async () => {
    const { fixture, root, host } = await setup();
    const before = host();
    const itemsArticle = root.querySelectorAll('[role="toolbar"] button').length;
    fixture.componentInstance.preset.set('minimal');
    await fixture.whenStable();
    expect(host()).not.toBe(before);
    expect(root.querySelectorAll('rte-editor')).toHaveLength(1);
    expect(root.querySelectorAll('[role="toolbar"] button').length).toBeLessThan(itemsArticle);
  });

  it('ligar e desligar uma feature recria o editor', async () => {
    const { fixture, host } = await setup();
    const before = host();
    fixture.componentInstance.features.update((f) => ({ ...f, tables: false }));
    await fixture.whenStable();
    const after = host();
    expect(after).not.toBe(before);
    fixture.componentInstance.features.update((f) => ({ ...f, tables: true }));
    await fixture.whenStable();
    expect(host()).not.toBe(after);
  });

  it('o seletor e as caixas refletem e alteram o estado', async () => {
    const { fixture, root } = await setup();
    const select = root.querySelector('[data-testid="preset"]') as HTMLSelectElement;
    select.value = 'full';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(fixture.componentInstance.preset()).toBe('full');
    const box = root.querySelector('[data-feature="tasks"]') as HTMLInputElement;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(fixture.componentInstance.features().tasks).toBe(false);
  });

  it('explica o que mostra e liga ao README', async () => {
    const { root } = await setup();
    expect(root.querySelector('.page-note')?.textContent).toContain('O que isto mostra');
    expect(root.querySelector('.page-note a')?.getAttribute('href')).toContain('#barra-de-ferramentas');
  });
});
