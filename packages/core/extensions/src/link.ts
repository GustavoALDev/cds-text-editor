import { Link } from '@tiptap/extension-link';
import type { Mark } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import { getLinkAttributes, normalizeHref } from '../../src/links';
import type { RteExtensionContext } from './context';

type Target = '_blank' | null;

/** `target` guardado: só `_blank` (sem diferenciar caixa) ou nada (lição 10). */
function toTarget(value: unknown): Target {
  return typeof value === 'string' && value.toLowerCase() === '_blank'
    ? '_blank'
    : null;
}

/**
 * `link`: o Link oficial com a política de links aplicada na leitura, nos
 * comandos, no autolink/colagem e na renderização (spec 03b, B14). Só `href`
 * (normalizado) e `target` são guardados; `rel` é sempre derivado da política.
 */
export function createLinkExtension(ctx: RteExtensionContext) {
  const policy = ctx.linkPolicy;
  return Link.extend({
    addAttributes() {
      return {
        href: { default: null, rendered: false },
        target: { default: null, rendered: false },
      };
    },
    parseHTML() {
      return [
        {
          tag: 'a[href]',
          getAttrs: (dom) => {
            const element = dom as HTMLElement;
            const attrs = getLinkAttributes(
              element.getAttribute('href') ?? '',
              policy,
              { target: toTarget(element.getAttribute('target')) },
            );
            if (attrs === null) return false;
            return { href: attrs.href, target: attrs.target ?? null };
          },
        },
      ];
    },
    renderHTML({ mark }) {
      const href: unknown = mark.attrs['href'];
      const attrs =
        typeof href === 'string'
          ? getLinkAttributes(href, policy, {
              target: toTarget(mark.attrs['target']),
            })
          : null;
      // Ordem canônica: href, target, rel. Href rejeitado → `<a>` inerte.
      const out: Record<string, string> = {};
      if (attrs !== null) {
        out['href'] = attrs.href;
        if (attrs.target) out['target'] = attrs.target;
        if (attrs.rel) out['rel'] = attrs.rel;
      }
      return ['a', out, 0];
    },
    addCommands() {
      return {
        ...this.parent?.(),
        setLink:
          (attributes) =>
          ({ chain }) => {
            const rawHref: unknown = attributes?.href;
            const href =
              typeof rawHref === 'string'
                ? normalizeHref(rawHref, policy)
                : null;
            if (href === null) return false;
            const attrs = getLinkAttributes(href, policy, {
              target: toTarget(attributes.target),
            });
            if (attrs === null) return false;
            return chain()
              .setMark(this.name, {
                href: attrs.href,
                target: toTarget(attributes.target),
              })
              .setMeta('preventAutolink', true)
              .run();
          },
        toggleLink:
          (attributes) =>
          ({ chain }) => {
            const rawHref: unknown = attributes?.href;
            if (typeof rawHref !== 'string') return false;
            const attrs = getLinkAttributes(rawHref, policy, {
              target: toTarget(attributes?.target),
            });
            if (attrs === null) return false;
            return chain()
              .toggleMark(
                this.name,
                { href: attrs.href, target: attrs.target ?? null },
                { extendEmptyMarkRange: true },
              )
              .setMeta('preventAutolink', true)
              .run();
          },
      };
    },
    addProseMirrorPlugins() {
      const markType = this.type;
      return [
        ...(this.parent?.() ?? []),
        new Plugin({
          // Autolink e colagem guardam o href do linkify; aqui ele vira o
          // canônico, só nos trechos tocados pela transação (sem laço).
          appendTransaction(transactions, _old, state) {
            let ranges: [number, number][] = [];
            for (const tr of transactions) {
              if (!tr.docChanged) continue;
              tr.mapping.maps.forEach((map, i) => {
                ranges = ranges.map(
                  ([a, b]) =>
                    [map.map(a, -1), map.map(b, 1)] as [number, number],
                );
                let any = false;
                map.forEach((_f, _t, from, to) => {
                  any = true;
                  ranges.push([from, to]);
                });
                // Passos de marca (AddMarkStep) têm mapa vazio: usa from/to.
                const step = tr.steps[i] as { from?: unknown; to?: unknown };
                if (
                  !any &&
                  typeof step?.from === 'number' &&
                  typeof step.to === 'number'
                ) {
                  ranges.push([step.from, step.to]);
                }
              });
            }
            if (ranges.length === 0) return null;
            const size = state.doc.content.size;
            const fixes: {
              from: number;
              to: number;
              mark: Mark;
              next: Mark | null;
            }[] = [];
            for (const [a, b] of ranges) {
              state.doc.nodesBetween(
                Math.max(0, a),
                Math.min(size, b),
                (node, pos) => {
                  if (!node.isText) return;
                  for (const mark of node.marks) {
                    if (mark.type !== markType) continue;
                    const href: unknown = mark.attrs['href'];
                    const target = toTarget(mark.attrs['target']);
                    const canon =
                      typeof href === 'string'
                        ? getLinkAttributes(href, policy, { target })
                        : null;
                    if (
                      canon !== null &&
                      canon.href === href &&
                      (canon.target ?? null) === mark.attrs['target']
                    ) {
                      continue;
                    }
                    fixes.push({
                      from: pos,
                      to: pos + node.nodeSize,
                      mark,
                      next:
                        canon === null
                          ? null
                          : markType.create({
                              href: canon.href,
                              target: canon.target ?? null,
                            }),
                    });
                  }
                },
              );
            }
            if (fixes.length === 0) return null;
            const tr = state.tr;
            for (const f of fixes) {
              tr.removeMark(f.from, f.to, f.mark);
              if (f.next) tr.addMark(f.from, f.to, f.next);
            }
            return tr;
          },
        }),
      ];
    },
  }).configure({
    openOnClick: false,
    defaultProtocol: 'https',
    isAllowedUri: (url) => getLinkAttributes(url, policy) !== null,
    shouldAutoLink: (url) => getLinkAttributes(url, policy) !== null,
  });
}
