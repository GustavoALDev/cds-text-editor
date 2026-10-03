import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EMBED_PROVIDERS,
  SPOTIFY_PROVIDER,
  VIMEO_PROVIDER,
  YOUTUBE_PROVIDER,
  assertEmbedProvider,
  toEmbed,
} from './index';
import type { RteEmbedProvider } from '../schema/types';

const YT = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';

describe('toEmbed: YouTube', () => {
  it('watch?v= com t=1m5s', () => {
    expect(
      toEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m5s'),
    ).toEqual({
      provider: 'youtube',
      src: `${YT}?start=65`,
      title: 'YouTube',
      width: 640,
      height: 360,
      aspectRatio: '16 / 9',
    });
  });
  it('youtu.be com t=42', () => {
    expect(toEmbed('https://youtu.be/dQw4w9WgXcQ?t=42')?.src).toBe(
      `${YT}?start=42`,
    );
  });
  it('formatos de tempo', () => {
    const src = (t: string) =>
      toEmbed(`https://youtu.be/dQw4w9WgXcQ?t=${t}`)?.src;
    expect(src('90')).toBe(`${YT}?start=90`);
    expect(src('90s')).toBe(`${YT}?start=90`);
    expect(src('1m30s')).toBe(`${YT}?start=90`);
    expect(src('1h2m3s')).toBe(`${YT}?start=3723`);
    expect(src('abc')).toBe(YT);
    expect(src('0')).toBe(YT);
  });
  it('start= em /embed/', () => {
    expect(
      toEmbed('https://www.youtube.com/embed/dQw4w9WgXcQ?start=7')?.src,
    ).toBe(`${YT}?start=7`);
  });
  it('shorts', () => {
    expect(toEmbed('https://youtube.com/shorts/dQw4w9WgXcQ')).toMatchObject({
      src: YT,
      aspectRatio: '9 / 16',
      width: 640,
      height: 1138,
    });
  });
  it('/embed/', () => {
    expect(toEmbed('https://www.youtube.com/embed/dQw4w9WgXcQ')?.src).toBe(YT);
  });
  it('rejeita entradas inválidas', () => {
    expect(toEmbed('https://www.youtube.com/watch?v=curto')).toBeNull();
    expect(toEmbed('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(toEmbed('javascript:alert(1)')).toBeNull();
    expect(
      toEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>'),
    ).toBeNull();
    expect(toEmbed('')).toBeNull();
    expect(toEmbed('não é url')).toBeNull();
    expect(toEmbed('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });
});

describe('toEmbed: Vimeo', () => {
  it('vimeo.com e player.vimeo.com', () => {
    for (const u of [
      'https://vimeo.com/76979871',
      'https://player.vimeo.com/video/76979871',
    ]) {
      expect(toEmbed(u)).toEqual({
        provider: 'vimeo',
        src: 'https://player.vimeo.com/video/76979871',
        title: 'Vimeo',
        width: 640,
        height: 360,
        aspectRatio: '16 / 9',
      });
    }
  });
  it('rejeita id não numérico', () => {
    expect(toEmbed('https://vimeo.com/abc')).toBeNull();
  });
});

describe('toEmbed: Spotify', () => {
  it('track', () => {
    expect(
      toEmbed('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'),
    ).toEqual({
      provider: 'spotify',
      src: 'https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT',
      title: 'Spotify',
      width: 640,
      height: 152,
    });
  });
  it('album e playlist usam 352', () => {
    expect(
      toEmbed('https://open.spotify.com/album/4cOdK2wGLETKBW3PvgPWqT')?.height,
    ).toBe(352);
    expect(
      toEmbed('https://open.spotify.com/embed/playlist/4cOdK2wGLETKBW3PvgPWqT')
        ?.height,
    ).toBe(352);
    expect(
      toEmbed('https://open.spotify.com/episode/4cOdK2wGLETKBW3PvgPWqT')
        ?.height,
    ).toBe(152);
  });
  it('rejeita tipo/id inválidos', () => {
    expect(
      toEmbed('https://open.spotify.com/user/4cOdK2wGLETKBW3PvgPWqT'),
    ).toBeNull();
    expect(toEmbed('https://open.spotify.com/track/curto')).toBeNull();
  });
});

describe('revalidação e provedores do consumidor', () => {
  const evil: RteEmbedProvider = {
    id: 'evil',
    name: 'Evil',
    hosts: ['embed.example.com'],
    srcPatterns: [String.raw`^https://embed\.example\.com/v/\d+$`],
    match: (u) => u.startsWith('https://example.com/'),
    toEmbed: () => ({ src: 'https://other.example.org/v/1' }),
  };
  it('src fora de hosts/srcPatterns vira null', () => {
    expect(toEmbed('https://example.com/x', [evil])).toBeNull();
    expect(
      toEmbed('https://example.com/x', [
        {
          ...evil,
          toEmbed: () => ({ src: 'https://embed.example.com/v/1/x' }),
        },
      ]),
    ).toBeNull();
  });
  it('src válido do consumidor passa', () => {
    const ok = {
      ...evil,
      toEmbed: () => ({
        src: 'https://embed.example.com/v/9',
        height: 200,
        aspectRatio: '4 / 3',
      }),
    };
    expect(toEmbed('https://example.com/x', [ok])).toEqual({
      provider: 'evil',
      src: 'https://embed.example.com/v/9',
      title: 'Evil',
      width: 640,
      height: 200,
      aspectRatio: '4 / 3',
    });
  });
  it('provedor que lança ou inválido é ignorado', () => {
    const throws = {
      ...evil,
      match: () => true,
      toEmbed: () => {
        throw new Error('x');
      },
    };
    const bad = { ...evil, hosts: ['localhost'], match: () => true };
    expect(toEmbed('https://example.com/x', [throws, bad])).toBeNull();
  });
  it('lista vazia não casa nada', () => {
    expect(toEmbed('https://youtu.be/dQw4w9WgXcQ', [])).toBeNull();
  });
});

describe('assertEmbedProvider (endurecido)', () => {
  const base = YOUTUBE_PROVIDER;
  it('aceita os padrões', () => {
    for (const p of DEFAULT_EMBED_PROVIDERS)
      expect(() => assertEmbedProvider(p)).not.toThrow();
    expect(DEFAULT_EMBED_PROVIDERS).toEqual([
      YOUTUBE_PROVIDER,
      VIMEO_PROVIDER,
      SPOTIFY_PROVIDER,
    ]);
  });
  it('recusa intranet e listas vazias', () => {
    expect(() => assertEmbedProvider({ ...base, hosts: ['intranet'] })).toThrow(
      TypeError,
    );
    expect(() => assertEmbedProvider({ ...base, srcPatterns: [] })).toThrow(
      TypeError,
    );
    expect(() => assertEmbedProvider({ ...base, hosts: [] })).toThrow(
      TypeError,
    );
  });
  const bad = (hosts: string[]) =>
    expect(() => assertEmbedProvider({ ...base, hosts })).toThrow(TypeError);
  it('recusa hosts perigosos', () => {
    for (const h of [
      '*.com',
      '*.localhost',
      'localhost',
      'a.localhost',
      '127.0.0.1',
      '[::1]',
      '.',
      'a..b',
      '.a.com',
      'a.com.',
      '*.',
      'a.*.com',
    ])
      bad([h]);
  });
  it('aceita curinga com domínio real', () => {
    expect(() =>
      assertEmbedProvider({ ...base, hosts: ['*.example.com'] }),
    ).not.toThrow();
  });
  it('recusa srcPatterns sem âncora ou inválidos', () => {
    for (const p of ['https://', '^https://a', 'https://a$', '^(', '', '.*'])
      expect(() => assertEmbedProvider({ ...base, srcPatterns: [p] })).toThrow(
        TypeError,
      );
  });
  it('toEmbed ignora provedor com curinga amplo', () => {
    const evil: RteEmbedProvider = {
      id: 'evil',
      name: 'Evil',
      hosts: ['*.com'],
      srcPatterns: ['https://'],
      match: () => true,
      toEmbed: () => ({ src: 'https://evil.com/a?autoplay=1' }),
    };
    expect(toEmbed('https://x.com/', [evil])).toBeNull();
  });
  it('provedores padrão são imutáveis', () => {
    for (const p of [...DEFAULT_EMBED_PROVIDERS]) {
      expect(Object.isFrozen(p)).toBe(true);
      expect(Object.isFrozen(p.hosts)).toBe(true);
      expect(Object.isFrozen(p.srcPatterns)).toBe(true);
    }
    expect(Object.isFrozen(DEFAULT_EMBED_PROVIDERS)).toBe(true);
    expect(() => YOUTUBE_PROVIDER.hosts.push('evil.com')).toThrow(TypeError);
  });
});
