// @vitest-environment jsdom
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveUploadConfig, type RteResolvedUpload } from './upload/config';
import type { RteUploadConfig } from './upload/types';
import { displayName, validateUploadFile } from './upload/validate';
import { fcOptions } from './testing-support/media-urls';

const MIB = 1024 * 1024;
const adapter = {
  uploadImage: () => Promise.reject(new Error('não usado')),
};
const videoAdapter = { ...adapter, uploadVideo: adapter.uploadImage };

function cfg(
  extra: Partial<RteUploadConfig> = {},
  withVideo = true,
): RteResolvedUpload {
  const resolved = resolveUploadConfig({
    adapter: withVideo ? videoAdapter : adapter,
    ...extra,
  });
  if (!resolved) throw new Error('configuração inválida no teste');
  return resolved;
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

const file = (name: string, type: string, size = 1) => ({ name, type, size });

describe('validateUploadFile (E5, tabela)', () => {
  it.each([
    ['a.png', 'image/png', 1, { ok: true, type: 'image' }],
    ['a.PNG', '', 1, { ok: true, type: 'image' }],
    ['a.avif', '', 1, { ok: true, type: 'image' }],
    ['a.jpeg', '', 1, { ok: true, type: 'image' }],
    ['a.png', 'image/svg+xml', 1, { ok: false, type: 'image', reason: 'type' }],
    ['a.svg', '', 1, { ok: false, type: 'image', reason: 'type' }],
    ['a.txt', 'text/plain', 1, { ok: false, type: 'image', reason: 'type' }],
    ['semextensao', '', 1, { ok: false, type: 'image', reason: 'type' }],
    ['a.png', 'image/png', 10 * MIB, { ok: true, type: 'image' }],
    [
      'a.png',
      'image/png',
      10 * MIB + 1,
      { ok: false, type: 'image', reason: 'size' },
    ],
    ['a.webm', 'video/webm', 200 * MIB, { ok: true, type: 'video' }],
    [
      'a.mp4',
      'video/mp4',
      200 * MIB + 1,
      { ok: false, type: 'video', reason: 'size' },
    ],
    ['a.mp4', '', 1, { ok: true, type: 'video' }],
    ['x.constructor', '', 1, { ok: false, type: 'image', reason: 'type' }],
    ['x.__proto__', '', 1, { ok: false, type: 'image', reason: 'type' }],
    ['x.CONSTRUCTOR', '', 1, { ok: false, type: 'image', reason: 'type' }],
    ['x.toString', '', 1, { ok: false, type: 'image', reason: 'type' }],
    ['x.hasOwnProperty', '', 1, { ok: false, type: 'image', reason: 'type' }],
  ])('%s / "%s" / %d B', (name, type, size, expected) => {
    expect(validateUploadFile(file(name, type, size), cfg())).toEqual(expected);
  });

  it('vídeo sem uploadVideo → type', () => {
    expect(
      validateUploadFile(file('a.webm', 'video/webm'), cfg({}, false)),
    ).toEqual({ ok: false, type: 'video', reason: 'type' });
  });

  it('imageTypes é subconjunto: jpeg fora de [png] → type', () => {
    const c = cfg({ imageTypes: ['image/png'] });
    expect(validateUploadFile(file('a.jpg', 'image/jpeg'), c)).toEqual({
      ok: false,
      type: 'image',
      reason: 'type',
    });
    expect(validateUploadFile(file('a.jpg', ''), c)).toMatchObject({
      ok: false,
      reason: 'type',
    });
  });

  it('svg configurado é descartado com um aviso e continua recusado', () => {
    const c = cfg({ imageTypes: ['image/svg+xml' as never, 'image/png'] });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('[rte-editor]');
    expect(c.imageTypes).toEqual(['image/png']);
    expect(validateUploadFile(file('a.svg', 'image/svg+xml'), c)).toMatchObject(
      { ok: false, reason: 'type' },
    );
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'maxImageBytes %s → padrão com aviso',
    (value) => {
      const c = cfg({ maxImageBytes: value });
      expect(c.maxImageBytes).toBe(10 * MIB);
      expect(warn).toHaveBeenCalledTimes(1);
    },
  );

  it('padrões e limites informados', () => {
    const c = cfg();
    expect(c.maxVideoBytes).toBe(200 * MIB);
    expect(c.maxFilesPerAction).toBe(20);
    expect(c.preview).toBe(false);
    expect(cfg({ maxFilesPerAction: 3 }).maxFilesPerAction).toBe(3);
    expect(warn).not.toHaveBeenCalled();
  });

  it('imageTypes/videoTypes que não são lista: aviso 1× e padrão', () => {
    const c = cfg({ imageTypes: 'image/png' as never, videoTypes: 5 as never });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(c.imageTypes).toHaveLength(5);
    expect(c.videoTypes).toHaveLength(2);
  });

  it('videoTypes fica vazio sem uploadVideo', () => {
    expect(cfg({}, false).videoTypes).toEqual([]);
  });

  it('resolveUploadConfig: null sem objeto ou sem uploadImage', () => {
    expect(resolveUploadConfig(null)).toBeNull();
    expect(resolveUploadConfig(undefined)).toBeNull();
    expect(resolveUploadConfig({ adapter: {} } as never)).toBeNull();
    expect(resolveUploadConfig({} as never)).toBeNull();
  });
});

describe('validateUploadFile (E5, propriedade)', () => {
  // Oráculo escrito à parte (tabelas literais, sem reusar a implementação).
  const IMAGE_BY_MIME = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/avif',
  ]);
  const VIDEO_BY_MIME = new Set(['video/mp4', 'video/webm']);
  const BY_EXT: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
  };

  const ALL_IMAGE = [...IMAGE_BY_MIME];
  const ALL_VIDEO = [...VIDEO_BY_MIME];

  const arbMime = fc.oneof(
    fc.constantFrom(
      '',
      'image/svg+xml',
      'text/plain',
      'application/octet-stream',
      'IMAGE/PNG',
      ...ALL_IMAGE,
      ...ALL_VIDEO,
    ),
    fc.string({ maxLength: 12 }),
  );
  const arbName = fc.oneof(
    fc.string({ maxLength: 12 }),
    fc
      .tuple(
        fc.string({ maxLength: 6 }),
        fc.constantFrom(
          ...Object.keys(BY_EXT),
          '.PNG',
          '.Mp4',
          '.svg',
          '.constructor',
          '.__proto__',
          '.toString',
          '.txt',
          '.',
        ),
      )
      .map(([a, b]) => a + b),
  );
  const arbSize = fc.oneof(
    fc.nat({ max: 300 * MIB }),
    fc.constantFrom(0, 10 * MIB, 10 * MIB + 1, 200 * MIB, 200 * MIB + 1),
  );
  const arbConfig = fc.record({
    imageTypes: fc.subarray(ALL_IMAGE),
    videoTypes: fc.subarray(ALL_VIDEO),
    withVideo: fc.boolean(),
    maxImageBytes: fc.integer({ min: 1, max: 20 * MIB }),
    maxVideoBytes: fc.integer({ min: 1, max: 300 * MIB }),
  });

  it('aceito ⇔ tipo permitido (MIME, ou extensão com MIME vazio) e tamanho dentro do limite', () => {
    fc.assert(
      fc.property(
        arbName,
        arbMime,
        arbSize,
        arbConfig,
        (name, type, size, c) => {
          const resolved = cfg(
            {
              imageTypes: c.imageTypes as never,
              videoTypes: c.videoTypes as never,
              maxImageBytes: c.maxImageBytes,
              maxVideoBytes: c.maxVideoBytes,
            },
            c.withVideo,
          );
          const mime = type.toLowerCase();
          let effective = mime;
          if (mime === '') {
            const dot = name.lastIndexOf('.');
            effective =
              dot < 0 ? '' : (BY_EXT[name.slice(dot).toLowerCase()] ?? '');
          }
          const isImage =
            IMAGE_BY_MIME.has(effective) && c.imageTypes.includes(effective);
          const isVideo =
            VIDEO_BY_MIME.has(effective) &&
            c.withVideo &&
            c.videoTypes.includes(effective);
          const typeOk = isImage || isVideo;
          const sizeOk = isImage
            ? size <= c.maxImageBytes
            : size <= c.maxVideoBytes;
          const result = validateUploadFile({ name, type, size }, resolved);
          expect(result.ok).toBe(typeOk && sizeOk);
          if (!result.ok) {
            expect(result.reason).toBe(typeOk ? 'size' : 'type');
            expect(result.type).toBe(
              effective.startsWith('video/') ? 'video' : 'image',
            );
          } else {
            expect(result.type).toBe(isImage ? 'image' : 'video');
          }
        },
      ),
      fcOptions(),
    );
  });
});

describe('displayName (pré-voo 14)', () => {
  it('nome aparado; vazio usa o MIME', () => {
    expect(displayName({ name: '  foto.png ', type: '' })).toBe('foto.png');
    expect(displayName({ name: '', type: 'image/png' })).toBe('image.png');
    expect(displayName({ name: '   ', type: 'image/png' })).toBe('image.png');
    expect(displayName({ name: '', type: 'image/jpeg' })).toBe('image.jpg');
    expect(displayName({ name: '', type: 'video/webm' })).toBe('video.webm');
    expect(displayName({ name: '', type: '' })).toBe('image');
    expect(displayName({ name: '', type: 'constructor' })).toBe('image');
    expect(displayName({ name: '', type: '__proto__' })).toBe('image');
  });

  it('funciona com File real', () => {
    expect(displayName(new File([], '', { type: 'image/avif' }))).toBe(
      'image.avif',
    );
  });
});
