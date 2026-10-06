/** `URL` da janela do editor (*object URLs* da miniatura, E16). */
function urlsOf(view: Window | null): typeof URL | null {
  return (view as (Window & { URL?: typeof URL }) | null)?.URL ?? null;
}

/** Miniatura local (E16): só no marcador; `null` sem `createObjectURL`. */
export function createPreview(view: Window | null, file: File): string | null {
  const urls = urlsOf(view);
  return typeof urls?.createObjectURL === 'function'
    ? urls.createObjectURL(file)
    : null;
}

/** Revoga a miniatura ao fim do envio, por qualquer caminho. */
export function revokePreview(view: Window | null, url: string): void {
  urlsOf(view)?.revokeObjectURL(url);
}
