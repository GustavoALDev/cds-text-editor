import { expect, test } from '@playwright/test';
import { loadCorePage } from './helpers/page';

test.skip(process.env['E2E_NETWORK'] !== '1', 'precisa de rede');

const PAGES = [
  ['youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ['vimeo', 'https://vimeo.com/76979871'],
  ['spotify', 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'],
] as const;

for (const [id, url] of PAGES) {
  test(`embed ${id} carrega com sandbox/allow fixos`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(60_000);
    // O Spotify nunca dispara `load` no WebKit do Playwright, nem sem sandbox/allow (verificado
    // à mão): problema do terceiro/build, não da lista `allow` do esquema.
    test.fixme(
      id === 'spotify' && browserName === 'webkit',
      'Spotify não carrega no WebKit do Playwright nem sem sandbox',
    );
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      // O WebKit do Playwright desconhece `allow-presentation` (aviso do parser de sandbox);
      // o valor segue a spec §4.8 e é aceito por Chromium e Firefox.
      if (
        m.type() === 'error' &&
        !/'allow-presentation' is an invalid sandbox flag/.test(m.text())
      )
        consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(e.message));
    await loadCorePage(page);

    const src = await page.evaluate(
      ({ url }) => {
        const { toEmbed, getHtmlSchema } = window.RteCore;
        const embed = toEmbed(url);
        if (!embed) throw new Error('toEmbed devolveu null');
        const attrs = getHtmlSchema().elements['iframe']!.attributes;
        const fixed = (name: string): string => {
          const rule = attrs[name]!.rule;
          if (rule.kind !== 'enum' || rule.values.length !== 1)
            throw new Error(`${name} não é valor fixo`);
          return rule.values[0]!;
        };
        const f = document.createElement('iframe');
        f.id = 'embed';
        f.title = embed.title;
        f.width = String(embed.width);
        f.height = String(embed.height);
        f.setAttribute('sandbox', fixed('sandbox'));
        f.setAttribute('allow', fixed('allow'));
        f.setAttribute('referrerpolicy', fixed('referrerpolicy'));
        f.setAttribute('loading', 'eager');
        f.allowFullscreen = true;
        (window as unknown as { __loaded: Promise<void> }).__loaded =
          new Promise((resolve) =>
            f.addEventListener('load', () => resolve(), { once: true }),
          );
        f.src = embed.src;
        document.body.append(f);
        return embed.src;
      },
      { url },
    );

    await page.evaluate(
      () => (window as unknown as { __loaded: Promise<void> }).__loaded,
    );
    const frames = page.frames().filter((fr) => fr.url().startsWith(src));
    expect(frames.length, `frames: ${page.frames().map((f) => f.url())}`).toBe(
      1,
    );
    expect(consoleErrors).toEqual([]);
  });
}
