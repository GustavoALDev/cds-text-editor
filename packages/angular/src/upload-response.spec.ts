import { getHtmlSchema } from '@cds/rte-core';
import { describe, expect, it } from 'vitest';
import { readUploadedMedia, readUploadRules } from './upload/response';
import { RteUploadError, uploadReason } from './upload/types';

const relative = readUploadRules(getHtmlSchema({ allowRelativeMedia: true }));
const hosted = readUploadRules(
  getHtmlSchema({ mediaHosts: ['media.example.test'] }),
);
const strict = readUploadRules(getHtmlSchema({ allowRelativeMedia: false }));

function rules() {
  if (!relative || !hosted || !strict) throw new Error('regras ausentes');
  return { relative, hosted, strict };
}

describe('readUploadRules', () => {
  it('lê as regras das mídias e de srcset/sizes', () => {
    const r = rules().relative;
    expect(r.media.imageSrc.kind).toBe('url');
    expect(r.imageSrcset.kind).toBe('srcset');
    expect(r.imageSizes).toBeDefined();
  });

  it('null com a mídia desligada', () => {
    expect(readUploadRules(getHtmlSchema({ features: { media: false } }))).toBe(
      null,
    );
  });
});

describe('readUploadedMedia (E6)', () => {
  it('url relativa aceita vira o valor canônico', () => {
    const out = readUploadedMedia(
      'image',
      { url: '/__uploads/1' },
      rules().relative,
    );
    expect(out).toEqual({ ok: true, attrs: { src: '/__uploads/1' } });
  });

  it('url de host permitido em vídeo, com pôster', () => {
    const out = readUploadedMedia(
      'video',
      {
        url: 'https://media.example.test/v.mp4',
        poster: 'https://media.example.test/p.png',
      },
      rules().hosted,
    );
    expect(out).toEqual({
      ok: true,
      attrs: {
        src: 'https://media.example.test/v.mp4',
        poster: 'https://media.example.test/p.png',
      },
    });
  });

  it.each([
    'http://media.example.test/a.png',
    'data:image/png;base64,AAAA',
    'blob:https://media.example.test/1',
    'javascript:alert(1)',
    'https://outro.example.test/a.png',
  ])('url %s recusada', (url) => {
    expect(readUploadedMedia('image', { url }, rules().hosted)).toEqual({
      ok: false,
    });
  });

  it('srcset, sizes e poster recusados → ok: false', () => {
    const r = rules().relative;
    expect(
      readUploadedMedia(
        'image',
        { url: '/a.png', srcset: 'http://x/a.png 1x' },
        r,
      ),
    ).toEqual({ ok: false });
    expect(
      readUploadedMedia('image', { url: '/a.png', sizes: 'x'.repeat(5000) }, r),
    ).toEqual({ ok: false });
    expect(readUploadedMedia('image', { url: '/a.png', sizes: 5 }, r)).toEqual({
      ok: false,
    });
    expect(
      readUploadedMedia(
        'video',
        { url: '/a.mp4', poster: 'data:image/png;base64,AAAA' },
        r,
      ),
    ).toEqual({ ok: false });
  });

  it('candidatos do srcset fora de mediaHosts, data: e javascript: recusados', () => {
    const r = rules().hosted;
    for (const srcset of [
      'https://outro.example.test/a.png 1x',
      'https://media.example.test/a.png 1x, data:image/png;base64,AAAA 2x',
      'https://media.example.test/a.png 1x, javascript:alert(1) 2x',
    ]) {
      expect(
        readUploadedMedia(
          'image',
          { url: 'https://media.example.test/a.png', srcset },
          r,
        ),
      ).toEqual({ ok: false });
    }
  });

  it('poster fora de mediaHosts recusado; string vazia é recusada (estrito, E6)', () => {
    const r = rules().hosted;
    expect(
      readUploadedMedia(
        'video',
        {
          url: 'https://media.example.test/a.mp4',
          poster: 'https://outro.example.test/p.png',
        },
        r,
      ),
    ).toEqual({ ok: false });
    expect(
      readUploadedMedia(
        'video',
        { url: 'https://media.example.test/a.mp4', poster: '' },
        r,
      ),
    ).toEqual({ ok: false });
  });

  it('srcset válido entra canônico', () => {
    const out = readUploadedMedia(
      'image',
      { url: '/a.png', srcset: '/a.png 1x, /b.png 2x', sizes: '100vw' },
      rules().relative,
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.attrs.srcset).toContain('/b.png 2x');
      expect(out.attrs.sizes).toBe('100vw');
    }
  });

  it.each([0, 10001, 2.5, '800', -3, Number.NaN])(
    'width/height %s omitidos sem erro',
    (v) => {
      const out = readUploadedMedia(
        'image',
        { url: '/a.png', width: v, height: v },
        rules().relative,
      );
      expect(out).toEqual({ ok: true, attrs: { src: '/a.png' } });
    },
  );

  it('width/height inteiros 1–10000 entram', () => {
    expect(
      readUploadedMedia(
        'image',
        { url: '/a.png', width: 1, height: 10000 },
        rules().relative,
      ),
    ).toEqual({ ok: true, attrs: { src: '/a.png', width: 1, height: 10000 } });
  });

  it.each([null, 'x', [], undefined, 5, {}, { url: 3 }])(
    'resposta %j → ok: false',
    (value) => {
      expect(readUploadedMedia('image', value, rules().relative)).toEqual({
        ok: false,
      });
    },
  );
});

describe('uploadReason (E4)', () => {
  it('RteUploadError mantém o motivo', () => {
    expect(uploadReason(new RteUploadError('network'))).toBe('network');
  });

  it('reconhece pela marca (name + reason válido)', () => {
    expect(uploadReason({ name: 'RteUploadError', reason: 'response' })).toBe(
      'response',
    );
  });

  it('marca com motivo inválido, Error comum e valores soltos → server', () => {
    expect(uploadReason({ name: 'RteUploadError', reason: 'x' })).toBe(
      'server',
    );
    expect(uploadReason(new Error('x'))).toBe('server');
    expect(uploadReason(null)).toBe('server');
    const hostile = {
      get name(): string {
        throw new Error('x');
      },
    };
    expect(uploadReason(hostile)).toBe('server');
    expect(uploadReason('network')).toBe('server');
  });
});

describe('readUploadedMedia sem allowRelativeMedia', () => {
  it('url relativa recusada', () => {
    expect(
      readUploadedMedia('image', { url: '/a.png' }, rules().strict),
    ).toEqual({ ok: false });
  });
});
