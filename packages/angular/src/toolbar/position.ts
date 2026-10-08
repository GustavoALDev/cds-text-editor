/** Margem mínima, em px CSS, entre o menu e as bordas da viewport (U7). */
export const RTE_MENU_MARGIN = 8;

/** Posição do menu em coordenadas da viewport (`position: fixed`). */
export interface RteMenuPlacement {
  left: number;
  top: number;
  maxHeight: number;
  placement: 'below' | 'above';
}

/**
 * Posição de um menu ancorado a um botão (U7), função pura sobre os
 * retângulos medidos: abaixo do botão (`top = trigger.bottom`), alinhado ao
 * início (`left`, ou `right - width` em `rtl`); vira para cima quando o menu
 * não cabe abaixo e sobra mais espaço acima; `left` fica em
 * `[8, viewport.width - 8 - width]` (prevalece o 8 se o menu for mais largo
 * que a viewport); `maxHeight` é o espaço do lado escolhido menos a margem.
 */
export function positionMenu(i: {
  trigger: { top: number; bottom: number; left: number; right: number };
  menu: { width: number; height: number };
  viewport: { width: number; height: number };
  rtl: boolean;
}): RteMenuPlacement {
  const { trigger, menu, viewport, rtl } = i;
  const m = RTE_MENU_MARGIN;
  const spaceBelow = viewport.height - trigger.bottom;
  const spaceAbove = trigger.top;
  const fitsBelow = menu.height <= spaceBelow - m;
  const placement = !fitsBelow && spaceAbove > spaceBelow ? 'above' : 'below';
  const maxHeight = Math.max(
    0,
    (placement === 'below' ? spaceBelow : spaceAbove) - m,
  );
  const top =
    placement === 'below'
      ? trigger.bottom
      : trigger.top - Math.min(menu.height, maxHeight);
  const start = rtl ? trigger.right - menu.width : trigger.left;
  const left = Math.max(m, Math.min(start, viewport.width - m - menu.width));
  return { left, top, maxHeight, placement };
}

/** Espaço, em px CSS, entre o menu flutuante e a âncora (M9). */
export const RTE_FLOATING_GAP = 8;

/** Retângulo em coordenadas da viewport. */
export interface RteRect {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * Viewport em coordenadas de layout; `left`/`top` (padrão 0) deslocam a
 * viewport visual em relação à de layout (spec 08b O7).
 */
export interface RteViewportBox {
  readonly left?: number;
  readonly top?: number;
  readonly width: number;
  readonly height: number;
}

/** Posição do menu flutuante em coordenadas da viewport (`position: fixed`). */
export interface RteFloatingPlacement {
  left: number;
  top: number;
  placement: 'above' | 'below' | 'overlay';
}

/**
 * Posição de um menu flutuante junto a uma âncora (M9), função pura: tenta o
 * lado preferido e depois o outro, cada um medido contra a viewport (margem
 * de 8) e a área visível; sem lado que caiba, `overlay` no topo da parte
 * visível da âncora. Horizontal centrado na âncora, em
 * `[8, viewport.width - 8 - width]` (prevalece o 8); independe de `dir`.
 */
export function positionFloating(i: {
  anchor: RteRect;
  visible: RteRect;
  menu: { width: number; height: number };
  viewport: RteViewportBox;
  prefer: 'above' | 'below';
}): RteFloatingPlacement {
  const { anchor, visible, menu, viewport, prefer } = i;
  const m = RTE_MENU_MARGIN;
  const gap = RTE_FLOATING_GAP;
  const vTop = viewport.top ?? 0;
  const vLeft = viewport.left ?? 0;
  const aboveTop = anchor.top - gap - menu.height;
  const belowTop = anchor.bottom + gap;
  const fits = {
    above: aboveTop >= Math.max(vTop + m, visible.top),
    below:
      belowTop + menu.height <=
      Math.min(vTop + viewport.height - m, visible.bottom),
  };
  const center = (anchor.left + anchor.right) / 2;
  const left = Math.max(
    vLeft + m,
    Math.min(center - menu.width / 2, vLeft + viewport.width - m - menu.width),
  );
  const other = prefer === 'above' ? 'below' : 'above';
  const side = fits[prefer] ? prefer : fits[other] ? other : null;
  if (side === null) {
    return {
      left,
      top: Math.max(anchor.top, visible.top) + gap,
      placement: 'overlay',
    };
  }
  return { left, top: side === 'above' ? aboveTop : belowTop, placement: side };
}
