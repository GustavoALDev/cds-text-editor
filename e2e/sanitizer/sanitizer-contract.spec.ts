// Spec 04, §6.3 S1: isomorfismo Node × navegador (R2 e R6). Os bytes de
// referência são calculados aqui, no processo do Playwright (pré-voo 13).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { sanitizeRichText } from '../../packages/sanitizer/src/index';
import type { RteSanitizeOptions } from '../../packages/sanitizer/src/index';
import { XSS_CORPUS } from '../../packages/sanitizer/src/testing/xss-corpus';
import { loadSanitizerPage } from './helpers/sanitizer-page';

const CONTENT = resolve(__dirname, '../../fixtures/content');

/** Fixture em UTF-8 com quebras normalizadas para `\n` (checkout com `autocrlf`). */
function readFixture(name: string): string {
  return readFileSync(resolve(CONTENT, name), 'utf8').replace(/\r\n?/g, '\n');
}

interface Case {
  name: string;
  input: string;
  options?: RteSanitizeOptions;
}

const fixture = readFixture('all-features.html');
const editorCorpus = JSON.parse(readFixture('editor-corpus.json')) as string[];

const CASES: Case[] = [
  { name: 'all-features.html', input: fixture },
  ...editorCorpus.map((input, i) => ({ name: `editor-corpus ${i}`, input })),
  ...XSS_CORPUS.map((c) => ({
    name: `xss ${c.category}: ${c.name}`,
    input: c.input,
    ...(c.options === undefined ? {} : { options: c.options }),
  })),
];

const BATCH = 100;

test('R2/R6: fixture, editor-corpus e corpus de XSS dão os mesmos bytes no navegador e no Node', async ({
  page,
}) => {
  expect(editorCorpus).toHaveLength(300);
  await loadSanitizerPage(page);

  const node = CASES.map((c) =>
    c.options === undefined
      ? sanitizeRichText(c.input)
      : sanitizeRichText(c.input, c.options),
  );
  const browser: string[] = [];
  for (let i = 0; i < CASES.length; i += BATCH) {
    const batch = CASES.slice(i, i + BATCH);
    browser.push(
      ...(await page.evaluate(
        (cases) =>
          cases.map((c) =>
            c.options === undefined
              ? window.RteSanitizerLab.sanitizeRichText(c.input)
              : window.RteSanitizerLab.sanitizeRichText(c.input, c.options),
          ),
        batch,
      )),
    );
  }

  expect(browser).toHaveLength(node.length);
  const first = browser.findIndex((out, i) => out !== node[i]);
  if (first !== -1) {
    expect(
      browser[first],
      `primeiro diferente: índice ${first} (${CASES[first]!.name})`,
    ).toBe(node[first]);
  }
  expect(first).toBe(-1);
});

test('R10: mediana de um documento de ≥ 400 000 caracteres no Chromium', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'R10 medido só no Chromium (spec 04)');
  await loadSanitizerPage(page);

  const doc = fixture.repeat(Math.ceil(400_000 / fixture.length));
  expect(doc.length).toBeGreaterThanOrEqual(400_000);

  const times = await page.evaluate((html) => {
    const s = window.RteSanitizerLab.sanitizeRichText;
    for (let i = 0; i < 3; i++) s(html);
    const out: number[] = [];
    for (let i = 0; i < 11; i++) {
      const t0 = performance.now();
      s(html);
      out.push(performance.now() - t0);
    }
    return out;
  }, doc);

  const median = [...times].sort((a, b) => a - b)[5]!;
  const text = `mediana ${median.toFixed(1)} ms (${doc.length} caracteres, 11 medições)`;
  test.info().annotations.push({ type: 'R10', description: text });
  console.log(`R10 Chromium: ${text}`);
  expect(median).toBeLessThan(2000);
});
