import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { FORMS_MAX_CHARS, FormsPage } from './forms.page';

// Primeira criação do editor carrega chunks sob demanda: folga no relógio do teste.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const LONG = `<p>${'x'.repeat(FORMS_MAX_CHARS + 20)}</p>`;

async function setup() {
  const errors: unknown[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...a) => {
    errors.push(a);
  });
  const fixture = TestBed.createComponent(FormsPage);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const text = (id: string) =>
    (el => (el instanceof HTMLTextAreaElement ? el.value : el?.textContent?.trim()) ?? '')(root.querySelector(`[data-testid="${id}"]`));
  return { fixture, root, text, errors, spy };
}

describe('página /forms', () => {
  it('mostra valor e validade nos quatro blocos, sem erro de console', async () => {
    const { fixture, root, text, errors, spy } = await setup();
    expect(root.querySelectorAll('rte-editor')).toHaveLength(4);
    expect(text('signal-value')).toContain('Signal Forms');
    expect(text('reactive-value')).toContain('Reactive Forms');
    expect(text('template-value')).toContain('Template Forms');
    expect(text('plain-value')).toContain('Sem formulário');
    expect(text('signal-state')).toContain('sim');
    expect(text('reactive-state')).toContain('sim');
    await fixture.whenStable();
    expect(errors).toEqual([]);
    spy.mockRestore();
  });

  it('Signal Forms: texto acima do limite fica inválido, com a mensagem de formatRteError', async () => {
    const { fixture, text, spy } = await setup();
    fixture.componentInstance.model.set({ body: LONG });
    await fixture.whenStable();
    expect(text('signal-state')).toContain('não');
    expect(text('signal-errors')).toContain(String(FORMS_MAX_CHARS));
    fixture.componentInstance.model.set({ body: '<p>curto</p>' });
    await fixture.whenStable();
    expect(text('signal-errors')).toBe('');
    spy.mockRestore();
  });

  it('Reactive Forms: setValue acima do limite mostra o erro e volta a válido', async () => {
    const { fixture, text, spy } = await setup();
    fixture.componentInstance.control.setValue(LONG);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(text('reactive-state')).toContain('não');
    expect(text('reactive-errors')).toContain(String(FORMS_MAX_CHARS));
    fixture.componentInstance.control.setValue('<p>curto</p>');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(text('reactive-errors')).toBe('');
    spy.mockRestore();
  });

  it('Template Forms: o ngModel entrega o erro do limite', async () => {
    const { fixture, text, spy } = await setup();
    fixture.componentInstance.templateValue.set(LONG);
    // O ngModel escreve no controle numa microtarefa; a página é OnPush, então marcamos a vista.
    const cdr = fixture.componentRef.injector.get(ChangeDetectorRef);
    for (let i = 0; i < 4; i++) {
      cdr.markForCheck();
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(text('template-state')).toContain('não');
    expect(text('template-errors')).toContain(String(FORMS_MAX_CHARS));
    spy.mockRestore();
  });
});
