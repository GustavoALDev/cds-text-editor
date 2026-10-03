import type { AnyExtension } from '@tiptap/core';
import type { RteCodeLanguage } from '../../code-languages/src/index';
import type { RteLinkPolicy } from '../../src/links';
import type { RteHtmlSchemaOptions } from '../../src/schema/types';

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

/** Opções da fábrica: superconjunto das opções do esquema (spec 03b, B18). */
export interface RteEditorOptions extends RteHtmlSchemaOptions {
  /** Superconjunto do `linkPolicy` do esquema. */
  linkPolicy?: Partial<RteLinkPolicy>;
  /** Padrão `[]` (sem realce). */
  codeLanguages?: readonly RteCodeLanguage[];
  /** Lido a cada uso (lição 4). */
  labels?: RteContentLabelsSource;
  /** Padrão `minWidth: 48` (`computeResize`). */
  image?: { minWidth?: number };
  /** Extensões do consumidor, no fim da lista. */
  extensions?: readonly AnyExtension[];
}
