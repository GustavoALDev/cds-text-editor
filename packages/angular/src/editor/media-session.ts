import {
  normalizeAttribute,
  parseSrcset,
  type RteAttrRule,
  type RteHtmlSchema,
} from '@cds/rte-core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';

/** Delta de uma transação (V13). Endereços canônicos, ordenados, sem repetição. */
export interface RteMediaChange {
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

/** Líquido desde a base (criação ou última carga externa) (V13). */
export interface RteMediaSession {
  readonly current: readonly string[];
  /** `current − base`. */
  readonly added: readonly string[];
  /** `(base ∪ vistos na sessão) − current`. */
  readonly removed: readonly string[];
}

/** Sessão antes da criação do editor. */
export const EMPTY_MEDIA_SESSION: RteMediaSession = Object.freeze({
  current: Object.freeze([]),
  added: Object.freeze([]),
  removed: Object.freeze([]),
});

/**
 * Sonda de teste (pré-voo 12): nós visitados pelo rastreador. Só conta em
 * desenvolvimento (`ngDevMode` some no build de produção).
 */
export const mediaTrackerProbe = { visited: 0 };

function countVisit(): void {
  if (typeof ngDevMode !== 'undefined' && ngDevMode) {
    mediaTrackerProbe.visited += 1;
  }
}

/** Ordem por unidade de código: determinística em qualquer motor (Ruling 16). */
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function frozenSorted(values: Iterable<string>): readonly string[] {
  return Object.freeze([...new Set(values)].sort(byCodeUnit));
}

/**
 * Regras do esquema que o `renderHTML` do core aplica aos endereços de mídia
 * (V13: a sessão conta os endereços **canônicos** que o HTML escreve).
 */
export interface RteMediaUrlRules {
  readonly imageSrc: RteAttrRule;
  readonly imageSrcset: RteAttrRule;
  readonly videoSrc: RteAttrRule;
  readonly videoPoster: RteAttrRule;
  readonly trackKind: RteAttrRule;
  readonly trackSrc: RteAttrRule;
  readonly trackLang: RteAttrRule;
}

/** Regras do esquema; `null` sem o recurso `media` (não há nós de mídia). */
export function readMediaUrlRules(
  schema: RteHtmlSchema,
): RteMediaUrlRules | null {
  const rule = (tag: string, attr: string): RteAttrRule | null =>
    schema.elements[tag]?.attributes[attr]?.rule ?? null;
  const rules = {
    imageSrc: rule('img', 'src'),
    imageSrcset: rule('img', 'srcset'),
    videoSrc: rule('video', 'src'),
    videoPoster: rule('video', 'poster'),
    trackKind: rule('track', 'kind'),
    trackSrc: rule('track', 'src'),
    trackLang: rule('track', 'srclang'),
  };
  return Object.values(rules).every((r) => r !== null)
    ? (rules as RteMediaUrlRules)
    : null;
}

/** Forma canônica pela regra, como o `byRule` do core (texto ou inteiro). */
function byRule(rule: RteAttrRule, value: unknown): string | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return normalizeAttribute(rule, String(value));
  }
  return typeof value === 'string' ? normalizeAttribute(rule, value) : null;
}

function pushUrl(out: string[], rule: RteAttrRule, value: unknown): void {
  const url = byRule(rule, value);
  if (url) out.push(url);
}

/**
 * Endereços de mídia de um nó (V13), na forma canônica que o `renderHTML` do
 * core escreve: `img[src]`, cada URL do `srcset`, `video[src]`,
 * `video[poster]` e `track[src]` das faixas que ele renderiza; valor que a
 * regra recusa não é escrito e não conta. *Embeds* ficam de fora. Com
 * repetição (contagem de referências).
 */
export function mediaUrlsOf(
  node: ProseMirrorNode,
  rules: RteMediaUrlRules | null,
): readonly string[] {
  const out: string[] = [];
  if (!rules) return out;
  const attrs = node.attrs as Record<string, unknown>;
  if (node.type.name === 'rtImage') {
    pushUrl(out, rules.imageSrc, attrs['src']);
    const srcset = byRule(rules.imageSrcset, attrs['srcset']);
    for (const candidate of srcset ? (parseSrcset(srcset) ?? []) : []) {
      if (candidate.url) out.push(candidate.url);
    }
  } else if (node.type.name === 'rtVideo') {
    pushUrl(out, rules.videoSrc, attrs['src']);
    pushUrl(out, rules.videoPoster, attrs['poster']);
    const tracks = attrs['tracks'];
    if (Array.isArray(tracks)) {
      for (const item of tracks as unknown[]) {
        if (item === null || typeof item !== 'object') continue;
        const track = item as Record<string, unknown>;
        // As mesmas faixas que o core renderiza (as inválidas são descartadas).
        const kind =
          track['kind'] === undefined || track['kind'] === null
            ? 'subtitles'
            : byRule(rules.trackKind, track['kind']);
        const src = byRule(rules.trackSrc, track['src']);
        const lang = byRule(rules.trackLang, track['srclang']);
        if (kind !== null && src && lang !== null) out.push(src);
      }
    }
  }
  return out;
}

/** `alt` ausente na sessão (V7): `null` ou valor que o core não lê como texto. */
const isMissingAlt = (node: ProseMirrorNode) =>
  node.type.name === 'rtImage' && typeof node.attrs['alt'] !== 'string';

/** Recontagem completa: endereço canônico → número de referências. */
export function countMedia(
  doc: ProseMirrorNode,
  rules: RteMediaUrlRules | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  doc.descendants((node) => {
    countVisit();
    for (const url of mediaUrlsOf(node, rules)) {
      counts.set(url, (counts.get(url) ?? 0) + 1);
    }
  });
  return counts;
}

function countMissingAlt(doc: ProseMirrorNode): number {
  let missing = 0;
  doc.descendants((node) => {
    if (isMissingAlt(node)) missing += 1;
  });
  return missing;
}

/** Igualdade por conteúdo (V13). */
export function sameMediaSession(
  a: RteMediaSession,
  b: RteMediaSession,
): boolean {
  const same = (x: readonly string[], y: readonly string[]) =>
    x.length === y.length && x.every((v, i) => v === y[i]);
  return (
    same(a.current, b.current) &&
    same(a.added, b.added) &&
    same(a.removed, b.removed)
  );
}

/**
 * Rastreador da sessão de mídia (V13): contagem de referências mantida de
 * forma incremental, só nos intervalos alterados de cada passo (pré-voo 12).
 */
export class RteMediaTracker {
  private counts = new Map<string, number>();
  private base = new Set<string>();
  private seen = new Set<string>();
  private missing = 0;
  private doc!: ProseMirrorNode;
  private cached: RteMediaSession | null = null;
  /** Presença de cada endereço tocado antes do lote em curso. */
  private touched = new Map<string, boolean>();

  constructor(
    doc: ProseMirrorNode,
    private readonly rules: RteMediaUrlRules | null,
  ) {
    this.reset(doc);
  }

  /** Nova base (criação ou carga externa, D9), sem delta. */
  reset(doc: ProseMirrorNode): void {
    this.doc = doc;
    this.counts = countMedia(doc, this.rules);
    this.base = new Set(this.counts.keys());
    this.seen = new Set();
    this.missing = countMissingAlt(doc);
    this.cached = null;
  }

  /**
   * Aplica o lote `[transaction, ...appendedTransactions]`; devolve o delta
   * líquido do lote, ou `null` quando o conjunto de endereços não muda.
   */
  apply(trs: readonly Transaction[]): RteMediaChange | null {
    this.touched.clear();
    for (const tr of trs) {
      if (!tr.docChanged) continue;
      if (tr.before !== this.doc) this.recount(tr.doc);
      else this.applySteps(tr);
      this.doc = tr.doc;
    }
    const added: string[] = [];
    const removed: string[] = [];
    for (const [url, was] of this.touched) {
      const is = this.counts.has(url);
      if (is && !was) added.push(url);
      else if (!is && was) removed.push(url);
    }
    this.touched.clear();
    if (!added.length && !removed.length) return null;
    for (const url of added) this.seen.add(url);
    this.cached = null;
    return Object.freeze({
      added: frozenSorted(added),
      removed: frozenSorted(removed),
    });
  }

  /** Líquido da sessão; o mesmo objeto enquanto o conjunto não muda. */
  session(): RteMediaSession {
    if (this.cached) return this.cached;
    const current = frozenSorted(this.counts.keys());
    const added = current.filter((url) => !this.base.has(url));
    const removed = [...this.base, ...this.seen].filter(
      (url) => !this.counts.has(url),
    );
    this.cached = Object.freeze({
      current,
      added: frozenSorted(added),
      removed: frozenSorted(removed),
    });
    return this.cached;
  }

  /** Imagens com `alt: null` (interno, para a 05c2, V7). */
  missingAlt(): number {
    return this.missing;
  }

  private bump(node: ProseMirrorNode, sign: 1 | -1): void {
    countVisit();
    if (isMissingAlt(node)) this.missing += sign;
    for (const url of mediaUrlsOf(node, this.rules)) {
      const count = this.counts.get(url) ?? 0;
      if (!this.touched.has(url)) this.touched.set(url, count > 0);
      const next = count + sign;
      if (next > 0) this.counts.set(url, next);
      else this.counts.delete(url);
    }
  }

  private visit(
    doc: ProseMirrorNode,
    from: number,
    to: number,
    sign: 1 | -1,
  ): void {
    if (from >= to) return;
    doc.nodesBetween(from, to, (node) => {
      this.bump(node, sign);
    });
  }

  /**
   * Cada passo `i`: o que estava nas faixas do mapa em `tr.docs[i]` sai e o
   * que está nelas no documento seguinte entra. Passo de mapa vazio com `pos`
   * (`AttrStep`, marcas de nó) troca o nó em `pos`; passos de marca de texto
   * não mudam atributos de mídia.
   */
  private applySteps(tr: Transaction): void {
    tr.mapping.maps.forEach((map, i) => {
      const before = tr.docs[i];
      const after = tr.docs[i + 1] ?? tr.doc;
      if (!before) return;
      let any = false;
      map.forEach((oldStart, oldEnd, newStart, newEnd) => {
        any = true;
        this.visit(before, oldStart, oldEnd, -1);
        this.visit(after, newStart, newEnd, 1);
      });
      if (any) return;
      const pos = (tr.steps[i] as { pos?: unknown } | undefined)?.pos;
      if (typeof pos !== 'number') return;
      const old = before.nodeAt(pos);
      const next = after.nodeAt(pos);
      if (old) this.bump(old, -1);
      if (next) this.bump(next, 1);
    });
  }

  /** Lote que não parte do documento conhecido: recontagem completa. */
  private recount(doc: ProseMirrorNode): void {
    const next = countMedia(doc, this.rules);
    for (const url of new Set([...this.counts.keys(), ...next.keys()])) {
      if (!this.touched.has(url)) this.touched.set(url, this.counts.has(url));
    }
    this.counts = next;
    this.missing = countMissingAlt(doc);
  }
}
