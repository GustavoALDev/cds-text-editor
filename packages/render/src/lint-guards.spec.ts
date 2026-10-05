// @vitest-environment node
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';
import { workspacePath } from './testing-support/workspace';

// Guardas por lint da spec 06 (H19, R13): cada padrão proibido tem de gerar a
// regra esperada no código publicado do pacote, e só nele.

const SRC_FILE = 'packages/render/src/__guard__.ts';
const SPEC_FILE = 'packages/render/src/__guard__.spec.ts';
const CONTENT_FILE = 'packages/render/src/content/rte-content.ts';
const CONTENT_OTHER = 'packages/render/src/content/x.ts';
const TOC_FILE = 'packages/render/toc/src/x.ts';

const eslint = new ESLint({
  cwd: workspacePath('.'),
  overrideConfigFile: 'packages/render/eslint.config.mjs',
});

async function ruleIds(code: string, file: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, {
    filePath: workspacePath(file),
  });
  return (result?.messages ?? []).map((m) => m.ruleId ?? '(fatal)');
}

const ON_PUSH =
  "import { ChangeDetectionStrategy, Component } from '@angular/core';\n";

const TS_IMPORTS = '@typescript-eslint/no-restricted-imports';

const BYPASS =
  'export function f(s: { bypassSecurityTrustHtml(x: string): unknown }, x: string): void { s.bypassSecurityTrustHtml(x); }\n';
const HOST_INNER_HTML = `import { Component } from '@angular/core';\n@Component({ selector: 'rte-x', templateUrl: './x.html', host: { '[innerHTML]': 'x' } })\nexport class X {}\n`;
const INNER_HTML =
  'export function f(el: HTMLElement, x: string): void { el.innerHTML = x; }\n';
const INSERT_ADJACENT =
  "export function f(el: HTMLElement, x: string): void { el.insertAdjacentHTML('beforeend', x); }\n";
const DOC_WRITE =
  'export function f(doc: Document, x: string): void { doc.write(x); }\n';
const EXTRACT_TOC =
  "import { extractToc } from '@cds/rte-core/html';\nexport const t = extractToc;\n";

const forbidden: ReadonlyArray<[string, string, string]> = [
  [
    '@Input()',
    `import { Input } from '@angular/core';\nexport class A { @Input() x = 1; }\n`,
    'no-restricted-syntax',
  ],
  [
    '@Output()',
    `import { EventEmitter, Output } from '@angular/core';\nexport class A { @Output() x = new EventEmitter<number>(); }\n`,
    'no-restricted-syntax',
  ],
  [
    "@HostListener('x')",
    `import { HostListener } from '@angular/core';\nexport class A { @HostListener('x') onX(): void { return; } }\n`,
    'no-restricted-syntax',
  ],
  [
    "@HostBinding('x')",
    `import { HostBinding } from '@angular/core';\nexport class A { @HostBinding('x') x = 1; }\n`,
    'no-restricted-syntax',
  ],
  [
    'ngOnChanges()',
    'export class A { ngOnChanges(): void { return; } }\n',
    'no-restricted-syntax',
  ],
  [
    'cdr.detectChanges()',
    'export function f(cdr: { detectChanges(): void }): void { cdr.detectChanges(); }\n',
    'no-restricted-syntax',
  ],
  [
    'setTimeout(f)',
    'export function g(f: () => void): void { setTimeout(f); }\n',
    'no-restricted-syntax',
  ],
  [
    'requestAnimationFrame(f)',
    'export function g(f: () => void): void { requestAnimationFrame(f); }\n',
    'no-restricted-syntax',
  ],
  [
    'globalThis.setTimeout(f)',
    'export function g(f: () => void): void { globalThis.setTimeout(f); }\n',
    'no-restricted-syntax',
  ],
  [
    'window.requestAnimationFrame(f)',
    'export function g(f: () => void): void { window.requestAnimationFrame(f); }\n',
    'no-restricted-syntax',
  ],
  [
    'document.body',
    'export const b = document.body;\n',
    'no-restricted-globals',
  ],
  ['window.x', 'export const x = window.name;\n', 'no-restricted-globals'],
  ['self.x', 'export const x = self.name;\n', 'no-restricted-globals'],
  [
    'globalThis.document',
    'export const b = globalThis.document.body;\n',
    'no-restricted-properties',
  ],
  [
    'globalThis.window',
    'export const x = globalThis.window.name;\n',
    'no-restricted-properties',
  ],
  ["import 'zone.js'", "import 'zone.js';\n", TS_IMPORTS],
  ["import 'zone.js/testing'", "import 'zone.js/testing';\n", TS_IMPORTS],
  [
    'componente Eager',
    `${ON_PUSH}@Component({ selector: 'rte-x', templateUrl: './x.html', changeDetection: ChangeDetectionStrategy.Eager })\nexport class X {}\n`,
    '@angular-eslint/prefer-on-push-component-change-detection',
  ],
  [
    'componente Default',
    `${ON_PUSH}@Component({ selector: 'rte-x', templateUrl: './x.html', changeDetection: ChangeDetectionStrategy.Default })\nexport class X {}\n`,
    '@angular-eslint/prefer-on-push-component-change-detection',
  ],
  ['el.innerHTML = x', INNER_HTML, 'no-restricted-syntax'],
  [
    'el.outerHTML',
    'export const o = (el: HTMLElement): string => el.outerHTML;\n',
    'no-restricted-syntax',
  ],
  ['el.insertAdjacentHTML(...)', INSERT_ADJACENT, 'no-restricted-syntax'],
  ['doc.write(x)', DOC_WRITE, 'no-restricted-syntax'],
  [
    'doc.writeln(x)',
    'export function f(doc: Document, x: string): void { doc.writeln(x); }\n',
    'no-restricted-syntax',
  ],
  ['s.bypassSecurityTrustHtml(x)', BYPASS, 'no-restricted-syntax'],
  ["host: { '[innerHTML]': 'x' }", HOST_INNER_HTML, 'no-restricted-syntax'],
  [
    "import { createSanitizer } from '@cds/rte-sanitizer'",
    "import { createSanitizer } from '@cds/rte-sanitizer';\nexport const s = createSanitizer;\n",
    TS_IMPORTS,
  ],
  ["import de '@cds/rte-core/html' fora de toc", EXTRACT_TOC, TS_IMPORTS],
];

describe('guardas por lint (spec 06, H19)', () => {
  // A primeira chamada do ESLint carrega a configuração do workspace (~20 s,
  // até ~60 s com `test` e `test-zone` em paralelo): aquece fora do tempo dos casos.
  beforeAll(async () => {
    await ruleIds('export const warm = 1;', SRC_FILE);
  }, 180_000);

  it.each(forbidden.map(([name, code, rule]) => ({ name, code, rule })))(
    '$name gera $rule em src/',
    async ({ code, rule }) => {
      expect(await ruleIds(code, SRC_FILE)).toContain(rule);
    },
  );

  it.each(forbidden.map(([name, code]) => ({ name, code })))(
    'specs ficam fora das guardas: $name',
    async ({ code }) => {
      const ids = await ruleIds(code, SPEC_FILE);
      expect(ids).not.toContain('no-restricted-syntax');
      expect(ids).not.toContain('no-restricted-globals');
      expect(ids).not.toContain('no-restricted-properties');
      expect(ids).not.toContain(TS_IMPORTS);
    },
  );

  it.each([
    ['bypassSecurityTrustHtml', BYPASS],
    ["chave de host '[innerHTML]'", HOST_INNER_HTML],
  ])('src/content/rte-content.ts pode usar %s', async (_name, code) => {
    expect(await ruleIds(code, CONTENT_FILE)).not.toContain(
      'no-restricted-syntax',
    );
  });

  it.each([
    ['innerHTML', INNER_HTML],
    ['insertAdjacentHTML', INSERT_ADJACENT],
    ['write', DOC_WRITE],
  ])('src/content/rte-content.ts continua barrando %s', async (_n, code) => {
    expect(await ruleIds(code, CONTENT_FILE)).toContain('no-restricted-syntax');
  });

  it('o resto de src/content/ barra bypassSecurityTrustHtml', async () => {
    expect(await ruleIds(BYPASS, CONTENT_OTHER)).toContain(
      'no-restricted-syntax',
    );
  });

  it('import type do sanitizador é permitido', async () => {
    expect(
      await ruleIds(
        "import type { RteSanitizeOptions } from '@cds/rte-sanitizer';\nexport type T = RteSanitizeOptions;\n",
        SRC_FILE,
      ),
    ).not.toContain(TS_IMPORTS);
  });

  it('@cds/rte-core/html é permitido no entry /toc e barrado em src/content/', async () => {
    expect(await ruleIds(EXTRACT_TOC, TOC_FILE)).not.toContain(TS_IMPORTS);
    expect(await ruleIds(EXTRACT_TOC, CONTENT_OTHER)).toContain(TS_IMPORTS);
    expect(await ruleIds("import 'zone.js';\n", TOC_FILE)).toContain(
      TS_IMPORTS,
    );
  });

  it.each([
    ['OnPush explícito', ', changeDetection: ChangeDetectionStrategy.OnPush'],
    ['sem changeDetection (OnPush padrão)', ''],
  ])('componente %s não gera prefer-on-push', async (_name, extra) => {
    const code = `${ON_PUSH}@Component({ selector: 'rte-x', templateUrl: './x.html'${extra} })\nexport class X {}\n`;
    expect(await ruleIds(code, SRC_FILE)).not.toContain(
      '@angular-eslint/prefer-on-push-component-change-detection',
    );
  });
});
