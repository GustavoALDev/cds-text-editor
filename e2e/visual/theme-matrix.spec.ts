import { test } from '@playwright/test';
import { RTE_THEME_PRESETS } from '../../packages/theme/src/index';
import { frames } from '../angular/helpers/toolbar';
import { editorHost, openEditor, setDoc } from './helpers/pages';
import { expectShot } from './helpers/shot';

// O4 (só Chromium): 5 presets x claro/escuro x densidade 1 e 0,75 = 20 capturas do editor curto com
// barra. O tema entra pela ponte `setTheme` (o mesmo `applyRteTheme` do `editor-theme.spec.ts`); a
// densidade é o `--rte-density` do host (CSSOM, que a CSP permite).

const ID = 'toolbar' as const;
const MODES = ['light', 'dark'] as const;
const DENSITIES = [1, 0.75] as const;

for (const preset of Object.keys(RTE_THEME_PRESETS) as Array<
  keyof typeof RTE_THEME_PRESETS
>) {
  for (const mode of MODES) {
    for (const density of DENSITIES) {
      const name = `theme-${preset}-${mode}-d${String(density).replace('.', '')}`;
      test(name, async ({ page }) => {
        await openEditor(page, '/toolbar', ID);
        await setDoc(
          page,
          ID,
          '<p>Texto com <strong>negrito</strong>, <em>itálico</em> e <a href="https://example.test/">um link</a>.</p>',
        );
        await page.evaluate(
          ({ id, theme }) => window.rteE2e.setTheme(id, theme),
          { id: ID, theme: { ...RTE_THEME_PRESETS[preset], mode } },
        );
        const host = editorHost(page, ID);
        await host.evaluate(
          (el, d) => el.style.setProperty('--rte-density', String(d)),
          density,
        );
        await frames(page);
        await expectShot(host, name, {
          ready: () =>
            host.evaluate(
              (el, { mode, d }) =>
                el.getAttribute('data-rte-mode') === mode &&
                getComputedStyle(el)
                  .getPropertyValue('--rte-density')
                  .trim() === String(d),
              { mode, d: density },
            ),
        });
      });
    }
  }
}
