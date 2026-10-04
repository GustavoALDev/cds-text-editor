// Corpus de XSS (spec 04, §6.1 e R5): cada caso tem a saída exata, é ponto
// fixo, passa no verificador executável (`findUnsafe`) e no oráculo
// independente do core (`validateHtml`).
import { getHtmlSchema } from '@cds/rte-core';
import { validateHtml } from '@cds/rte-core/html';
import { describe, expect, it } from 'vitest';
import { createSanitizer } from './index';
import { findUnsafe } from './testing/safety';
import {
  XSS_CORPUS,
  XSS_MIN_PER_CATEGORY,
  type XssCategory,
} from './testing/xss-corpus';

describe('corpus de XSS: forma', () => {
  it('tem ao menos 150 casos, com nomes únicos', () => {
    expect(XSS_CORPUS.length).toBeGreaterThanOrEqual(150);
    const names = XSS_CORPUS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('cada categoria tem o mínimo de casos', () => {
    const counts = new Map<XssCategory, number>();
    for (const c of XSS_CORPUS) {
      counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
    }
    for (const [category, min] of Object.entries(XSS_MIN_PER_CATEGORY)) {
      expect(
        counts.get(category as XssCategory) ?? 0,
        category,
      ).toBeGreaterThanOrEqual(min);
    }
  });

  it('toda tag do esquema aparece em algum caso de handlers', () => {
    const handlers = XSS_CORPUS.filter((c) => c.category === 'handlers');
    for (const tag of Object.keys(getHtmlSchema().elements)) {
      expect(
        handlers.some((c) => new RegExp(`<${tag}[\\s>/]`).test(c.input)),
        `<${tag}>`,
      ).toBe(true);
    }
  });
});

describe('findUnsafe acusa o que é executável', () => {
  const schema = getHtmlSchema();
  it.each([
    '<p onclick="x">a</p>',
    '<a href="javascript:x">a</a>',
    '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ">x</iframe>',
    '<!--x-->',
    '<script>x</script>',
    '<img src="https://example.com/a.jpg" srcset="data:x 1x" alt="">',
    '<video src="https://example.com/v.mp4" poster="vbscript:x" controls=""></video>',
    '<p style="background: URL(x)">a</p>',
    '<p style="color: red\\">a</p>',
    '<p style="width: Expression(x)">a</p>',
    '<![CDATA[x]]>',
    '<?xml x?>',
  ])('%s', (html) => {
    expect(findUnsafe(html, schema)).not.toEqual([]);
  });

  it('aceita a saída canônica', () => {
    expect(
      findUnsafe(
        '<p>a</p><a href="https://example.com/" target="_blank" rel="noopener noreferrer">b</a>',
        schema,
      ),
    ).toEqual([]);
  });
});

describe('corpus de XSS: R5', () => {
  it.each(XSS_CORPUS.map((c) => [`${c.category}: ${c.name}`, c] as const))(
    '%s',
    (_label, c) => {
      const s = createSanitizer(c.options ?? {});
      const schema = getHtmlSchema(c.options ?? {});
      expect(s(c.input)).toBe(c.expected);
      expect(s(c.expected)).toBe(c.expected);
      expect(findUnsafe(c.expected, schema)).toEqual([]);
      expect(validateHtml(c.expected, schema)).toEqual([]);
    },
  );
});
