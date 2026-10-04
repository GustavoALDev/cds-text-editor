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
