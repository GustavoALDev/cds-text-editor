import { Link } from '@tiptap/extension-link';
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
      };
    },
  }).configure({
    openOnClick: false,
    defaultProtocol: 'https',
    isAllowedUri: (url) => getLinkAttributes(url, policy) !== null,
  });
}
