import { vi } from 'vitest';

/** Uma escrita em `cssText`, vista pelo espião. */
export interface CssWrite {
  /** Dono da declaração, se já estava no documento na hora da escrita. */
  owner: Element | null;
  target: CSSStyleDeclaration;
  value: string;
}

/**
 * Espião no *setter* de `cssText`. O jsdom também escreve `cssText` ao
 * analisar o atributo `style` (`_attrModified`), mas isso acontece no
 * fragmento ainda desligado do `[innerHTML]`; só a reaplicação da diretiva
 * escreve em elementos já no documento — é o que `owner` separa.
 */
export function spyCssText(): CssWrite[] {
  const calls: CssWrite[] = [];
  const proto = CSSStyleDeclaration.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'cssText')!;
  vi.spyOn(proto, 'cssText', 'set').mockImplementation(function (
    this: CSSStyleDeclaration,
    value: string,
  ) {
    const owner =
      [...document.querySelectorAll<HTMLElement>('*')].find(
        (e) => e.style === this,
      ) ?? null;
    calls.push({ owner, target: this, value });
    desc.set!.call(this, value);
  });
  return calls;
}

/**
 * Simula o Gecko sob CSP sem `'unsafe-inline'`: o atributo `style` existe, mas
 * lê vazio (achado da L2).
 */
export function blankStyleAttributes(): void {
  const get = Element.prototype.getAttribute;
  vi.spyOn(Element.prototype, 'getAttribute').mockImplementation(function (
    this: Element,
    name: string,
  ) {
    return name === 'style' ? '' : get.call(this, name);
  });
}
