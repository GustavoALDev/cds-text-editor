import { createRteTheme } from './create-theme';
import type { RteTheme, RteThemeMode } from './types';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const MODE_ATTR = 'data-rte-mode';

export type ApplyRteThemeOptions = RteTheme & {
  /** Usa o plano B (variáveis calculadas em JS) mesmo com suporte nativo. */
  force?: boolean;
};

type MediaListener = (event: { matches: boolean }) => void;

interface MediaQueryLike {
  matches: boolean;
  addEventListener?: (type: string, listener: MediaListener) => void;
  removeEventListener?: (type: string, listener: MediaListener) => void;
  addListener?: (listener: MediaListener) => void;
  removeListener?: (listener: MediaListener) => void;
}

/** Cleanup vigente por elemento: reaplicar no mesmo elemento descarta a aplicação anterior. */
const active = new WeakMap<object, () => void>();

const noop = (): void => undefined;

function hasDom(): boolean {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}

function getMedia(): MediaQueryLike | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return null;
  try {
    return window.matchMedia(DARK_QUERY) as unknown as MediaQueryLike;
  } catch {
    return null;
  }
}

/**
 * `true` só se o navegador entende cores relativas, `light-dark()` e `@property` (o que o
 * theme.css exige). Em Node/SSR ou diante de qualquer erro, `false`.
 */
export function supportsRelativeColors(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function')
    return false;
  if (typeof CSSPropertyRule === 'undefined') return false;
  try {
    return (
      CSS.supports('color', 'color(from red srgb-linear calc(r) g b)') &&
      CSS.supports('color', 'light-dark(red, blue)')
    );
  } catch {
    return false;
  }
}

/**
 * Resolve o modo para claro/escuro (plano B). `undefined` equivale a `auto`.
 * - `auto`: `prefers-color-scheme` (claro sem `matchMedia`).
 * - `inherit`: `color-scheme` calculado do `<html>`; só `dark` -> escuro, só `light`/vazio -> claro.
 *   Limitação: se o site declara `light dark`, o valor segue o sistema, então usa `matchMedia`.
 *   Mudanças do tema do site (classe/atributo) não são observadas: reinvoque `applyRteTheme`.
 */
export function resolveMode(mode: RteThemeMode | undefined): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  const system = (): 'light' | 'dark' =>
    getMedia()?.matches === true ? 'dark' : 'light';
  if (mode !== 'inherit') return system();
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function')
    return 'light';
  let scheme = '';
  try {
    scheme = String(
      getComputedStyle(document.documentElement).colorScheme ?? '',
    );
  } catch {
    scheme = '';
  }
  const dark = scheme.includes('dark');
  const light = scheme.includes('light');
  if (dark && light) return system();
  return dark ? 'dark' : 'light';
}

/**
 * Aplica o tema no elemento. Com suporte nativo, define só as sementes (texto original) e o
 * modo, e o theme.css deriva o resto; sem suporte (ou com `force`), calcula tudo em JS (plano B)
 * e define cada variável via `style.setProperty` (compatível com CSP). Sem DOM (SSR) não faz nada.
 * Reaplicar no mesmo elemento descarta a aplicação anterior. Devolve o cleanup, que remove
 * listeners e exatamente as propriedades/atributos definidos.
 */
export function applyRteTheme(
  element: HTMLElement,
  options: ApplyRteThemeOptions = {},
): () => void {
  if (!hasDom()) return noop;
  active.get(element)?.();

  const props = new Set<string>();
  const attrs = new Set<string>();
  const setProp = (name: string, value: string): void => {
    element.style.setProperty(name, value);
    props.add(name);
  };
  const { mode } = options;
  if (mode !== undefined) {
    element.setAttribute(MODE_ATTR, mode);
    attrs.add(MODE_ATTR);
  }

  let unsubscribe: () => void = noop;

  if (supportsRelativeColors() && !options.force) {
    for (const role of ['primary', 'secondary', 'tertiary'] as const) {
      const value = options[role];
      if (value !== undefined) setProp(`--rte-${role}`, value);
    }
    if (options.neutral === 'gray') setProp('--rte-neutral-tint', '0');
  } else {
    const paint = (): void => {
      const dark = resolveMode(mode) === 'dark';
      const vars = createRteTheme({ ...options, dark });
      for (const [name, value] of Object.entries(vars)) setProp(name, value);
      setProp('color-scheme', dark ? 'dark' : 'light');
    };
    paint();
    if (mode === undefined || mode === 'auto' || mode === 'inherit') {
      const media = getMedia();
      if (media) {
        const handler: MediaListener = () => paint();
        if (typeof media.addEventListener === 'function') {
          media.addEventListener('change', handler);
          unsubscribe = () => media.removeEventListener?.('change', handler);
        } else if (typeof media.addListener === 'function') {
          media.addListener(handler);
          unsubscribe = () => media.removeListener?.(handler);
        }
      }
    }
  }

  const cleanup = (): void => {
    unsubscribe();
    unsubscribe = noop;
    for (const name of props) element.style.removeProperty(name);
    for (const name of attrs) element.removeAttribute(name);
    props.clear();
    attrs.clear();
    if (active.get(element) === cleanup) active.delete(element);
  };
  active.set(element, cleanup);
  return cleanup;
}
