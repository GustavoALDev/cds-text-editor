/** Medidas fingidas de um elemento observado. */
export interface FakeSize {
  scrollWidth: number;
  clientWidth: number;
}

/** Controle do `ResizeObserver` falso (H7). */
export interface FakeResizeObserverControl {
  /**
   * Fixa `scrollWidth`/`clientWidth` dos elementos e entrega, a cada
   * observador vivo, as entradas dos que ele observa (como o navegador faz
   * quando o tamanho muda).
   */
  trigger(sizes: Map<Element, FakeSize>): void;
  /** Elementos observados agora (todos os observadores vivos). */
  observed(): Element[];
  /** Quantas vezes algum observador chamou `disconnect()`. */
  disconnects(): number;
  /** Devolve o `ResizeObserver`, `scrollWidth` e `clientWidth` originais. */
  restore(): void;
}

interface ZoneLike {
  run<T>(fn: () => T): T;
}

function currentZone(): ZoneLike | null {
  const zone = (globalThis as { Zone?: { current: ZoneLike } }).Zone;
  return zone ? zone.current : null;
}

/**
 * Instala um `ResizeObserver` falso em `globalThis` e torna `scrollWidth` e
 * `clientWidth` controláveis por elemento (o jsdom não faz leiaute e devolve
 * 0). O *callback* roda na zona capturada na construção, como um observador
 * real criado ali (Ruling 6): assim "roda fora da zona Angular" depende de a
 * diretiva criá-lo em `runOutsideAngular`.
 */
export function installFakeResizeObserver(): FakeResizeObserverControl {
  // No ambiente jsdom do Vitest `globalThis` e `document.defaultView` são
  // objetos diferentes; a diretiva lê o `ResizeObserver` do segundo.
  const hosts = [
    ...new Set([globalThis, document.defaultView].filter((w) => w !== null)),
  ] as { ResizeObserver?: unknown }[];
  const saved = hosts.map((h) => ({
    h,
    own: Object.prototype.hasOwnProperty.call(h, 'ResizeObserver'),
    value: h.ResizeObserver,
  }));
  const sizes = new WeakMap<Element, FakeSize>();
  const live = new Set<FakeResizeObserver>();
  let disconnects = 0;

  // Sobrepostos em `HTMLElement.prototype` (o jsdom os define em `Element`):
  // o `restore` só apaga a sobreposição.
  const proto = HTMLElement.prototype;
  Object.defineProperty(proto, 'scrollWidth', {
    configurable: true,
    get(this: Element) {
      return sizes.get(this)?.scrollWidth ?? 0;
    },
  });
  Object.defineProperty(proto, 'clientWidth', {
    configurable: true,
    get(this: Element) {
      return sizes.get(this)?.clientWidth ?? 0;
    },
  });

  class FakeResizeObserver {
    readonly targets = new Set<Element>();
    private readonly zone = currentZone();

    constructor(private readonly callback: ResizeObserverCallback) {
      live.add(this);
    }

    observe(target: Element): void {
      this.targets.add(target);
    }

    unobserve(target: Element): void {
      this.targets.delete(target);
    }

    disconnect(): void {
      disconnects++;
      this.targets.clear();
    }

    deliver(changed: Element[]): void {
      const entries = changed
        .filter((el) => this.targets.has(el))
        .map((target) => ({ target }) as unknown as ResizeObserverEntry);
      if (entries.length === 0) return;
      const run = () =>
        this.callback(entries, this as unknown as ResizeObserver);
      if (this.zone) this.zone.run(run);
      else run();
    }
  }

  for (const h of hosts) h.ResizeObserver = FakeResizeObserver;

  return {
    trigger(next) {
      for (const [el, size] of next) sizes.set(el, size);
      const changed = [...next.keys()];
      for (const observer of [...live]) observer.deliver(changed);
    },
    observed() {
      return [...live].flatMap((o) => [...o.targets]);
    },
    disconnects() {
      return disconnects;
    },
    restore() {
      delete (proto as unknown as Record<string, unknown>)['scrollWidth'];
      delete (proto as unknown as Record<string, unknown>)['clientWidth'];
      for (const { h, own, value } of saved) {
        if (own) h.ResizeObserver = value;
        else delete h.ResizeObserver;
      }
      live.clear();
    },
  };
}
