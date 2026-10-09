import { parseColor, parseColorPure } from './color/parse';
import { buildRteTheme } from './create-theme';
import { STATIC_TOKENS } from './static-tokens';
import type { RteTheme, RteThemeMode } from './types';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const FORCED_QUERY = '(forced-colors: active)';
const CONTRAST_QUERY = '(prefers-contrast: more)';
const MODE_ATTR = 'data-rte-mode';
const ROLES = ['primary', 'secondary', 'tertiary'] as const;
const SEED_NAMES: readonly string[] = ROLES.map((role) => `--rte-${role}`);

/**
 * Tokens que o bloco `@media (forced-colors: active)` do theme.css troca por cores do sistema. No
 * plano B eles não são escritos inline sob forced-colors (o inline venceria o bloco). Uso interno;
 * `theme-css.spec.ts` confere a lista com o theme.css.
 */
export const FORCED_COLORS_TOKENS = [
  '--rte-border',
  '--rte-focus',
  '--rte-surface',
  '--rte-text',
  '--rte-surface-raised',
  '--rte-text-muted',
  '--rte-primary-border',
  '--rte-secondary-border',
  '--rte-tertiary-border',
] as const;

export type RteApplyThemeOptions = RteTheme & {
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

function getMedia(query = DARK_QUERY): MediaQueryLike | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return null;
  try {
    return (window.matchMedia(query) as unknown as MediaQueryLike) ?? null;
  } catch {
    return null;
  }
}

/** Assina `change` (ou o `addListener` legado) e devolve a função que remove o MESMO handler. */
function subscribe(
  media: MediaQueryLike | null,
  handler: MediaListener,
): () => void {
  if (!media) return noop;
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', handler);
    return () => media.removeEventListener?.('change', handler);
  }
  if (typeof media.addListener === 'function') {
    media.addListener(handler);
    return () => media.removeListener?.(handler);
  }
  return noop;
}

/** Valor computado (aparado) de uma propriedade no elemento; '' se ilegível. */
function computedVar(element: Element, name: string): string {
  try {
    return String(
      getComputedStyle(element).getPropertyValue(name) ?? '',
    ).trim();
  } catch {
    return '';
  }
}

/**
 * Resolve uma cor no contexto do elemento (`var()`, `currentcolor`, nomes, cores do sistema): um
 * filho descartável recebe a cor em `background-color` (não herdado: um valor inválido, inclusive
 * `var()` indefinida, vira transparente, que é rejeitado) e a cor computada é lida. A sonda sai
 * sempre (`finally`); qualquer erro dá `null`.
 */
function resolveInContext(element: HTMLElement, value: string): string | null {
  let probe: HTMLElement | undefined;
  try {
    probe = element.ownerDocument.createElement('span');
    probe.style.setProperty('forced-color-adjust', 'none');
    probe.style.setProperty('background-color', value, 'important');
    element.appendChild(probe);
    const color = String(getComputedStyle(probe).backgroundColor ?? '');
    return parseColor(color) ? color : null;
  } catch {
    return null;
  } finally {
    try {
      if (probe?.parentNode === element) element.removeChild(probe);
    } catch {
      // nada a fazer: o elemento recusou a remoção
    }
  }
}

/**
 * `true` só se o navegador entende tudo o que o theme.css exige: cores relativas em srgb-linear e
 * em oklch (`color(from …)`, `oklch(from …)`), `color-mix(in oklab, …)`, `light-dark()` e
 * `@property`. Em Node/SSR ou diante de qualquer erro, `false`.
 */
export function supportsRelativeColors(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function')
    return false;
  if (typeof CSSPropertyRule === 'undefined') return false;
  try {
    return (
      CSS.supports('color', 'color(from red srgb-linear calc(r) g b)') &&
      CSS.supports('color', 'light-dark(red, blue)') &&
      CSS.supports('color', 'oklch(from red l c h)') &&
      CSS.supports('color', 'color-mix(in oklab, red, blue)')
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
 *
 * Plano B, sementes: uma semente dada é lida pelo parser puro ou, se não der (`var()`, nomes,
 * `currentcolor`, cores do sistema), resolvida no contexto do elemento por um filho-sonda
 * temporário. Semente omitida ou ilegível vale o valor herdado da cascata (`:root`/ancestral) e,
 * sem nenhum, o padrão Angular. É uma FOTO da cascata no momento da aplicação (e de cada
 * repintura por mudança de preferência): a semente resolvida também é gravada inline, então
 * semente e derivados ficam um par consistente; se o `:root`/ancestral mudar depois, chame
 * `applyRteTheme` de novo. Exceção: um `--rte-<papel>` que o próprio usuário pôs inline no
 * elemento é respeitado (os derivados saem dele) e não é gravado nem removido pelo cleanup. O mesmo
 * vale para um token derivado/estático sobrescrito pelo consumidor (CSS em `.rte-root` ou inline);
 * `*-subtle`/`*-border` saem da `--rte-surface` dele, como no theme.css. Plano B, R8: sob `forced-colors: active` os tokens trocados pelo bloco
 * do theme.css não são escritos inline; sob `prefers-contrast: more` a borda recebe o valor do
 * texto secundário. Mudanças dessas preferências repintam.
 */
export function applyRteTheme(
  element: HTMLElement,
  options: RteApplyThemeOptions = {},
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
      // Recomeça do zero: a cascata é lida sem as sementes inline desta aplicação, e tokens que o
      // estado atual não deve escrever (forced-colors) não ficam para trás.
      for (const name of props) element.style.removeProperty(name);
      props.clear();
      const dark = resolveMode(mode) === 'dark';
      const forced = getMedia(FORCED_QUERY)?.matches === true;
      const contrast = !forced && getMedia(CONTRAST_QUERY)?.matches === true;
      const seeds: Partial<Record<(typeof ROLES)[number], string>> = {};
      const authored = new Set<string>();
      for (const role of ROLES) {
        const name = `--rte-${role}`;
        const given = options[role];
        let seed: string | null = null;
        if (given !== undefined)
          seed = parseColorPure(given)
            ? given
            : (resolveInContext(element, given) ??
              (parseColor(given) ? given : null));
        if (seed === null) {
          // Omitido ou ilegível: vale o valor herdado (ancestral/:root ou inline do usuário no
          // próprio elemento); só sem ele, o padrão. Inline que resta após remover os nossos é do
          // usuário: não é sobrescrito.
          const inherited = computedVar(element, name);
          if (inherited && parseColor(inherited)) {
            seed = inherited;
            if (element.style.getPropertyValue(name)) authored.add(name);
          }
        }
        if (seed !== null) seeds[role] = seed;
      }
      // Token derivado que o consumidor sobrescreveu (CSS mirando .rte-root ou inline): é respeitado,
      // como no caminho nativo. Valor do próprio theme.css (fórmula com `from`/`color-mix`, inútil
      // aqui, ou o estático do tema) ou ausente é calculado e gravado.
      const themeOptions = {
        ...(mode !== undefined && { mode }),
        ...(options.neutral !== undefined && { neutral: options.neutral }),
        ...seeds,
        dark,
      };
      let vars = buildRteTheme(themeOptions);
      for (const name of Object.keys(vars)) {
        if (SEED_NAMES.includes(name)) continue;
        const value = computedVar(element, name).replace(/\s+/g, '');
        const key = name.slice(6) as keyof (typeof STATIC_TOKENS)['light'];
        if (
          value &&
          !/from|color-mix\(/.test(value) &&
          value !==
            `light-dark(${STATIC_TOKENS.light[key]},${STATIC_TOKENS.dark[key]})`
        )
          authored.add(name);
      }
      if (authored.has('--rte-surface')) {
        const surface = resolveInContext(element, 'var(--rte-surface)');
        const rgb = surface === null ? null : parseColor(surface);
        if (rgb) vars = buildRteTheme(themeOptions, rgb);
      }
      if (contrast) vars['--rte-border'] = vars['--rte-text-muted'] as string;
      for (const [name, value] of Object.entries(vars)) {
        // A semente vinda da cascata é gravada junto (par semente+derivados consistente), exceto a
        // que o próprio usuário pôs inline no elemento; idem para os tokens derivados sobrescritos.
        if (authored.has(name)) continue;
        if (
          forced &&
          (FORCED_COLORS_TOKENS as readonly string[]).includes(name)
        )
          continue;
        setProp(name, value);
      }
      setProp('color-scheme', dark ? 'dark' : 'light');
    };
    paint();
    const handler: MediaListener = () => paint();
    const queries = [FORCED_QUERY, CONTRAST_QUERY];
    if (mode === undefined || mode === 'auto' || mode === 'inherit')
      queries.unshift(DARK_QUERY);
    const subs = queries.map((q) => subscribe(getMedia(q), handler));
    unsubscribe = () => {
      for (const off of subs) off();
    };
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
