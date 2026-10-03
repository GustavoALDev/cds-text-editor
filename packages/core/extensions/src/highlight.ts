import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import { createLowlight } from 'lowlight';
import type { RteCodeLanguage } from '../../code-languages/src/index';
import type { RteElementSpec } from '../../src/schema/types';
import { resolveCodeLanguage } from './code-block';
import type { RteExtensionContext } from './context';

const highlightKey = new PluginKey<DecorationSet>('rtCodeHighlight');
const LOADED = 'loaded';

/** Nó da árvore hast do `lowlight`, só com o que o realce lê. */
interface HastNode {
  type: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
}

/**
 * Decorações inline (`hljs-*`) de um texto, a partir da árvore do `lowlight`.
 * `start` é a posição do primeiro caractere do bloco.
 */
function treeDecorations(root: HastNode, start: number): Decoration[] {
  const out: Decoration[] = [];
  let offset = 0;
  const walk = (node: HastNode, classes: readonly string[]): void => {
    if (node.type === 'text') {
      const length = node.value?.length ?? 0;
      if (classes.length > 0 && length > 0) {
        out.push(
          Decoration.inline(start + offset, start + offset + length, {
            class: classes.join(' '),
          }),
        );
      }
      offset += length;
      return;
    }
    const own = node.properties?.className;
    const next = Array.isArray(own)
      ? [...classes, ...own.filter((c): c is string => typeof c === 'string')]
      : classes;
    for (const child of node.children ?? []) walk(child, next);
  };
  walk(root, []);
  return out;
}

/** Intervalos do documento final tocados pela transação (inclui `AttrStep`). */
function changedRanges(tr: Transaction): [number, number][] {
  let ranges: [number, number][] = [];
  tr.mapping.maps.forEach((map, i) => {
    ranges = ranges.map(([a, b]) => [map.map(a, -1), map.map(b, 1)]);
    let any = false;
    map.forEach((_oldFrom, _oldTo, from, to) => {
      any = true;
      ranges.push([from, to]);
    });
    // Passos de atributo (setNodeAttribute) têm mapa vazio: usa `pos`.
    const step = tr.steps[i] as { pos?: unknown };
    if (!any && typeof step?.pos === 'number') {
      ranges.push([step.pos, step.pos + 1]);
    }
  });
  return ranges;
}

/**
 * Plugin de realce do bloco de código (spec 03b, B15/R10): uma instância
 * própria de `lowlight` (vazia) por plugin — isto é, por editor —, gramáticas
 * do catálogo carregadas sob demanda (uma vez por editor, falha sem nova
 * tentativa), nunca `highlightAuto`. Só decorações: nada vai para o HTML.
 */
export function createHighlightPlugin(ctx: RteExtensionContext): Plugin {
  const elements = ctx.schema.elements;
  const codeSpec: RteElementSpec | undefined = Object.hasOwn(elements, 'code')
    ? elements['code']
    : undefined;
  const byId = new Map<string, RteCodeLanguage>(
    ctx.codeLanguages.map((language) => [language.id, language]),
  );
  const lowlight = createLowlight();
  // id → estado da carga; ausente = nunca pedida.
  const loads = new Map<string, 'pending' | 'loaded' | 'failed'>();
  let view: EditorView | null = null;
  let destroyed = false;
  let refreshPending = false;

  const refresh = (): void => {
    if (destroyed) return;
    if (view === null || view.isDestroyed) {
      // Vista ainda não montada: o realce entra quando ela montar.
      refreshPending = true;
      return;
    }
    view.dispatch(
      view.state.tr
        .setMeta(highlightKey, LOADED)
        .setMeta('addToHistory', false),
    );
  };

  const requestLoad = (language: RteCodeLanguage): void => {
    if (loads.has(language.id)) return;
    loads.set(language.id, 'pending');
    new Promise<Awaited<ReturnType<RteCodeLanguage['load']>>>((resolve) => {
      resolve(language.load());
    }).then(
      (grammar) => {
        if (destroyed) return;
        try {
          lowlight.register(language.id, grammar);
          if (language.aliases.length > 0) {
            lowlight.registerAlias(language.id, language.aliases);
          }
        } catch {
          loads.set(language.id, 'failed');
          return;
        }
        loads.set(language.id, 'loaded');
        refresh();
      },
      () => {
        // Falha de carga: o bloco fica sem realce, sem novas tentativas.
        loads.set(language.id, 'failed');
      },
    );
  };

  const blockDecorations = (
    node: ProseMirrorNode,
    pos: number,
  ): Decoration[] => {
    const raw: unknown = node.attrs['language'];
    if (typeof raw !== 'string' || codeSpec === undefined) return [];
    const id = resolveCodeLanguage(raw, ctx.codeLanguages, codeSpec);
    const language = id === null ? undefined : byId.get(id);
    if (language === undefined) return [];
    if (loads.get(language.id) !== 'loaded') {
      requestLoad(language);
      return [];
    }
    try {
      const root = lowlight.highlight(language.id, node.textContent);
      return treeDecorations(root as HastNode, pos + 1);
    } catch {
      return [];
    }
  };

  const isCodeBlock = (node: ProseMirrorNode): boolean =>
    node.type.spec.code === true && node.isTextblock;

  const all = (doc: ProseMirrorNode): DecorationSet => {
    const decorations: Decoration[] = [];
    doc.descendants((node, pos) => {
      if (isCodeBlock(node)) {
        decorations.push(...blockDecorations(node, pos));
        return false;
      }
      return true;
    });
    return DecorationSet.create(doc, decorations);
  };

  const update = (
    tr: Transaction,
    old: DecorationSet,
    state: EditorState,
  ): DecorationSet => {
    const doc = state.doc;
    let set = old.map(tr.mapping, doc);
    const size = doc.content.size;
    const seen = new Set<number>();
    for (const [a, b] of changedRanges(tr)) {
      doc.nodesBetween(
        Math.max(0, a - 1),
        Math.min(size, Math.max(a, b) + 1),
        (node, pos) => {
          if (!isCodeBlock(node)) return true;
          if (!seen.has(pos)) {
            seen.add(pos);
            const end = pos + node.nodeSize;
            set = set
              .remove(set.find(pos, end))
              .add(doc, blockDecorations(node, pos));
          }
          return false;
        },
      );
    }
    return set;
  };

  return new Plugin<DecorationSet>({
    key: highlightKey,
    state: {
      init: (_config, state) => all(state.doc),
      apply: (tr, old, _oldState, state) => {
        if (tr.getMeta(highlightKey) === LOADED) return all(state.doc);
        if (!tr.docChanged) return old;
        return update(tr, old, state);
      },
    },
    props: {
      decorations: (state) => highlightKey.getState(state),
    },
    view: (editorView) => {
      // Reconfigurar o estado recria a vista do plugin: volta a valer.
      destroyed = false;
      view = editorView;
      if (refreshPending) {
        refreshPending = false;
        // Fora do construtor da vista, que ainda não terminou de montar.
        queueMicrotask(refresh);
      }
      return {
        destroy: () => {
          destroyed = true;
          view = null;
        },
      };
    },
  });
}
