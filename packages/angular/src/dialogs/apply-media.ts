import { isDevMode } from '@angular/core';
import type {
  RteImageAlign,
  RteImageAttrs,
  RteVideoAttrs,
  RteVideoTrack,
} from '@comodeviaser/rte-core/extensions';
import type { ChainedCommands, CommandProps, Editor } from '@tiptap/core';
import type { RteDialogRequest } from './controller';

const REFUSED = '[rte-editor] o editor recusou a mídia; nada foi aplicado.';

/**
 * Comandos de mídia do core na cadeia: o `declare module` do core não chega
 * ao `.d.ts` do *build* (mesmo caso do `setImageAlign` em
 * `floating/commands.ts`), então os tipos ficam aqui (pré-voo 8).
 */
export type MediaChain = ChainedCommands & {
  setImage(attrs: RteImageAttrs, options?: { at?: number }): MediaChain;
  updateImage(attrs: Partial<RteImageAttrs>): MediaChain;
  setImageSize(size: { width: number }): MediaChain;
  setVideo(attrs: RteVideoAttrs, options?: { at?: number }): MediaChain;
  updateVideo(attrs: Partial<RteVideoAttrs>): MediaChain;
  setEmbed(url: string, options: { caption: string }): MediaChain;
  updateEmbed(attrs: { caption: string }): MediaChain;
};

/** Valores do diálogo de imagem já canônicos (o `src` pela regra, V4). */
export interface RteImageApply {
  src: string;
  alt: string;
  caption: string;
  credit: string;
  align: RteImageAlign;
  width: number | null;
  /** A largura mudou em relação à abertura (só então se mexe nela). */
  widthChanged: boolean;
  /**
   * O endereço mudou em relação à abertura: outro arquivo, então `srcset`,
   * `sizes` e `height` da imagem antiga caem (a `width` fica, salvo se a
   * pessoa mexeu nela).
   */
  srcChanged: boolean;
}

/**
 * Roda os comandos de mídia numa transação só (D8) e foca o editável.
 * Qualquer comando recusado (`false`) descarta a transação inteira (nenhum
 * passo parcial é despachado, nem o foco) e avisa em `isDevMode()`; o
 * controlador fecha como cancelamento (V9, Ruling 4).
 */
export function runMedia(
  editor: Editor,
  build: (chain: MediaChain) => MediaChain,
): boolean {
  const ok = editor
    .chain()
    .command((props: CommandProps) => {
      if (build(props.chain() as MediaChain).run()) {
        return props.commands.focus();
      }
      props.tr.setMeta('preventDispatch', true);
      return false;
    })
    .run();
  if (!ok && isDevMode()) console.warn(REFUSED);
  return ok;
}

/**
 * Imagem (V6, pré-voo 8). Inserir: `setImage` na seleção viva (o core acha
 * o ponto e deixa a imagem selecionada, V12). Editar: `updateImage` no nó da
 * abertura e, se a largura mudou, `setImageSize` (a altura segue a
 * proporção) ou, apagada, `width`/`height` nulos na mesma chamada. Com o
 * endereço trocado, `srcset`/`sizes`/`height` antigos saem na mesma chamada
 * (senão o navegador seguiria exibindo os candidatos da imagem antiga).
 */
export function applyImage(
  editor: Editor,
  req: RteDialogRequest,
  v: RteImageApply,
): boolean {
  const { src, alt, caption, credit } = v;
  if (req.mode !== 'edit') {
    return runMedia(editor, (c) => c.setImage({ src, alt, caption, credit }));
  }
  const cleared = v.widthChanged && v.width === null;
  return runMedia(editor, (c) => {
    const at = c.setNodeSelection(req.range.from) as MediaChain;
    const chain = at.updateImage({
      src,
      alt,
      caption,
      credit,
      align: v.align,
      ...(v.srcChanged ? { srcset: null, sizes: null, height: null } : {}),
      ...(cleared ? { width: null, height: null } : {}),
    });
    return v.widthChanged && v.width !== null
      ? chain.setImageSize({ width: v.width })
      : chain;
  });
}

/** Valores do diálogo de vídeo já canônicos (endereços pela regra, V4). */
export interface RteVideoApply {
  src: string;
  poster: string | null;
  caption: string;
  tracks: RteVideoTrack[];
}

/**
 * Vídeo (V8, pré-voo 8). Inserir: `setVideo` na seleção viva (o core acha o
 * ponto e deixa o vídeo selecionado). Editar: `updateVideo` no nó da
 * abertura, com a lista de faixas inteira (substitui a anterior).
 */
export function applyVideo(
  editor: Editor,
  req: RteDialogRequest,
  v: RteVideoApply,
): boolean {
  const attrs = {
    src: v.src,
    poster: v.poster,
    caption: v.caption,
    tracks: v.tracks,
  };
  if (req.mode !== 'edit') {
    return runMedia(editor, (c) => c.setVideo(attrs));
  }
  return runMedia(editor, (c) =>
    (c.setNodeSelection(req.range.from) as MediaChain).updateVideo(attrs),
  );
}

/**
 * *Embed* (V5, pré-voo 8). Inserir: `setEmbed` com a URL de página aparada
 * (o core monta o `src` pelos provedores ativos e deixa o *embed*
 * selecionado). Editar: só a legenda (`updateEmbed`) no nó da abertura.
 */
export function applyEmbed(
  editor: Editor,
  req: RteDialogRequest,
  v: { url: string; caption: string },
): boolean {
  const { caption } = v;
  if (req.mode !== 'edit') {
    return runMedia(editor, (c) => c.setEmbed(v.url.trim(), { caption }));
  }
  return runMedia(editor, (c) =>
    (c.setNodeSelection(req.range.from) as MediaChain).updateEmbed({ caption }),
  );
}

/** Remove o nó de mídia da abertura (pré-voo 8); o cursor fica no lugar. */
export function removeMediaAt(editor: Editor, req: RteDialogRequest): boolean {
  return runMedia(
    editor,
    (c) => c.setNodeSelection(req.range.from).deleteSelection() as MediaChain,
  );
}
