// Tipos do esquema declarativo do HTML (spec 03a, seções 5 e 6). Só dados:
// nada de RegExp nem funções dentro do objeto do esquema.

export type RteFeatureId =
  | 'base'
  | 'links'
  | 'colors'
  | 'code'
  | 'tables'
  | 'tasks'
  | 'media'
  | 'embeds'
  | 'newsBlocks';

export interface RteFeatures {
  colors: boolean;
  code: boolean;
  tables: boolean;
  tasks: boolean;
  media: boolean;
  embeds: boolean;
  newsBlocks: boolean;
  search: boolean;
  slashCommands: boolean;
}

export interface RtePaletteColor {
  name: string;
  light: string;
  dark: string;
}

export type RteUrlRule = {
  kind: 'url';
  schemes: string[];
  relative: boolean;
  fragment: boolean;
  hosts?: string[];
  blockedHosts?: string[];
  patterns?: string[];
  maxLength: number;
};

export type RteAttrRule =
  | { kind: 'enum'; values: string[] }
  | { kind: 'pattern'; pattern: string; maxLength: number } // regex ancorada, sem flags
  | { kind: 'int'; min: number; max: number }
  | { kind: 'bool' } // presença; serializa vazio
  | { kind: 'text'; maxLength: number }
  | RteUrlRule
  | { kind: 'srcset'; url: RteUrlRule; maxLength: number }
  | {
      kind: 'tokens';
      values: string[];
      separator: ' ' | '; ';
      maxLength: number;
    };

export interface RteAttrSpec {
  rule: RteAttrRule;
  required?: boolean;
  default?: string;
}

export interface RteElementSpec {
  attributes: Record<string, RteAttrSpec>;
  classes?: { values?: string[]; patterns?: string[] };
  /** Propriedade -> regra do valor. */
  styles?: Record<string, RteAttrRule>;
  styleFrom?: {
    attribute: string;
    property: string;
    map: Record<string, string>;
  };
  /** Filhos diretos exigidos; avaliado após sanitizar. */
  requireChild?: string[];
  /** Ação quando um atributo `required` sem default é inválido. */
  onInvalid?: 'remove' | 'unwrap';
  ensureTokens?: {
    attribute: string;
    tokens: string[];
    when?: { attribute: string; equals: string };
  }[];
}

export interface RteHtmlSchema {
  version: 1;
  idPrefix: string;
  features: RteFeatureId[];
  /** União dos recursos ativos. */
  elements: Record<string, RteElementSpec>;
  /** Tags de cada recurso (documentação). */
  byFeature: Partial<Record<RteFeatureId, string[]>>;
  palette: {
    text: readonly RtePaletteColor[];
    highlight: readonly RtePaletteColor[];
  };
}

export interface RteEmbedProvider {
  id: string;
  name: string;
  hosts: string[];
  srcPatterns: string[];
  match(url: string): boolean;
  toEmbed(
    url: string,
  ): { src: string; height?: number; aspectRatio?: string } | null;
}

/** Opções de `getHtmlSchema`. */
export interface RteHtmlSchemaOptions {
  features?: Partial<RteFeatures>;
  embedProviders?: RteEmbedProvider[];
  /** Padrão `rt-`; casa `^[a-z][a-z0-9-]{0,15}$` (senão lança). */
  idPrefix?: string;
  mediaHosts?: string[];
  /** Padrão `true`. */
  allowRelativeMedia?: boolean;
  linkPolicy?: { blockedDomains?: string[]; forceRel?: string[] };
}
