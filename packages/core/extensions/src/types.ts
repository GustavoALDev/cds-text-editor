/** Variantes da caixa de destaque (`rtCallout`). */
export type RteCalloutVariant = 'info' | 'success' | 'warning' | 'danger';

/** Alinhamentos da imagem (`rtImage.align`). */
export type RteImageAlign = 'left' | 'center' | 'right' | 'full';

/** Rótulos do conteúdo (títulos sintetizados e nome acessível das tarefas). */
export interface RteContentLabels {
  calloutTitles: Record<RteCalloutVariant, string>;
  readAlsoTitle: string;
  /** Nome acessível do checkbox da tarefa na vista do editor. */
  taskCheckbox(text: string): string;
}

/** Fonte de rótulos: objeto parcial ou função lida a cada uso (lição 4). */
export type RteContentLabelsSource =
  Partial<RteContentLabels> | (() => Partial<RteContentLabels>);
