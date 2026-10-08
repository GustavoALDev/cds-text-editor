// #region provedor
import type { ApplicationConfig } from '@angular/core';
import { provideRichText } from '@cds/rte-angular';
import {
  DEFAULT_EMBED_PROVIDERS,
  type RteEmbedProvider,
} from '@cds/rte-core/embeds';

export const MEU_PLAYER: RteEmbedProvider = {
  id: 'meu-player', // vira a classe rt-embed--meu-player
  name: 'Meu player',
  // Cada srcPattern é ancorado e começa com um destes hosts, literal: a lista é fechada.
  hosts: ['player.example.com'],
  srcPatterns: ['^https://player\\.example\\.com/embed/[a-z0-9]{8}$'],
  // O endereço da PÁGINA que a pessoa cola...
  match: (url) => /^https:\/\/example\.com\/v\/[a-z0-9]{8}$/.test(url),
  // ...e o src do iframe, que só você monta.
  toEmbed: (url) => ({
    src: `https://player.example.com/embed/${url.slice(-8)}`,
    aspectRatio: '16 / 9',
  }),
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRichText({
      // A lista SUBSTITUI a padrão: repita os provedores que quer manter.
      editor: { embedProviders: [...DEFAULT_EMBED_PROVIDERS, MEU_PLAYER] },
      pasteEmbeds: true,
    }),
  ],
};
// #endregion
