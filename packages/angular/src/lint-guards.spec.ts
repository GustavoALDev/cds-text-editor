// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { workspacePath } from './testing-support/workspace';

// Guardas por lint da spec 05a (D25, R1, R15): cada padrão proibido tem de
// gerar a mensagem da regra esperada no código do pacote, e só nele.

const SRC_FILE = 'packages/angular/src/__guard__.ts';
const SPEC_FILE = 'packages/angular/src/__guard__.spec.ts';
const VALIDATORS_FILE = 'packages/angular/validators/src/__guard__.ts';

const eslint = new ESLint({
  cwd: workspacePath('.'),
  overrideConfigFile: 'packages/angular/eslint.config.mjs',
});

async function ruleIds(code: string, file: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, {
    filePath: workspacePath(file),
  });
  return (result?.messages ?? []).map((m) => m.ruleId ?? '(fatal)');
}

const ON_PUSH =
  "import { ChangeDetectionStrategy, Component } from '@angular/core';\n";

const forbidden: ReadonlyArray<[string, string, string]> = [
  [
    '@Input()',
    `${ON_PUSH}import { Input } from '@angular/core';\nexport class A { @Input() x = 1; }\n`,
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
    'globalThis.requestAnimationFrame(f)',
    'export function g(f: () => void): void { globalThis.requestAnimationFrame(f); }\n',
    'no-restricted-syntax',
  ],
  [
    'window.setTimeout(f)',
    'export function g(f: () => void): void { window.setTimeout(f); }\n',
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
  ["import 'zone.js'", "import 'zone.js';\n", 'no-restricted-imports'],
  [
    "import 'zone.js/testing'",
    "import 'zone.js/testing';\n",
    'no-restricted-imports',
  ],
  [
    "import de '@cds/rte-core/html'",
    "import { htmlToText } from '@cds/rte-core/html';\nexport const t = htmlToText('');\n",
    'no-restricted-imports',
  ],
  // No Angular 22 o OnPush é o padrão: a regra barra quem sai dele.
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
];

describe('guardas por lint (spec 05a, D25)', () => {
  it.each(forbidden.map(([name, code, rule]) => ({ name, code, rule })))(
    '$name gera $rule',
    async ({ code, rule }) => {
      expect(await ruleIds(code, SRC_FILE)).toContain(rule);
    },
  );

  it.each([
    ['OnPush explícito', ', changeDetection: ChangeDetectionStrategy.OnPush'],
    ['sem changeDetection (OnPush padrão)', ''],
  ])('componente %s não gera prefer-on-push', async (_name, extra) => {
    const code = `${ON_PUSH}@Component({ selector: 'rte-x', templateUrl: './x.html'${extra} })\nexport class X {}\n`;
    expect(await ruleIds(code, SRC_FILE)).not.toContain(
      '@angular-eslint/prefer-on-push-component-change-detection',
    );
  });

  it("o entry /validators pode importar '@cds/rte-core/html', mas não zone.js", async () => {
    const html =
      "import { htmlToText } from '@cds/rte-core/html';\nexport const t = htmlToText('');\n";
    expect(await ruleIds(html, VALIDATORS_FILE)).not.toContain(
      'no-restricted-imports',
    );
    expect(await ruleIds("import 'zone.js';\n", VALIDATORS_FILE)).toContain(
      'no-restricted-imports',
    );
  });

  it.each([
    'packages/angular/i18n/src/__guard__.ts',
    'packages/angular/testing/src/__guard__.ts',
  ])("%s não pode importar '@cds/rte-core/html' (R1)", async (file) => {
    const html =
      "import { htmlToText } from '@cds/rte-core/html';\nexport const t = htmlToText('');\n";
    expect(await ruleIds(html, file)).toContain('no-restricted-imports');
  });

  it('specs ficam fora das guardas (document.body permitido)', async () => {
    expect(
      await ruleIds('export const b = document.body;\n', SPEC_FILE),
    ).not.toContain('no-restricted-globals');
  });
});
