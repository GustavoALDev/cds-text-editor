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
    const bad = templates
      .filter((f) => STYLE_BINDING.test(readFileSync(f, 'utf8')))
      .map(packagePath);
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
