/*
 * Lucide 1.52.0 (https://lucide.dev), ISC License.
 * Dados de caminho copiados de lucide-static@1.52.0 (não é dependência).
 *
 * Modificação (permitida pela licença ISC): os elementos `rect` e `line` dos
 * SVG originais foram convertidos em caminhos (`d`) equivalentes, para que o
 * desenho use só `<path [attr.d]>` (viewBox 24, traço 2, desenhado pelo
 * template). Os ícones `chevron-down`, `check`, `code` e `italic` derivam do
 * Feather (MIT, Cole Bemis), assim como `link`; o texto dessa licença está em
 * THIRD-PARTY-NOTICES.md.
 *
 * Menus flutuantes (05b2b): `addRowAfter` e `addColumnAfter` vêm de
 * `between-horizontal-end` (duas linhas empilhadas) e `between-vertical-end`
 * (duas colunas lado a lado), trocados em relação ao nome do Lucide porque o
 * desenho é que diz linha ou coluna; `deleteRow`/`deleteColumn` vêm de
 * `panel-bottom-close`/`panel-right-close` (o Lucide não tem remover
 * linha/coluna: nome acessível e dica dizem a operação).
 *
 * Mídia (05c1): `mediaDetails` vem de `pencil` (Lucide 1.52.0, sem
 * conversão: já são só caminhos); os itens da barra `image`, `video` e
 * `embed` vêm de `image`, `video` e `square-play` (`rect`/`circle`
 * convertidos em caminhos, como acima).
 *
 * Busca (05d1): `search` vem de `search` (`circle` convertido em caminho).
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
import type { RteToolbarItemId } from './items';

export type RteIconName =
  | Exclude<RteToolbarItemId, 'blockType'>
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'alignJustify'
  | 'chevronDown'
  | 'check'
  | 'addRowAfter'
  | 'addColumnAfter'
  | 'deleteRow'
  | 'deleteColumn'
  | 'tableMore'
  | 'removeLink'
  | 'openLink'
  | 'imageAlignFull'
  | 'removeImage'
  | 'mediaDetails';

/** Lista de `d` por ícone (viewBox 24, traço 2, `currentColor`). */
export const RTE_ICONS: Readonly<Record<RteIconName, readonly string[]>> =
  Object.freeze({
    undo: ['M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'],
    redo: ['M21 7v6h-6', 'M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7'],
    bold: [
      'M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8',
    ],
    italic: ['M19 4L10 4', 'M14 20L5 20', 'M15 4L9 20'],
    underline: ['M6 4v6a6 6 0 0 0 12 0V4', 'M4 20L20 20'],
    strike: [
      'M16 4H9a3 3 0 0 0-2.83 4',
      'M14 12a4 4 0 0 1 0 8H6',
      'M4 12L20 12',
    ],
    code: ['m16 18 6-6-6-6', 'm8 6-6 6 6 6'],
    superscript: [
      'm4 19 8-8',
      'm12 19-8-8',
      'M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 0 0-2.617-.436c-.42.239-.738.614-.899 1.06',
    ],
    subscript: [
      'm4 5 8 8',
      'm12 5-8 8',
      'M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07',
    ],
    link: [
      'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
      'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    ],
    lang: [
      'm5 8 6 6',
      'm4 14 6-6 2-3',
      'M2 5h12',
      'M7 2h1',
      'm22 22-5-10-5 10',
      'M14 18h6',
    ],
    textColor: ['M4 20h16', 'm6 16 6-12 6 12', 'M8 12h8'],
    highlight: [
      'm9 11-6 6v3h9l3-3',
      'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4',
    ],
    bulletList: [
      'M3 5h.01',
      'M3 12h.01',
      'M3 19h.01',
      'M8 5h13',
      'M8 12h13',
      'M8 19h13',
    ],
    orderedList: [
      'M11 5h10',
      'M11 12h10',
      'M11 19h10',
      'M4 4h1v5',
      'M4 9h2',
      'M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02',
    ],
    taskList: [
      'M13 5h8',
      'M13 12h8',
      'M13 19h8',
      'm3 17 2 2 4-4',
      'M4 4H8A1 1 0 0 1 9 5V9A1 1 0 0 1 8 10H4A1 1 0 0 1 3 9V5A1 1 0 0 1 4 4Z',
    ],
    indent: ['M21 5H11', 'M21 12H11', 'M21 19H11', 'm3 8 4 4-4 4'],
    outdent: ['M21 5H11', 'M21 12H11', 'M21 19H11', 'm7 8-4 4 4 4'],
    align: ['M21 5H3', 'M15 12H3', 'M17 19H3'],
    alignLeft: ['M21 5H3', 'M15 12H3', 'M17 19H3'],
    alignCenter: ['M21 5H3', 'M17 12H7', 'M19 19H5'],
    alignRight: ['M21 5H3', 'M21 12H9', 'M21 19H7'],
    alignJustify: ['M3 5h18', 'M3 12h18', 'M3 19h18'],
    blockquote: ['M17 5H3', 'M21 12H8', 'M21 19H8', 'M3 12v7'],
    codeBlock: [
      'm10 9-3 3 3 3',
      'm14 15 3-3-3-3',
      'M5 3H19A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3Z',
    ],
    codeLanguage: ['m18 16 4-4-4-4', 'm6 8-4 4 4 4', 'm14.5 4-5 16'],
    horizontalRule: ['M5 12h14'],
    table: [
      'M12 3v18',
      'M5 3H19A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3Z',
      'M3 9h18',
      'M3 15h18',
    ],
    callout: [
      'M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z',
      'M12 15h.01',
      'M12 7v4',
    ],
    pullquote: [
      'M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z',
      'M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z',
    ],
    quoteAuthor: [
      'M11.5 15H7a4 4 0 0 0-4 4v2',
      'M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z',
      'M14 7A4 4 0 0 1 6 7A4 4 0 0 1 14 7Z',
    ],
    readAlso: [
      'M15 18h-5',
      'M18 14h-8',
      'M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2',
      'M11 6H17A1 1 0 0 1 18 7V9A1 1 0 0 1 17 10H11A1 1 0 0 1 10 9V7A1 1 0 0 1 11 6Z',
    ],
    clearFormatting: [
      'M4 7V4h16v3',
      'M5 20h6',
      'M13 4 8 20',
      'm15 15 5 5',
      'm20 15-5 5',
    ],
    chevronDown: ['m6 9 6 6 6-6'],
    check: ['M20 6 9 17l-5-5'],
    addRowAfter: [
      'M4 3H15A1 1 0 0 1 16 4V9A1 1 0 0 1 15 10H4A1 1 0 0 1 3 9V4A1 1 0 0 1 4 3Z',
      'm22 15-3-3 3-3',
      'M4 14H15A1 1 0 0 1 16 15V20A1 1 0 0 1 15 21H4A1 1 0 0 1 3 20V15A1 1 0 0 1 4 14Z',
    ],
    addColumnAfter: [
      'M4 3H9A1 1 0 0 1 10 4V15A1 1 0 0 1 9 16H4A1 1 0 0 1 3 15V4A1 1 0 0 1 4 3Z',
      'm9 22 3-3 3 3',
      'M15 3H20A1 1 0 0 1 21 4V15A1 1 0 0 1 20 16H15A1 1 0 0 1 14 15V4A1 1 0 0 1 15 3Z',
    ],
    deleteRow: [
      'M5 3H19A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3Z',
      'M3 15h18',
      'm15 8-3 3-3-3',
    ],
    deleteColumn: [
      'M5 3H19A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3Z',
      'M15 3v18',
      'm8 9 3 3-3 3',
    ],
    tableMore: [
      'M13 12A1 1 0 0 1 11 12A1 1 0 0 1 13 12Z',
      'M20 12A1 1 0 0 1 18 12A1 1 0 0 1 20 12Z',
      'M6 12A1 1 0 0 1 4 12A1 1 0 0 1 6 12Z',
    ],
    removeLink: [
      'm18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71',
      'm5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71',
      'M8 2L8 5',
      'M2 8L5 8',
      'M16 19L16 22',
      'M19 16L22 16',
    ],
    openLink: [
      'M15 3h6v6',
      'M10 14 21 3',
      'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
    ],
    imageAlignFull: [
      'M4 4H20A2 2 0 0 1 22 6V8A2 2 0 0 1 20 10H4A2 2 0 0 1 2 8V6A2 2 0 0 1 4 4Z',
      'M4 14H20A2 2 0 0 1 22 16V18A2 2 0 0 1 20 20H4A2 2 0 0 1 2 18V16A2 2 0 0 1 4 14Z',
    ],
    image: [
      'M5 3H19A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3Z',
      'M11 9A2 2 0 0 1 7 9A2 2 0 0 1 11 9Z',
      'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21',
    ],
    video: [
      'm16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5',
      'M4 6H14A2 2 0 0 1 16 8V16A2 2 0 0 1 14 18H4A2 2 0 0 1 2 16V8A2 2 0 0 1 4 6Z',
    ],
    embed: [
      'M5 3H19A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3Z',
      'M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z',
    ],
    mediaDetails: [
      'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
      'm15 5 4 4',
    ],
    search: [
      'M19 11A8 8 0 0 1 3 11A8 8 0 0 1 19 11Z',
      'm21 21-4.3-4.3',
    ],
    removeImage: [
      'M10 11v6',
      'M14 11v6',
      'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
      'M3 6h18',
      'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    ],
  });
