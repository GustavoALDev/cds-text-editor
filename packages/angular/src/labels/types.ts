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

export interface RteLabels {
  readonly content: RteContentLabels;
  readonly slash: RteSlashLabels;
  readonly editor: RteEditorLabels;
  readonly errors: RteErrorLabels;
}

export interface RteLabelsInput {
  content?: Partial<Omit<RteContentLabels, 'calloutTitles'>> & {
    calloutTitles?: Partial<RteContentLabels['calloutTitles']>;
  };
  slash?: Partial<RteSlashLabels>;
  editor?: Partial<RteEditorLabels>;
  errors?: Partial<RteErrorLabels>;
}

/** Objeto parcial ou função lida dentro de `computed` (pode ler signals) (D15). */
export type RteLabelsSource = RteLabelsInput | (() => RteLabelsInput);
