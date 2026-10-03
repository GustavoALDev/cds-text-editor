import { getHtmlSchema } from '../../src/schema/get-html-schema';
import { matchesRule } from '../../src/schema/rules';
import { walkHtml } from './walk';

export interface RteTocEntry {
  id: string;
  text: string;
  level: number;
}

export interface ExtractTocOptions {
  /** Níveis de título incluídos (padrão `[2, 3]`). */
  levels?: number[];
  /** Prefixo dos ids (padrão `'rt-'`); `RangeError` se inválido. */
  idPrefix?: string;
}

const HEADING = /^h([1-6])$/;

/**
 * Extrai o sumário (títulos com id válido) de um HTML, sem DOM. O id é validado pela mesma
 * regra do esquema; títulos sem id ou com id inválido são ignorados. Nunca lança por HTML malformado.
 */
export function extractToc(
  html: string,
  options: ExtractTocOptions = {},
): RteTocEntry[] {
  const levels = new Set(options.levels ?? [2, 3]);
  const schema = getHtmlSchema(
    options.idPrefix === undefined ? {} : { idPrefix: options.idPrefix },
  );
  const idRule = schema.elements['h2']?.attributes['id']?.rule;
  const entries: RteTocEntry[] = [];
  let current: { id: string; level: number; text: string } | null = null;

  const finish = () => {
    if (current) {
      const text = current.text.replace(/\s+/g, ' ').trim();
      if (text) entries.push({ id: current.id, text, level: current.level });
    }
    current = null;
  };

  walkHtml(html, {
    open(name, attributes) {
      const m = HEADING.exec(name);
      if (!m) return;
      finish();
      const level = Number(m[1]);
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
  });
  finish();
  return entries;
}
