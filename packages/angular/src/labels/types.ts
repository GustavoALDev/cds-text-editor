import type {
  RteContentLabels,
  RteSlashLabels,
} from '@cds/rte-core/extensions';

export interface RteEditorLabels {
  /** Nome acessível do editável sem `ariaLabel` nem `ariaLabelledBy`. */
  ariaLabel: string;
}

export interface RteErrorLabels {
  rteRequired: string;
  rteMaxChars(error: { max: number; actual: number }): string;
  rteMaxWords(error: { max: number; actual: number }): string;
}

export interface RteToolbarLabels {
  toolbar: string;
  undo: string;
  redo: string;
  blockType: string;
  paragraph: string;
  bold: string;
  italic: string;
  underline: string;
  strike: string;
  code: string;
  superscript: string;
  subscript: string;
  textColor: string;
  highlight: string;
  defaultColor: string;
  bulletList: string;
  orderedList: string;
  taskList: string;
  indent: string;
  outdent: string;
  align: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  alignJustify: string;
  blockquote: string;
  codeBlock: string;
  codeLanguage: string;
  plainText: string;
  horizontalRule: string;
  table: string;
  insertTable: string;
  insertTableCustom: string;
  addRowBefore: string;
  addRowAfter: string;
  addColumnBefore: string;
  addColumnAfter: string;
  deleteRow: string;
  deleteColumn: string;
  deleteTable: string;
  mergeCells: string;
  splitCell: string;
  toggleHeaderRow: string;
  toggleHeaderColumn: string;
  spanLimit: string;
  callout: string;
  removeCallout: string;
  pullquote: string;
  readAlso: string;
  clearFormatting: string;
  link: string;
  editLink: string;
  lang: string;
  editLang: string;
  quoteAuthor: string;
  image: string;
  editImage: string;
  video: string;
  editVideo: string;
  embed: string;
  editEmbed: string;
  heading(level: 2 | 3 | 4): string;
  /** Nomes da paleta (texto e marca-texto), por nome da cor. */
  colorNames: Readonly<Record<string, string>>;
}

export interface RteDialogLabels {
  apply: string;
  cancel: string;
  remove: string;
  linkInsertTitle: string;
  linkEditTitle: string;
  linkUrl: string;
  linkUrlHint: string;
  linkText: string;
  linkNewTab: string;
  linkRemove: string;
  langTitle: string;
  langEditTitle: string;
  langLanguage: string;
  langOther: string;
  langCode: string;
  langCodeHint: string;
  langDirection: string;
  langDirectionDefault: string;
  langDirectionLtr: string;
  langDirectionRtl: string;
  langRemove: string;
  /** Chave = código de `RTE_DIALOG_LANGUAGES`. */
  languageNames: Readonly<Record<string, string>>;
  quoteTitle: string;
  quoteAuthor: string;
  quoteRole: string;
  tableTitle: string;
  tableRows: string;
  tableColumns: string;
  tableHeaderRow: string;
  tableHeaderColumn: string;
  tableInsert: string;
  errorRequired: string;
  errorLinkUrl: string;
  errorLangCode: string;
  errorRange(min: number, max: number): string;
  errorMaxLength(max: number): string;
  imageInsertTitle: string;
  imageEditTitle: string;
  imageUrl: string;
  imageUrlHint: string;
  imageAlt: string;
  imageAltHint: string;
  imageDecorative: string;
  imageCaption: string;
  imageCredit: string;
  /** Os nomes dos valores vêm de `floating.imageAlign*`. */
  imageAlign: string;
  imageWidth: string;
  imageWidthHint: string;
  videoInsertTitle: string;
  videoEditTitle: string;
  videoUrl: string;
  videoUrlHint: string;
  videoPoster: string;
  videoCaption: string;
  videoTracks: string;
  videoTrack(n: number): string;
  videoTrackKind: string;
  videoTrackCaptions: string;
  videoTrackSubtitles: string;
  videoTrackUrl: string;
  videoTrackLang: string;
  videoTrackLabel: string;
  videoTrackDefault: string;
  videoTrackAdd: string;
  videoTrackRemove(n: number): string;
  /** Lembrete da WCAG 1.2.2 (não bloqueia). */
  videoCaptionsHint: string;
  embedInsertTitle: string;
  embedEditTitle: string;
  embedUrl: string;
  embedUrlHint(providers: readonly string[]): string;
  embedCaption: string;
  errorMediaUrl: string;
  errorEmbedUrl: string;
}

export interface RteFloatingMenuLabels {
  /** Nome acessível do menu de texto. */
  textMenu: string;
  linkMenu: string;
  tableMenu: string;
  imageMenu: string;
  /** Dica do endereço do link. */
  openLink: string;
  removeLink: string;
  tableMore: string;
  imageAlignLeft: string;
  imageAlignCenter: string;
  imageAlignRight: string;
  imageAlignFull: string;
  removeImage: string;
  videoMenu: string;
  embedMenu: string;
  imageDetails: string;
  videoDetails: string;
  embedDetails: string;
  removeVideo: string;
  removeEmbed: string;
}

export interface RteLabels {
  readonly content: RteContentLabels;
  readonly slash: RteSlashLabels;
  readonly editor: RteEditorLabels;
  readonly errors: RteErrorLabels;
  readonly toolbar: RteToolbarLabels;
  readonly dialogs: RteDialogLabels;
  readonly floating: RteFloatingMenuLabels;
}

export interface RteLabelsInput {
  content?: Partial<Omit<RteContentLabels, 'calloutTitles'>> & {
    calloutTitles?: Partial<RteContentLabels['calloutTitles']>;
  };
  slash?: Partial<RteSlashLabels>;
  editor?: Partial<RteEditorLabels>;
  errors?: Partial<RteErrorLabels>;
  toolbar?: Partial<Omit<RteToolbarLabels, 'colorNames'>> & {
    colorNames?: Readonly<Record<string, string>>;
  };
  dialogs?: Partial<Omit<RteDialogLabels, 'languageNames'>> & {
    languageNames?: Readonly<Record<string, string>>;
  };
  floating?: Partial<RteFloatingMenuLabels>;
}

/** Objeto parcial ou função lida dentro de `computed` (pode ler signals) (D15). */
export type RteLabelsSource = RteLabelsInput | (() => RteLabelsInput);
