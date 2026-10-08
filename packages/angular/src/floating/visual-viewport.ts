/** Retângulo da viewport em coordenadas de layout (`position: fixed`). */
export interface RteViewportRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Viewport em que as camadas do pacote (`position: fixed`) são posicionadas
 * (spec 08b O7): a **visual** (`offsetLeft`, `offsetTop`, `width`, `height` de
 * `visualViewport`, que no iOS é a única a encolher com o teclado virtual e a
 * que muda com a pinça) quando existir; senão a de layout, como antes
 * (`documentElement.clientWidth/Height`, com `innerWidth/innerHeight` de
 * reserva).
 */
export function readViewport(view: Window): RteViewportRect {
  const visual = view.visualViewport;
  if (visual && visual.width > 0 && visual.height > 0) {
    return {
      top: visual.offsetTop,
      left: visual.offsetLeft,
      width: visual.width,
      height: visual.height,
    };
  }
  const root = view.document.documentElement;
  return {
    top: 0,
    left: 0,
    width: root.clientWidth || view.innerWidth,
    height: root.clientHeight || view.innerHeight,
  };
}
