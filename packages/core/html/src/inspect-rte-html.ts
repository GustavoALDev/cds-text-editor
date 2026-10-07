import { walkHtml } from './walk';

/** O que `inspectRteHtml` encontra num HTML do editor. */
export interface RteHtmlInspection {
  /** `href` de todo `<a>` que tem o atributo, em qualquer profundidade, na ordem do documento. */
  readonly hrefs: readonly string[];
  /** Quantidade de `h2`–`h4` cujo texto aparado é vazio (`<br>` e espaços contam como vazio). */
  readonly emptyHeadings: number;
  /**
   * `true` se a leitura parou por passar de 256 níveis de aninhamento: `hrefs`
   * e `emptyHeadings` são só do trecho lido e não provam nada sobre o resto.
   */
  readonly truncated: boolean;
}

const HEADING = /^h[2-4]$/;

/**
 * Lê o HTML numa passada, sem DOM nem Tiptap: devolve os `href` dos links e
 * quantos títulos `h2`–`h4` estão vazios. `href` ausente é ignorado. Nunca
 * lança por HTML malformado.
 */
export function inspectRteHtml(html: string): RteHtmlInspection {
  const hrefs: string[] = [];
  let emptyHeadings = 0;
  let heading: { text: string } | null = null;

  const finish = () => {
    if (heading && heading.text.trim() === '') emptyHeadings++;
    heading = null;
  };

  const truncated = walkHtml(html, {
    open(name, attributes) {
      if (name === 'a') {
        const href = attributes['href'];
        if (href !== undefined) hrefs.push(href);
      }
      if (HEADING.test(name)) {
        finish();
        heading = { text: '' };
      }
    },
    close(name) {
      if (HEADING.test(name)) finish();
    },
    text(data) {
      if (heading) heading.text += data;
    },
  });
  finish();
  return { hrefs, emptyHeadings, truncated };
}
