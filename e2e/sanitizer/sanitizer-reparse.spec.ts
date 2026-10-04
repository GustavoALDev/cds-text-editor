// Spec 04, §6.3 S2: I1/R7, estabilidade da saída sob o parser HTML do
// navegador. Cada saída `o` vai para um `div` vivo por `innerHTML`; a árvore
// lida só pode ter elementos, atributos e URLs do esquema, e `s(div.innerHTML)`
// tem de devolver `o`. FC_RUNS muda o número de casos do gerador hostil.
import { expect, test } from '@playwright/test';
import * as fc from 'fast-check';
import type { RteSanitizeOptions } from '../../packages/sanitizer/src/index';
import { hostileHtml } from '../../packages/sanitizer/src/testing/html-arbitraries';
import { XSS_CORPUS } from '../../packages/sanitizer/src/testing/xss-corpus';
import { loadSanitizerPage } from './helpers/sanitizer-page';

interface Case {
  input: string;
  options?: RteSanitizeOptions;
}

const RUNS = Number(process.env['FC_RUNS'] ?? 2000);
const BATCH = 200;

const CASES: Case[] = [
  ...XSS_CORPUS.map((c) => ({
    input: c.input,
    ...(c.options === undefined ? {} : { options: c.options }),
  })),
  ...fc
    .sample(hostileHtml, { numRuns: RUNS, seed: 20261003 })
    .map((input) => ({ input })),
];

test(`R7: corpus de XSS e ${RUNS} casos hostis relidos pelo parser do navegador`, async ({
  page,
}) => {
  test.setTimeout(Math.max(60_000, RUNS * 60));
  await loadSanitizerPage(page);

  const failures: {
    input: string;
    output: string;
    reread: string;
    reason: string;
  }[] = [];
  for (let i = 0; i < CASES.length; i += BATCH) {
    failures.push(
      ...(await page.evaluate(
        (cases) => {
          const lab = window.RteSanitizerLab;
          const HTML_NS = 'http://www.w3.org/1999/xhtml';
          const URL_ATTRS = ['href', 'src', 'poster', 'srcset'];
          const root = document.getElementById('root')!;
          const tools = new Map<
            string,
            {
              s: (html: string) => string;
              schema: ReturnType<typeof lab.getHtmlSchema>;
            }
          >();
          const toolsFor = (options: Case['options']) => {
            const key = JSON.stringify(options ?? null);
            let t = tools.get(key);
            if (t === undefined) {
              t = {
                s: lab.createSanitizer(options),
                schema: lab.getHtmlSchema(options),
              };
              tools.set(key, t);
            }
            return t;
          };

          /** Problemas da árvore lida pelo navegador (vazio se tudo é do esquema). */
          const check = (
            div: HTMLElement,
            schema: ReturnType<typeof lab.getHtmlSchema>,
          ): string | null => {
            for (const el of div.querySelectorAll('*')) {
              const tag = el.localName;
              if (el.namespaceURI !== HTML_NS)
                return `<${tag}> no espaço de nomes ${String(el.namespaceURI)}`;
              if (!Object.hasOwn(schema.elements, tag))
                return `<${tag}> fora do esquema`;
              const spec = schema.elements[tag]!;
              for (const { name, value } of el.attributes) {
                const known =
                  Object.hasOwn(spec.attributes, name) ||
                  (name === 'class' && spec.classes !== undefined) ||
                  (name === 'style' &&
                    (spec.styles !== undefined ||
                      spec.styleFrom !== undefined));
                if (!known) return `<${tag}> com atributo ${name}`;
                if (!URL_ATTRS.includes(name)) continue;
                const rule = spec.attributes[name]!.rule;
                const urlRule =
                  rule.kind === 'url'
                    ? rule
                    : rule.kind === 'srcset'
                      ? rule.url
                      : null;
                if (urlRule === null)
                  return `<${tag}> ${name} sem regra de URL (${rule.kind})`;
                const urls =
                  name === 'srcset'
                    ? value
                        .split(',')
                        .map((c) => c.trim().split(/\s+/)[0] ?? '')
                        .filter((u) => u !== '')
                    : [value];
                for (const u of urls) {
                  let protocol: string;
                  try {
                    protocol = new URL(u, location.href).protocol.slice(0, -1);
                  } catch {
                    return `<${tag}> ${name}="${u}" não é URL`;
                  }
                  if (!urlRule.schemes.includes(protocol))
                    return `<${tag}> ${name}="${u}" com esquema ${protocol}`;
                }
              }
            }
            return null;
          };

          const out: {
            input: string;
            output: string;
            reread: string;
            reason: string;
          }[] = [];
          for (const c of cases) {
            const { s, schema } = toolsFor(c.options);
            const output = s(c.input);
            const div = document.createElement('div');
            root.appendChild(div);
            div.innerHTML = output;
            const reread = div.innerHTML;
            let reason = check(div, schema);
            if (reason === null) {
              const again = s(reread);
              if (again !== output) reason = `s(div.innerHTML) = ${again}`;
            }
            if (reason !== null)
              out.push({ input: c.input, output, reread, reason });
          }
          return out;
        },
        CASES.slice(i, i + BATCH),
      )),
    );
  }

  expect(failures.slice(0, 10), `${failures.length} falhas de I1`).toEqual([]);

  // Handlers e recursos atrasados: espera o `load` e mais 100 ms.
  await page.waitForLoadState('load');
  const { calls, scriptViolations } = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 100));
    return {
      calls: window.__xssCalls,
      scriptViolations: window.__violations.filter((v) =>
        v.startsWith('script-src'),
      ),
    };
  });
  expect(calls).toBe(0);
  expect(scriptViolations).toEqual([]);
});
