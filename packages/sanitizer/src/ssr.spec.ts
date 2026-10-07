import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFixture } from './testing/fixtures';

const GLOBALS = ['window', 'document', 'navigator', 'localStorage'] as const;

describe('SSR (R9): sem globais do navegador', () => {
  /** Descritores originais (o Node 21+ define `navigator`). */
  const saved = new Map<string, PropertyDescriptor | undefined>();

  beforeEach(() => {
    vi.resetModules();
    for (const name of GLOBALS) {
      saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() {
          throw new Error(`acesso a ${name} no servidor`);
        },
      });
    }
  });

  afterEach(() => {
    for (const name of GLOBALS) {
      const descriptor = saved.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    }
  });

  it('importa e sanitiza o fixture', { timeout: 30_000 }, async () => {
    const fixture = readFixture('all-features.html');
    const mod = await import('./index');
    expect(mod.sanitizeRichText(fixture)).toBe(fixture);
    expect(
      mod.createSanitizer({ features: { tables: false } })('<p>a</p>'),
    ).toBe('<p>a</p>');
  });
});
