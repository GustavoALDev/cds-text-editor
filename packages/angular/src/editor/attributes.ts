/** Estado que vira atributos do editável (D10, D13). */
export interface RteEditableState {
  ariaLabel?: string | undefined;
  ariaLabelledBy?: string | undefined;
  ariaDescribedBy?: string | undefined;
  /** Nome acessível sem `ariaLabel` nem `ariaLabelledBy` (`labels.editor.ariaLabel`). */
  fallbackLabel: string;
  required: boolean;
  invalid: boolean;
  touched: boolean;
  disabled: boolean;
  readonly: boolean;
}

/** Texto vazio ou só com espaços vale como ausente (sem nome acessível vazio). */
export function presentText(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Atributos do editável (o `.ProseMirror`). O `role="textbox"` vem do Tiptap
 * e o `aria-placeholder`, do core.
 */
export function editableAttributes(
  s: RteEditableState,
): Record<string, string> {
  const out: Record<string, string> = {
    class: 'rte-content',
    'aria-multiline': 'true',
  };
  const labelledBy = presentText(s.ariaLabelledBy);
  const describedBy = presentText(s.ariaDescribedBy);
  if (labelledBy) out['aria-labelledby'] = labelledBy;
  else out['aria-label'] = presentText(s.ariaLabel) ?? s.fallbackLabel;
  if (describedBy) out['aria-describedby'] = describedBy;
  if (s.required) out['aria-required'] = 'true';
  if (s.invalid && s.touched) out['aria-invalid'] = 'true';
  if (s.disabled) {
    out['aria-disabled'] = 'true';
  } else if (s.readonly) {
    out['aria-readonly'] = 'true';
    out['tabindex'] = '0';
  }
  return out;
}
