import {
  TmplAstRecursiveVisitor,
  parseTemplate,
  tmplAstVisitAll,
  type TmplAstText,
  type TmplAstTextAttribute,
} from '@angular/compiler';

/** Atributos que levam texto para o usuário e por isso vêm de rótulos. */
const TEXT_ATTRIBUTES = new Set([
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'title',
  'placeholder',
  'alt',
]);

class LiteralTextVisitor extends TmplAstRecursiveVisitor {
  readonly found: string[] = [];

  constructor(private readonly url: string) {
    super();
  }

  override visitText(text: TmplAstText): void {
    const value = text.value.trim();
    if (value) this.found.push(`${this.where(text)} texto "${value}"`);
  }

  override visitTextAttribute(attribute: TmplAstTextAttribute): void {
    if (TEXT_ATTRIBUTES.has(attribute.name)) {
      this.found.push(
        `${this.where(attribute)} ${attribute.name}="${attribute.value}"`,
      );
    }
  }

  private where(node: TmplAstText | TmplAstTextAttribute): string {
    const { line, col } = node.sourceSpan.start;
    return `${this.url}:${line + 1}:${col + 1}`;
  }
}

/**
 * Texto fixo num template Angular (R15): nós de texto não vazios fora de
 * interpolação e atributos de texto estáticos (`aria-label`, `title`, ...).
 * Percorre elementos, `ng-template` e blocos (`@if`, `@for`, `@switch`, ...).
 */
export function findLiteralText(
  html: string,
  url = 'inline-template.html',
): string[] {
  const parsed = parseTemplate(html, url);
  if (parsed.errors?.length) {
    throw new Error(
      `${url}: template inválido: ${parsed.errors.map((e) => e.msg).join('; ')}`,
    );
  }
  const visitor = new LiteralTextVisitor(url);
  tmplAstVisitAll(visitor, parsed.nodes);
  return visitor.found;
}
