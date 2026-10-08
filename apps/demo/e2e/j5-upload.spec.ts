import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ORIGIN, ORIGIN_WITH_SERVER, watch } from './helpers';

// J5 (spec 07b, W6/W12): envio de imagens na página /files. Modo simulado (padrão, sem servidor):
// progresso, cancelar, falhar anunciado e imagem inserida. Modo servidor (`--with-server`, só no
// Chromium): PNG real enviado, exibido e presente na pasta temporária do servidor de exemplo.

const PNG_PATH = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../public/exemplo.png',
);
const PNG = readFileSync(PNG_PATH);

async function open(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/files`);
  await expect(page.locator('.ProseMirror').first()).toBeVisible({
    timeout: 30_000,
  });
}

/** Insere o PNG pelo diálogo de imagem (Origem "Arquivo"). */
async function sendPng(page: Page, name = 'foto.png'): Promise<void> {
  await page.getByRole('button', { name: 'Imagem' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Inserir imagem' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Arquivo', { exact: true }).check();
  await dialog
    .getByLabel('Arquivo de imagem')
    .setInputFiles({ name, mimeType: 'image/png', buffer: PNG });
  await dialog.getByLabel('Texto alternativo').fill('Faixas de cor do exemplo');
  await dialog.getByRole('button', { name: 'Aplicar' }).click();
}

test.describe('J5 simulado', () => {
  test('aviso, progresso e imagem inserida (a imagem de exemplo do demo)', async ({
    page,
  }) => {
    const problems = await watch(page);
    await open(page, ORIGIN);
    await expect(page.getByTestId('files-simulated')).toBeVisible();
    await expect(page.getByTestId('files-server')).toHaveCount(0);

    await sendPng(page);
    const progress = page.locator('.rte-uploads__progress').first();
    await expect(progress).toBeVisible();
    const image = page.locator('.ProseMirror img[src="/exemplo.png"]');
    await expect(image).toBeVisible({ timeout: 15_000 });
    await expect(image).toHaveAttribute('alt', 'Faixas de cor do exemplo');
    await expect(page.getByTestId('files-status')).toHaveText(
      'Imagem inserida: /exemplo.png',
    );
    await expect(page.locator('.rte-uploads__item')).toHaveCount(0);
    expect(problems.messages).toEqual([]);
  });

  test('cancelar o envio lento não insere a imagem', async ({ page }) => {
    await open(page, ORIGIN);
    await page.getByLabel(/Lento/).check();
    await sendPng(page);
    const cancel = page.locator('.rte-uploads__cancel').first();
    await expect(cancel).toBeVisible();
    await cancel.click();
    await expect(page.locator('.rte-uploads__item')).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(page.locator('.ProseMirror img')).toHaveCount(0);
  });

  test('"Cancelar todos os envios" anuncia e nada é inserido', async ({
    page,
  }) => {
    await open(page, ORIGIN);
    await page.getByLabel(/Lento/).check();
    await sendPng(page);
    await expect(page.locator('.rte-uploads__item')).toHaveCount(1);
    await page
      .getByRole('button', { name: 'Cancelar todos os envios' })
      .click();
    await expect(page.getByTestId('files-status')).toHaveText(
      'Envios cancelados.',
    );
    await expect(page.locator('.rte-uploads__item')).toHaveCount(0);
    await expect(page.locator('.ProseMirror img')).toHaveCount(0);
  });

  test('falhar no meio do caminho é anunciado numa região viva', async ({
    page,
  }) => {
    await open(page, ORIGIN);
    await page.getByLabel(/Falhar/).check();
    await sendPng(page, 'quebrada.png');
    const status = page.getByTestId('files-status');
    await expect(status).toHaveText(
      'Falha ao enviar quebrada.png: o servidor recusou ou falhou.',
      { timeout: 15_000 },
    );
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('.ProseMirror img')).toHaveCount(0);
  });
});

test.describe('J5 com servidor (--with-server)', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'o servidor de exemplo é exercitado só no Chromium',
  );

  test('PNG real enviado, exibido e presente na pasta temporária', async ({
    page,
    request,
  }) => {
    const problems = await watch(page);
    await open(page, ORIGIN_WITH_SERVER);
    await expect(page.getByTestId('files-server')).toBeVisible();
    await expect(page.getByTestId('files-simulated')).toHaveCount(0);

    await sendPng(page, 'real.png');
    const image = page.locator('.ProseMirror img[src^="/media/"]');
    await expect(image).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);

    // Exibido: o servidor devolve os mesmos bytes enviados.
    const src = (await image.getAttribute('src')) ?? '';
    const served = await request.get(`${ORIGIN_WITH_SERVER}${src}`);
    expect(served.ok()).toBe(true);
    expect(Buffer.from(await served.body()).equals(PNG)).toBe(true);

    // Presente na pasta temporária do servidor de exemplo (a que o `serve.mjs` criou).
    const stored = readdirSync(tmpdir())
      .filter((name) => name.startsWith('cds-rte-demo-media-'))
      .map((name) => join(tmpdir(), name))
      .filter((dir) => existsSync(dir))
      .flatMap((dir) =>
        readdirSync(dir).map((file) => readFileSync(join(dir, file))),
      );
    expect(stored.some((bytes) => bytes.equals(PNG))).toBe(true);
    expect(problems.messages).toEqual([]);
  });
});
