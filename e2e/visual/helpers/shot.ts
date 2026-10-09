import { appendFileSync } from 'node:fs';
import { expect, test, type Locator } from '@playwright/test';

// Captura por elemento (spec 08b, O2). `RTE_VISUAL_DRYRUN=1` (só local, nunca em workflow:
// conferido por tools/visual-image.test.mjs) confere estado e estabilidade sem capturar.

const DRYRUN = process.env['RTE_VISUAL_DRYRUN'] === '1';

/** Falha fora do contêiner da imagem oficial: captura de outro SO não é comparável. */
export function assertContainer(): void {
  if (process.env['RTE_VISUAL_CONTAINER'] === '1' || DRYRUN) return;
  throw new Error(
    'A regressão visual só roda no contêiner oficial do Playwright. Local com Docker: ' +
      '`npm run visual`; sem Docker, atualize as capturas pelo workflow visual-update.yml ' +
      '(GitHub > Actions) e veja e2e/README.md.',
  );
}

/** Caixa do elemento duas vezes seguidas, com um quadro entre as leituras. */
async function box(locator: Locator): Promise<string> {
  return locator.evaluate(
    (el) =>
      new Promise<string>((resolve) =>
        requestAnimationFrame(() => {
          const r = el.getBoundingClientRect();
          resolve([r.x, r.y, r.width, r.height].map(Math.round).join(','));
        }),
      ),
  );
}

/** Fontes carregadas, imagens completas e caixa estável em dois quadros. */
export async function settle(locator: Locator): Promise<void> {
  const page = locator.page();
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Imagens preguiçosas fora da tela (ou bloqueadas) nunca disparam load/error no Firefox:
    // cada espera tem teto de 2 s.
    await Promise.all(
      [...document.images]
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise((r) => {
              img.addEventListener('load', r, { once: true });
              img.addEventListener('error', r, { once: true });
              setTimeout(r, 2000);
            }),
        ),
    );
  });
  await expect
    .poll(async () => (await box(locator)) === (await box(locator)), {
      timeout: 5_000,
    })
    .toBe(true);
}

/**
 * Captura `locator` como `<name>.png`. Antes, espera o estado (`ready`, opcional) por
 * `expect.poll`, as fontes, as imagens e a estabilidade da caixa.
 */
export async function expectShot(
  locator: Locator,
  name: string,
  opts: { ready?: () => Promise<boolean> } = {},
): Promise<void> {
  assertContainer();
  await expect(locator).toBeVisible();
  if (opts.ready) await expect.poll(opts.ready).toBe(true);
  await settle(locator);
  if (DRYRUN) return;
  // `RTE_VISUAL_USED=<arquivo>`: anota o caminho da baseline usada, para `tools/visual.mjs prune`
  // apagar as órfãs (workflow visual-update.yml).
  const used = process.env['RTE_VISUAL_USED'];
  if (used) {
    appendFileSync(used, `${test.info().snapshotPath(`${name}.png`)}\n`);
  }
  await expect(locator).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
  });
}
