import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { editorBundle } from './editor-bundle';
import { ORIGIN } from './page';

const BLANK = resolve(__dirname, '../../fixtures/blank.html');

/** PNG 1×1 servido em `${ORIGIN}/e2e.png` (as imagens do E3 apontam para `/e2e.png`). */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * CSS mínimo das alças do `rtImage` (o CSS de verdade é da spec 05): figura do
 * tamanho do `img`, alças 12×12 nos cantos, fora de qualquer recorte. Mais as
 * decorações da 03c: placeholder pelo `::before`, resultados da busca (ativo
 * distinto) e a consulta do menu `/`.
 */
const CSS = `
#editor { margin: 32px; }
#editor .ProseMirror { padding: 24px; outline: 1px solid #ccc; }
#editor figure.rt-figure { position: relative; width: fit-content; margin: 24px; }
#editor figure.rt-figure img { display: block; }
#editor .rte-image__handle {
  position: absolute; width: 12px; height: 12px; background: #1d4ed8;
  touch-action: none; z-index: 1;
}
#editor .rte-image__handle--nw { top: -6px; left: -6px; cursor: nwse-resize; }
#editor .rte-image__handle--ne { top: -6px; right: -6px; cursor: nesw-resize; }
#editor .rte-image__handle--sw { bottom: -6px; left: -6px; cursor: nesw-resize; }
#editor .rte-image__handle--se { bottom: -6px; right: -6px; cursor: nwse-resize; }
.rte-placeholder::before {
  content: attr(data-placeholder); float: left; height: 0;
  pointer-events: none; color: #6b6b6b;
}
.rte-search-match { background: #fff3a3; }
.rte-search-match--active { background: #ffb74d; }
.rte-slash-query { text-decoration: underline; }
`;

export interface EditorPageOptions {
  /** Conteúdo inicial do editor (`new Editor({ content })`). */
  content?: string;
  /** Expressão JS das opções de `createEditorExtensions` (pode usar `RteEditorLab`). */
  editor?: string;
}

/**
 * Abre o blank.html em `ORIGIN`, injeta `window.RteEditorLab` e monta o editor
 * da fábrica em `#editor` como `window.editor`. Só `ORIGIN/` e `ORIGIN/e2e.png`
 * respondem; toda outra requisição (imagens e embeds do fixture) é abortada.
 */
export async function loadEditorPage(
  page: Page,
  options: EditorPageOptions = {},
): Promise<void> {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url === `${ORIGIN}/`) {
      return route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: readFileSync(BLANK, 'utf8'),
      });
    }
    if (url === `${ORIGIN}/e2e.png`) {
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: PNG,
      });
    }
    return route.abort();
  });
  await page.goto(`${ORIGIN}/`);
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: editorBundle() });
  // `addScriptTag` usa `textContent`: o JSON do conteúdo não passa pelo parser HTML.
  const content =
    options.content === undefined
      ? ''
      : `content: ${JSON.stringify(options.content)},`;
  await page.addScriptTag({
    content: `(() => {
      const element = document.createElement('div');
      element.id = 'editor';
      document.body.appendChild(element);
      window.editor = new RteEditorLab.Editor({
        element,
        extensions: RteEditorLab.createEditorExtensions(${options.editor ?? '{}'}),
        ${content}
      });
    })();`,
  });
}
