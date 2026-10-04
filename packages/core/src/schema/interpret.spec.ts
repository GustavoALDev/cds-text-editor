import { describe, expect, it } from 'vitest';
import { escapeHtmlAttribute, escapeHtmlText } from './escape';
import { getHtmlSchema } from './get-html-schema';
import {
  getElementSpec,
  hasRequiredChild,
  sanitizeAttributes,
  sanitizeClass,
} from './interpret';
import { normalizeAttribute } from './rules';
import type { RteElementSpec, RteHtmlSchema } from './types';

const S = getHtmlSchema();

function el(schema: RteHtmlSchema, tag: string): RteElementSpec {
  const spec = getElementSpec(schema, tag);
  if (!spec) throw new Error(`sem ${tag} no esquema`);
  return spec;
}

const TAGS = [
  'a',
  'figure',
  'iframe',
  'img',
  'input',
  'li',
  'mark',
  'p',
  'span',
  'track',
  'video',
] as const;
const E = Object.fromEntries(TAGS.map((tag) => [tag, el(S, tag)])) as Record<
  (typeof TAGS)[number],
  RteElementSpec
>;

const IFRAME_SRC = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
const IFRAME_SANDBOX =
  'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox';
const IFRAME_ALLOW = 'encrypted-media; fullscreen; picture-in-picture';
const IFRAME_REFERRER = 'strict-origin-when-cross-origin';
const HREF = 'https://example.com/';

function keep(attributes: [string, string][]) {
  return { action: 'keep', attributes };
}

describe('getElementSpec', () => {
  it('só acha chaves próprias do esquema', () => {
    for (const tag of ['constructor', 'toString', '__proto__']) {
      expect(getElementSpec(S, tag), tag).toBeUndefined();
    }
    expect(getElementSpec(S, 'p')).toBe(S.elements['p']);
  });
});

describe('sanitizeClass', () => {
  it('filtra, tira repetição e mantém a ordem', () => {
    expect(sanitizeClass(E.figure, '')).toBeNull();
    expect(sanitizeClass(E.figure, 'rt-figure rt-figure rt-figure--left')).toBe(
      'rt-figure rt-figure--left',
    );
    expect(sanitizeClass(E.figure, ' rt-figure\t\nrt-embed ')).toBe(
      'rt-figure rt-embed',
    );
  });

  it('espaço não ASCII não separa tokens', () => {
    expect(
      sanitizeClass(E.figure, 'rt-figure\u00a0rt-figure--left'),
    ).toBeNull();
  });

  it('aceita até 128 caracteres', () => {
    const spec: RteElementSpec = {
      attributes: {},
      classes: { patterns: ['^[a-z]+$'] },
    };
    expect(sanitizeClass(spec, 'a'.repeat(128))).toBe('a'.repeat(128));
    expect(sanitizeClass(spec, 'a'.repeat(129))).toBeNull();
  });

  it('elemento sem classes não aceita nenhuma', () => {
    expect(sanitizeClass(E.p, 'rt-figure')).toBeNull();
  });
});

describe('sanitizeAttributes', () => {
  it('mantém a ordem da entrada e o primeiro nome vence', () => {
    expect(
      sanitizeAttributes(E.a, [
        ['rel', 'nofollow'],
        ['href', HREF],
        ['href', 'https://evil.test/'],
        ['onclick', 'x'],
        ['__proto__', 'x'],
      ]),
    ).toEqual(
      keep([
        ['rel', 'nofollow'],
        ['href', HREF],
      ]),
    );
  });

  it('o primeiro nome vence mesmo se for inválido', () => {
    expect(
      sanitizeAttributes(E.img, [
        ['src', 'https://example.com/a.jpg'],
        ['width', 'x'],
        ['width', '10'],
      ]),
    ).toEqual(
      keep([
        ['src', 'https://example.com/a.jpg'],
        ['alt', ''],
      ]),
    );
  });

  it('não usa chaves herdadas do protótipo', () => {
    for (const name of ['constructor', 'toString', 'hasOwnProperty']) {
      expect(sanitizeAttributes(E.p, [[name, 'x']]), name).toEqual(keep([]));
    }
  });

  describe('default', () => {
    it('alt ausente vira alt=""', () => {
      expect(
        sanitizeAttributes(E.img, [['src', 'https://example.com/a.jpg']]),
      ).toEqual(
        keep([
          ['src', 'https://example.com/a.jpg'],
          ['alt', ''],
        ]),
      );
    });

    it('input recebe type e disabled na ordem do esquema', () => {
      expect(sanitizeAttributes(E.input, [['checked', 'x']])).toEqual(
        keep([
          ['checked', ''],
          ['type', 'checkbox'],
          ['disabled', ''],
        ]),
      );
    });

    it('valor inválido com default vai para o fim com o default', () => {
      expect(
        sanitizeAttributes(E.input, [
          ['type', 'text'],
          ['disabled', 'x'],
        ]),
      ).toEqual(
        keep([
          ['disabled', ''],
          ['type', 'checkbox'],
        ]),
      );
    });

    it('iframe recebe os valores fixos', () => {
      expect(
        sanitizeAttributes(E.iframe, [
          ['src', IFRAME_SRC],
          ['title', 'T'],
          ['sandbox', 'allow-top-navigation'],
        ]),
      ).toEqual(
        keep([
          ['src', IFRAME_SRC],
          ['title', 'T'],
          ['referrerpolicy', IFRAME_REFERRER],
          ['allow', IFRAME_ALLOW],
          ['sandbox', IFRAME_SANDBOX],
        ]),
      );
    });

    it('todo default do esquema padrão é ponto fixo de normalizeAttribute', () => {
      let count = 0;
      for (const [tag, spec] of Object.entries(S.elements)) {
        for (const [name, attr] of Object.entries(spec.attributes)) {
          if (attr.default === undefined) continue;
          count++;
          expect(
            normalizeAttribute(attr.rule, attr.default),
            `${tag}.${name}`,
          ).toBe(attr.default);
        }
      }
      expect(count).toBeGreaterThanOrEqual(7);
    });
  });

  describe('onInvalid', () => {
    it('a sem href válido é desembrulhado', () => {
      expect(
        sanitizeAttributes(E.a, [['href', 'javascript:alert(1)']]),
      ).toEqual({ action: 'unwrap', attribute: 'href' });
    });

    it('mídia sem src é removida', () => {
      expect(sanitizeAttributes(E.img, [['alt', 'x']])).toEqual({
        action: 'remove',
        attribute: 'src',
      });
      expect(sanitizeAttributes(E.video, [['controls', '']])).toEqual({
        action: 'remove',
        attribute: 'src',
      });
      expect(sanitizeAttributes(E.track, [['kind', 'captions']])).toEqual({
        action: 'remove',
        attribute: 'src',
      });
    });

    it('iframe fora do provedor ou sem título é removido', () => {
      expect(
        sanitizeAttributes(E.iframe, [
          ['src', 'https://evil.test/embed/x'],
          ['title', 'T'],
        ]),
      ).toEqual({ action: 'remove', attribute: 'src' });
      expect(sanitizeAttributes(E.iframe, [['src', IFRAME_SRC]])).toEqual({
        action: 'remove',
        attribute: 'title',
      });
    });

    it('onInvalid ausente vale remove', () => {
      const spec: RteElementSpec = {
        attributes: {
          x: { rule: { kind: 'text', maxLength: 1 }, required: true },
        },
      };
      expect(sanitizeAttributes(spec, [])).toEqual({
        action: 'remove',
        attribute: 'x',
      });
    });
  });

  describe('style', () => {
    it('styleFrom ignora o style da entrada e regenera do atributo', () => {
      expect(
        sanitizeAttributes(E.span, [
          ['style', 'color: red'],
          ['data-rt-color', 'red'],
        ]),
      ).toEqual(
        keep([
          ['data-rt-color', 'red'],
          ['style', 'color: #b3261e'],
        ]),
      );
      expect(sanitizeAttributes(E.span, [['style', 'color:#b3261e']])).toEqual(
        keep([]),
      );
      expect(
        sanitizeAttributes(E.mark, [['data-rt-color', 'constructor']]),
      ).toEqual(keep([]));
    });

    it('styles passa por sanitizeStyle e vazio descarta', () => {
      expect(
        sanitizeAttributes(E.p, [['style', 'TEXT-ALIGN: Center; color: red']]),
      ).toEqual(keep([['style', 'text-align: center']]));
      expect(sanitizeAttributes(E.p, [['style', 'color: red']])).toEqual(
        keep([]),
      );
    });

    it('elemento sem styles descarta o style', () => {
      expect(sanitizeAttributes(E.li, [['style', 'color: red']])).toEqual(
        keep([]),
      );
    });

    it('class passa por sanitizeClass', () => {
      expect(
        sanitizeAttributes(E.figure, [['class', 'rt-figure x rt-figure']]),
      ).toEqual(keep([['class', 'rt-figure']]));
      expect(sanitizeAttributes(E.figure, [['class', 'x']])).toEqual(keep([]));
    });
  });

  describe('ensureTokens', () => {
    it('target=_blank acrescenta noopener noreferrer', () => {
      expect(
        sanitizeAttributes(E.a, [
          ['href', HREF],
          ['target', '_BLANK'],
        ]),
      ).toEqual(
        keep([
          ['href', HREF],
          ['target', '_blank'],
          ['rel', 'noopener noreferrer'],
        ]),
      );
    });

    it('rel existente é re-serializado no lugar', () => {
      expect(
        sanitizeAttributes(E.a, [
          ['rel', 'NOFOLLOW ugc x'],
          ['href', HREF],
          ['target', '_blank'],
        ]),
      ).toEqual(
        keep([
          ['rel', 'nofollow ugc noopener noreferrer'],
          ['href', HREF],
          ['target', '_blank'],
        ]),
      );
    });

    it('rel inválido sai e o garantido vai para o fim', () => {
      expect(
        sanitizeAttributes(E.a, [
          ['rel', 'opener'],
          ['href', HREF],
          ['target', '_blank'],
        ]),
      ).toEqual(
        keep([
          ['href', HREF],
          ['target', '_blank'],
          ['rel', 'noopener noreferrer'],
        ]),
      );
    });

    it('sem target não acrescenta nada', () => {
      expect(sanitizeAttributes(E.a, [['href', HREF]])).toEqual(
        keep([['href', HREF]]),
      );
    });

    it('forceRel vale em todo link', () => {
      const a = el(
        getHtmlSchema({ linkPolicy: { forceRel: ['nofollow'] } }),
        'a',
      );
      expect(sanitizeAttributes(a, [['href', HREF]])).toEqual(
        keep([
          ['href', HREF],
          ['rel', 'nofollow'],
        ]),
      );
      expect(
        sanitizeAttributes(a, [
          ['href', HREF],
          ['target', '_blank'],
        ]),
      ).toEqual(
        keep([
          ['href', HREF],
          ['target', '_blank'],
          ['rel', 'nofollow noopener noreferrer'],
        ]),
      );
    });

    it('target=_blank sempre tem noopener noreferrer, mesmo com rel longo', () => {
      const all = el(
        getHtmlSchema({
          linkPolicy: { forceRel: ['nofollow', 'sponsored', 'ugc'] },
        }),
        'a',
      );
      // 199 unidades (cabe no maxLength 200) e 201 (rel descartado).
      for (const rel of [
        'ugc '.repeat(49) + 'ugc',
        'ugc '.repeat(50) + 'u',
        'nofollow sponsored ugc noopener noreferrer',
      ]) {
        for (const spec of [E.a, all]) {
          const out = sanitizeAttributes(spec, [
            ['href', HREF],
            ['rel', rel],
            ['target', '_blank'],
          ]);
          if (out.action !== 'keep') throw new Error('esperava keep');
          const value = new Map(out.attributes).get('rel') ?? '';
          expect(value.split(' ')).toEqual(
            expect.arrayContaining(['noopener', 'noreferrer']),
          );
        }
      }
    });

    it('é idempotente na saída canônica', () => {
      const once = sanitizeAttributes(E.a, [
        ['href', HREF],
        ['target', '_blank'],
      ]);
      if (once.action !== 'keep') throw new Error('esperava keep');
      expect(sanitizeAttributes(E.a, once.attributes)).toEqual(once);
    });
  });
});

describe('hasRequiredChild', () => {
  it('é "um dentre"', () => {
    expect(hasRequiredChild(E.figure, new Set(['video']))).toBe(true);
    expect(hasRequiredChild(E.figure, new Set(['figcaption']))).toBe(false);
    expect(hasRequiredChild(E.p, new Set())).toBe(true);
  });
});

describe('escapes', () => {
  const input = 'a\r\nb\rc\0<>&"\u00a0';

  it('escapeHtmlText escapa & nbsp < > e pré-processa CR e NUL', () => {
    expect(escapeHtmlText(input)).toBe('a\nb\nc\ufffd&lt;&gt;&amp;"&nbsp;');
  });

  it('escapeHtmlAttribute também escapa aspas', () => {
    expect(escapeHtmlAttribute(input)).toBe(
      'a\nb\nc\ufffd&lt;&gt;&amp;&quot;&nbsp;',
    );
  });
});
