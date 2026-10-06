/** Conteúdo de um `DataTransfer` falso: arquivos e textos por tipo. */
export interface FakeTransferData {
  readonly files?: readonly File[];
  readonly text?: string;
  readonly html?: string;
}

/**
 * `DataTransfer` mínimo para o jsdom (que não o implementa): `types` como o
 * navegador (`'Files'` com arquivos), `getData`/`setData` e `files`.
 */
export class FakeDataTransfer {
  private readonly data = new Map<string, string>();
  readonly files: readonly File[];
  dropEffect = 'none';
  effectAllowed = 'all';

  constructor(o: FakeTransferData = {}) {
    this.files = Object.freeze([...(o.files ?? [])]);
    if (o.text !== undefined) this.data.set('text/plain', o.text);
    if (o.html !== undefined) this.data.set('text/html', o.html);
  }

  get types(): readonly string[] {
    return [...this.data.keys(), ...(this.files.length ? ['Files'] : [])];
  }

  getData(type: string): string {
    return this.data.get(type) ?? '';
  }

  setData(type: string, value: string): void {
    this.data.set(type, value);
  }

  clearData(): void {
    this.data.clear();
  }
}

/**
 * Calço do `DataTransfer` (spec 05c2a, Ruling 10): instala o
 * {@link FakeDataTransfer} como global quando o ambiente não tem um; devolve a
 * função que restaura (no-op quando já havia).
 */
export function installDataTransferShim(): () => void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g['DataTransfer'] === 'function') return () => undefined;
  g['DataTransfer'] = FakeDataTransfer;
  return () => {
    delete g['DataTransfer'];
  };
}

/** Despacha um `paste` cancelável com `clipboardData`; devolve o evento. */
export function dispatchPaste(target: Element, o: FakeTransferData): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: new FakeDataTransfer(o),
  });
  target.dispatchEvent(event);
  return event;
}

/**
 * Despacha `type` (`dragenter`, `dragover` ou `drop`) cancelável com
 * `dataTransfer` e as coordenadas; devolve o evento.
 */
export function dispatchDrag(
  target: Element,
  type: 'dragenter' | 'dragover' | 'drop',
  o: FakeTransferData,
  point: { x: number; y: number } = { x: 10, y: 10 },
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: new FakeDataTransfer(o) },
    clientX: { value: point.x },
    clientY: { value: point.y },
  });
  target.dispatchEvent(event);
  return event;
}
