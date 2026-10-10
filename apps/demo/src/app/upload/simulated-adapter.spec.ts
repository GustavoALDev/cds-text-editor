import { RteUploadError } from '@comodeviaser/rte-angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSimulatedAdapter,
  SAMPLE_IMAGE_URL,
  SIMULATED_DURATION_MS,
  SIMULATED_SLOW_DURATION_MS,
} from './simulated-adapter';

function fakeFile() {
  const file = new File(['conteudo'], 'foto.png', { type: 'image/png' });
  // jsdom não tem arrayBuffer/stream/text no File: instala sentinelas próprias.
  const reads = ['arrayBuffer', 'stream', 'text', 'slice'].map((name) => {
    const spy = vi.fn();
    Object.defineProperty(file, name, { value: spy, configurable: true });
    return spy;
  });
  return { file, reads };
}

const ctx = (signal = new AbortController().signal, seen?: unknown[]) => ({
  signal,
  onProgress: (f: number | null) => seen?.push(f),
});

describe('adaptador simulado', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('progresso monotônico até 100% e devolve a imagem de exemplo', async () => {
    const { file } = fakeFile();
    const seen: number[] = [];
    const promise = createSimulatedAdapter().uploadImage(file, {
      signal: new AbortController().signal,
      onProgress: (f) => seen.push(f as number),
    });
    await vi.advanceTimersByTimeAsync(SIMULATED_DURATION_MS + 50);
    await expect(promise).resolves.toEqual({ url: SAMPLE_IMAGE_URL });
    expect(seen.length).toBeGreaterThan(3);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1] as number);
    }
    expect(seen.at(-1)).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('abort rejeita e para o temporizador', async () => {
    const { file } = fakeFile();
    const controller = new AbortController();
    const settled = createSimulatedAdapter()
      .uploadImage(file, ctx(controller.signal))
      .catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(400);
    controller.abort();
    expect(((await settled) as Error).name).toBe('AbortError');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('já abortado rejeita sem criar temporizador', async () => {
    const { file } = fakeFile();
    const controller = new AbortController();
    controller.abort();
    await expect(
      createSimulatedAdapter().uploadImage(file, ctx(controller.signal)),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('"falhar" rejeita com RteUploadError no meio do caminho', async () => {
    const { file } = fakeFile();
    const settled = createSimulatedAdapter({ fail: () => true })
      .uploadImage(file, ctx())
      .catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(SIMULATED_DURATION_MS + 50);
    const error = await settled;
    expect(error).toBeInstanceOf(RteUploadError);
    expect((error as RteUploadError).reason).toBe('server');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('"lento" demora mais que o normal', async () => {
    const { file } = fakeFile();
    let done = false;
    void createSimulatedAdapter({ slow: () => true })
      .uploadImage(file, ctx())
      .then(() => (done = true));
    await vi.advanceTimersByTimeAsync(SIMULATED_DURATION_MS + 50);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(SIMULATED_SLOW_DURATION_MS);
    expect(done).toBe(true);
  });

  it('nunca lê o conteúdo do arquivo', async () => {
    const { file, reads } = fakeFile();
    const spies = [
      ...reads,
      vi.spyOn(FileReader.prototype, 'readAsArrayBuffer'),
      vi.spyOn(FileReader.prototype, 'readAsText'),
      vi.spyOn(FileReader.prototype, 'readAsDataURL'),
    ];
    const promise = createSimulatedAdapter().uploadImage(file, ctx());
    await vi.advanceTimersByTimeAsync(SIMULATED_DURATION_MS + 50);
    await promise;
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('não oferece uploadVideo', () => {
    expect(createSimulatedAdapter().uploadVideo).toBeUndefined();
  });
});
