export type RteToolbarItemId =
  | 'undo'
  | 'redo'
  | 'blockType'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'superscript'
  | 'subscript'
  | 'link'
  | 'lang'
  | 'textColor'
  | 'highlight'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'indent'
  | 'outdent'
  | 'align'
  | 'blockquote'
  | 'codeBlock'
  | 'codeLanguage'
  | 'horizontalRule'
  | 'image'
  | 'video'
  | 'embed'
  | 'table'
  | 'callout'
  | 'pullquote'
  | 'quoteAuthor'
  | 'readAlso'
  | 'clearFormatting'
  | 'search';

export type RteToolbarPreset = 'minimal' | 'article' | 'full';
export type RteToolbarGroups = readonly (readonly RteToolbarItemId[])[];
export type RteToolbarConfig = RteToolbarPreset | RteToolbarGroups | false;

export type RteToolbarItemKind = 'button' | 'toggle' | 'menu' | 'dialog';

/** Recurso de `features` que, desligado, remove o item (U8). */
export type RteToolbarItemFeature =
  | 'colors'
  | 'tasks'
  | 'code'
  | 'tables'
  | 'newsBlocks'
  | 'media'
  | 'embeds'
  | 'search';

const item = (
  kind: RteToolbarItemKind,
  feature: RteToolbarItemFeature | null = null,
) => Object.freeze({ kind, feature });

export const RTE_TOOLBAR_ITEMS: Readonly<
  Record<
    RteToolbarItemId,
    Readonly<{
      kind: RteToolbarItemKind;
      feature: RteToolbarItemFeature | null;
    }>
  >
> = Object.freeze({
  undo: item('button'),
  redo: item('button'),
  blockType: item('menu'),
  bold: item('toggle'),
  italic: item('toggle'),
  underline: item('toggle'),
  strike: item('toggle'),
  code: item('toggle'),
  superscript: item('toggle'),
  subscript: item('toggle'),
  link: item('dialog'),
  lang: item('dialog', 'newsBlocks'),
  textColor: item('menu', 'colors'),
  highlight: item('menu', 'colors'),
  bulletList: item('toggle'),
  orderedList: item('toggle'),
  taskList: item('toggle', 'tasks'),
  indent: item('button'),
  outdent: item('button'),
  align: item('menu'),
  blockquote: item('toggle'),
  codeBlock: item('toggle', 'code'),
  codeLanguage: item('menu', 'code'),
  horizontalRule: item('button'),
  image: item('dialog', 'media'),
  video: item('dialog', 'media'),
  embed: item('dialog', 'embeds'),
  table: item('menu', 'tables'),
  callout: item('menu', 'newsBlocks'),
  pullquote: item('toggle', 'newsBlocks'),
  quoteAuthor: item('dialog', 'newsBlocks'),
  readAlso: item('button', 'newsBlocks'),
  clearFormatting: item('button'),
  search: item('button', 'search'),
});

function freezeGroups(groups: string[][]): RteToolbarGroups {
  return Object.freeze(
    groups.map((group) => Object.freeze(group)),
  ) as unknown as RteToolbarGroups;
}

/** Presets (U9), congelados em profundidade. */
export const RTE_TOOLBAR_PRESETS: Readonly<
  Record<RteToolbarPreset, RteToolbarGroups>
> = Object.freeze({
  minimal: freezeGroups([
    ['undo', 'redo'],
    ['bold', 'italic', 'link'],
    ['bulletList', 'orderedList'],
  ]),
  article: freezeGroups([
    ['undo', 'redo'],
    ['blockType'],
    ['bold', 'italic', 'underline', 'strike', 'link'],
    ['textColor', 'highlight'],
    ['bulletList', 'orderedList', 'taskList'],
    ['align'],
    ['blockquote', 'codeBlock', 'horizontalRule'],
    ['image', 'embed'],
    ['table'],
    ['clearFormatting'],
  ]),
  full: freezeGroups([
    ['undo', 'redo'],
    ['blockType'],
    [
      'bold',
      'italic',
      'underline',
      'strike',
      'link',
      'code',
      'superscript',
      'subscript',
      'lang',
    ],
    ['textColor', 'highlight'],
    ['bulletList', 'orderedList', 'taskList', 'indent', 'outdent'],
    ['align'],
    ['blockquote', 'codeBlock', 'codeLanguage', 'horizontalRule'],
    ['image', 'video', 'embed'],
    ['table'],
    ['callout', 'pullquote', 'quoteAuthor', 'readAlso'],
    ['clearFormatting', 'search'],
  ]),
});
