import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam os entries pelo alias público
import { httpUploadAdapter } from '@cds/rte-angular/upload';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  installFakeXhr,
  type FakeXhrRequest,
} from './testing-support/fake-xhr';
import { workspacePath } from './testing-support/workspace';

const png = () => new File(['x'], 'a.png', { type: 'image/png' });
const mp4 = () => new File(['x'], 'a.mp4', { type: 'video/mp4' });
const ctx = (signal = new AbortController().signal) => ({
  signal,
  onProgress: (): void => undefined,
});
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const ignore = () => undefined;
let fake: ReturnType<typeof installFakeXhr>;
const at = (i: number): FakeXhrRequest => fake.requests[i]!;

describe('httpUploadAdapter', () => {
  beforeEach(() => {
    fake = installFakeXhr();
  });
  afterEach(() => fake.restore());

  it('envia FormData com arquivo e kind por POST', async () => {
    const a = httpUploadAdapter({ endpoint: '/up' });
    const p = a.uploadImage(png(), ctx());
    await tick();
    const r = at(0);
    expect(r.method).toBe('POST');
    expect(r.url).toBe('/up');
    expect((r.body!.get('file') as File).name).toBe('a.png');
    expect(r.body!.get('kind')).toBe('image');
    r.respond(200, '{"url":"https://x/a.png"}');
    await expect(p).resolves.toEqual({ url: 'https://x/a.png' });
  });

  it('usa fieldName configurado e kind video', async () => {
    const a = httpUploadAdapter({ endpoint: '/up', fieldName: 'upload' });
    void a.uploadVideo!(mp4(), ctx()).catch(ignore);
    await tick();
    const r = at(0);
    expect(r.body!.get('upload')).toBeInstanceOf(File);
    expect(r.body!.get('file')).toBeNull();
    expect(r.body!.get('kind')).toBe('video');
  });

  it('endpoint por tipo e sem uploadVideo sem video', async () => {
    const a = httpUploadAdapter({ endpoint: { image: '/i', video: '/v' } });
    void a.uploadImage(png(), ctx()).catch(ignore);
    void a.uploadVideo!(mp4(), ctx()).catch(ignore);
    await tick();
    expect(fake.requests.map((r) => r.url)).toEqual(['/i', '/v']);
    expect(httpUploadAdapter({ endpoint: { image: '/i' } }).uploadVideo).toBe(
      undefined,
    );
  });

  it('headers função (sync e Promise) chamada a cada envio', async () => {
    let n = 0;
    const a = httpUploadAdapter({
      endpoint: '/up',
      headers: () => ({ Authorization: `t${++n}` }),
    });
    void a.uploadImage(png(), ctx()).catch(ignore);
    void a.uploadImage(png(), ctx()).catch(ignore);
    await tick();
    expect(n).toBe(2);
    expect(fake.requests.map((r) => r.headers['Authorization'])).toEqual([
      't1',
      't2',
    ]);
    let m = 0;
    const b = httpUploadAdapter({
      endpoint: '/up',
      headers: () => Promise.resolve({ 'X-A': `p${++m}` }),
    });
    void b.uploadImage(png(), ctx()).catch(ignore);
    await tick();
    expect(at(2).headers['X-A']).toBe('p1');
  });

  it('headers objeto', async () => {
    const a = httpUploadAdapter({ endpoint: '/up', headers: { 'X-K': 'v' } });
    void a.uploadImage(png(), ctx()).catch(ignore);
    await tick();
    expect(at(0).headers['X-K']).toBe('v');
  });

  it('headers não sobrescreve Content-Type (o boundary do multipart é do navegador)', async () => {
    const a = httpUploadAdapter({
      endpoint: '/up',
      headers: {
        'Content-Type': 'application/json',
        'content-type': 'text/plain',
        'X-K': 'v',
      },
    });
    void a.uploadImage(png(), ctx()).catch(ignore);
    await tick();
    const names = Object.keys(at(0).headers).map((n) => n.toLowerCase());
    expect(names).not.toContain('content-type');
    expect(at(0).headers['X-K']).toBe('v');
  });

  it('withCredentials e timeout', async () => {
    const a = httpUploadAdapter({ endpoint: '/up' });
    void a.uploadImage(png(), ctx()).catch(ignore);
    const b = httpUploadAdapter({
      endpoint: '/up',
      withCredentials: true,
      timeoutMs: 5000,
    });
    void b.uploadImage(png(), ctx()).catch(ignore);
    await tick();
    expect(at(0).withCredentials).toBe(false);
    expect(at(0).timeout).toBe(0);
    expect(at(1).withCredentials).toBe(true);
    expect(at(1).timeout).toBe(5000);
  });

  it('progresso: determinado e indeterminado', async () => {
    const seen: (number | null)[] = [];
    const a = httpUploadAdapter({ endpoint: '/up' });
    void a
      .uploadImage(png(), { ...ctx(), onProgress: (f) => seen.push(f) })
      .catch(ignore);
    await tick();
    at(0).progress(25, 100, true);
    at(0).progress(10, 0, false);
    expect(seen).toEqual([0.25, null]);
  });

  it('cancelar chama xhr.abort() e rejeita com AbortError', async () => {
    const ac = new AbortController();
    const a = httpUploadAdapter({ endpoint: '/up' });
    const p = a.uploadImage(png(), ctx(ac.signal));
    await tick();
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    await expect(p).rejects.toBeInstanceOf(DOMException);
    expect(at(0).aborted).toBe(true);
  });

  it('signal já abortado: nenhuma requisição', async () => {
    const ac = new AbortController();
    ac.abort();
    const a = httpUploadAdapter({ endpoint: '/up' });
    await expect(a.uploadImage(png(), ctx(ac.signal))).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fake.requests).toHaveLength(0);
  });

  it('abortar durante a espera dos headers não envia', async () => {
    const ac = new AbortController();
    const a = httpUploadAdapter({
      endpoint: '/up',
      headers: () => Promise.resolve({}),
    });
    const p = a.uploadImage(png(), ctx(ac.signal));
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    await tick();
    expect(fake.requests.every((r) => r.body === null)).toBe(true);
  });

  async function fail(
    options: Parameters<typeof httpUploadAdapter>[0],
    act: (r: FakeXhrRequest) => void,
  ) {
    const p = httpUploadAdapter(options).uploadImage(png(), ctx());
    await tick();
    act(at(fake.requests.length - 1));
    return p.then(
      () => null,
      (e: unknown) => e as { name: string; reason: string },
    );
  }

  it('erros tipados com a marca RteUploadError', async () => {
    const cases: [string, (r: FakeXhrRequest) => void][] = [
      ['network', (r) => r.fail()],
      ['network', (r) => r.fireTimeout()],
      ['server', (r) => r.respond(404, '')],
      ['server', (r) => r.respond(500, '{}')],
      ['response', (r) => r.respond(200, '{')],
      ['response', (r) => r.respond(200, '{"url":1}')],
      ['response', (r) => r.respond(200, 'null')],
    ];
    for (const [reason, act] of cases) {
      const e = await fail({ endpoint: '/up' }, act);
      expect(e).toMatchObject({ name: 'RteUploadError', reason });
    }
  });

  it('mapResponse que lança → response', async () => {
    const e = await fail(
      {
        endpoint: '/up',
        mapResponse: () => {
          throw new Error('x');
        },
      },
      (r) => r.respond(200, '{}'),
    );
    expect(e).toMatchObject({ name: 'RteUploadError', reason: 'response' });
  });

  it('mapResponse recebe o corpo e a informação', async () => {
    let got: unknown;
    const f = png();
    const p = httpUploadAdapter({
      endpoint: '/up',
      mapResponse: (body, info) => {
        got = [body, info];
        return { url: 'https://x/y' };
      },
    }).uploadImage(f, ctx());
    await tick();
    at(0).respond(201, '{"a":1}');
    await expect(p).resolves.toEqual({ url: 'https://x/y' });
    expect(got).toEqual([{ a: 1 }, { file: f, kind: 'image' }]);
  });

  it('mapResponse padrão lê só as chaves conhecidas', async () => {
    const p = httpUploadAdapter({ endpoint: '/up' }).uploadImage(png(), ctx());
    await tick();
    const known = {
      url: 'https://x/a.png',
      width: 10,
      height: 20,
      srcset: 'a 1x',
      sizes: '100vw',
      poster: 'https://x/p.png',
    };
    at(0).respond(200, JSON.stringify({ ...known, extra: 'no' }));
    await expect(p).resolves.toEqual(known);
  });

  it('o código do entry não importa valores de @angular nem do principal', () => {
    const dir = workspacePath('packages/angular/upload/src');
    for (const f of readdirSync(dir, { recursive: true }) as string[]) {
      if (!f.endsWith('.ts')) continue;
      const src = readFileSync(join(dir, f), 'utf8');
      const bad = src
        .split('\n')
        .filter(
          (l) =>
            /^\s*(import|export)\b/.test(l) &&
            !/^\s*(import|export)\s+type\b/.test(l) &&
            /['"](@angular\/|@cds\/rte-angular['"/])/.test(l),
        );
      expect(bad, f).toEqual([]);
    }
  });
});
