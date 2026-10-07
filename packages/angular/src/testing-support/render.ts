import type { EnvironmentProviders, Provider, Type } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

/**
 * Cria o host com detecção automática e espera estabilizar (o editor é criado
 * no `afterNextRender`). O mesmo código nos modos zoneless e zone.js.
 */
export async function renderHost<T>(
  type: Type<T>,
  providers: (Provider | EnvironmentProviders)[] = [],
): Promise<ComponentFixture<T>> {
  TestBed.configureTestingModule({ providers });
  const fixture = TestBed.createComponent(type);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  return fixture;
}

/** Espera a detecção de mudanças e os ganchos de render pendentes. */
export async function settle(
  fixture: ComponentFixture<unknown>,
): Promise<void> {
  await fixture.whenStable();
}
