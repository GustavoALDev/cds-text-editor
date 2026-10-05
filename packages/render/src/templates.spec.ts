// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findLiteralText } from './testing-support/template-text';
import { workspacePath } from './testing-support/workspace';

// R12 (H16, H19): nenhum texto fixo em template (só interpolação de rótulos),
// nenhum template inline e nenhum estilo em template ou host (CSP estrita).

const PACKAGE_DIR = workspacePath('packages/render');

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => join(dir, f).replaceAll('\\', '/'))
    .filter((f) => !f.includes('/node_modules/'));
}

function packagePath(file: string): string {
  return relative(PACKAGE_DIR, file).replaceAll('\\', '/');
}

/** Código publicado: `src/`, `i18n/src/` e `toc/src/`, fora specs e `testing-support/`. */
function isPublished(file: string): boolean {
  const p = packagePath(file);
  return (
    /^((i18n|toc)\/)?src\//.test(p) &&
    !p.endsWith('.spec.ts') &&
    !p.includes('/testing-support/')
  );
}

const files = listFiles(PACKAGE_DIR).filter(isPublished);
const templates = files.filter((f) => f.endsWith('.html'));
const sources = files.filter((f) => f.endsWith('.ts'));

describe('templates do pacote (R12)', () => {
  it('a varredura enxerga os templates e o código publicados', () => {
    expect(templates.map(packagePath)).toContain('toc/src/rte-toc.html');
    expect(sources.map(packagePath)).toEqual(
      expect.arrayContaining([
        'toc/src/rte-toc.ts',
        'src/content/rte-content.ts',
      ]),
    );
  });

  it('findLiteralText acusa texto e atributos de texto fixos', () => {
    expect(findLiteralText('<nav aria-label="Sumário"></nav>')).toHaveLength(1);
    expect(findLiteralText('<a>Topo</a>')).toHaveLength(1);
    expect(
      findLiteralText('<nav [attr.aria-label]="l().toc">{{ t }}</nav>'),
    ).toEqual([]);
  });

  it('nenhum template .html tem texto literal', () => {
    const found = templates.flatMap((f) =>
      findLiteralText(readFileSync(f, 'utf8'), packagePath(f)),
    );
    expect(found).toEqual([]);
  });

  it('nenhum .ts publicado usa template inline', () => {
    const inline = sources
      .filter((f) => /\btemplate\s*:/.test(readFileSync(f, 'utf8')))
      .map(packagePath);
    expect(inline).toEqual([]);
  });
});

describe('sem estilo em template nem host (CSP)', () => {
  const STYLE_IN_TEMPLATE =
    /\[(?:style|ngStyle)[\].]|\[attr\.style\]|\sstyle\s*=/;
  const HOST_STYLE =
    /host\s*:\s*\{[^}]*?(?:^|[\s,{])['"]?\[?(?:style|ngStyle|attr\.style)(?:\.[\w-]+)*\]?['"]?\s*:/;

  it('as expressões pegam as formas de estilo', () => {
    for (const bad of [
      '<b [style.color]="c"></b>',
      '<b [style]="s"></b>',
      '<b [ngStyle]="s"></b>',
      '<b [attr.style]="s"></b>',
      '<b style="color: red"></b>',
    ])
      expect(bad).toMatch(STYLE_IN_TEMPLATE);
    expect('<b [class.x]="c" data-style="x"></b>').not.toMatch(
      STYLE_IN_TEMPLATE,
    );
    for (const bad of [
      "host: { style: 'x' }",
      "host: { class: 'a', '[style.color]': 'c' }",
      "host: {\n  '[style]': 's',\n}",
      "host: { '[attr.style]': 's' }",
    ])
      expect(bad).toMatch(HOST_STYLE);
    expect("host: { '[class.x]': 'c', 'data-style': 'x' }").not.toMatch(
      HOST_STYLE,
    );
  });

  it('nenhum template .html tem style nem ligação de estilo', () => {
    const bad = templates
      .filter((f) => STYLE_IN_TEMPLATE.test(readFileSync(f, 'utf8')))
      .map(packagePath);
    expect(bad).toEqual([]);
  });

  it('nenhum host de .ts publicado tem chave style ou [style…]', () => {
    const bad = sources
      .filter((f) => HOST_STYLE.test(readFileSync(f, 'utf8')))
      .map(packagePath);
    expect(bad).toEqual([]);
  });
});
