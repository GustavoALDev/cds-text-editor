import {
  ApplicationRef,
  createComponent,
  createEnvironmentInjector,
  EnvironmentInjector,
  type ComponentRef,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PrecedenceEditor,
  rootProviders,
  routeProviders,
} from './precedencia.example';

// Prova a ordem de precedência com o RteEditor e os injetores reais (nada simulado).

async function mount(
  providers: typeof rootProviders | null,
  inputs: Record<string, unknown> = {},
): Promise<HTMLElement> {
  const root = TestBed.inject(EnvironmentInjector);
  const environmentInjector = providers
    ? createEnvironmentInjector(providers, root)
    : root;
  const ref: ComponentRef<PrecedenceEditor> = createComponent(
    PrecedenceEditor,
    { environmentInjector },
  );
  for (const [k, v] of Object.entries(inputs)) ref.setInput(k, v);
  const app = TestBed.inject(ApplicationRef);
  app.attachView(ref.hostView);
  document.body.appendChild(ref.location.nativeElement);
  await app.whenStable();
  return ref.location.nativeElement as HTMLElement;
}

const buttons = (el: HTMLElement) =>
  el.querySelectorAll('rte-toolbar button').length;
const counter = (el: HTMLElement) => el.querySelector('.rte-counter--chars');
const prop = (el: HTMLElement, name: string) =>
  el.querySelector<HTMLElement>('rte-editor')?.style.getPropertyValue(name) ??
  '';

afterEach(() => {
  document.body.replaceChildren();
  TestBed.resetTestingModule();
});

describe('precedência da configuração', () => {
  it('a raiz vale quando não há provider na rota nem entrada', async () => {
    TestBed.configureTestingModule({ providers: rootProviders });
    const el = await mount(null);
    expect(buttons(el)).toBeGreaterThan(0);
    expect(counter(el)).not.toBeNull();
  });

  it('o provider da rota substitui o da raiz por inteiro: barra menor e sem contador', async () => {
    TestBed.configureTestingModule({ providers: rootProviders });
    const full = await mount(null);
    const route = await mount(routeProviders);
    expect(buttons(route)).toBeLessThan(buttons(full));
    expect(counter(route)).toBeNull();
  });

  it('a entrada vence o provider mais próximo', async () => {
    TestBed.configureTestingModule({ providers: rootProviders });
    const full = await mount(null);
    const forced = await mount(routeProviders, {
      toolbar: 'full',
      chars: true,
    });
    expect(buttons(forced)).toBe(buttons(full));
    expect(counter(forced)).not.toBeNull();
  });

  it('o tema mescla campo a campo: a entrada troca só a cor que informa', async () => {
    TestBed.configureTestingModule({ providers: rootProviders });
    const base = await mount(null);
    const mixed = await mount(null, { theme: { primary: '#b3261e' } });
    const names = (el: HTMLElement) =>
      Array.from(el.querySelector<HTMLElement>('rte-editor')?.style ?? []);
    expect(names(base).length).toBeGreaterThan(0);
    // a secundária continua a do provider; a primária mudou
    expect(prop(mixed, '--rte-secondary')).toBe(prop(base, '--rte-secondary'));
    expect(prop(mixed, '--rte-primary')).not.toBe(prop(base, '--rte-primary'));
  });
});
