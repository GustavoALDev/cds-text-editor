import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GLOBALS = ['window', 'document', 'localStorage'] as const;

describe('SSR (R5): importar não toca em globais do navegador', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const name of GLOBALS) {
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
      delete (globalThis as Record<string, unknown>)[name];
    }
  });

  // Import frio dos três entries depois de resetModules: com a suíte toda em
  // paralelo (propriedades do fast-check) passa dos 5 s padrão.
  it('importa os três entries sem lançar', { timeout: 30_000 }, async () => {
    await expect(import('./index')).resolves.toBeDefined();
    await expect(import('../embeds/src/index')).resolves.toBeDefined();
    await expect(import('../html/src/index')).resolves.toBeDefined();
  });

  it('getHtmlSchema e createLocalDraftStorage não lançam', async () => {
    const mod = await import('./index');
    expect(() => mod.getHtmlSchema()).not.toThrow();
    expect(() => mod.createLocalDraftStorage()).not.toThrow();
  });
});
