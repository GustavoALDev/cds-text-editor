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
  it('o próprio src nocookie /embed/ é reconhecido e volta igual', () => {
    expect(toEmbed(`${YT}?start=90`)).toEqual({
      provider: 'youtube',
      src: `${YT}?start=90`,
      title: 'YouTube',
      width: 640,
      height: 360,
      aspectRatio: '16 / 9',
    });
    expect(
      toEmbed('https://www.youtube-nocookie.com/watch?v=dQw4w9WgXcQ'),
    ).toBeNull();
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
  it('aceita curinga com domínio real (ao lado de um host literal)', () => {
    expect(() =>
      assertEmbedProvider({
        ...base,
        hosts: ['*.example.com', ...base.hosts],
      }),
    ).not.toThrow();
  });
  it('recusa srcPatterns sem âncora ou inválidos', () => {
    for (const p of ['https://', '^https://a', 'https://a$', '^(', '', '.*'])
      expect(() => assertEmbedProvider({ ...base, srcPatterns: [p] })).toThrow(
        TypeError,
      );
  });
  it('recusa alternância de topo que escapa da âncora', () => {
    for (const p of [
      String.raw`^a|.*$`,
      String.raw`^https://a\.com/x$|^.*$`,
      String.raw`^(a)|.*$`,
      String.raw`^[\]]|.*$`,
    ])
      expect(() => assertEmbedProvider({ ...base, srcPatterns: [p] })).toThrow(
        TypeError,
      );
  });
  it('aceita alternância dentro de grupo ou de classe', () => {
    for (const p of [
      String.raw`^https://a\.com/(x|y)$`,
      String.raw`^https://a\.com/[|]$`,
      String.raw`^https://a\.com/\|$`,
      String.raw`^https://a\.com/[(](x|y)$`,
    ])
      expect(() =>
        assertEmbedProvider({ ...base, hosts: ['a.com'], srcPatterns: [p] }),
      ).not.toThrow();
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

describe('validador único de provedor (toEmbed = getHtmlSchema)', () => {
  const provider = (over: Partial<RteEmbedProvider>): RteEmbedProvider => ({
    id: 'acme',
    name: 'Acme',
    hosts: ['embed.example.com'],
    srcPatterns: [String.raw`^https://embed\.example\.com/v/\d+$`],
    match: () => true,
    toEmbed: () => ({ src: 'https://embed.example.com/v/1' }),
    ...over,
  });

  it('altura derivada de proporção extrema fica em [1, 10000]', () => {
    const at = (aspectRatio: string) =>
      toEmbed('https://x.com/', [
        provider({
          toEmbed: () => ({
            src: 'https://embed.example.com/v/1',
            aspectRatio,
          }),
        }),
      ]);
    expect(at('1 / 9999')).toMatchObject({
      height: 10000,
      aspectRatio: '1 / 9999',
    });
    expect(at('1 / 16')).toMatchObject({ height: 10000 });
    expect(at('9999 / 1')).toMatchObject({
      height: 1,
      aspectRatio: '9999 / 1',
    });
  });

  it('recusa IP em qualquer forma, depois de interpretar a URL', () => {
    for (const host of [
      '*.0.1',
      '127.1',
      '0x7f.0.0.1',
      '127.0.0.1',
      '[::1]',
      '[0:0:0:0:0:0:0:1]',
      '１２７.０.０.１',
      'LOCALHOST.',
      'x.localhost',
    ]) {
      const p = provider({
        hosts: [host],
        srcPatterns: [String.raw`^https://[0-9a-f.:\[\]]+/x$`],
        toEmbed: () => ({ src: 'https://127.0.0.1/x' }),
      });
      expect(() => assertEmbedProvider(p), host).toThrow(TypeError);
      expect(toEmbed('https://example.com/', [p]), host).toBeNull();
    }
  });

  it('host IDN funciona (normalizado para punycode)', () => {
    const p = provider({
      hosts: ['пример.рф'],
      srcPatterns: [String.raw`^https://xn--e1afmkfd\.xn--p1ai/v/\d+$`],
      toEmbed: () => ({ src: 'https://пример.рф/v/1' }),
    });
    expect(() => assertEmbedProvider(p)).not.toThrow();
    expect(toEmbed('https://example.com/', [p])?.src).toBe(
      'https://xn--e1afmkfd.xn--p1ai/v/1',
    );
  });

  it('id fora de ^[a-z][a-z0-9-]{0,31}$ é recusado', () => {
    for (const id of ['Bad Id', 'x" onload="', '', '1abc', 'a'.repeat(33)]) {
      const p = provider({ id });
      expect(() => assertEmbedProvider(p), id).toThrow(TypeError);
      expect(toEmbed('https://example.com/', [p]), id).toBeNull();
    }
  });

  it('srcPattern precisa fixar um host literal do próprio provedor', () => {
    for (const pat of [
      String.raw`^https://[a-z.]+/embed/[0-9]+$`,
      String.raw`^https://embed\.example\.com.*$`,
      String.raw`^https://embed\.example\.com\.evil\.com/v$`,
      String.raw`^https://other\.example\.com/v$`,
      String.raw`^http://embed\.example\.com/v$`,
      String.raw`^https://embed.example.com/v$`,
    ]) {
      const p = provider({ srcPatterns: [pat] });
      expect(() => assertEmbedProvider(p), pat).toThrow(TypeError);
      expect(toEmbed('https://example.com/', [p]), pat).toBeNull();
    }
  });

  it('quantificador logo depois da / do prefixo é recusado', () => {
    for (const pat of [
      String.raw`^https://embed\.example\.com/?.*$`,
      String.raw`^https://embed\.example\.com/{0}v/\d+$`,
      String.raw`^https://embed\.example\.com/*v/\d+$`,
      String.raw`^https://embed\.example\.com/+v/\d+$`,
    ]) {
      const p = provider({ srcPatterns: [pat] });
      expect(() => assertEmbedProvider(p), pat).toThrow(TypeError);
      expect(toEmbed('https://embed.example.com/v/1', [p]), pat).toBeNull();
    }
  });

  it('padrões com o que vem depois da / sem quantificador continuam aceitos', () => {
    for (const pat of [
      String.raw`^https://embed\.example\.com/v/\d+$`,
      String.raw`^https://embed\.example\.com/\?id=\d+$`,
      String.raw`^https://embed\.example\.com/(?:v|e)/\d+$`,
    ])
      expect(
        () => assertEmbedProvider(provider({ srcPatterns: [pat] })),
        pat,
      ).not.toThrow();
    expect(
      toEmbed('https://embed.example.com/v/1', [provider({})]),
    ).not.toBeNull();
  });

  it('bypass A + B: ^https://a\\.com/?.*$ não deixa passar a.com.x.net', () => {
    const a = provider({
      id: 'a',
      hosts: ['a.com'],
      srcPatterns: [String.raw`^https://a\.com/?.*$`],
      toEmbed: () => ({ src: 'https://a.com.x.net/x' }),
    });
    const b = provider({
      id: 'b',
      hosts: ['*.x.net', 'b.x.net'],
      srcPatterns: [String.raw`^https://b\.x\.net/v/\d+$`],
    });
    expect(() => assertEmbedProvider(a)).toThrow(TypeError);
    expect(toEmbed('https://a.com/x', [a, b])).toBeNull();
  });

  it('provedor só com hosts curinga não pode ser usado', () => {
    const p = provider({ hosts: ['*.example.com'] });
    expect(() => assertEmbedProvider(p)).toThrow(TypeError);
    expect(
      assertEmbedProvider(
        provider({ hosts: ['*.example.com', 'embed.example.com'] }),
      ),
    ).toBeUndefined();
  });

  it('host com caractere de URL é recusado', () => {
    for (const host of ['ü@evil.com', 'evil.com/ü', 'a.com:443', 'a b.com'])
      expect(
        () => assertEmbedProvider(provider({ hosts: [host] })),
        host,
      ).toThrow(TypeError);
  });
});
