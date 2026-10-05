// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findLiteralText } from './testing-support/template-text';
import { workspacePath } from './testing-support/workspace';

// R15 (spec 05a, D25): texto fixo em template é proibido; só interpolação de
// rótulos. Texto literal e atributos de acessibilidade/dica estáticos falham.

const PACKAGE_DIR = workspacePath('packages/angular');

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => join(dir, f).replaceAll('\\', '/'))
    .filter((f) => !f.includes('/node_modules/'));
}

/** Templates dos formulários de diálogo (spec 05c1, `src/dialogs/forms/`). */
const MEDIA_FORM_TEMPLATES = [
  'src/dialogs/forms/embed-form.html',
  'src/dialogs/forms/image-form.html',
  'src/dialogs/forms/lang-form.html',
  'src/dialogs/forms/link-form.html',
  'src/dialogs/forms/quote-form.html',
  'src/dialogs/forms/table-form.html',
  'src/dialogs/forms/video-form.html',
];

function packagePath(file: string): string {
  return relative(PACKAGE_DIR, file).replaceAll('\\', '/');
}

describe('findLiteralText', () => {
  it.each([
    ['<p>Olá</p>', 1],
    ['<b aria-label="x"></b>', 1],
    ['<img alt="foto" />', 1],
    ['<input placeholder="Digite" />', 1],
    ['<i title="{{ a }}"></i>', 0],
    ['<p>{{ l().x }}</p>', 0],
    ['<p> </p>', 0],
    ['<b class="x" role="button"></b>', 0],
    ['@if (a) { <span [attr.title]="t"></span> }', 0],
    ['@if (a) { <span>x</span> }', 1],
    ['@for (i of xs; track i) { <span title="t"></span> }', 1],
    ['@defer { <b>x</b> } @placeholder {} @error { <i>y</i> }', 2],
    ['@let e = f(); @if (e) { <p>{{ e }}</p> }', 0],
  ])('%s → %i', (html, count) => {
    expect(findLiteralText(html)).toHaveLength(count);
  });
});

describe('templates do pacote (R15)', () => {
  const files = listFiles(PACKAGE_DIR);

  it('nenhum template .html tem texto literal', () => {
    const templates = files.filter(
      (f) =>
        f.endsWith('.html') &&
        /(^|\/)src\//.test(packagePath(f)) &&
        !packagePath(f).includes('/testing-support/'),
    );
    expect(templates.length).toBeGreaterThanOrEqual(1);
    // Os templates dos diálogos (spec 05b2a) entram na varredura.
    expect(templates.map(packagePath)).toContain(
      'src/dialogs/rte-dialogs.html',
    );
    // Os templates dos menus flutuantes (spec 05b2b) também.
    expect(templates.map(packagePath)).toContain(
      'src/floating/rte-floating-menus.html',
    );
    // Os formulários dos diálogos (spec 05c1) também, inclusive os de mídia.
    expect(templates.map(packagePath)).toEqual(
      expect.arrayContaining(MEDIA_FORM_TEMPLATES),
    );
    const found = templates.flatMap((f) =>
      findLiteralText(readFileSync(f, 'utf8'), packagePath(f)),
    );
    expect(found).toEqual([]);
  });

  it('nenhum .ts fora das specs usa template inline', () => {
    const inline = files
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .filter((f) => /\btemplate\s*:/.test(readFileSync(f, 'utf8')))
      .map(packagePath);
    expect(inline).toEqual([]);
  });
});

describe('sem ligação de estilo (R16, CSP)', () => {
  const files = listFiles(PACKAGE_DIR).filter(
    (f) => !packagePath(f).startsWith('dist/'),
  );
  const STYLE_BINDING = /\[(?:style|ngStyle)[\].]|\[attr\.style\]/;

  it('a expressão pega as formas de ligação de estilo', () => {
    for (const bad of [
      '<b [style.color]="c"></b>',
      '<b [style]="s"></b>',
      '<b [ngStyle]="s"></b>',
      '<b [attr.style]="s"></b>',
    ])
      expect(bad).toMatch(STYLE_BINDING);
    expect('<b [class.x]="c" style-x></b>').not.toMatch(STYLE_BINDING);
  });

  it('nenhum template .html liga estilo', () => {
    const templates = files.filter(
      (f) => f.endsWith('.html') && /(^|\/)src\//.test(packagePath(f)),
    );
    expect(templates.length).toBeGreaterThanOrEqual(2);
    expect(templates.map(packagePath)).toContain(
      'src/dialogs/rte-dialogs.html',
    );
    expect(templates.map(packagePath)).toContain(
      'src/floating/rte-floating-menus.html',
    );
    expect(templates.map(packagePath)).toEqual(
      expect.arrayContaining(MEDIA_FORM_TEMPLATES),
    );
    const bad = templates
      .filter((f) => STYLE_BINDING.test(readFileSync(f, 'utf8')))
      .map(packagePath);
    expect(bad).toEqual([]);
  });

  it('o template dos menus flutuantes não tem atributo style', () => {
    const html = readFileSync(
      join(PACKAGE_DIR, 'src/floating/rte-floating-menus.html'),
      'utf8',
    );
    expect(html).not.toMatch(/\sstyle\s*=/);
  });

  it('os templates dos formulários de diálogo não têm atributo style', () => {
    const bad = MEDIA_FORM_TEMPLATES.filter((f) =>
      /\sstyle\s*=/.test(readFileSync(join(PACKAGE_DIR, f), 'utf8')),
    );
    expect(bad).toEqual([]);
  });

  const HOST_STYLE =
    /host\s*:\s*\{[^}]*?(?:^|[\s,{])['"]?\[?(?:style|ngStyle|attr\.style)(?:\.[\w-]+)*\]?['"]?\s*:/;

  it('a expressão de host pega chave style e [style…]', () => {
    for (const bad of [
      "host: { style: 'x' }",
      "host: { class: 'a', '[style.color]': 'c' }",
      "host: {\n  '[style]': 's',\n}",
      "host: { '[attr.style]': 's' }",
      "host: { '[style.width.px]': 'w' }",
    ])
      expect(bad).toMatch(HOST_STYLE);
    expect("host: { '[class.x]': 'c', 'data-style': 'x' }").not.toMatch(
      HOST_STYLE,
    );
  });

  it('nenhum host de .ts (fora das specs) tem chave style ou [style…]', () => {
    const bad = files
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .filter((f) => HOST_STYLE.test(readFileSync(f, 'utf8')))
      .map(packagePath);
    expect(bad).toEqual([]);
  });
});
