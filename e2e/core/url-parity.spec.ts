import { expect, test } from '@playwright/test';
import * as fc from 'fast-check';
import { dangerousUrl } from '../../packages/core/src/schema/testing/dangerous-urls';
import { loadCorePage } from './helpers/page';

const FIXED = [
  'javascript:alert(1)',
  'JAVASCRIPT:alert(1)',
  'JaVaScRiPt:alert(1)',
  ' javascript:alert(1)',
  '\u0000javascript:alert(1)',
  '\u0001javascript:alert(1)',
  'java\tscript:alert(1)',
  'java\nscript:alert(1)',
  'jav\rascript:alert(1)',
  'jav&#x09;ascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'DATA:text/html;base64,PHNjcmlwdD4=',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
  '//evil.com',
  '/\\evil.com',
  '/%2F/evil.com',
  '\\\\evil.com',
  '\\/evil.com',
  'https:evil.com',
  'https:/evil.com',
  'http:\\\\evil.com',
  'https://u:p@evil.com',
  'https://Example.com',
  '  https://a.com/x  ',
  '/materia/1',
  '#rt-intro',
  'mailto:joao@x.com.br',
  'tel:+5511999999999',
  'site.com',
  'a@b.com',
  'materia/1',
  '',
];

function corpus(): string[] {
  const random = [
    ...fc.sample(dangerousUrl, { numRuns: 250, seed: 20261003 }),
    ...fc.sample(fc.string({ unit: 'binary' }), { numRuns: 125, seed: 1 }),
    ...fc.sample(
      fc.webUrl({ withFragments: true, withQueryParameters: true }),
      { numRuns: 125, seed: 2 },
    ),
  ];
  return [...FIXED, ...random];
}

test('o que o navegador resolve como esquema perigoso nunca é aceito; o aceito resolve para esquema/origem seguros', async ({
  page,
}) => {
  await loadCorePage(page);
  const inputs = corpus();
  expect(inputs.length).toBeGreaterThanOrEqual(500);

  const problems = await page.evaluate((inputs) => {
    const { getHtmlSchema, isAllowedUrl, normalizeHref } = window.RteCore;
    const rule = getHtmlSchema().elements['a']!.attributes['href']!.rule;
    if (rule.kind !== 'url') throw new Error('regra do href não é url');
    const dangerous = ['javascript:', 'data:', 'vbscript:', 'file:'];
    const safe = ['https:', 'http:', 'mailto:', 'tel:'];
    const a = document.createElement('a');
    const resolve = (v: string): { protocol: string; origin: string } => {
      a.href = v;
      let origin = '';
      try {
        origin = new URL(a.href, location.href).origin;
      } catch {
        // href inválido: sem origem
      }
      return { protocol: a.protocol, origin };
    };
    const out: string[] = [];
    for (const v of inputs) {
      const browser = resolve(v);
      const viaRule = isAllowedUrl(rule, v);
      const viaHref = normalizeHref(v);
      if (dangerous.includes(browser.protocol)) {
        if (viaRule !== null)
          out.push(
            `isAllowedUrl aceitou ${JSON.stringify(v)} (navegador: ${browser.protocol})`,
          );
        if (viaHref !== null)
          out.push(
            `normalizeHref aceitou ${JSON.stringify(v)} (navegador: ${browser.protocol})`,
          );
      }
      for (const s of [viaRule, viaHref]) {
        if (s === null) continue;
        const r = resolve(s);
        if (!safe.includes(r.protocol) && r.origin !== location.origin)
          out.push(
            `saída ${JSON.stringify(s)} (de ${JSON.stringify(v)}) resolve para ${r.protocol} / ${r.origin}`,
          );
      }
    }
    return out;
  }, inputs);

  expect(problems).toEqual([]);
});

test('o navegador resolve os ofuscados como esquema perigoso (sanidade do harness)', async ({
  page,
}) => {
  await loadCorePage(page);
  const protocols = await page.evaluate(() => {
    const a = document.createElement('a');
    const p = (v: string): string => {
      a.href = v;
      return a.protocol;
    };
    return [p('java\tscript:alert(1)'), p(' JAVASCRIPT:x'), p('/materia/1')];
  });
  expect(protocols).toEqual(['javascript:', 'javascript:', 'https:']);
});
