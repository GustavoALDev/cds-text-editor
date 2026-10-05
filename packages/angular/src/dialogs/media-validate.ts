import { untracked } from '@angular/core';
import { validate, type SchemaPath } from '@angular/forms/signals';
import { normalizeAttribute, type RteAttrRule } from '@cds/rte-core';
import type { CanCommands, Editor } from '@tiptap/core';

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

/**
 * `can()` com o comando de *embed* do core: o `declare module` do core não
 * chega ao `.d.ts` do *build* (mesmo caso do `MediaChain`).
 */
type EmbedCan = CanCommands & { setEmbed(url: string): boolean };

/**
 * URL de página aceita pelo comando do core (V5, pré-voo 5): o diálogo aceita
 * se e somente se `editor.can().setEmbed(url.trim())` (que chama `toEmbed`
 * com os provedores ativos); recusada ou sem editor → `rteEmbedUrl`. O vazio
 * nunca dá erro aqui (Ruling 10). O *chunk* não importa `/embeds`.
 */
export function embedUrlValidator(
  path: SchemaPath<string>,
  editor: () => Editor | null,
): void {
  validate(path, ({ value }) => {
    const url = value();
    if (url === '') return undefined;
    const ok = untracked(() => {
      const ed = editor();
      return (
        !!ed && !ed.isDestroyed && (ed.can() as EmbedCan).setEmbed(url.trim())
      );
    });
    return ok ? undefined : { kind: 'rteEmbedUrl' };
  });
}
