import type { RteEmbedProvider } from '../schema/types';

/** Congela o provedor e seus arrays: a allowlist padrão não pode ser ampliada em tempo de execução. */
function freezeProvider(p: RteEmbedProvider): RteEmbedProvider {
  Object.freeze(p.hosts);
  Object.freeze(p.srcPatterns);
  return Object.freeze(p);
}

/** Interpreta `URL` sem lançar; só aceita `https:`. */
function parseHttps(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/** Aceita `90`, `90s`, `1m30s`, `1h2m3s`; devolve segundos (1 a 999999) ou `null`. */
function parseStart(value: string | null): number | null {
  if (value === null || value === '') return null;
  const m = /^(?:(\d{1,4})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s?)?$/.exec(value);
  if (!m) return null;
  const seconds =
    Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return seconds >= 1 && seconds <= 999999 ? seconds : null;
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function youtubeParts(
  url: string,
): { id: string; short: boolean; start: number | null } | null {
  const u = parseHttps(url);
  if (!u || !YOUTUBE_HOSTS.has(u.hostname)) return null;
  const segs = u.pathname.split('/').filter(Boolean);
  let id: string | undefined;
  let short = false;
  if (u.hostname === 'youtu.be') {
    if (segs.length === 1) id = segs[0];
  } else if (segs[0] === 'watch' && segs.length === 1) {
    id = u.searchParams.get('v') ?? undefined;
  } else if (segs[0] === 'shorts' && segs.length === 2) {
    id = segs[1];
    short = true;
  } else if (segs[0] === 'embed' && segs.length === 2) {
    id = segs[1];
  }
  if (id === undefined || !YOUTUBE_ID.test(id)) return null;
  const start = parseStart(
    u.searchParams.get('t') ?? u.searchParams.get('start'),
  );
  return { id, short, start };
}

export const YOUTUBE_PROVIDER: RteEmbedProvider = freezeProvider({
  id: 'youtube',
  name: 'YouTube',
  hosts: ['www.youtube-nocookie.com'],
  srcPatterns: [
    '^https://www\\.youtube-nocookie\\.com/embed/[A-Za-z0-9_-]{11}(\\?start=\\d{1,6})?$',
  ],
  match: (url) => youtubeParts(url) !== null,
  toEmbed(url) {
    const p = youtubeParts(url);
    if (!p) return null;
    return {
      src: `https://www.youtube-nocookie.com/embed/${p.id}${p.start === null ? '' : `?start=${p.start}`}`,
      aspectRatio: p.short ? '9 / 16' : '16 / 9',
    };
  },
});

function vimeoId(url: string): string | null {
  const u = parseHttps(url);
  if (!u) return null;
  const segs = u.pathname.split('/').filter(Boolean);
  let id: string | undefined;
  if (u.hostname === 'vimeo.com' || u.hostname === 'www.vimeo.com') {
    if (segs.length === 1) id = segs[0];
  } else if (u.hostname === 'player.vimeo.com') {
    if (segs.length === 2 && segs[0] === 'video') id = segs[1];
  }
  return id !== undefined && /^\d{1,12}$/.test(id) ? id : null;
}

export const VIMEO_PROVIDER: RteEmbedProvider = freezeProvider({
  id: 'vimeo',
  name: 'Vimeo',
  hosts: ['player.vimeo.com'],
  srcPatterns: ['^https://player\\.vimeo\\.com/video/\\d{1,12}$'],
  match: (url) => vimeoId(url) !== null,
  toEmbed(url) {
    const id = vimeoId(url);
    return id === null
      ? null
      : { src: `https://player.vimeo.com/video/${id}`, aspectRatio: '16 / 9' };
  },
});

function spotifyParts(url: string): { type: string; id: string } | null {
  const u = parseHttps(url);
  if (!u || u.hostname !== 'open.spotify.com') return null;
  const segs = u.pathname.split('/').filter(Boolean);
  if (segs[0] === 'embed') segs.shift();
  if (segs.length !== 2) return null;
  const type = segs[0] ?? '';
  const id = segs[1] ?? '';
  if (!/^(track|album|playlist|episode|show)$/.test(type)) return null;
  return /^[A-Za-z0-9]{22}$/.test(id) ? { type, id } : null;
}

export const SPOTIFY_PROVIDER: RteEmbedProvider = freezeProvider({
  id: 'spotify',
  name: 'Spotify',
  hosts: ['open.spotify.com'],
  srcPatterns: [
    '^https://open\\.spotify\\.com/embed/(track|album|playlist|episode|show)/[A-Za-z0-9]{22}$',
  ],
  match: (url) => spotifyParts(url) !== null,
  toEmbed(url) {
    const p = spotifyParts(url);
    if (!p) return null;
    return {
      src: `https://open.spotify.com/embed/${p.type}/${p.id}`,
      height: p.type === 'track' || p.type === 'episode' ? 152 : 352,
    };
  },
});

export const DEFAULT_EMBED_PROVIDERS: readonly RteEmbedProvider[] =
  Object.freeze([YOUTUBE_PROVIDER, VIMEO_PROVIDER, SPOTIFY_PROVIDER]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function checkHost(id: string, host: unknown): void {
  const fail = (motivo: string): never => {
    throw new TypeError(
      `Provedor de embed "${id}": host "${String(host)}" recusado (${motivo}).`,
    );
  };
  if (typeof host !== 'string') return fail('precisa ser texto');
  const h = host.toLowerCase();
  const name = h.startsWith('*.') ? h.slice(2) : h;
  if (name.includes('*')) return fail('curinga só é aceito como prefixo "*."');
  if (h.startsWith('[') || name.includes(':')) return fail('IPv6 não é aceito');
  if (!name.includes('.')) return fail('precisa ter ponto');
  if (name.split('.').some((label) => label === ''))
    return fail('rótulo vazio');
  if (IPV4.test(name)) return fail('IP literal não é aceito');
  if (name === 'localhost' || name.endsWith('.localhost'))
    return fail('localhost não é aceito');
}

/**
 * Recusa provedores inseguros: `sandbox` com `allow-scripts` + `allow-same-origin`
 * só é seguro se o host do embed nunca for a origem do site.
 */
export function assertEmbedProvider(p: RteEmbedProvider): void {
  if (!Array.isArray(p.hosts) || p.hosts.length === 0) {
    throw new TypeError(
      `Provedor de embed "${p.id}": "hosts" não pode ser vazio.`,
    );
  }
  for (const host of p.hosts) checkHost(p.id, host);
  if (!Array.isArray(p.srcPatterns) || p.srcPatterns.length === 0) {
    throw new TypeError(
      `Provedor de embed "${p.id}": "srcPatterns" é obrigatório.`,
    );
  }
  for (const pat of p.srcPatterns) {
    let ok =
      typeof pat === 'string' && pat.startsWith('^') && pat.endsWith('$');
    if (ok) {
      try {
        new RegExp(pat);
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      throw new TypeError(
        `Provedor de embed "${p.id}": srcPattern "${String(pat)}" precisa ser uma regex válida ancorada (^…$).`,
      );
    }
  }
}
