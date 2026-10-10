import type { RteSlashMenuState } from '@comodeviaser/rte-core/extensions';
import { slashListId, slashOptionId } from './state';

const NONE: Readonly<Record<string, string>> = Object.freeze({});

/**
 * Atributos do editável com o menu `/` (K4): só com o menu aberto, com itens
 * e a lista carregada. O editável mantém `role="textbox"`; nada de
 * `role="combobox"` nem `aria-expanded` (inválidos num `textbox` multilinha).
 */
export function slashAriaAttributes(
  state: RteSlashMenuState,
  instance: string,
  listLoaded: boolean,
): Readonly<Record<string, string>> {
  const active = state.items[state.activeIndex];
  if (!state.open || !listLoaded || !active) return NONE;
  return Object.freeze({
    'aria-autocomplete': 'list',
    'aria-controls': slashListId(instance),
    'aria-activedescendant': slashOptionId(instance, active.id),
  });
}

export function sameAttributes(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
  );
}

const NAMES = ['aria-autocomplete', 'aria-controls', 'aria-activedescendant'];

/** Grava `attrs` no elemento e tira os atributos do menu `/` que não estão nele. */
export function applySlashAria(
  el: Element,
  attrs: Readonly<Record<string, string>>,
): void {
  for (const name of NAMES) {
    const value = attrs[name];
    if (value === undefined) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== value) {
      el.setAttribute(name, value);
    }
  }
}
