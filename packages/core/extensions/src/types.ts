import type { AnyExtension } from '@tiptap/core';
import type { RteCodeLanguage } from '../../code-languages/src/index';
import type { RteLinkPolicy } from '../../src/links';
import type { RteHtmlSchemaOptions } from '../../src/schema/types';
import type { RteSlashOptions } from './slash-items';

/** Variantes da caixa de destaque (`rtCallout`). */
export type RteCalloutVariant = 'info' | 'success' | 'warning' | 'danger';

/** Alinhamentos da imagem (`rtImage.align`). */
export type RteImageAlign = 'left' | 'center' | 'right' | 'full';

/**
 * Atributos de `rtImage` (B10: legenda e crédito em texto puro). Padrões:
 * `alt: null` (não informado; sai `alt=""`), `align: 'center'`,
 * `caption: ''`, `credit: ''`.
 */
export interface RteImageAttrs {
  src: string;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
  srcset?: string | null;
  sizes?: string | null;
  align?: RteImageAlign;
  caption?: string;
  credit?: string;
}

/** Faixa de texto do vídeo (WCAG 1.2.2). */
export interface RteVideoTrack {
  kind: 'captions' | 'subtitles';
  src: string;
  srclang: string;
  label: string;
  default?: boolean;
}

/**
 * Atributos de `rtVideo`. Padrões: `preload: 'metadata'`, `tracks: []`,
 * `caption: ''`.
 */
export interface RteVideoAttrs {
  src: string;
  width?: number | null;
  height?: number | null;
  poster?: string | null;
  preload?: 'metadata' | 'none';
  tracks?: readonly RteVideoTrack[];
  caption?: string;
}

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
  /** Texto do documento vazio; função lida a cada uso (lição 4). */
  placeholder?: string | (() => string);
  /**
   * Limite de caracteres da entrada direta (spec 03c, C4/C6): inteiro `>= 0`
   * ou `null` (sem limite); função lida a cada verificação (lição 4).
   */
  charLimit?: number | null | (() => number | null | undefined);
  /** Comandos `/` (spec 03c): itens, rótulos e item de UI. */
  slash?: RteSlashOptions;
  /** Padrão `minWidth: 48` (`computeResize`). */
  image?: { minWidth?: number };
  /** Extensões do consumidor, no fim da lista. */
  extensions?: readonly AnyExtension[];
}
