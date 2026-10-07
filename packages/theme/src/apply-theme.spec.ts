import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyRteTheme,
  FORCED_COLORS_TOKENS,
  resolveMode,
  supportsRelativeColors,
} from './apply-theme';
import { createRteTheme } from './create-theme';

afterEach(() => vi.unstubAllGlobals());

const DARK = '(prefers-color-scheme: dark)';
const FORCED = '(forced-colors: active)';
const CONTRAST = '(prefers-contrast: more)';

interface FakeProbe {
  probe: true;
  value: string;
  parentNode: unknown;
  style: { setProperty: (k: string, v: string) => void };
}

/**
 * Elemento falso. `cascade` simula o valor computado das variáveis vindo de ancestrais/`:root`
 * (o inline definido no próprio elemento tem precedência, como no navegador); `resolve` simula o
 * `background-color` computado do filho-sonda para cada valor (padrão: transparente = inválido).
 */
const fakeElement = (
  cascade: Record<string, string> = {},
  resolve: (value: string) => string = () => 'rgba(0, 0, 0, 0)',
) => {
  const props = new Map<string, string>();
  const attrs = new Map<string, string>();
  const children: unknown[] = [];
  const created = vi.fn();
  const el = {
    props,
    attrs,
    children,
    created,
    cascade,
    resolve,
    style: {
      setProperty: (k: string, v: string) => props.set(k, v),
      removeProperty: (k: string) => props.delete(k),
      getPropertyValue: (k: string) => props.get(k) ?? '',
    },
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    removeAttribute: (k: string) => attrs.delete(k),
    appendChild: (c: FakeProbe) => {
      children.push(c);
      c.parentNode = el;
      return c;
    },
    removeChild: (c: FakeProbe) => {
      children.splice(children.indexOf(c), 1);
      c.parentNode = null;
      return c;
    },
    ownerDocument: {
      createElement: (tag: string): FakeProbe => {
        created(tag);
        const probe: FakeProbe = {
          probe: true,
          value: '',
          parentNode: null,
          style: {
            setProperty: (k: string, v: string) => {
              if (k === 'background-color') probe.value = v;
            },
          },
        };
        return probe;
      },
    },
  };
  return el as unknown as HTMLElement & {
    props: Map<string, string>;
    attrs: Map<string, string>;
    children: unknown[];
    created: ReturnType<typeof vi.fn>;
    cascade: Record<string, string>;
    resolve: (value: string) => string;
  };
};

type FakeEl = ReturnType<typeof fakeElement>;

/** `getComputedStyle` falso: sonda -> `background-color` resolvido; elemento -> inline ou cascata. */
const stubComputed = (el: FakeEl, opts: { probeThrows?: boolean } = {}) => {
  const fn = vi.fn((target: unknown) => {
    if ((target as FakeProbe).probe) {
      if (opts.probeThrows) throw new Error('boom');
      return { backgroundColor: el.resolve((target as FakeProbe).value) };
    }
    return {
      colorScheme: '',
      getPropertyValue: (n: string) => el.props.get(n) ?? el.cascade[n] ?? '',
    };
  });
  vi.stubGlobal('getComputedStyle', fn);
  return fn;
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

/** `matchMedia` que devolve `mql` só para `query` e uma lista falsa (sem casar) para as demais. */
const only = (query: string, mql: object) => {
  const others = new Map<string, object>();
  return (q: string) => {
    if (q === query) return mql;
    if (!others.has(q)) others.set(q, fakeMedia(false).mql);
    return others.get(q);
  };
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

  it.each([
    'color(from red srgb-linear calc(r) g b)',
    'light-dark(red, blue)',
    'oklch(from red l c h)',
    'color-mix(in oklab, red, blue)',
  ])(
    'is false when only %j is unsupported (theme.css needs all four)',
    (missing) => {
      vi.stubGlobal('CSSPropertyRule', class {});
      const asked: string[] = [];
      vi.stubGlobal('CSS', {
        supports: (p: string, v: string) => {
          asked.push(`${p}:${v}`);
          return v !== missing;
        },
      });
      expect(supportsRelativeColors()).toBe(false);
      expect(asked).toContain(`color:${missing}`);
    },
  );
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
    stubDom(false, { matchMedia: only(DARK, mql) });
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
    stubDom(false, { matchMedia: only(DARK, mql) });
    applyRteTheme(fakeElement(), { mode: 'auto' })();
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(add.mock.calls[0]?.[0]);
  });

  it('does not subscribe for forced modes', () => {
    const { mql } = fakeMedia(false);
    stubDom(false, { matchMedia: only(DARK, mql) });
    applyRteTheme(fakeElement(), { mode: 'dark' })();
    expect(mql.addEventListener).not.toHaveBeenCalled();
  });

  it('re-applying on the same element disposes the previous application', () => {
    const { mql, listeners } = fakeMedia(false);
    stubDom(false, { matchMedia: only(DARK, mql) });
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

describe('applyRteTheme plano B: sementes resolvidas no contexto do elemento', () => {
  const theme = (o: Parameters<typeof createRteTheme>[0]) =>
    createRteTheme({ mode: 'light', ...o });

  it('resolve var() dado nas opções via sonda filha e remove a sonda', () => {
    stubDom(true, {});
    const el = fakeElement({}, (v) =>
      v === 'var(--marca)' ? 'rgb(14, 165, 233)' : 'rgba(0, 0, 0, 0)',
    );
    stubComputed(el);
    applyRteTheme(el, { primary: 'var(--marca)', mode: 'light', force: true });
    const want = theme({ primary: '#0ea5e9' });
    expect(el.props.get('--rte-primary')).toBe('#0ea5e9');
    expect(el.props.get('--rte-primary-hover')).toBe(
      want['--rte-primary-hover'],
    );
    expect(el.props.get('--rte-on-primary')).toBe(want['--rte-on-primary']);
    expect(el.created).toHaveBeenCalledWith('span');
    expect(el.children).toEqual([]);
  });

  it('papel omitido lê o valor da cascata e grava a semente resolvida inline (par consistente)', () => {
    stubDom(false, {});
    const el = fakeElement({ '--rte-secondary': ' rgb(16, 185, 129) ' });
    stubComputed(el);
    applyRteTheme(el, { primary: '#8514f5', mode: 'light' });
    const want = theme({ primary: '#8514f5', secondary: '#10b981' });
    for (const k of ['hover', 'active', 'text', 'subtle', 'border'])
      expect(el.props.get(`--rte-secondary-${k}`), k).toBe(
        want[`--rte-secondary-${k}`],
      );
    expect(el.props.get('--rte-on-secondary')).toBe(want['--rte-on-secondary']);
    // Antes a semente lida da cascata NÃO era gravada inline (ficava viva enquanto os derivados
    // eram uma foto: mudar a cascata depois quebrava o contraste). Agora a foto é consistente: a
    // semente resolvida também é gravada, como o hex que `createRteTheme` devolve.
    expect(el.props.get('--rte-secondary')).toBe('#10b981');
    expect(el.props.get('--rte-secondary')).toBe(want['--rte-secondary']);
    // O papel sem nada na cascata cai no padrão Angular e é escrito inline.
    expect(el.props.get('--rte-tertiary')).toBe('#0546ff');
    expect(el.created).not.toHaveBeenCalled(); // nada dado ilegível: sem sonda
  });

  it('valor inválido cai no valor da cascata e, sem nada acima, no padrão', () => {
    stubDom(false, {});
    const red = fakeElement({ '--rte-primary': 'rgb(255, 0, 0)' });
    stubComputed(red);
    applyRteTheme(red, { primary: 'banana', mode: 'light' });
    const fromRed = theme({ primary: '#ff0000' });
    expect(red.props.get('--rte-primary-hover')).toBe(
      fromRed['--rte-primary-hover'],
    );
    expect(red.props.get('--rte-surface')).toBe(fromRed['--rte-surface']);
    expect(red.children).toEqual([]);

    const none = fakeElement();
    stubComputed(none);
    applyRteTheme(none, { primary: 'banana', mode: 'light' });
    const def = theme({});
    expect(none.props.get('--rte-primary')).toBe('#8514f5');
    expect(none.props.get('--rte-primary-hover')).toBe(
      def['--rte-primary-hover'],
    );
  });

  it('a sonda é removida mesmo quando getComputedStyle lança (cai na cascata)', () => {
    stubDom(false, {});
    const el = fakeElement(
      { '--rte-primary': '#ff0000' },
      () => 'rgb(1, 2, 3)',
    );
    stubComputed(el, { probeThrows: true });
    expect(() =>
      applyRteTheme(el, { primary: 'var(--marca)', mode: 'light' }),
    ).not.toThrow();
    expect(el.created).toHaveBeenCalledTimes(1);
    expect(el.children).toEqual([]);
    expect(el.props.get('--rte-primary-hover')).toBe(
      theme({ primary: '#ff0000' })['--rte-primary-hover'],
    );
  });

  it('sem getComputedStyle (ou elemento sem ownerDocument) não lança e usa o padrão', () => {
    stubDom(false, {});
    const el = fakeElement({ '--rte-primary': '#ff0000' });
    applyRteTheme(el, { primary: 'var(--marca)', mode: 'light' });
    expect(el.props.get('--rte-primary')).toBe('#8514f5');
    expect(el.children).toEqual([]);
  });

  it('remove a própria semente inline antes de reler a cascata ao repintar', () => {
    const { mql, listeners } = fakeMedia(false);
    stubDom(false, { matchMedia: only(DARK, mql) });
    const el = fakeElement();
    stubComputed(el);
    applyRteTheme(el, { mode: 'auto' });
    // Sem nada na cascata: padrão escrito inline.
    expect(el.props.get('--rte-secondary')).toBe('#f637e3');
    // Um ancestral passa a definir a semente; a repintura (mudança de esquema) a enxerga.
    el.cascade['--rte-secondary'] = 'rgb(16, 185, 129)';
    for (const l of listeners) l({ matches: false });
    // A semente inline anterior (padrão) saiu antes da releitura; a nova, lida da cascata, é
    // gravada junto com os derivados (antes: não era gravada; agora o par fica consistente).
    expect(el.props.get('--rte-secondary')).toBe('#10b981');
    expect(el.props.get('--rte-secondary-hover')).toBe(
      theme({ secondary: '#10b981' })['--rte-secondary-hover'],
    );
  });

  it('semente da cascata gravada inline sai no cleanup; reaplicar após mudar a cascata atualiza o par', () => {
    stubDom(false, {});
    const el = fakeElement({ '--rte-primary': '#ffff00' });
    stubComputed(el);
    let cleanup = applyRteTheme(el, { mode: 'light', force: true });
    const yellow = theme({ primary: '#ffff00' });
    expect(el.props.get('--rte-primary')).toBe('#ffff00');
    expect(el.props.get('--rte-on-primary')).toBe(yellow['--rte-on-primary']);
    // A cascata muda depois: a foto (semente + derivados) segue intacta e consistente.
    el.cascade['--rte-primary'] = '#000080';
    expect(el.props.get('--rte-primary')).toBe('#ffff00');
    expect(el.props.get('--rte-on-primary')).toBe(yellow['--rte-on-primary']);
    // Reaplicar descarta a foto anterior e relê a cascata: o par passa a ser o azul-marinho.
    cleanup = applyRteTheme(el, { mode: 'light', force: true });
    const navy = theme({ primary: '#000080' });
    expect(el.props.get('--rte-primary')).toBe('#000080');
    expect(el.props.get('--rte-on-primary')).toBe(navy['--rte-on-primary']);
    expect(el.props.get('--rte-primary-hover')).toBe(
      navy['--rte-primary-hover'],
    );
    cleanup();
    expect(el.props.size).toBe(0);
  });

  it('semente inline do próprio usuário no elemento é respeitada: não é sobrescrita nem removida', () => {
    stubDom(false, {});
    const el = fakeElement({ '--rte-primary': '#ffff00' });
    el.style.setProperty('--rte-primary', '#000080'); // autoria do usuário
    stubComputed(el);
    const cleanup = applyRteTheme(el, { mode: 'light', force: true });
    const navy = theme({ primary: '#000080' });
    expect(el.props.get('--rte-primary')).toBe('#000080');
    expect(el.props.get('--rte-on-primary')).toBe(navy['--rte-on-primary']);
    // Reaplicar (descartando a anterior) também não toca no valor do usuário.
    const again = applyRteTheme(el, { mode: 'light', force: true });
    expect(el.props.get('--rte-primary')).toBe('#000080');
    cleanup(); // obsoleto: não desfaz a aplicação nova
    again();
    expect([...el.props]).toEqual([['--rte-primary', '#000080']]);
  });

  it('caminho nativo intocado: texto original, sem sonda e sem ler a cascata', () => {
    stubDom(true, {});
    const el = fakeElement({ '--rte-secondary': '#10b981' });
    const computed = stubComputed(el);
    applyRteTheme(el, { primary: 'var(--marca)' });
    expect([...el.props]).toEqual([['--rte-primary', 'var(--marca)']]);
    expect(el.created).not.toHaveBeenCalled();
    expect(computed).not.toHaveBeenCalled();
  });
});

describe('applyRteTheme plano B: tokens derivados sobrescritos pelo consumidor (nível 3)', () => {
  const FORMULA =
    'light-dark(oklch(from #8514f5 0.985 calc(min(c, 0.006) * 1) h / 1), oklch(from #8514f5 0.18 calc(min(c, 0.012) * 1) h / 1))';

  it('respeita o override em CSS (.rte-root) e deriva subtle/border da superfície do consumidor', () => {
    stubDom(false, {});
    const el = fakeElement(
      {
        '--rte-surface': ' #fffdf7 ',
        '--rte-danger': '#c62828',
        '--rte-text': FORMULA, // fórmula do theme.css: inútil sem suporte, o plano B grava
        '--rte-warning': 'light-dark(#8c5a00, #f0b84d)', // estático do próprio tema
        '--rte-primary-subtle':
          'color-mix(in oklab, oklab(from #8514f5 l a b / 1) 12%, #fffdf7)',
      },
      (v) =>
        v === 'var(--rte-surface)' ? 'rgb(255, 253, 247)' : 'rgba(0, 0, 0, 0)',
    );
    stubComputed(el);
    applyRteTheme(el, { primary: '#8514f5', mode: 'light' });
    expect(el.props.has('--rte-surface')).toBe(false);
    expect(el.props.has('--rte-danger')).toBe(false);
    const plain = createRteTheme({ primary: '#8514f5', mode: 'light' });
    expect(el.props.get('--rte-text')).toBe(plain['--rte-text']);
    expect(el.props.get('--rte-warning')).toBe(plain['--rte-warning']);
    // subtle/border saem da superfície do consumidor, como color-mix(…, var(--rte-surface)) no CSS.
    expect(el.props.get('--rte-primary-subtle')).not.toBe(
      plain['--rte-primary-subtle'],
    );
    expect(el.props.get('--rte-primary-subtle')).toMatch(/^#[0-9a-f]{6}$/);
    expect(el.children).toEqual([]);
  });

  it('override inline do usuário num token derivado não é sobrescrito nem removido pelo cleanup', () => {
    stubDom(false, {});
    const el = fakeElement();
    el.style.setProperty('--rte-focus', '#ff00ff');
    stubComputed(el);
    const cleanup = applyRteTheme(el, { mode: 'light' });
    expect(el.props.get('--rte-focus')).toBe('#ff00ff');
    expect(el.props.has('--rte-primary-text')).toBe(true);
    cleanup();
    expect(el.props.get('--rte-focus')).toBe('#ff00ff');
    expect(el.props.has('--rte-primary-text')).toBe(false);
  });
});

describe('applyRteTheme plano B: R8 (forced-colors e prefers-contrast)', () => {
  const media = (flags: { forced?: boolean; contrast?: boolean } = {}) => {
    const dark = fakeMedia(false);
    const forced = fakeMedia(flags.forced ?? false);
    const contrast = fakeMedia(flags.contrast ?? false);
    const map: Record<string, object> = {
      [DARK]: dark.mql,
      [FORCED]: forced.mql,
      [CONTRAST]: contrast.mql,
    };
    return { dark, forced, contrast, matchMedia: (q: string) => map[q] };
  };

  it('em forced-colors não escreve os tokens que o bloco do theme.css troca', () => {
    const m = media({ forced: true });
    stubDom(false, { matchMedia: m.matchMedia });
    const el = fakeElement();
    applyRteTheme(el, { primary: '#0ea5e9', mode: 'light' });
    for (const name of FORCED_COLORS_TOKENS)
      expect(el.props.has(name), name).toBe(false);
    expect(el.props.get('--rte-primary-hover')).toMatch(/^#[0-9a-f]{6}$/);
    expect(el.props.get('--rte-primary-subtle')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('em prefers-contrast: more a borda é o texto secundário (como o CSS)', () => {
    const m = media({ contrast: true });
    stubDom(false, { matchMedia: m.matchMedia });
    const el = fakeElement();
    applyRteTheme(el, { primary: '#0ea5e9', mode: 'light' });
    const muted = el.props.get('--rte-text-muted');
    expect(muted).toMatch(/^#[0-9a-f]{6}$/);
    expect(el.props.get('--rte-border')).toBe(muted);
    expect(muted).not.toBe(
      createRteTheme({ primary: '#0ea5e9' })['--rte-border'],
    );
    expect(el.props.has('--rte-focus-width')).toBe(false);
  });

  it('forced-colors vence prefers-contrast: borda continua de fora', () => {
    const m = media({ forced: true, contrast: true });
    stubDom(false, { matchMedia: m.matchMedia });
    const el = fakeElement();
    applyRteTheme(el, { mode: 'dark' });
    expect(el.props.has('--rte-border')).toBe(false);
  });

  it('repinta quando as preferências mudam e o cleanup remove os mesmos handlers', () => {
    const m = media();
    stubDom(false, { matchMedia: m.matchMedia });
    const el = fakeElement();
    const cleanup = applyRteTheme(el, { mode: 'dark' });
    const normal = el.props.get('--rte-border');
    expect(normal).toMatch(/^#[0-9a-f]{6}$/);
    // modo forçado: não assina prefers-color-scheme, mas assina as duas de acessibilidade
    expect(m.dark.mql.addEventListener).not.toHaveBeenCalled();
    expect(m.forced.mql.addEventListener).toHaveBeenCalledTimes(1);
    expect(m.contrast.mql.addEventListener).toHaveBeenCalledTimes(1);

    m.contrast.mql.matches = true;
    for (const l of m.contrast.listeners) l({ matches: true });
    expect(el.props.get('--rte-border')).toBe(el.props.get('--rte-text-muted'));

    m.forced.mql.matches = true;
    for (const l of m.forced.listeners) l({ matches: true });
    for (const name of FORCED_COLORS_TOKENS)
      expect(el.props.has(name), name).toBe(false);

    m.forced.mql.matches = false;
    m.contrast.mql.matches = false;
    for (const l of m.forced.listeners) l({ matches: false });
    expect(el.props.get('--rte-border')).toBe(normal);

    const fh = m.forced.mql.addEventListener.mock.calls[0]?.[1];
    const ch = m.contrast.mql.addEventListener.mock.calls[0]?.[1];
    cleanup();
    expect(m.forced.mql.removeEventListener).toHaveBeenCalledWith('change', fh);
    expect(m.contrast.mql.removeEventListener).toHaveBeenCalledWith(
      'change',
      ch,
    );
    expect(m.forced.listeners.size).toBe(0);
    expect(m.contrast.listeners.size).toBe(0);
    expect(el.props.size).toBe(0);
  });

  it('auto assina as três consultas; matchMedia que lança não quebra', () => {
    const m = media();
    stubDom(false, { matchMedia: m.matchMedia });
    applyRteTheme(fakeElement(), { mode: 'auto' })();
    for (const q of [m.dark, m.forced, m.contrast]) {
      expect(q.mql.addEventListener).toHaveBeenCalledTimes(1);
      expect(q.mql.removeEventListener).toHaveBeenCalledTimes(1);
    }
    stubDom(false, {
      matchMedia: () => {
        throw new Error('x');
      },
    });
    const el = fakeElement();
    expect(() => applyRteTheme(el, { mode: 'auto' })()).not.toThrow();
  });
});
