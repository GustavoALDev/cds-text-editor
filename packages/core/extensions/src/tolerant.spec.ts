// @vitest-environment jsdom
// Leitura tolerante (spec 03b, §7.4, A1): HTML genérico/colado passa pela
// colagem do editor e sai na forma canônica fixada em
// `fixtures/content/tolerant-cases.json` (os mesmos casos rodam no Playwright).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RTE_CODE_LANGUAGES } from '../../code-languages/src/index';
import { validateHtml } from '../../html/src/validate-html';
import { getHtmlSchema } from '../../src/schema/get-html-schema';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';
import { readFixture } from './testing/fixtures';
import type { RteEditorOptions } from './types';

interface TolerantCase {
  name: string;
  input: string;
  expected: string;
  options?: RteEditorOptions;
}

const CASES = JSON.parse(readFixture('tolerant-cases.json')) as TolerantCase[];
const S = getHtmlSchema();

vi.setConfig({ testTimeout: 30_000 });

afterEach(() => destroyTestEditors());

function editorFor(options?: RteEditorOptions, content?: string) {
  return createTestEditor(
    { codeLanguages: RTE_CODE_LANGUAGES, ...options },
    content,
  );
}

/** Editor vazio com opções padrão (catálogo completo) e `input` colado. */
function paste(input: string, options?: RteEditorOptions): string {
  const editor = editorFor(options);
  editor.commands.focus('end');
  editor.view.pasteHTML(input, new Event('paste') as ClipboardEvent);
  return getRteHtml(editor);
}

describe('tolerant-cases.json', () => {
  it('nomes únicos e expected não vazio', () => {
    const names = CASES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const c of CASES) expect(c.expected, c.name).not.toBe('');
  });

  it.each(CASES.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(validateHtml(c.expected, S)).toEqual([]);
    expect(paste(c.input, c.options)).toBe(c.expected);
  });

  // A saída é ponto fixo da releitura: setContent e colagem do `expected`.
  it.each(CASES.map((c) => [c.name, c] as const))(
    'ponto fixo: %s',
    (_name, c) => {
      expect(getRteHtml(editorFor(c.options, c.expected))).toBe(c.expected);
      expect(paste(c.expected, c.options)).toBe(c.expected);
    },
  );
});
