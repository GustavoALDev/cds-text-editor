import type { EditorState } from '@tiptap/pm/state';

/**
 * URL colada → *embed* (S11, R7): o endereço a transformar, ou `null` para
 * seguir o caminho de hoje. Só `text/plain` aparado com **um único** endereço
 * absoluto sem espaços, seleção vazia num parágrafo vazio. Quem decide se o
 * provedor existe é o comando `setEmbed` (`editor.can()`): o principal não
 * importa `@cds/rte-core/embeds`.
 */
export function pasteEmbedUrl(text: string, state: EditorState): string | null {
  const url = text.trim();
  if (!url || /\s/.test(url)) return null;
  try {
    const { protocol } = new URL(url);
    if (protocol !== 'https:' && protocol !== 'http:') return null;
  } catch {
    return null;
  }
  const { selection } = state;
  if (!selection.empty) return null;
  const parent = selection.$from.parent;
  return parent.type.name === 'paragraph' && parent.content.size === 0
    ? url
    : null;
}
