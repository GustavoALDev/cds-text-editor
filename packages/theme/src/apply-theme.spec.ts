import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyRteTheme,
  resolveMode,
  supportsRelativeColors,
} from './apply-theme';

afterEach(() => vi.unstubAllGlobals());

const fakeElement = () => {
  const props = new Map<string, string>();
  const attrs = new Map<string, string>();
  return {
    props,
    attrs,
    style: {
      setProperty: (k: string, v: string) => props.set(k, v),
      removeProperty: (k: string) => props.delete(k),
    },
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    removeAttribute: (k: string) => attrs.delete(k),
  } as unknown as HTMLElement & {
    props: Map<string, string>;
    attrs: Map<string, string>;
  };
};

const stubDom = (supported: boolean, extra: object = {}) => {
  vi.stubGlobal('document', { documentElement: {} });
  vi.stubGlobal('window', extra);
  vi.stubGlobal('CSS', { supports: () => supported });
  if (supported) vi.stubGlobal('CSSPropertyRule', class {});
};

const fakeMedia = (matches: boolean) => {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mql = {
    matches,
    addEventListener: vi.fn(
      (_t: string, h: (e: { matches: boolean }) => void) => listeners.add(h),
    ),
    removeEventListener: vi.fn(
      (_t: string, h: (e: { matches: boolean }) => void) => listeners.delete(h),
    ),
  };
  return { mql, listeners };
};

describe('supportsRelativeColors', () => {
  it('is false in Node and when CSS.supports throws or CSSPropertyRule is missing', () => {
    expect(supportsRelativeColors()).toBe(false);
    vi.stubGlobal('CSS', {
      supports: () => {
        throw new Error('x');
      },
    });
    vi.stubGlobal('CSSPropertyRule', class {});
    expect(supportsRelativeColors()).toBe(false);
    vi.unstubAllGlobals();
    vi.stubGlobal('CSS', { supports: () => true });
    expect(supportsRelativeColors()).toBe(false);
  });

  it('requires both relative colors and light-dark()', () => {
    vi.stubGlobal('CSSPropertyRule', class {});
    vi.stubGlobal('CSS', {
      supports: (_p: string, v: string) => v.startsWith('color(from'),
    });
    expect(supportsRelativeColors()).toBe(false);
    vi.stubGlobal('CSS', { supports: () => true });
    expect(supportsRelativeColors()).toBe(true);
  });
});

describe('applyRteTheme', () => {
  it('is a safe no-op without a DOM (SSR/Node)', () => {
    expect(supportsRelativeColors()).toBe(false);
    const el = fakeElement();
    const cleanup = applyRteTheme(el, { primary: '#0ea5e9' });
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
    expect(el.props.size).toBe(0);
  });

  it('is a no-op when only document or only window exists', () => {
    const a = fakeElement();
    vi.stubGlobal('document', {});
    expect(() => applyRteTheme(a, { primary: '#0ea5e9' })()).not.toThrow();
    expect(a.props.size).toBe(0);
    vi.unstubAllGlobals();
    const b = fakeElement();
    vi.stubGlobal('window', {});
    expect(() => applyRteTheme(b, { primary: '#0ea5e9' })()).not.toThrow();
    expect(b.props.size).toBe(0);
  });

  it('applies only the seeds and the mode attribute when the browser supports relative colors', () => {
    stubDom(true, {});
    const el = fakeElement();
    const cleanup = applyRteTheme(el, { primary: '#0ea5e9', mode: 'dark' });
    expect(el.props.get('--rte-primary')).toBe('#0ea5e9');
    expect(el.props.has('--rte-secondary')).toBe(false);
    expect(el.props.has('--rte-surface')).toBe(false);
    expect(el.attrs.get('data-rte-mode')).toBe('dark');
    cleanup();
    expect(el.props.size).toBe(0);
    expect(el.attrs.size).toBe(0);
  });

  it('passes invalid seeds through untouched and sets no mode attribute when mode is undefined', () => {
    stubDom(true, {});
    const el = fakeElement();
    applyRteTheme(el, { primary: 'banana' });
    expect(el.props.get('--rte-primary')).toBe('banana');
    expect(el.attrs.size).toBe(0);
  });

  it('sets the mode attribute for auto and --rte-neutral-tint for gray (native)', () => {
    stubDom(true, {});
    const el = fakeElement();
    const cleanup = applyRteTheme(el, { mode: 'auto', neutral: 'gray' });
    expect(el.attrs.get('data-rte-mode')).toBe('auto');
    expect(el.props.get('--rte-neutral-tint')).toBe('0');
    expect([...el.props.keys()]).toEqual(['--rte-neutral-tint']);
    cleanup();
    expect(el.props.size).toBe(0);
  });

  it('force: true applies every variable even with support', () => {
    stubDom(true, {});
    const el = fakeElement();
    applyRteTheme(el, { primary: '#0ea5e9', mode: 'dark', force: true });
    expect(el.props.get('--rte-surface')).toMatch(/^#[0-9a-f]{6}$/);
    expect(el.props.get('color-scheme')).toBe('dark');
  });

  it('applies every precomputed variable when relative colors are unsupported (plan B) and cleans up', () => {
    stubDom(false, {});
    const el = fakeElement();
    const cleanup = applyRteTheme(el, { primary: '#0ea5e9', mode: 'light' });
    expect(el.props.get('--rte-surface')).toMatch(/^#[0-9a-f]{6}$/);
    expect(el.props.get('--rte-on-primary')).toMatch(/^#[0-9a-f]{6}$/);
    expect(el.props.get('color-scheme')).toBe('light');
    expect(el.attrs.get('data-rte-mode')).toBe('light');
    cleanup();
    expect(el.props.size).toBe(0);
    expect(el.attrs.size).toBe(0);
  });

  it('does not throw for invalid seeds', () => {
    stubDom(false, {});
    expect(() =>
      applyRteTheme(fakeElement(), { primary: 'banana' }),
    ).not.toThrow();
  });

  it('auto in plan B re-applies on media change and cleanup removes the same handler', () => {
    const { mql, listeners } = fakeMedia(false);
    stubDom(false, { matchMedia: () => mql });
    const el = fakeElement();
    const cleanup = applyRteTheme(el, { primary: '#0ea5e9', mode: 'auto' });
    const light = el.props.get('--rte-surface');
    expect(el.props.get('color-scheme')).toBe('light');
    expect(mql.addEventListener).toHaveBeenCalledTimes(1);
    const handler = mql.addEventListener.mock.calls[0]?.[1];
    mql.matches = true;
    for (const l of listeners) l({ matches: true });
    expect(el.props.get('color-scheme')).toBe('dark');
    expect(el.props.get('--rte-surface')).not.toBe(light);
    cleanup();
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', handler);
    expect(listeners.size).toBe(0);
    expect(el.props.size).toBe(0);
    expect(el.attrs.size).toBe(0);
  });

  it('uses legacy addListener/removeListener when addEventListener is missing', () => {
    const add = vi.fn();
    const remove = vi.fn();
    const mql = { matches: false, addListener: add, removeListener: remove };
    stubDom(false, { matchMedia: () => mql });
    applyRteTheme(fakeElement(), { mode: 'auto' })();
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(add.mock.calls[0]?.[0]);
  });

  it('does not subscribe for forced modes', () => {
    const { mql } = fakeMedia(false);
    stubDom(false, { matchMedia: () => mql });
    applyRteTheme(fakeElement(), { mode: 'dark' })();
    expect(mql.addEventListener).not.toHaveBeenCalled();
  });

  it('re-applying on the same element disposes the previous application', () => {
    const { mql, listeners } = fakeMedia(false);
    stubDom(false, { matchMedia: () => mql });
    const el = fakeElement();
    applyRteTheme(el, { primary: '#0ea5e9', mode: 'auto' });
    applyRteTheme(el, { mode: 'dark' });
    expect(listeners.size).toBe(0);
    expect(mql.removeEventListener).toHaveBeenCalledTimes(1);
    expect(el.attrs.get('data-rte-mode')).toBe('dark');
    expect(el.props.get('color-scheme')).toBe('dark');
  });

  it('a stale cleanup does not undo a newer application', () => {
    stubDom(false, {});
    const el = fakeElement();
    const first = applyRteTheme(el, { mode: 'light' });
    applyRteTheme(el, { mode: 'dark' });
    first();
    expect(el.props.get('color-scheme')).toBe('dark');
  });
});

describe('resolveMode', () => {
  it('returns forced modes directly', () => {
    expect(resolveMode('dark')).toBe('dark');
    expect(resolveMode('light')).toBe('light');
  });

  it('follows prefers-color-scheme for auto/undefined and defaults to light without matchMedia', () => {
    expect(resolveMode('auto')).toBe('light');
    expect(resolveMode(undefined)).toBe('light');
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    expect(resolveMode('auto')).toBe('dark');
    expect(resolveMode(undefined)).toBe('dark');
  });

  it('inherit reads the documentElement color-scheme', () => {
    vi.stubGlobal('document', { documentElement: {} });
    const scheme = (colorScheme: string) =>
      vi.stubGlobal('getComputedStyle', () => ({ colorScheme }));
    scheme('dark');
    expect(resolveMode('inherit')).toBe('dark');
    scheme('light');
    expect(resolveMode('inherit')).toBe('light');
    scheme('normal');
    expect(resolveMode('inherit')).toBe('light');
  });

  it('inherit with "light dark" follows the system', () => {
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({ colorScheme: 'light dark' }));
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    expect(resolveMode('inherit')).toBe('dark');
  });

  it('inherit without getComputedStyle falls back to light', () => {
    vi.stubGlobal('document', { documentElement: {} });
    expect(resolveMode('inherit')).toBe('light');
  });
});
