import {
  DEFAULT_EMBED_PROVIDERS,
  assertEmbedProvider,
} from '../embeds/providers';
import {
  type FeatureContext,
  baseFeature,
  codeFeature,
  colorsFeature,
  embedsFeature,
  linksFeature,
  mediaFeature,
  newsBlocksFeature,
  tablesFeature,
  tasksFeature,
} from './features';
import { normalizeHosts, normalizeRelTokens } from './hosts';
import { DEFAULT_ID_PREFIX, assertIdPrefix } from './id-prefix';
import { RTE_HIGHLIGHT_COLORS, RTE_TEXT_COLORS } from './palette';
import type {
  RteElementSpec,
  RteEmbedProvider,
  RteFeatureId,
  RteHtmlSchema,
  RteHtmlSchemaOptions,
} from './types';

export { DEFAULT_ID_PREFIX };

type Elements = Record<string, RteElementSpec>;

/** Serialização com chaves ordenadas, para comparar regras por valor. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const entries = Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

function union(a: readonly string[] = [], b: readonly string[] = []): string[] {
  return [...new Set([...a, ...b])];
}

function mergeRecords<T>(
  what: string,
  a: Record<string, T> = {},
  b: Record<string, T> = {},
): Record<string, T> {
  const out: Record<string, T> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (Object.hasOwn(out, key) && canonical(out[key]) !== canonical(value)) {
      throw new Error(
        `Esquema: ${what} "${key}" com regras diferentes em dois recursos.`,
      );
    }
    out[key] = value;
  }
  return out;
}

/** O valor definido em um dos lados; lança se os dois definem valores diferentes. */
function same<T>(tag: string, key: string, x: T, y: T): T {
  if (x !== undefined && y !== undefined && canonical(x) !== canonical(y)) {
    throw new Error(`Esquema: ${key} de <${tag}> diverge entre dois recursos.`);
  }
  return x ?? y;
}

function mergeSpec(
  tag: string,
  a: RteElementSpec,
  b: RteElementSpec,
): RteElementSpec {
  const out: RteElementSpec = {
    attributes: mergeRecords(`atributo <${tag}>`, a.attributes, b.attributes),
  };
  if (a.classes || b.classes) {
    const values = union(a.classes?.values, b.classes?.values);
    const patterns = union(a.classes?.patterns, b.classes?.patterns);
    out.classes = {};
    if (values.length > 0) out.classes.values = values;
    if (patterns.length > 0) out.classes.patterns = patterns;
  }
  if (a.styles || b.styles)
    out.styles = mergeRecords(`estilo <${tag}>`, a.styles, b.styles);
  const styleFrom = same(tag, 'styleFrom', a.styleFrom, b.styleFrom);
  if (styleFrom) out.styleFrom = styleFrom;
  const onInvalid = same(tag, 'onInvalid', a.onInvalid, b.onInvalid);
  if (onInvalid) out.onInvalid = onInvalid;
  if (a.requireChild || b.requireChild) {
    out.requireChild = union(a.requireChild, b.requireChild);
  }
  if (a.ensureTokens || b.ensureTokens) {
    const seen = new Set<string>();
    out.ensureTokens = [
      ...(a.ensureTokens ?? []),
      ...(b.ensureTokens ?? []),
    ].filter((e) => {
      const k = canonical(e);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return out;
}

/**
 * União por tag dos elementos de dois recursos: soma atributos, classes,
 * estilos, `requireChild` e `ensureTokens`; lança `Error` se o mesmo
 * atributo/estilo (ou `styleFrom`/`onInvalid`) tiver regras diferentes.
 * Não altera as entradas.
 */
export function mergeElements(a: Elements, b: Elements): Elements {
  const out: Elements = { ...a };
  for (const [tag, spec] of Object.entries(b)) {
    const prev = Object.hasOwn(out, tag) ? out[tag] : undefined;
    out[tag] = prev
      ? mergeSpec(tag, prev, spec)
      : mergeSpec(tag, { attributes: {} }, spec);
  }
  return out;
}

const PROVIDER_ID = /^[a-z][a-z0-9-]{0,31}$/;

function checkProviders(providers: readonly RteEmbedProvider[]): void {
  const ids = new Set<string>();
  for (const p of providers) {
    assertEmbedProvider(p);
    if (typeof p.id !== 'string' || !PROVIDER_ID.test(p.id)) {
      throw new TypeError(
        `Provedor de embed "${String(p.id)}": id precisa casar ^[a-z][a-z0-9-]{0,31}$ (vira classe rt-embed--<id>).`,
      );
    }
    if (ids.has(p.id))
      throw new TypeError(`Provedor de embed "${p.id}" repetido.`);
    ids.add(p.id);
  }
}

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

type Builder = (ctx: FeatureContext) => Elements;

const BUILDERS: [RteFeatureId, Builder][] = [
  ['base', baseFeature],
  ['links', linksFeature],
  ['colors', colorsFeature],
  ['code', codeFeature],
  ['tables', tablesFeature],
  ['tasks', tasksFeature],
  ['media', mediaFeature],
  ['embeds', embedsFeature],
  ['newsBlocks', newsBlocksFeature],
];

/** Contexto de recursos a partir das opções (validando-as). */
function buildContext(options: RteHtmlSchemaOptions): FeatureContext {
  const idPrefix = options.idPrefix ?? DEFAULT_ID_PREFIX;
  assertIdPrefix(idPrefix);
  const providers = options.embedProviders ?? DEFAULT_EMBED_PROVIDERS;
  checkProviders(providers);

  return {
    idPrefix,
    mediaHosts: normalizeHosts('mediaHosts', options.mediaHosts),
    allowRelativeMedia: options.allowRelativeMedia ?? true,
    blockedDomains: normalizeHosts(
      'linkPolicy.blockedDomains',
      options.linkPolicy?.blockedDomains,
      false,
    ),
    forceRel: normalizeRelTokens(
      'linkPolicy.forceRel',
      options.linkPolicy?.forceRel,
    ),
    providers,
    providerHosts: normalizeHosts(
      'embedProviders.hosts',
      providers.flatMap((p) => p.hosts),
    ),
    textColors: RTE_TEXT_COLORS,
    highlightColors: RTE_HIGHLIGHT_COLORS,
  };
}

/**
 * Elementos de cada recurso isoladamente (sem a união), para a documentação.
 * Interno: não exportado pelo `index.ts`.
 */
export function getFeatureElements(
  options: RteHtmlSchemaOptions = {},
): Partial<Record<RteFeatureId, Elements>> {
  const ctx = buildContext(options);
  const out: Partial<Record<RteFeatureId, Elements>> = {};
  for (const [id, build] of BUILDERS) out[id] = build(ctx);
  return out;
}

/**
 * Esquema declarativo do HTML aceito (spec 03a, seção 5): só dados,
 * congelado em profundidade e serializável em JSON. Lança `RangeError` para
 * `idPrefix` inválido e `TypeError` para provedor, host ou `forceRel` inválidos.
 */
export function getHtmlSchema(
  options: RteHtmlSchemaOptions = {},
): RteHtmlSchema {
  const idPrefix = options.idPrefix ?? DEFAULT_ID_PREFIX;
  const ctx = buildContext(options);

  const enabled = options.features ?? {};
  const features: RteFeatureId[] = [];
  const byFeature: RteHtmlSchema['byFeature'] = {};
  let elements: Elements = {};
  for (const [id, build] of BUILDERS) {
    if (
      id !== 'base' &&
      id !== 'links' &&
      (enabled as Partial<Record<RteFeatureId, boolean>>)[id] === false
    )
      continue;
    features.push(id);
    const own = build(ctx);
    const tags = Object.keys(own);
    if (tags.length > 0) byFeature[id] = tags;
    elements = mergeElements(elements, own);
  }

  return deepFreeze({
    version: 1,
    idPrefix,
    features,
    elements,
    byFeature,
    palette: {
      text: RTE_TEXT_COLORS.map((c) => ({ ...c })),
      highlight: RTE_HIGHLIGHT_COLORS.map((c) => ({ ...c })),
    },
  });
}
