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
  hosts: readonly string[];
  srcPatterns: readonly string[];
  match(url: string): boolean;
  toEmbed(
    url: string,
  ): { src: string; height?: number; aspectRatio?: string } | null;
}

/** Política de links aceita por `getHtmlSchema` (`RteHtmlSchemaOptions.linkPolicy`). */
export interface RteSchemaLinkPolicy {
  /** Domínios bloqueados. */
  blockedDomains?: readonly string[];
  /** Tokens de `rel` sempre aplicados. */
  forceRel?: readonly string[];
  /** Protocolos aceitos (só restringe o padrão). */
  protocols?: readonly string[];
  /** Aceita caminhos relativos (padrão `true`). */
  allowRelative?: boolean;
}

/** Opções de `getHtmlSchema`. */
export interface RteHtmlSchemaOptions {
  features?: Partial<RteFeatures>;
  embedProviders?: readonly RteEmbedProvider[];
  /** Padrão `rt-`; casa `^[a-z][a-z0-9-]{0,14}-$` (termina em hífen, senão lança; evita _DOM clobbering_). */
  idPrefix?: string;
  mediaHosts?: readonly string[];
  /**
   * Padrão `true` (caminhos do próprio site). Em sites com vários autores use `false` e `mediaHosts`:
   * sem `mediaHosts`, qualquer host `https` é aceito (rastreamento por imagem; `GET` com efeito colateral).
   */
  allowRelativeMedia?: boolean;
  /**
   * `blockedDomains`, `forceRel`, `protocols` e `allowRelative` chegam ao esquema (e ao
   * sanitizador), com o mesmo efeito do `normalizeHref` do editor; `defaultRel` e `target` valem só
   * no editor. `protocols` (padrão `https`, `http`, `mailto`, `tel`) só pode restringir; um valor fora
   * dessa lista lança `TypeError`. `allowRelative: false` recusa também o fragmento (`#x`).
   */
  linkPolicy?: RteSchemaLinkPolicy;
}
