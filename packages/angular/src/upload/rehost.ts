import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import type { RteResolvedUpload } from './config';
import type { RteUploadedAttrs } from './response';

/**
 * Re-hospedagem de imagens externas coladas (S10, R6), no *chunk*
 * `rte-upload`: escolhe os endereços e troca o `src` depois do envio.
 */

/** O endereço é `https:` absoluto de fora (`ownHosts` e a origem da página)? */
export function isExternalHttps(
  src: unknown,
  ownHosts: readonly string[],
  origin: string | null,
): src is string {
  if (typeof src !== 'string') return false;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (origin !== null && url.origin === origin) return false;
  return !ownHosts.includes(url.host) && !ownHosts.includes(url.hostname);
}

/**
 * Endereços (únicos, na ordem) das imagens que as colagens das transações
 * inseriram: só `paste` do ProseMirror e só dentro do trecho inserido, de
 * modo que uma imagem anterior à colagem nunca entra.
 */
export function pastedExternalImages(
  transactions: readonly Transaction[],
  cfg: Pick<RteResolvedUpload, 'rehostExternal' | 'ownHosts'>,
  origin: string | null,
): string[] {
  const urls: string[] = [];
  if (!cfg.rehostExternal) return urls;
  for (const tr of transactions) {
    if (!tr.getMeta('paste') || !tr.docChanged) continue;
    tr.mapping.maps.forEach((map, i) => {
      const later = tr.mapping.slice(i + 1);
      map.forEach((_a, _b, from, to) => {
        const start = later.map(from, -1);
        const end = later.map(to, 1);
        tr.doc.nodesBetween(start, end, (node) => {
          if (node.type.name !== 'rtImage') return true;
          const src: unknown = node.attrs['src'];
          if (
            isExternalHttps(src, cfg.ownHosts, origin) &&
            !urls.includes(src)
          ) {
            urls.push(src);
          }
          return false;
        });
      });
    });
  }
  return urls;
}

/**
 * Troca `src` (e `srcset`/`sizes`, e as dimensões da resposta) de todas as
 * imagens com o endereço `from` numa transação fora do histórico. `false`
 * quando nenhuma imagem sobrou (já removida).
 */
export function replaceExternalImages(
  editor: Editor,
  from: string,
  attrs: RteUploadedAttrs,
): boolean {
  const { tr } = editor.state;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'rtImage' || node.attrs['src'] !== from) return true;
    const next: Record<string, unknown> = {
      ...node.attrs,
      src: attrs.src,
      srcset: attrs.srcset ?? null,
      sizes: attrs.sizes ?? null,
    };
    if (attrs.width !== undefined) next['width'] = attrs.width;
    if (attrs.height !== undefined) next['height'] = attrs.height;
    tr.setNodeMarkup(pos, undefined, next);
    return false;
  });
  if (!tr.docChanged) return false;
  tr.setMeta('addToHistory', false);
  editor.view.dispatch(tr);
  return true;
}
