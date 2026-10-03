// Ajudante de testes do editor (fora do build). Ao importar, supre no jsdom só
// o que falta para o prosemirror-view e o NodeView de imagem (spec 03b, §7.1).

type RectLike = Omit<DOMRect, 'toJSON'> & { toJSON(): unknown };

function emptyRect(): RectLike {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON() {
      return {};
    },
  };
}

if (typeof document !== 'undefined') {
  const range = globalThis.Range?.prototype as Partial<Range> | undefined;
  if (range && typeof range.getClientRects !== 'function') {
    range.getClientRects = function getClientRects() {
      return Object.assign([] as RectLike[], {
        item: () => null,
      }) as unknown as DOMRectList;
    };
  }
  if (range && typeof range.getBoundingClientRect !== 'function') {
    range.getBoundingClientRect = function getBoundingClientRect() {
      return emptyRect() as DOMRect;
    };
  }
  if (typeof document.elementFromPoint !== 'function') {
    document.elementFromPoint = () => null;
  }
  if (
    typeof (globalThis as { PointerEvent?: unknown }).PointerEvent !==
      'function' &&
    typeof MouseEvent === 'function'
  ) {
    class PointerEventStub extends MouseEvent {
      readonly pointerId: number;

      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    (globalThis as { PointerEvent?: unknown }).PointerEvent = PointerEventStub;
  }
}

export {};
