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
  heading(level: 2 | 3 | 4): string;
  /** Nomes da paleta (texto e marca-texto), por nome da cor. */
  colorNames: Readonly<Record<string, string>>;
}

export interface RteLabels {
  readonly content: RteContentLabels;
  readonly slash: RteSlashLabels;
  readonly editor: RteEditorLabels;
  readonly errors: RteErrorLabels;
  readonly toolbar: RteToolbarLabels;
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
}

/** Objeto parcial ou função lida dentro de `computed` (pode ler signals) (D15). */
export type RteLabelsSource = RteLabelsInput | (() => RteLabelsInput);
