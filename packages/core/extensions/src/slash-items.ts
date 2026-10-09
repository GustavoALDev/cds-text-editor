import type { ChainedCommands, Editor } from '@tiptap/core';
import type { RteExtensionContext } from './context';

/** Ids dos itens embutidos do menu `/` (spec 03c, §4). */
export type RteSlashItemId =
  | 'paragraph'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'blockquote'
  | 'codeBlock'
  | 'table'
  | 'horizontalRule'
  | 'callout'
  | 'pullquote'
  | 'readAlso'
  | 'image'
  | 'video'
  | 'embed';

/** Item do menu `/`. */
export interface RteSlashItem {
  /** `^[a-z][a-zA-Z0-9-]{0,39}$`, único (`TypeError`). */
  readonly id: string;
  /** Embutidos: de `RTE_SLASH_LABELS`. */
  readonly title?: string | (() => string);
  /** Palavras extras que também encontram o item. */
  readonly keywords?: readonly string[];
  /** Embutidos: `'text' | 'lists' | 'blocks' | 'news' | 'media'`. */
  readonly group?: string;
  /** Recebe a cadeia já com `/consulta` apagada; ausente = item de UI. */
  readonly command?: (
    chain: ChainedCommands,
    editor: Editor,
  ) => ChainedCommands;
}

/** Título e palavras-chave de cada item embutido do menu `/`. */
export type RteSlashLabels = Record<
  RteSlashItemId,
  { title: string; keywords: readonly string[] }
>;

/** Opções do menu `/`. */
export interface RteSlashOptions {
  /**
   * Itens do menu: lista que substitui os embutidos ou função que recebe os embutidos e devolve a lista final.
   */
  items?:
    | readonly RteSlashItem[]
    | ((defaults: readonly RteSlashItem[]) => readonly RteSlashItem[]);
  /** Lido a cada uso (lição 4). */
  labels?: Partial<RteSlashLabels> | (() => Partial<RteSlashLabels>);
  /**
   * Chamado de forma síncrona dentro da atualização da vista (plugin view):
   * adie qualquer despacho no editor (por exemplo, `queueMicrotask`).
   */
  onUiItem?: (id: string, editor: Editor) => void;
}

type Entry = readonly [string, readonly string[]];

function pack(rows: Record<RteSlashItemId, Entry>): RteSlashLabels {
  const out: Record<string, { title: string; keywords: readonly string[] }> =
    {};
  for (const id of Object.keys(rows)) {
    const [title, keywords] = rows[id as RteSlashItemId];
    out[id] = Object.freeze({ title, keywords: Object.freeze([...keywords]) });
  }
  return Object.freeze(out) as RteSlashLabels;
}

/** Títulos e palavras-chave dos itens embutidos (congelados; padrão `en`). */
export const RTE_SLASH_LABELS: Readonly<
  Record<'pt-BR' | 'en' | 'es', RteSlashLabels>
> = Object.freeze({
  en: pack({
    paragraph: ['Paragraph', ['text', 'p']],
    heading2: ['Heading 2', ['title', 'h2', 'subtitle']],
    heading3: ['Heading 3', ['h3']],
    heading4: ['Heading 4', ['h4']],
    bulletList: ['Bulleted list', ['ul', 'bullets', 'unordered']],
    orderedList: ['Numbered list', ['ol', 'ordered', 'numbers']],
    taskList: ['Task list', ['todo', 'checklist', 'checkbox']],
    blockquote: ['Quote', ['blockquote', 'citation']],
    codeBlock: ['Code block', ['code', 'pre', 'snippet']],
    table: ['Table', ['grid', 'rows', 'columns']],
    horizontalRule: ['Divider', ['hr', 'separator', 'line']],
    callout: ['Callout', ['note', 'box', 'warning']],
    pullquote: ['Pull quote', ['quote', 'highlight']],
    readAlso: ['Read also', ['related', 'links', 'see also']],
    image: ['Image', ['picture', 'photo', 'img']],
    video: ['Video', ['movie', 'clip', 'mp4']],
    embed: ['Embed', ['youtube', 'vimeo', 'spotify', 'iframe']],
  }),
  'pt-BR': pack({
    paragraph: ['Parágrafo', ['texto', 'p']],
    heading2: ['Título 2', ['cabeçalho', 'h2', 'subtítulo']],
    heading3: ['Título 3', ['h3']],
    heading4: ['Título 4', ['h4']],
    bulletList: ['Lista com marcadores', ['ul', 'marcadores', 'tópicos']],
    orderedList: ['Lista numerada', ['ol', 'números', 'ordenada']],
    taskList: ['Lista de tarefas', ['tarefas', 'checklist', 'afazeres']],
    blockquote: ['Citação', ['blockquote', 'aspas']],
    codeBlock: ['Bloco de código', ['código', 'pre', 'trecho']],
    table: ['Tabela', ['grade', 'linhas', 'colunas']],
    horizontalRule: ['Linha horizontal', ['hr', 'separador', 'divisória']],
    callout: ['Caixa de destaque', ['destaque', 'nota', 'aviso']],
    pullquote: ['Citação em destaque', ['olho', 'aspas']],
    readAlso: ['Leia também', ['relacionados', 'links', 'veja também']],
    image: ['Imagem', ['foto', 'figura', 'img']],
    video: ['Vídeo', ['filme', 'clipe', 'mp4']],
    embed: ['Incorporar', ['embed', 'youtube', 'vimeo', 'spotify']],
  }),
  es: pack({
    paragraph: ['Párrafo', ['texto', 'p']],
    heading2: ['Título 2', ['encabezado', 'h2', 'subtítulo']],
    heading3: ['Título 3', ['h3']],
    heading4: ['Título 4', ['h4']],
    bulletList: ['Lista con viñetas', ['ul', 'viñetas']],
    orderedList: ['Lista numerada', ['ol', 'números', 'ordenada']],
    taskList: ['Lista de tareas', ['tareas', 'checklist', 'pendientes']],
    blockquote: ['Cita', ['blockquote', 'comillas']],
    codeBlock: ['Bloque de código', ['código', 'pre', 'fragmento']],
    table: ['Tabla', ['cuadrícula', 'filas', 'columnas']],
    horizontalRule: ['Línea horizontal', ['hr', 'separador', 'divisor']],
    callout: ['Recuadro destacado', ['destacado', 'nota', 'aviso']],
    pullquote: ['Cita destacada', ['comillas']],
    readAlso: ['Lee también', ['relacionados', 'enlaces', 'ver también']],
    image: ['Imagen', ['foto', 'figura', 'img']],
    video: ['Vídeo', ['película', 'clip', 'mp4']],
    embed: ['Insertar', ['embed', 'youtube', 'vimeo', 'spotify']],
  }),
});

interface SelectionState {
  selection: {
    $from: { depth: number; node(depth: number): { type: { name: string } } };
  };
}

/** Pré-voo da tabela: nenhum ancestral da seleção é `table`. */
function notInsideTable(state: SelectionState): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === 'table') return false;
  }
  return true;
}

/**
 * Pré-voo das listas: a lista mais próxima da seleção não é `name`. Desligar
 * a lista (`toggle*List` dentro dela) passa no `can()`, mas o `liftListItem`
 * do PM falha na mesma transação depois do `deleteRange` da consulta (ele
 * compara posições do documento atual com o mapeamento da transação inteira).
 */
function notInsideList(state: SelectionState, name: string): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const type = $from.node(depth).type.name;
    if (type === 'bulletList' || type === 'orderedList') return type !== name;
  }
  return true;
}

function builtin(
  id: RteSlashItemId,
  group: string,
  command?: RteSlashItem['command'],
): RteSlashItem {
  return Object.freeze(command ? { id, group, command } : { id, group });
}

/** Itens embutidos, na ordem do tipo `RteSlashItemId` (congelados). */
export const RTE_SLASH_ITEMS: readonly RteSlashItem[] = Object.freeze([
  builtin('paragraph', 'text', (c) => c.setParagraph()),
  builtin('heading2', 'text', (c) => c.setHeading({ level: 2 })),
  builtin('heading3', 'text', (c) => c.setHeading({ level: 3 })),
  builtin('heading4', 'text', (c) => c.setHeading({ level: 4 })),
  builtin('bulletList', 'lists', (c) =>
    c
      .command(({ state }) => notInsideList(state, 'bulletList'))
      .toggleBulletList(),
  ),
  builtin('orderedList', 'lists', (c) =>
    c
      .command(({ state }) => notInsideList(state, 'orderedList'))
      .toggleOrderedList(),
  ),
  builtin('taskList', 'lists', (c) => c.toggleTaskList()),
  builtin('blockquote', 'blocks', (c) => c.setBlockquote()),
  builtin('codeBlock', 'blocks', (c) => c.setCodeBlock()),
  builtin('table', 'blocks', (c) =>
    c
      .command(({ state }) => notInsideTable(state))
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
  ),
  builtin('horizontalRule', 'blocks', (c) => c.setHorizontalRule()),
  builtin('callout', 'news', (c) => c.setCallout('info')),
  builtin('pullquote', 'news', (c) => c.setPullquote({})),
  builtin('readAlso', 'news', (c) => c.insertReadAlso()),
  builtin('image', 'media'),
  builtin('video', 'media'),
  builtin('embed', 'media'),
]);

/** Recurso que habilita cada embutido; os demais pertencem à base. */
const FEATURE_OF: ReadonlyMap<string, string> = new Map([
  ['taskList', 'tasks'],
  ['codeBlock', 'code'],
  ['table', 'tables'],
  ['callout', 'newsBlocks'],
  ['pullquote', 'newsBlocks'],
  ['readAlso', 'newsBlocks'],
  ['image', 'media'],
  ['video', 'media'],
  ['embed', 'embeds'],
]);

const BUILTIN_IDS: ReadonlySet<string> = new Set(
  RTE_SLASH_ITEMS.map((i) => i.id),
);

const ID_PATTERN = /^[a-z][a-zA-Z0-9-]{0,39}$/;

function availableDefaults(ctx: RteExtensionContext): readonly RteSlashItem[] {
  const features: readonly string[] = ctx.schema.features;
  return RTE_SLASH_ITEMS.filter((entry) => {
    const feature = FEATURE_OF.get(entry.id);
    if (feature === undefined) return true;
    if (!features.includes(feature)) return false;
    return feature !== 'embeds' || ctx.providers.length > 0;
  });
}

function kindOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Itens do menu: os embutidos disponíveis (por recurso) e, se houver, o
 * `items` do consumidor aplicado. `TypeError` para `id` inválido ou repetido.
 */
export function resolveSlashItems(
  ctx: RteExtensionContext,
  items: RteSlashOptions['items'],
): readonly RteSlashItem[] {
  const defaults = availableDefaults(ctx);
  const result =
    items === undefined
      ? defaults
      : typeof items === 'function'
        ? items(defaults)
        : items;
  if (!Array.isArray(result)) {
    throw new TypeError(
      `slash.items: esperava um array de itens (recebido ${kindOf(result)})`,
    );
  }
  const seen = new Set<string>();
  for (const entry of result as readonly unknown[]) {
    if (typeof entry !== 'object' || entry === null) {
      throw new TypeError(
        `slash.items: item inválido (${kindOf(entry)}); use um objeto com id`,
      );
    }
    const id: unknown = (entry as { id?: unknown }).id;
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      throw new TypeError(
        `slash.items: id inválido (${JSON.stringify(id)}); use ${ID_PATTERN.source}`,
      );
    }
    if (seen.has(id)) {
      throw new TypeError(`slash.items: id repetido (${JSON.stringify(id)})`);
    }
    seen.add(id);
  }
  return result;
}

/**
 * Rótulos efetivos: `en` com as sobreposições do consumidor por `id` (só
 * `title` string e `keywords` array de strings valem). Função que lança ou
 * devolve algo que não é objeto conta como ausente.
 */
export function resolveSlashLabels(
  source: RteSlashOptions['labels'],
): RteSlashLabels {
  const out: Record<string, { title: string; keywords: readonly string[] }> = {
    ...RTE_SLASH_LABELS.en,
  };
  let given: unknown;
  try {
    given = typeof source === 'function' ? source() : source;
  } catch {
    return out as RteSlashLabels;
  }
  if (typeof given !== 'object' || given === null) {
    return out as RteSlashLabels;
  }
  for (const [id, base] of Object.entries(out)) {
    if (!Object.hasOwn(given, id)) continue;
    const entry = (given as Record<string, unknown>)[id];
    if (typeof entry !== 'object' || entry === null) continue;
    const { title, keywords } = entry as {
      title?: unknown;
      keywords?: unknown;
    };
    out[id] = {
      title: typeof title === 'string' ? title : base.title,
      keywords:
        Array.isArray(keywords) && keywords.every((k) => typeof k === 'string')
          ? [...(keywords as string[])]
          : base.keywords,
    };
  }
  return out as RteSlashLabels;
}

function labelOf(
  id: string,
  labels: RteSlashLabels,
): { title: string; keywords: readonly string[] } | undefined {
  if (!BUILTIN_IDS.has(id) || !Object.hasOwn(labels, id)) return undefined;
  return labels[id as RteSlashItemId];
}

/** Título: o do item (string ou função válida), o rótulo do embutido ou o `id`. */
export function slashTitle(
  entry: RteSlashItem,
  labels: RteSlashLabels,
): string {
  let title: unknown = entry.title;
  if (typeof title === 'function') {
    try {
      title = (title as () => unknown)();
    } catch {
      title = undefined;
    }
  }
  if (typeof title === 'string') return title;
  return labelOf(entry.id, labels)?.title ?? entry.id;
}

/** Palavras-chave: as do item (array de strings) ou as do rótulo do embutido. */
export function slashKeywords(
  entry: RteSlashItem,
  labels: RteSlashLabels,
): readonly string[] {
  const own: unknown = entry.keywords;
  if (Array.isArray(own) && own.every((k) => typeof k === 'string')) {
    return own as string[];
  }
  return labelOf(entry.id, labels)?.keywords ?? [];
}

/** `NFD`, sem marcas diacríticas, minúsculas. */
export function normalizeForFilter(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function words(text: string): string[] {
  return normalizeForFilter(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== '');
}

/** O `id` inteiro e suas partes por hífen/camelCase (`readAlso` → read, also). */
function idWords(id: string): string[] {
  return [
    normalizeForFilter(id),
    ...words(id.replace(/([a-z0-9])([A-Z])/g, '$1 $2')),
  ];
}

/** Filtro por prefixo de palavra do título, das palavras-chave ou do `id`. */
export function filterSlashItems(
  items: readonly RteSlashItem[],
  query: string,
  labels: RteSlashLabels,
): readonly RteSlashItem[] {
  const q = normalizeForFilter(query);
  if (q === '') return items;
  return items.filter((entry) => {
    const candidates = [
      ...words(slashTitle(entry, labels)),
      ...slashKeywords(entry, labels).flatMap(words),
      ...idWords(entry.id),
    ];
    return candidates.some((w) => w.startsWith(q));
  });
}
