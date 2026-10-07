import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import type { RteE2eId } from '../window';
import { waitForEditor } from './app';
import { rteHtml } from './toolbar';

// Ajudantes da página `/productivity` (spec 05d1, N42–N44).

/** Espera o editor `id` e o documento inicial (ou `text`) chegarem. */
export async function productivityReady(
  page: Page,
  id: RteE2eId = 'productivity',
  text = 'Segundo parágrafo',
): Promise<void> {
  await waitForEditor(page, id);
  await expect.poll(() => rteHtml(page, id)).toContain(text);
}

/** Violações `serious`/`critical` do axe na página inteira. */
export async function severeViolations(
  page: Page,
  disabledRules: string[] = [],
) {
  const results = await new AxeBuilder({ page })
    .disableRules(disabledRules)
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target.join(' ')),
    }));
}
