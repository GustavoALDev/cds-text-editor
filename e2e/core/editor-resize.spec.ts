// E3 (spec 03b, §6 e §7.6): redimensionar a imagem pelas 4 alças com o mouse
// real mantém a proporção, respeita `minWidth`, `Escape` cancela sem
// transação e o arrasto é um único passo de desfazer. Lição 17: rolar até a
// alça antes de usar o mouse.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadEditorPage } from './helpers/editor-page';

const IMAGE =
  '<figure class="rt-figure rt-figure--center"><img src="/e2e.png" alt="Ponto" width="400" height="200"></figure><p>depois</p>';

type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** Sentido "para dentro" da imagem a partir de cada canto. */
const INWARD: Record<Corner, { x: number; y: number }> = {
  nw: { x: 1, y: 1 },
  ne: { x: -1, y: 1 },
  sw: { x: 1, y: -1 },
  se: { x: -1, y: -1 },
};

async function open(page: Page): Promise<void> {
  await loadEditorPage(page, { content: IMAGE });
  await page.evaluate(() => {
    const w = window as unknown as {
      e2eDrags: boolean[];
      e2eCaptures: number;
    };
    w.e2eDrags = [];
    w.e2eCaptures = 0;
    // `dragstart` que chegue ao documento sem `preventDefault` seria o
    // arrastar-e-soltar nativo da figura começando no meio do redimensionamento.
    document.addEventListener('dragstart', (e) =>
      w.e2eDrags.push(e.defaultPrevented),
    );
    document.addEventListener('gotpointercapture', (e) => {
      if ((e.target as Element).classList.contains('rte-image__handle'))
        w.e2eCaptures++;
    });
  });
  // O PNG 1×1 de `helpers/editor-page.ts` carregou (rota da origem falsa).
  await expect(page.locator('#editor img')).toHaveJSProperty('naturalWidth', 1);
}

/** Tamanho no documento (atributos do nó `rtImage`). */
function nodeSize(page: Page) {
  return page.evaluate(() => {
    const node = window.editor.state.doc.firstChild!;
    return {
      width: node.attrs['width'] as number,
      height: node.attrs['height'] as number,
    };
  });
}

/** Tamanho exibido pela prévia (atributos do `img` do NodeView). */
function previewSize(page: Page) {
  return page.locator('#editor img').evaluate((img) => ({
    width: Number(img.getAttribute('width')),
    height: Number(img.getAttribute('height')),
  }));
}

async function grab(page: Page, corner: Corner) {
  const handle = page.locator(`#editor .rte-image__handle--${corner}`);
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  return { x, y };
}

function expectRatio(size: { width: number; height: number }): void {
  expect(Math.abs(size.width - 2 * size.height)).toBeLessThanOrEqual(1);
}

for (const corner of ['nw', 'ne', 'sw', 'se'] as const) {
  test(`E3: canto ${corner} redimensiona com proporção 2:1 em um passo`, async ({
    page,
  }) => {
    await open(page);
    const start = await grab(page, corner);
    const d = INWARD[corner];
    await page.mouse.move(start.x + 100 * d.x, start.y + 50 * d.y, {
      steps: 5,
    });
    const preview = await previewSize(page);
    expect(preview.width).toBeGreaterThanOrEqual(299);
    expect(preview.width).toBeLessThanOrEqual(301);
    expectRatio(preview);
    // Prévia só no DOM: o documento não muda antes do `pointerup`.
    expect(await nodeSize(page)).toEqual({ width: 400, height: 200 });
    await page.mouse.up();

    const size = await nodeSize(page);
    expect(size).toEqual(preview);
    expectRatio(size);
    expect(await previewSize(page)).toEqual(size);
    expect(
      await page.evaluate(() => {
        const g = window as unknown as {
          e2eDrags: boolean[];
          e2eCaptures: number;
        };
        return { drags: g.e2eDrags, captures: g.e2eCaptures };
      }),
    ).toEqual({ drags: expect.not.arrayContaining([false]), captures: 1 });

    // Um passo de desfazer: volta a 400×200 e não sobra histórico.
    expect(await page.evaluate(() => window.editor.commands.undo())).toBe(true);
    expect(await nodeSize(page)).toEqual({ width: 400, height: 200 });
    expect(await previewSize(page)).toEqual({ width: 400, height: 200 });
    expect(await page.evaluate(() => window.editor.can().undo())).toBe(false);
  });
}

test('E3: arrastar para fora aumenta mantendo a proporção', async ({
  page,
}) => {
  await open(page);
  const start = await grab(page, 'se');
  await page.mouse.move(start.x + 100, start.y + 10, { steps: 5 });
  await page.mouse.up();
  const size = await nodeSize(page);
  expect(size.width).toBeGreaterThanOrEqual(499);
  expect(size.width).toBeLessThanOrEqual(501);
  expectRatio(size);
});

test('E3: arrastar além do limite para em minWidth (48×24)', async ({
  page,
}) => {
  await open(page);
  const start = await grab(page, 'nw');
  await page.mouse.move(start.x + 600, start.y + 300, { steps: 5 });
  await page.mouse.up();
  expect(await nodeSize(page)).toEqual({ width: 48, height: 24 });
});

test('E3: Escape no meio do arrasto restaura sem mudar o documento', async ({
  page,
}) => {
  await open(page);
  const before = await page.evaluate(() =>
    window.RteEditorLab.getRteHtml(window.editor),
  );
  const start = await grab(page, 'se');
  await page.mouse.move(start.x - 100, start.y - 50, { steps: 5 });
  expect((await previewSize(page)).width).toBeLessThan(400);
  await page.keyboard.press('Escape');
  expect(await previewSize(page)).toEqual({ width: 400, height: 200 });
  // O resto do gesto não retoma o arrasto.
  await page.mouse.move(start.x - 150, start.y - 75, { steps: 2 });
  await page.mouse.up();
  expect(await previewSize(page)).toEqual({ width: 400, height: 200 });
  expect(await nodeSize(page)).toEqual({ width: 400, height: 200 });
  expect(
    await page.evaluate(() => window.RteEditorLab.getRteHtml(window.editor)),
  ).toBe(before);
  expect(await page.evaluate(() => window.editor.can().undo())).toBe(false);
});
