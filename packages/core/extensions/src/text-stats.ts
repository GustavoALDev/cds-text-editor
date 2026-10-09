import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TEXT_BLOCK_TAGS, collapseTextLine } from '../../src/text-lines';
import { countCharacters, countWords } from '../../src/text';
import { resolveContentLabels } from './labels';
import { withRenderDocument } from './render-document';
import { createStringDocument } from './string-dom';
import { emptyTitleLabel } from './titles';
import type { RteContentLabels, RteContentLabelsSource } from './types';

/** Contagem de caracteres e palavras do texto visível. */
export interface RteTextStats {
  /** Quantidade de caracteres (pontos de código). */
  characters: number;
  /** Quantidade de palavras. */
  words: number;
}

interface CacheEntry {
  /** Chave dos rótulos usados pelo bloco (`null`: o bloco não usou rótulo). */
  labelsKey: string | null;
  stats: RteTextStats;
}

/** Interno (testes, C7): blocos de topo calculados (faltas no cache). */
export const textStatsProbe = { blocks: 0 };

// O ProseMirror reaproveita os nós não alterados: um bloco de topo igual por
// identidade tem as mesmas estatísticas (C7).
const cache = new WeakMap<ProseMirrorNode, CacheEntry>();

/**
 * Caracteres e palavras do documento pela regra única (spec 03c, C5): igual a
 * `countCharacters`/`countWords` de `htmlToText(serializeRteHtml(doc, { labels }))`,
 * sem serializar. Recalcula só os blocos de topo alterados (C7).
 */
export function getRteTextStats(
  doc: ProseMirrorNode,
  options: { labels?: RteContentLabelsSource } = {},
): RteTextStats {
  const labels = resolveContentLabels(options.labels);
  const key = JSON.stringify([labels.calloutTitles, labels.readAlsoTitle]);
  let characters = 0;
  let words = 0;
  doc.forEach((block) => {
    let entry = cache.get(block);
    if (!entry || (entry.labelsKey !== null && entry.labelsKey !== key)) {
      entry = blockStats(block, labels, key);
      cache.set(block, entry);
    }
    characters += entry.stats.characters;
    words += entry.stats.words;
  });
  return { characters, words };
}

/**
 * Linhas de um bloco de topo pelas regras do `htmlToText`: blocos de texto são
 * genéricos; os demais nós seguem a especificação de saída (`toDOM`), para que
 * textos de atributos (legenda, crédito, autor) contem como no HTML.
 */
function blockStats(
  block: ProseMirrorNode,
  labels: RteContentLabels,
  key: string,
): CacheEntry {
  textStatsProbe.blocks++;
  const lines: string[] = [];
  let line = '';
  let usedLabel = false;
  const flush = () => {
    const t = collapseTextLine(line);
    if (t) lines.push(t);
    line = '';
  };

  const walk = (node: ProseMirrorNode, parent: ProseMirrorNode | null) => {
    if (node.isText) {
      line += node.text ?? '';
    } else if (node.type.name === 'hardBreak') {
      flush();
    } else if (node.isTextblock) {
      flush();
      const label = emptyTitleLabel(node, parent, labels);
      if (label !== null) {
        usedLabel = true;
        line += label;
      } else {
        node.forEach((child) => walk(child, node));
      }
      flush();
    } else if (!node.isInline) {
      const spec = node.type.spec.toDOM?.(node);
      if (Array.isArray(spec)) {
        walkSpec(spec, node);
      } else {
        flush();
        node.forEach((child) => walk(child, node));
        flush();
      }
    }
  };

  const walkSpec = (spec: readonly unknown[], node: ProseMirrorNode) => {
    const tag = String(spec[0]).toLowerCase();
    const isBlock = TEXT_BLOCK_TAGS.has(tag);
    if (isBlock) flush();
    for (let i = 1; i < spec.length; i++) {
      const child = spec[i];
      if (typeof child === 'string') line += child;
      else if (child === 0) node.forEach((c) => walk(c, node));
      else if (Array.isArray(child)) walkSpec(child, node);
    }
    if (isBlock) flush();
  };

  // `toDOM` que monta nós usa o documento de renderização (sem DOM global).
  withRenderDocument(createStringDocument(), () => walk(block, null));
  flush();
  const text = lines.join('\n');
  let characters = 0;
  for (const l of lines) characters += countCharacters(l);
  return {
    labelsKey: usedLabel ? key : null,
    stats: { characters, words: countWords(text) },
  };
}
