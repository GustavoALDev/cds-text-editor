import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  expect,
  test,
  type Page,
  type Request,
  type Response,
} from '@playwright/test';
import { ORIGIN_WITH_SERVER } from './helpers';

// J8 (spec 08a, X8): conjunto contra o `examples/server-node` (servidor `--with-server`, mesma
// origem, pasta temporária) nos 3 motores. Cookie de CSRF e `SameSite` divergem entre motores,
// por isso nada aqui é restrito ao Chromium. Só os STATUS são afirmados (não as mensagens de
// erro do servidor); o token *bearer* vem do `demo-config.json` da execução, pela própria página.

const here = fileURLToPath(new URL('.', import.meta.url));
const PNG = readFileSync(resolve(here, '../public/exemplo.png'));
const WEBM = readFileSync(
  resolve(here, '../../../e2e/angular/app/public/e2e.webm'),
);
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
);

/** Acrescenta ao final um rótulo único: o servidor guarda os bytes tal como chegam. */
const tagged = (bytes: Buffer, tag: string): Buffer =>
  Buffer.concat([bytes, Buffer.from(`\n<!--${tag}-->`)]);

/** Arquivos de todas as pastas de mídia do demo (a do servidor desta execução está entre elas). */
function stored(): Buffer[] {
  return readdirSync(tmpdir())
    .filter((name) => name.startsWith('cds-rte-demo-media-'))
    .map((name) => join(tmpdir(), name))
    .filter((dir) => existsSync(dir))
    .flatMap((dir) =>
      readdirSync(dir).map((file) => readFileSync(join(dir, file))),
    );
}
const wasStored = (marker: string): boolean =>
  stored().some((bytes) => bytes.includes(marker));

const isUpload = (r: Request | Response): boolean =>
  new URL(r.url()).pathname === '/upload';

let counter = 0;
const unique = (): string => `j8-${Date.now()}-${counter++}`;

async function openFiles(page: Page): Promise<void> {
  await page.goto(`${ORIGIN_WITH_SERVER}/files`);
  await expect(page.getByTestId('files-server')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('.ProseMirror').first()).toBeVisible();
}

/** Escolhe o arquivo no diálogo de imagem/vídeo (Origem "Arquivo") e aplica. */
async function chooseFile(
  page: Page,
  kind: 'image' | 'video',
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await page
    .getByRole('button', {
      name: kind === 'image' ? 'Inserir imagem' : 'Inserir vídeo',
      exact: true,
    })
    .first()
    .click();
  const dialog = page.getByRole('dialog', {
    name: kind === 'image' ? 'Inserir imagem' : 'Inserir vídeo',
  });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Arquivo', { exact: true }).check();
  await dialog
    .getByLabel(kind === 'image' ? 'Arquivo de imagem' : 'Arquivo de vídeo')
    .setInputFiles(file);
  if (kind === 'image') {
    await dialog.getByLabel('Texto alternativo').fill('J8');
  }
  await dialog.getByRole('button', { name: 'Aplicar' }).click();
}

test.describe('J8 contra o servidor de exemplo', () => {
  test.beforeEach(async ({ page }) => {
    await openFiles(page);
  });

  test('(a) PNG: 201, imagem visível, mídia com nosniff e CSP restrita, arquivo na pasta', async ({
    page,
    request,
  }) => {
    const marker = unique();
    const png = tagged(PNG, marker);
    const upload = page.waitForResponse(isUpload);
    await chooseFile(page, 'image', {
      name: 'ok.png',
      mimeType: 'image/png',
      buffer: png,
    });
    const response = await upload;
    expect(response.status()).toBe(201);

    // Cabeçalhos que a página realmente mandou: bearer da execução e o token de CSRF.
    const sent = await response.request().allHeaders();
    expect(sent['authorization']).toMatch(/^Bearer .+/);
    expect(sent['x-csrf-token']).toBeTruthy();

    const image = page.locator('.ProseMirror img[src^="/media/"]');
    await expect(image).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);

    const src = (await image.getAttribute('src')) ?? '';
    const media = await request.get(`${ORIGIN_WITH_SERVER}${src}`);
    expect(media.status()).toBe(200);
    expect(media.headers()['x-content-type-options']).toBe('nosniff');
    expect(media.headers()['content-security-policy']).toBe(
      "default-src 'none'; sandbox",
    );
    expect(Buffer.from(await media.body()).equals(png)).toBe(true);
    expect(wasStored(marker)).toBe(true);
  });

  test('(b) sem X-CSRF-Token: 403, erro anunciado e nada gravado', async ({
    page,
  }) => {
    const marker = unique();
    await page.route(
      (url) => url.pathname === '/upload',
      async (route) => {
        const headers = { ...route.request().headers() };
        delete headers['x-csrf-token'];
        await route.continue({ headers });
      },
    );
    const upload = page.waitForResponse(isUpload);
    await chooseFile(page, 'image', {
      name: 'csrf.png',
      mimeType: 'image/png',
      buffer: tagged(PNG, marker),
    });
    expect((await upload).status()).toBe(403);
    await expect(page.getByTestId('files-status')).toContainText(
      'Falha ao enviar csrf.png',
      { timeout: 15_000 },
    );
    await expect(page.getByTestId('files-status')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    await expect(page.locator('.ProseMirror img')).toHaveCount(0);
    expect(wasStored(marker)).toBe(false);
  });

  test('(c) SVG com extensão .png: 415, erro e nada gravado', async ({
    page,
  }) => {
    const marker = unique();
    const upload = page.waitForResponse(isUpload);
    await chooseFile(page, 'image', {
      name: 'disfarce.png',
      mimeType: 'image/png',
      buffer: tagged(SVG, marker),
    });
    expect((await upload).status()).toBe(415);
    await expect(page.getByTestId('files-status')).toContainText(
      'Falha ao enviar disfarce.png',
      { timeout: 15_000 },
    );
    await expect(page.locator('.ProseMirror img')).toHaveCount(0);
    expect(wasStored(marker)).toBe(false);
  });

  test('(d) corpo acima do limite: 413, erro e nada gravado', async ({
    page,
  }) => {
    // O cliente recusa arquivos acima do limite antes de enviar (mesmo teto de 10 MiB do
    // servidor); para provar a defesa do servidor, o corpo da requisição é trocado na rede por
    // um maior que o limite.
    const marker = unique();
    const oversized = Buffer.concat([
      PNG,
      Buffer.from(marker),
      Buffer.alloc(11 * 1024 * 1024, 1),
    ]);
    await page.route(
      (url) => url.pathname === '/upload',
      async (route) => {
        const type = route.request().headers()['content-type'] ?? '';
        const boundary = /boundary=(.+)$/.exec(type)?.[1] ?? '';
        const body = Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nimage\r\n` +
              `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="grande.png"\r\n` +
              `Content-Type: image/png\r\n\r\n`,
          ),
          oversized,
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]);
        await route.continue({ postData: body });
      },
    );
    const upload = page.waitForResponse(isUpload);
    await chooseFile(page, 'image', {
      name: 'grande.png',
      mimeType: 'image/png',
      buffer: tagged(PNG, 'pequeno'),
    });
    expect((await upload).status()).toBe(413);
    await expect(page.getByTestId('files-status')).toContainText(
      'Falha ao enviar grande.png',
      { timeout: 15_000 },
    );
    await expect(page.locator('.ProseMirror img')).toHaveCount(0);
    expect(wasStored(marker)).toBe(false);
  });

  test('(e) cancelar com a requisição retida: nada gravado e o marcador some', async ({
    page,
  }) => {
    const marker = unique();
    let release: (() => Promise<void>) | undefined;
    const arrived = new Promise<void>((resolveArrived) => {
      void page.route(
        (url) => url.pathname === '/upload',
        (route) => {
          // Não continua nem cumpre: a requisição fica retida até o cancelamento.
          release = () => route.abort();
          resolveArrived();
        },
      );
    });
    await chooseFile(page, 'image', {
      name: 'retido.png',
      mimeType: 'image/png',
      buffer: tagged(PNG, marker),
    });
    await arrived;
    const item = page.locator('.rte-uploads__item');
    await expect(item).toHaveCount(1);
    await page.locator('.rte-uploads__cancel').first().click();
    await expect(item).toHaveCount(0);
    await release?.().catch(() => undefined);
    await expect(page.locator('.ProseMirror img')).toHaveCount(0);
    expect(wasStored(marker)).toBe(false);
  });

  test('(f) WebM: <video> com metadados carregados', async ({
    page,
    request,
    browserName,
  }) => {
    const marker = unique();
    const upload = page.waitForResponse(isUpload);
    await chooseFile(page, 'video', {
      name: 'clip.webm',
      mimeType: 'video/webm',
      buffer: tagged(WEBM, marker),
    });
    expect((await upload).status()).toBe(201);
    const video = page.locator('.ProseMirror video[src^="/media/"]');
    await expect(video).toBeVisible({ timeout: 20_000 });
    // O WebKit só começa a reproduzir mídia de um servidor que responde a Range com 206. Enquanto
    // o servidor de exemplo não o faz, o WebKit nunca passa de readyState 0; a divergência fica
    // anotada (e registrada no ADR 0019) e vale a prova de que o servidor entrega video/webm.
    // Com Range suportado, a verificação estrita volta a valer em todos os motores.
    const src = (await video.getAttribute('src')) ?? '';
    const url = ORIGIN_WITH_SERVER + src;
    const ranged = await request.get(url, { headers: { Range: 'bytes=0-1' } });
    if (browserName === 'webkit' && ranged.status() !== 206) {
      test.info().annotations.push({
        type: 'webkit-sem-range',
        description:
          'GET /media sem suporte a Range: readyState não verificado',
      });
      expect(ranged.headers()['content-type']).toBe('video/webm');
    } else {
      await expect
        .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), {
          timeout: 20_000,
        })
        .toBeGreaterThanOrEqual(1);
    }
    expect(wasStored(marker)).toBe(true);
  });
});
