// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import './editor';

describe('testing/editor: stubs do jsdom', () => {
  it('Range tem getClientRects e getBoundingClientRect', () => {
    const range = document.createRange();
    expect(range.getClientRects()).toHaveLength(0);
    expect(range.getBoundingClientRect().width).toBe(0);
  });

  it('document.elementFromPoint existe', () => {
    expect(typeof document.elementFromPoint).toBe('function');
  });

  it('PointerEvent é um MouseEvent com pointerId', () => {
    const event = new PointerEvent('pointerdown', {
      pointerId: 7,
      clientX: 3,
    });
    expect(event).toBeInstanceOf(MouseEvent);
    expect(event.pointerId).toBe(7);
    expect(event.clientX).toBe(3);
  });
});
