import type { RteHeadingLevel } from '../../src/headings';
import { getHtmlSchema } from '../../src/schema/get-html-schema';
import { matchesRule } from '../../src/schema/rules';
import { resolveMaxDepth, walkHtml } from './walk';

export interface RteTocEntry {
  id: string;
  /** Texto puro já decodificado: escape ou use `textContent` antes de inserir em HTML. */
  text: string;
  level: RteHeadingLevel;
}

export interface RteExtractTocOptions {
  /** Níveis de título incluídos (padrão `[2, 3]`); fora de 2–4 é ignorado. */
  levels?: readonly RteHeadingLevel[];
  /** Prefixo dos ids (padrão `'rt-'`); `RangeError` se inválido. */
  idPrefix?: string;
  /** Profundidade máxima de elementos (padrão 256); `RangeError` se não for inteiro positivo. */
  maxDepth?: number;
}

const HEADING = /^h([1-6])$/;

/**
 * Extrai o sumário (títulos com id válido) de um HTML, sem DOM. O id é validado pela mesma
 * regra do esquema; títulos sem id ou com id inválido são ignorados. Nunca lança por HTML malformado.
 *
 * `text` é TEXTO PURO já decodificado (`&lt;img&gt;` vira `<img>`): deve ser escapado, ou atribuído via
 * `textContent`, antes de voltar a HTML. Acima de `maxDepth` a leitura é truncada: devolve as entradas
 * coletadas até ali, sem lançar.
 */
export function extractToc(
  html: string,
  options: RteExtractTocOptions = {},
): RteTocEntry[] {
  const maxDepth = resolveMaxDepth(options.maxDepth);
  const levels = new Set<number>(
    (options.levels ?? [2, 3]).filter((n) => n >= 2 && n <= 4),
  );
  const schema = getHtmlSchema(
    options.idPrefix === undefined ? {} : { idPrefix: options.idPrefix },
  );
  const idRule = schema.elements['h2']?.attributes['id']?.rule;
  const entries: RteTocEntry[] = [];
  let current: { id: string; level: RteHeadingLevel; text: string } | null =
    null;

  const finish = () => {
    if (current) {
      const text = current.text.replace(/\s+/g, ' ').trim();
      if (text) entries.push({ id: current.id, text, level: current.level });
    }
    current = null;
  };

  walkHtml(
    html,
    {
      open(name, attributes) {
        const m = HEADING.exec(name);
        if (!m) return;
        finish();
        const level = Number(m[1]) as RteHeadingLevel;
        const id = attributes['id'];
        if (
          levels.has(level) &&
          id !== undefined &&
          idRule !== undefined &&
          matchesRule(idRule, id)
        ) {
          current = { id, level, text: '' };
        }
      },
      close(name) {
        if (HEADING.test(name)) finish();
      },
      text(data) {
        if (current) current.text += data;
      },
    },
    maxDepth,
  );
  finish();
  return entries;
}
