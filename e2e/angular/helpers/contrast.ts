import type { Page } from '@playwright/test';

/** Canais sRGB (0-255) e alfa de uma cor computada `rgb()/rgba()` (ou `color(srgb ...)`). */
function parseColor(color: string): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  const text = color.trim();
  const srgb =
    /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\)$/.exec(
      text,
    );
  if (srgb) {
    const alpha = srgb[4] ?? '1';
    return {
      r: Number(srgb[1]) * 255,
      g: Number(srgb[2]) * 255,
      b: Number(srgb[3]) * 255,
      a: alpha.endsWith('%') ? Number.parseFloat(alpha) / 100 : Number(alpha),
    };
  }
  const rgb =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(
      text,
    );
  if (!rgb) throw new Error(`cor computada não suportada: ${color}`);
  const alpha = rgb[4] ?? '1';
  return {
    r: Number(rgb[1]),
    g: Number(rgb[2]),
    b: Number(rgb[3]),
    a: alpha.endsWith('%') ? Number.parseFloat(alpha) / 100 : Number(alpha),
  };
}

function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Razão de contraste WCAG 2 entre duas cores computadas (`rgb()/rgba()`), de 1 a 21. */
export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(parseColor(fg));
  const b = luminance(parseColor(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Converte qualquer cor CSS computada (o tema usa `oklch()`) para `rgb(r, g, b)` com um
 * pixel de canvas, no próprio navegador.
 */
export function toRgb(page: Page, color: string): Promise<string> {
  return page.evaluate((value) => {
    const context = document.createElement('canvas').getContext('2d', {
      willReadFrequently: true,
    });
    if (!context) throw new Error('sem canvas 2d');
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
  }, color);
}

/**
 * Cor de fundo efetiva (em `rgb()`) do primeiro elemento de `selector`: a do primeiro
 * ancestral (ele mesmo incluído) com fundo não transparente; branco se nenhum tiver.
 */
export async function effectiveBackground(
  page: Page,
  selector: string,
): Promise<string> {
  const color = await page.evaluate((sel) => {
    let node: Element | null = document.querySelector(sel);
    if (!node) throw new Error(`sem elemento para ${sel}`);
    while (node) {
      const value = getComputedStyle(node).backgroundColor;
      if (value !== 'transparent' && !/\/ 0\)$|, 0\)$/.test(value))
        return value;
      node = node.parentElement;
    }
    return 'rgb(255, 255, 255)';
  }, selector);
  return toRgb(page, color);
}
