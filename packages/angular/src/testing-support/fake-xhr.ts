/** `XMLHttpRequest` falso para os testes do `httpUploadAdapter` (E24). */
export class FakeXhrRequest {
  method = '';
  url = '';
  body: FormData | null = null;
  readonly headers: Record<string, string> = {};
  withCredentials = false;
  timeout = 0;
  aborted = false;
  status = 0;
  responseText = '';
  readyState = 0;
  readonly upload: { onprogress: ((e: unknown) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
    this.readyState = 1;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  send(body: FormData): void {
    this.body = body;
  }

  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }

  respond(status: number, body: string): void {
    this.status = status;
    this.responseText = body;
    this.readyState = 4;
    this.onload?.();
  }

  progress(loaded: number, total: number, computable: boolean): void {
    this.upload.onprogress?.({ loaded, total, lengthComputable: computable });
  }

  fail(): void {
    this.onerror?.();
  }

  fireTimeout(): void {
    this.ontimeout?.();
  }
}

/** Instala o falso em `globalThis.XMLHttpRequest`; `restore()` devolve o original. */
export function installFakeXhr(): {
  requests: FakeXhrRequest[];
  restore(): void;
} {
  const requests: FakeXhrRequest[] = [];
  const g = globalThis as { XMLHttpRequest?: unknown };
  const original = g.XMLHttpRequest;
  g.XMLHttpRequest = function () {
    const r = new FakeXhrRequest();
    requests.push(r);
    return r;
  };
  return {
    requests,
    restore() {
      g.XMLHttpRequest = original;
    },
  };
}
