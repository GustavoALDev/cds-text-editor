/**
 * Reaplica por CSSOM o atributo `style` de cada descendente de `root` que o
 * tenha (H8, pré-voo 9): `el.style.cssText = el.getAttribute('style')`.
 *
 * Sob CSP sem `'unsafe-inline'` o navegador ignora o **atributo** `style`
 * vindo do HTML, mas não a escrita por CSSOM; é a mesma informação que o
 * sanitizador (ou o servidor, em `trusted`) já validou. O próprio `root` (do
 * consumidor) não é tocado. Só no navegador. Devolve quantos reaplicou.
 */
export function restoreContentStyles(root: Element): number {
  let count = 0;
  for (const el of root.querySelectorAll('[style]')) {
    const style = (el as Partial<ElementCSSInlineStyle>).style;
    if (!style) continue;
    style.cssText = el.getAttribute('style') ?? '';
    count++;
  }
  return count;
}
