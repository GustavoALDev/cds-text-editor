// @vitest-environment jsdom
// Propriedades da serialização (spec 03b, §7.5): (a) segurança — nenhum
// esquema perigoso chega a `href`/`src`/`srcset`/`poster` e as únicas
// violações aceitas são de elemento inerte; (b) idempotência —
// `serializeRteHtml(parse(serializeRteHtml(doc))) === serializeRteHtml(doc)`.
//
// Reproduzir uma falha: `FC_SEED=<n> npx vitest run extensions/src/properties.spec.ts`
// (a semente aparece na falha); `FC_RUNS` muda o número de execuções.
import { getSchema } from '@tiptap/core';
import { DOMParser as PMParser } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import * as fc from 'fast-check';
import { Parser } from 'htmlparser2';
import { describe, expect, it, vi } from 'vitest';
import { validateHtml } from '../../html/src/validate-html';
import { getHtmlSchema } from '../../src/schema/get-html-schema';
import { dangerousUrl } from '../../src/schema/testing/dangerous-urls';
import { createEditorExtensions } from './factory';
import { serializeRteHtml } from './serialize';

const SEED = Number(process.env['FC_SEED'] ?? 20261003);
const RUNS = Number(process.env['FC_RUNS'] ?? 500);
vi.setConfig({ testTimeout: 120_000 }); // FC_RUNS alto em execuções locais

const schema = getSchema(createEditorExtensions());
const S = getHtmlSchema();
const URL_ATTRS = new Set(['href', 'src', 'srcset', 'poster']);
const DANGEROUS = /^(?:javascript|data|vbscript):/;
// Espaço ASCII e controles C0/C1 somem antes do teste do esquema (como fazem
// os navegadores ao resolver a URL).
// eslint-disable-next-line no-control-regex
const STRIP = /[\u0000-\u0020\u007f-\u009f]/g;

// ---------------------------------------------------------------------------
// Geradores

/** Letra de texto: qualquer grafema imprimível, mais NBSP, `<`, `&`, aspas. */
const textChar = fc
  .oneof(
    fc.constantFrom('\u00a0', '<', '>', '&', '"', "'", 'é', '😀', '&amp;'),
    fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }),
  )
  // espaço/controle ASCII e C1 colapsam ou somem na leitura do HTML
  // eslint-disable-next-line no-control-regex
  .filter((c) => !/[\u0000-\u0020\u007f-\u009f]/.test(c));

/**
 * Texto sem espaço nas pontas e com um espaço só entre palavras: ponto fixo
 * do colapso de espaços da leitura de HTML (que é intencional, A1).
 */
const text = fc
  .array(fc.string({ unit: textChar, minLength: 1, maxLength: 6 }), {
    minLength: 1,
    maxLength: 3,
  })
  .map((words) => words.join(' '));

/** Mídia válida: `https` absoluta ou relativa (padrão `allowRelativeMedia`). */
const validMediaUrl = fc.oneof(
  fc.webUrl({ validSchemes: ['https'] }),
  fc.constantFrom('https://example.com/a.png', '/relativo/a.jpg', '/v.mp4'),
);

/** Link válido: mídia válida, `http`, `mailto:`, `tel:` e fragmento. */
const validLinkUrl = fc.oneof(
  validMediaUrl,
  fc.webUrl({ validSchemes: ['http', 'https'] }),
  fc.constantFrom('mailto:a@example.com', 'tel:+5511999999999', '#secao'),
);

/**
 * Par provedor/`src` canônico (o JSON guarda o `src` do iframe; URL de página
 * só vira embed na leitura do HTML).
 */
const validEmbed = fc.constantFrom(
  ['youtube', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
  ['youtube', 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ'],
  ['vimeo', 'https://player.vimeo.com/video/76979871'],
  ['spotify', 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC'],
  ['spotify', 'https://open.spotify.com/embed/album/1DFixLWuPkv3KT3TnV35m3'],
);

/** URL arbitrária: perigosa ofuscada, `\`, `//`, texto qualquer ou válida. */
const anyUrl = fc.oneof(
  dangerousUrl,
  fc.string(),
  fc.string().map((s) => `\\\\${s}`),
  fc.string().map((s) => `//${s}`),
  validLinkUrl,
);

const anyEmbed = fc.oneof(
  fc.tuple(fc.constantFrom('youtube', 'vimeo', 'spotify', 'outro'), anyUrl),
  validEmbed,
);

const maybe = <T>(arb: fc.Arbitrary<T>) => fc.option(arb, { nil: null });

interface DocUrls {
  link: fc.Arbitrary<string>;
  media: fc.Arbitrary<string>;
  embed: fc.Arbitrary<readonly [string, string]>;
  target: fc.Arbitrary<string | null>;
}

function docArb(urls: DocUrls, str: fc.Arbitrary<string>) {
  const url = urls.media;
  const textNode = fc
    .tuple(text, fc.option(fc.tuple(urls.link, urls.target)))
    .map(([t, link]) => ({
      type: 'text',
      text: t,
      ...(link
        ? {
            marks: [
              { type: 'link', attrs: { href: link[0], target: link[1] } },
            ],
          }
        : {}),
    }));
  const paragraph = fc
    .array(textNode, { minLength: 1, maxLength: 3 })
    .map((content) => ({ type: 'paragraph', content }));
  const size = maybe(fc.oneof(fc.integer({ min: 1, max: 4000 }), fc.integer()));
  const image = fc
    .record({
      src: url,
      alt: maybe(str),
      width: size,
      height: size,
      srcset: maybe(
        fc.oneof(
          url,
          url.map((u) => `${u} 2x`),
        ),
      ),
      sizes: maybe(str),
      align: fc.constantFrom('left', 'center', 'right', 'full'),
      caption: str,
      credit: str,
    })
    .map((attrs) => ({ type: 'rtImage', attrs }));
  const track = fc.record({
    kind: fc.constantFrom('captions', 'subtitles'),
    src: url,
    srclang: fc.constantFrom('pt', 'en', 'pt-BR'),
    label: str,
    default: fc.boolean(),
  });
  const video = fc
    .record({
      src: url,
      width: size,
      height: size,
      poster: maybe(url),
      preload: fc.constantFrom('metadata', 'none'),
      tracks: fc.array(track, { maxLength: 2 }),
      caption: str,
    })
    .map((attrs) => ({ type: 'rtVideo', attrs }));
  const embed = fc
    .record({
      target: urls.embed,
      title: str,
      width: size,
      height: size,
      aspectRatio: maybe(fc.constantFrom('16 / 9', '9 / 16', '4 / 3')),
      caption: str,
    })
    .map(({ target: [provider, src], ...rest }) => ({
      type: 'rtEmbed',
      attrs: { provider, src, ...rest },
    }));
  const code = fc
    .record({
      language: maybe(
        fc.oneof(fc.constantFrom('javascript', 'js', 'python'), fc.string()),
      ),
      body: fc.string({ minLength: 1 }),
    })
    .map(({ language, body }) => ({
      type: 'codeBlock',
      attrs: { language },
      content: [{ type: 'text', text: body.replace(/\r\n?/g, '\n') }],
    }));
  return fc
    .array(fc.oneof(paragraph, image, video, embed, code), {
      minLength: 1,
      maxLength: 5,
    })
    .map((content) => ({ type: 'doc', content }));
}

/** Documento com atributos de URL arbitrários (segurança). */
const hostileDoc = docArb(
  {
    link: anyUrl,
    media: anyUrl,
    embed: anyEmbed,
    target: maybe(fc.oneof(fc.constantFrom('_blank', '_BLANK'), fc.string())),
  },
  fc.string(),
);
/** Documento só com URLs válidas e textos arbitrários (idempotência). */
const validDoc = docArb(
  {
    link: validLinkUrl,
    media: validMediaUrl,
    embed: validEmbed,
    // único `target` canônico (outro valor sai sem atributo e junta links)
    target: maybe(fc.constant('_blank')),
  },
  text,
);

// ---------------------------------------------------------------------------
// Auxiliares

/** Pares `[nome, valor]` de todos os atributos (candidatos do `srcset` à parte). */
function attributes(html: string): [string, string][] {
  const pairs: [string, string][] = [];
  const parser = new Parser(
    {
      onopentag(_tag, attrs) {
        for (const [name, value] of Object.entries(attrs)) {
          pairs.push([name, value]);
          if (name === 'srcset') {
            for (const candidate of value.split(',')) {
              pairs.push([name, candidate]);
            }
          }
        }
      },
    },
    {
      decodeEntities: true,
      lowerCaseTags: true,
      lowerCaseAttributeNames: true,
    },
  );
  parser.write(html);
  parser.end();
  return pairs;
}

/** `DOMParser.fromSchema(schema).parse` sobre um `div` do jsdom. */
function parse(html: string): ProseMirrorNode {
  const body = new window.DOMParser().parseFromString(html, 'text/html').body;
  const div = document.createElement('div');
  div.append(...Array.from(body.childNodes));
  return PMParser.fromSchema(schema).parse(div);
}

const params = { seed: SEED, numRuns: RUNS };

// ---------------------------------------------------------------------------

describe('propriedades da serialização', () => {
  it('(a) segurança: nenhum esquema perigoso; só violações de elemento inerte', () => {
    fc.assert(
      fc.property(hostileDoc, (json) => {
        const out = serializeRteHtml(schema.nodeFromJSON(json));
        for (const [name, value] of attributes(out)) {
          expect(name).not.toMatch(/^(?:on|srcdoc$)/);
          if (URL_ATTRS.has(name)) {
            expect(value.toLowerCase().replace(STRIP, '')).not.toMatch(
              DANGEROUS,
            );
          }
        }
        for (const v of validateHtml(out, S, { mode: 'accepted' })) {
          expect(v.kind).toBe('missing-required-attribute');
          expect(['href', 'src']).toContain(v.name);
        }
      }),
      params,
    );
  });

  it('(b) idempotência com URLs válidas e textos arbitrários', () => {
    fc.assert(
      fc.property(validDoc, (json) => {
        const out = serializeRteHtml(schema.nodeFromJSON(json));
        // o gerador só produz documentos válidos: nada inerte (elemento sem
        // href/src não é relido), então a saída é canônica sem violações
        expect(validateHtml(out, S)).toEqual([]);
        expect(serializeRteHtml(parse(out))).toBe(out);
      }),
      params,
    );
  });
});
