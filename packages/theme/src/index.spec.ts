import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

describe('@comodeviaser/rte-theme', () => {
  it('exports exactly the public value API', async () => {
    const mod = await import('./index');
    expect(Object.keys(mod).sort()).toEqual([
      'RTE_THEME_PRESETS',
      'applyRteTheme',
      'checkRteTheme',
      'createRteTheme',
      'parseColor',
      'suggestRteColor',
      'supportsRelativeColors',
      'warnIfPoorTheme',
    ]);
  });

  it('imports in Node (no DOM) without throwing or touching globals', async () => {
    vi.resetModules();
    const before = Object.getOwnPropertyNames(globalThis).sort();
    const mod = await import('./index');
    expect(typeof mod.createRteTheme).toBe('function');
    expect(Object.getOwnPropertyNames(globalThis).sort()).toEqual(before);
    expect(typeof document).toBe('undefined');
  });

  it('keeps package.json sideEffects as css only', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { sideEffects: unknown };
    expect(pkg.sideEffects).toEqual(['*.css']);
  });
});
