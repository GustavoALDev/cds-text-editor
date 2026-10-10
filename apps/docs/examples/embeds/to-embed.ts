// #region to-embed
import { toEmbed } from '@comodeviaser/rte-core/embeds';

// O `src` é sempre montado pelo provedor e revalidado pelo core.
export const youtube = toEmbed('https://youtu.be/dQw4w9WgXcQ?t=42');
// { provider: 'youtube', src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42', ... }

// Endereço desconhecido devolve null: nunca se monta um iframe com a URL colada.
export const desconhecido = toEmbed('https://exemplo.invalid/video/1');
// null
// #endregion
