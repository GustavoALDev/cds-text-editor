import { validate, type SchemaPath } from '@angular/forms/signals';
import { normalizeAttribute, type RteAttrRule } from '@cds/rte-core';

/**
 * Endereço de mídia canônico pela regra do esquema do editor (V4, pré-voo 3):
 * a entrada aparada (Ruling 11); `null` sem regra ou com o endereço recusado.
 */
export function canonicalMediaUrl(
  rule: RteAttrRule | null,
  value: string,
): string | null {
  return rule ? normalizeAttribute(rule, value.trim()) : null;
}

/**
 * Endereço de mídia aceito pela regra (V4): recusado → `rteMediaUrl`. O vazio
 * nunca dá erro aqui (Ruling 10): o campo obrigatório usa `required`.
 */
export function mediaUrlValidator(
  path: SchemaPath<string>,
  rule: () => RteAttrRule | null,
): void {
  validate(path, ({ value }) => {
    const url = value();
    return url !== '' && canonicalMediaUrl(rule(), url) === null
      ? { kind: 'rteMediaUrl' }
      : undefined;
  });
}
