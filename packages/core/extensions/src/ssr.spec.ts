// Ambiente `node` (padrão do vitest.config): sem window/document/navigator e
// sem armadilhas de getter. O prosemirror-view só checa `typeof` na importação
// (spec 03b, R15).
import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { htmlToText } from '../../html/src/index';
import { countCharacters } from '../../src/index';
import { readFixture } from './testing/fixtures';

describe('SSR do /extensions em Node puro (R15)', () => {
  it('não há DOM no ambiente', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });

  it(
    'importa /extensions e /code-languages, cria o editor sem elemento e serializa',
    { timeout: 30_000 },
    async () => {
      const ext = await import('./index');
      const langs = await import('../../code-languages/src/index');
      expect(langs.RTE_CODE_LANGUAGES.length).toBeGreaterThan(0);

      const extensions = ext.createEditorExtensions();
      const editor = new Editor({
        element: null,
        extensions,
        content: JSON.parse(readFixture('all-features.json')),
      });
      try {
        const expected = readFixture('all-features.html');
        expect(ext.serializeRteHtml(editor.state.doc)).toBe(expected);
        expect(ext.getRteHtml(editor)).toBe(expected);

        // Spec 03c: getters de estado em Node puro (R1).
        const characters = countCharacters(htmlToText(expected));
        expect(ext.getSearchState(editor)?.query).toBe('');
        expect(ext.getSlashMenuState(editor).open).toBe(false);
        expect(ext.getCharLimitState(editor).characters).toBe(characters);
        expect(ext.getRteTextStats(editor.state.doc).characters).toBe(
          characters,
        );
      } finally {
        editor.destroy();
      }
    },
  );
});
