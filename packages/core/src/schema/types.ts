// Tipos do esquema declarativo do HTML (spec 03a, seções 5 e 6). Só dados:
// nada de RegExp nem funções dentro do objeto do esquema.

/** Identificador de um grupo de recursos do esquema. */
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

/**
 * Recursos opcionais do editor e do esquema; todos ativos, exceto os passados como `false`.
 */
export interface RteFeatures {
  /** Cor de texto e realce, só da paleta. */
  colors: boolean;
  /** Blocos de código com linguagem. */
  code: boolean;
  /** Tabelas. */
  tables: boolean;
  /** Listas de tarefas. */
  tasks: boolean;
  /** Imagens e vídeos. */
  media: boolean;
  /** Mídia incorporada por `iframe` de provedores conhecidos. */
  embeds: boolean;
  /**
   * Blocos de redação: citação em destaque, caixa, "leia também" e afins.
   */
  newsBlocks: boolean;
  /** Busca e substituição no documento. */
  search: boolean;
  /** Menu de comandos aberto com `/`. */
  slashCommands: boolean;
}

/** Cor da paleta, com a variante clara e a escura. */
export interface RtePaletteColor {
  /** Nome da cor: valor do atributo de cor do esquema. */
  name: string;
  /** Cor no tema claro (hexadecimal). */
  light: string;
  /** Cor no tema escuro (hexadecimal). */
  dark: string;
}

/** Regra de URL do esquema: esquemas, hosts e padrões aceitos. */
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

/**
 * Regra de valor de um atributo do esquema: enumeração, padrão, inteiro, booleano, texto, URL, `srcset` ou lista de tokens. Só dados, sem funções.
 */
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

/** Especificação de um atributo de elemento do esquema. */
export interface RteAttrSpec {
  /** Regra que o valor precisa cumprir. */
  rule: RteAttrRule;
  /** Se verdadeiro, o atributo é obrigatório no elemento. */
  required?: boolean;
  /** Valor usado quando o atributo está ausente. */
  default?: string;
}

/** Especificação de um elemento HTML do esquema. */
export interface RteElementSpec {
  /** Atributos aceitos, por nome. */
  attributes: Record<string, RteAttrSpec>;
  /** Classes aceitas: valores literais e padrões. */
  classes?: { values?: string[]; patterns?: string[] };
  /** Propriedade -> regra do valor. */
  styles?: Record<string, RteAttrRule>;
  /**
   * Gera a propriedade de `style` a partir do valor de um atributo, pelo mapa informado.
   */
  styleFrom?: {
    attribute: string;
    property: string;
    map: Record<string, string>;
  };
  /** Filhos diretos exigidos; avaliado após sanitizar. */
  requireChild?: string[];
  /** Ação quando um atributo `required` sem default é inválido. */
  onInvalid?: 'remove' | 'unwrap';
  /**
   * Tokens que a serialização garante num atributo (por exemplo `rel`), opcionalmente só quando outro atributo tem certo valor.
   */
  ensureTokens?: {
    attribute: string;
    tokens: string[];
    when?: { attribute: string; equals: string };
  }[];
}

/**
 * Esquema declarativo do HTML aceito: elementos, atributos, classes e estilos, só dados serializáveis em JSON.
 */
export interface RteHtmlSchema {
  /** Versão do formato do esquema (sempre `1`). */
  version: 1;
  /** Prefixo dos ids de título. */
  idPrefix: string;
  /** Grupos de recursos ativos neste esquema. */
  features: RteFeatureId[];
  /** União dos recursos ativos. */
  elements: Record<string, RteElementSpec>;
  /** Tags de cada recurso (documentação). */
  byFeature: Partial<Record<RteFeatureId, string[]>>;
  /** Cores aceitas para texto e realce, com a variante clara e a escura. */
  palette: {
    text: readonly RtePaletteColor[];
    highlight: readonly RtePaletteColor[];
  };
}

/**
 * Provedor de mídia incorporada: reconhece um endereço público e o converte no endereço do `iframe`.
 */
export interface RteEmbedProvider {
  /** Identificador estável do provedor. */
  id: string;
  /** Nome legível do provedor. */
  name: string;
  /** Hosts dos `iframe` que o esquema aceita para este provedor. */
  hosts: readonly string[];
  /**
   * Padrões (expressões regulares ancoradas) dos endereços de `iframe` aceitos para este provedor.
   */
  srcPatterns: readonly string[];
  /** Diz se o endereço público pertence ao provedor. */
  match(url: string): boolean;
  /**
   * Converte o endereço público no endereço do `iframe` (com altura ou proporção opcionais), ou `null` se não for reconhecido.
   */
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
  /** Recursos a ligar ou desligar sobre o padrão. */
  features?: Partial<RteFeatures>;
  /**
   * Provedores de mídia incorporada aceitos (padrão: `RTE_EMBED_PROVIDERS`).
   */
  embedProviders?: readonly RteEmbedProvider[];
  /** Padrão `rt-`; casa `^[a-z][a-z0-9-]{0,14}-$` (termina em hífen, senão lança; evita _DOM clobbering_). */
  idPrefix?: string;
  /**
   * Hosts permitidos para imagens e vídeos; ausente aceita qualquer host `https` (veja `allowRelativeMedia`).
   */
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
